import { uploadFileXhr, resumeUploadXhr, probeUploadOffset, dufsFetch } from "../lib/dufs/client";

const VERIFY_BYTES = 64 * 1024;

async function sameBytes(url: string, file: File, from: number, to: number): Promise<boolean> {
  if (to <= from) return true;
  const resp = await dufsFetch(url, { headers: { Range: `bytes=${from}-${to - 1}` } });
  const body = new Uint8Array(await resp.arrayBuffer());
  // A server that ignores Range answers 200 with the whole file.
  const remote = resp.status === 206 ? body : body.subarray(from, to);
  const local = new Uint8Array(await file.slice(from, to).arrayBuffer());
  if (remote.length !== local.length) return false;
  for (let i = 0; i < local.length; i += 1) if (remote[i] !== local[i]) return false;
  return true;
}

/**
 * Is what the server holds (its first `offset` bytes) really the beginning of
 * *this* file? Compares the head and the bytes just before the break point.
 * Without this, retrying onto a same-named older file would append our tail to
 * its content — a silently corrupted file reported as "done".
 */
async function serverHoldsOurPrefix(url: string, file: File, offset: number): Promise<boolean> {
  if (offset <= 0) return true;
  try {
    const head = Math.min(offset, VERIFY_BYTES);
    if (!(await sameBytes(url, file, 0, head))) return false;
    return await sameBytes(url, file, Math.max(head, offset - VERIFY_BYTES), offset);
  } catch {
    return false;
  }
}

export type UploadStatus = "queued" | "uploading" | "done" | "error" | "canceled";

export interface UploadItem {
  id: string;
  /** Path relative to the upload base (keeps folder structure). */
  relPath: string;
  url: string;
  size: number;
  loaded: number;
  status: UploadStatus;
  error?: string;
  file: File;
}

const CONCURRENCY = 3;
let seq = 0;

class UploadsStore {
  items = $state<UploadItem[]>([]);
  private abortHooks = new Map<string, () => void>();
  private waiters: (() => void)[] = [];

  get total() {
    return this.items.length;
  }
  get activeCount() {
    return this.items.filter((i) => i.status === "uploading").length;
  }
  get queuedCount() {
    return this.items.filter((i) => i.status === "queued").length;
  }
  get finishedCount() {
    return this.items.filter((i) => i.status === "done" || i.status === "error" || i.status === "canceled").length;
  }
  get inFlight() {
    return this.activeCount > 0 || this.queuedCount > 0;
  }
  get overallProgress() {
    const total = this.items.reduce((s, i) => s + i.size, 0);
    const loaded = this.items.reduce((s, i) => s + i.loaded, 0);
    return total > 0 ? Math.min(1, loaded / total) : 0;
  }

  /** Queue files for upload. `relPath` may contain subdirectories. */
  enqueue(entries: { file: File; relPath: string }[], basePath: string): string[] {
    const ids: string[] = [];
    const created: UploadItem[] = [];
    for (const { file, relPath } of entries) {
      const segs = relPath.split("/").map(encodeURIComponent).join("/");
      const id = `u${++seq}`;
      ids.push(id);
      created.push({
        id,
        relPath,
        url: basePath + segs,
        size: file.size,
        loaded: 0,
        status: "queued",
        file,
      });
    }
    this.items = [...this.items, ...created];
    this.pump();
    return ids;
  }

  private patch(id: string, patch: Partial<UploadItem>) {
    this.items = this.items.map((i) => (i.id === id ? { ...i, ...patch } : i));
  }

  private pump() {
    while (this.activeCount < CONCURRENCY) {
      const next = this.items.find((i) => i.status === "queued");
      if (!next) break;
      this.start(next);
    }
    if (!this.inFlight) {
      const waiters = this.waiters;
      this.waiters = [];
      for (const w of waiters) w();
    }
  }

  private start(item: UploadItem) {
    const id = item.id;
    this.patch(id, { status: "uploading", error: undefined });
    let aborted = false;
    const xhr = uploadFileXhr(item.url, item.file, {
      onProgress: (loaded, total) => this.patch(id, { loaded, size: total || item.size }),
      onDone: () => {
        this.patch(id, { status: "done", loaded: item.size });
        this.abortHooks.delete(id);
        this.pump();
      },
      onError: (err) => {
        this.patch(id, { status: aborted ? "canceled" : "error", error: err.message });
        this.abortHooks.delete(id);
        this.pump();
      },
    });
    this.abortHooks.set(id, () => {
      aborted = true;
      xhr.abort();
    });
  }

  /**
   * Resume a failed upload: HEAD the target to see how much of the file is
   * already on the server, then PATCH-append the rest. This is dufs' native
   * resumable protocol — PUT would restart (or collide) from byte zero.
   */
  private async resume(item: UploadItem) {
    const id = item.id;
    this.patch(id, { status: "uploading", error: undefined });
    let offset: number;
    try {
      offset = await probeUploadOffset(item.url);
    } catch (e) {
      this.patch(id, { status: "error", error: e instanceof Error ? e.message : "探测断点失败" });
      this.pump();
      return;
    }
    // Bytes on the server must be ours before we build on them; otherwise
    // start over with a full PUT (which replaces whatever is there).
    if (offset > item.size || !(await serverHoldsOurPrefix(item.url, item.file, offset))) {
      this.start(item);
      return;
    }
    if (offset === item.size) {
      // Already complete (e.g. the "failure" was the connection dropping after
      // the last byte): verify nothing, mark done.
      this.patch(id, { status: "done", loaded: item.size });
      this.pump();
      return;
    }
    let aborted = false;
    const xhr = resumeUploadXhr(item.url, item.file, offset, {
      onProgress: (loaded) => this.patch(id, { loaded: Math.max(offset, loaded) }),
      onDone: () => {
        this.patch(id, { status: "done", loaded: item.size });
        this.abortHooks.delete(id);
        this.pump();
      },
      onError: (err) => {
        this.patch(id, { status: aborted ? "canceled" : "error", error: err.message });
        this.abortHooks.delete(id);
        this.pump();
      },
    });
    this.abortHooks.set(id, () => {
      aborted = true;
      xhr.abort();
    });
  }


  cancel(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (item.status === "uploading") {
      this.abortHooks.get(id)?.();
    } else if (item.status === "queued") {
      this.patch(id, { status: "canceled", error: "已取消" });
      this.pump();
    }
  }

  cancelAll() {
    for (const item of [...this.items]) this.cancel(item.id);
  }

  retry(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    // Retry resumes from whatever the server already holds; a fresh queue
    // entry would restart the transfer from zero.
    void this.resume(item);
  }

  clearFinished() {
    this.items = this.items.filter((i) => i.status === "uploading" || i.status === "queued");
  }

  /** Resolves once nothing is queued or uploading. */
  whenIdle(): Promise<void> {
    if (!this.inFlight) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

export const uploads = new UploadsStore();
