import {
  createFolder,
  deleteItem,
  fetchDirectory,
  getToken,
  invalidateDirectoryCache,
  moveItem,
} from "../lib/dufs/client";
import { auth } from "../stores/auth.svelte";
import { directory } from "../stores/directory.svelte";
import { selection } from "../stores/selection.svelte";
import { toasts } from "../stores/toast.svelte";
import { dialogs } from "../stores/dialog.svelte";
import { trash, TRASH_DIR, genTrashId, type TrashEntry } from "../stores/trash.svelte";
import { uploads } from "../stores/uploads.svelte";
import { folderProbes } from "../stores/folderProbe.svelte";
import { ensureTrailingSlash } from "../lib/models/path";
import type { PathItem } from "../lib/dufs/types";

async function reloadDir() {
  selection.clear();
  // Child folders may have changed too (moves, uploads into them).
  invalidateDirectoryCache();
  folderProbes.reset();
  await directory.load(directory.path, undefined, { skipCache: true });
}

interface UploadEntry {
  file: File;
  relPath: string;
}

async function runUploads(entries: UploadEntry[], basePath: string) {
  if (!entries.length) return;
  const ids = uploads.enqueue(entries, basePath);
  await uploads.whenIdle();
  const mine = uploads.items.filter((i) => ids.includes(i.id));
  const ok = mine.filter((i) => i.status === "done").length;
  const failed = mine.filter((i) => i.status === "error").length;
  if (ok) toasts.success(`已上传 ${ok} 个文件`);
  if (failed) toasts.error(`${failed} 个文件上传失败`);
  await reloadDir();
}

export async function actionUploadFiles(files: FileList | File[], basePath?: string) {
  const base = basePath ?? directory.path;
  const list = Array.from(files);
  if (!list.length) return;
  await runUploads(
    list.map((f) => ({ file: f, relPath: f.name })),
    base,
  );
}

async function actionUploadEntries(entries: UploadEntry[], basePath?: string) {
  await runUploads(entries, basePath ?? directory.path);
}

/** Walk a dropped FileSystemEntry, preserving directory structure. */
async function readEntryRecursive(entry: any, prefix: string, out: UploadEntry[]): Promise<void> {
  if (entry.isFile) {
    const file: File = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ file, relPath: prefix + entry.name });
  } else if (entry.isDirectory) {
    const reader = entry.createReader();
    const subPrefix = `${prefix}${entry.name}/`;
    // readEntries returns partial batches; keep reading until empty.
    for (;;) {
      const batch: any[] = await new Promise((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      for (const child of batch) await readEntryRecursive(child, subPrefix, out);
    }
  }
}

/** Handle a drop: folders are walked recursively when the browser exposes entries. */
export async function actionUploadDataTransfer(dt: DataTransfer, basePath?: string) {
  const items = dt.items;
  if (items && items.length && typeof (items[0] as any).webkitGetAsEntry === "function") {
    const roots: any[] = [];
    for (const it of Array.from(items)) {
      if (it.kind !== "file") continue;
      const entry = (it as any).webkitGetAsEntry?.();
      if (entry) roots.push(entry);
    }
    const out: UploadEntry[] = [];
    await Promise.all(roots.map((e) => readEntryRecursive(e, "", out)));
    await actionUploadEntries(out, basePath);
    return;
  }
  if (dt.files?.length) await actionUploadFiles(dt.files, basePath);
}

export async function actionNewFolder() {
  const name = await dialogs.prompt({
    title: "新建文件夹",
    message: "输入文件夹名称",
    promptLabel: "名称",
    confirmText: "创建",
  });
  if (!name?.trim()) return;
  try {
    await createFolder(directory.path + encodeURIComponent(name.trim()));
    toasts.success("文件夹已创建");
    await reloadDir();
  } catch (e) {
    toasts.error(e instanceof Error ? e.message : "创建失败");
  }
}

/** Set once the trash folder is known to exist, so deletes don't re-check. */
let trashReady = false;

async function ensureTrashDir(): Promise<void> {
  if (trashReady) return;
  try {
    // `?json` reports dir_exists without an error status (HEAD answers 200 either way),
    // so MKCOL only runs when it is really needed and never logs a 405.
    const data = await fetchDirectory(TRASH_DIR, undefined, { skipCache: true });
    if (!data?.dir_exists) await createFolder(TRASH_DIR);
    trashReady = true;
  } catch {
    // No permission or a race — the MOVE below will surface real errors.
  }
}

export async function actionDeleteItems(items: PathItem[]) {
  if (!items.length) return;
  const ok = await dialogs.confirm({
    title: "移入回收站",
    message: `确定移除 ${items.length} 项？可在回收站恢复。`,
    confirmText: "移除",
    danger: true,
  });
  if (!ok) return;
  await ensureTrashDir();
  const entries: TrashEntry[] = [];
  for (const item of items) {
    const id = genTrashId();
    const trashPath = TRASH_DIR + id;
    try {
      await moveItem(item.fullpath, trashPath);
      entries.push({
        id,
        trashPath,
        originalPath: item.fullpath,
        name: item.name,
        isDir: item.is_dir,
        size: item.size,
        deletedAt: Date.now(),
      });
    } catch (e) {
      trashReady = false; // the folder may have vanished; re-check next time
      toasts.error(e instanceof Error ? e.message : `移除失败: ${item.name}`);
    }
  }
  if (entries.length) {
    for (const e of entries) trash.add(e);
    toasts.success(`已移入回收站：${entries.length} 项`, {
      label: "撤销",
      handler: () => void actionRestoreTrashEntries(entries),
    });
  }
  await reloadDir();
}

/** Restore trash entries to their original locations (used by undo + trash dialog). */
export async function actionRestoreTrashEntries(entries: TrashEntry[]) {
  // Idempotent: entries already restored (via the toast or the trash dialog) are skipped.
  const pending = entries.filter((e) => trash.items.some((t) => t.id === e.id));
  if (!pending.length) return;
  let n = 0;
  for (const e of pending) {
    try {
      await moveItem(e.trashPath, e.originalPath);
      trash.remove(e.id);
      n += 1;
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : `恢复失败: ${e.name}`);
    }
  }
  if (n) toasts.success(`已恢复 ${n} 项`);
  await reloadDir();
}

/** Permanently delete one trash entry (cannot be undone). */
export async function actionPurgeTrashEntry(entry: TrashEntry) {
  try {
    await deleteItem(entry.trashPath);
    trash.remove(entry.id);
    toasts.success(`已彻底删除 ${entry.name}`);
  } catch (e) {
    toasts.error(e instanceof Error ? e.message : `删除失败: ${entry.name}`);
  }
}

/** Empty the whole trash. */
export async function actionEmptyTrash() {
  const entries = [...trash.items];
  if (!entries.length) return;
  const ok = await dialogs.confirm({
    title: "清空回收站",
    message: `彻底删除 ${entries.length} 项？此操作不可恢复。`,
    confirmText: "清空",
    danger: true,
  });
  if (!ok) return;
  let n = 0;
  for (const e of entries) {
    try {
      await deleteItem(e.trashPath);
      trash.remove(e.id);
      n += 1;
    } catch {
      /* keep the entry so it can be retried */
    }
  }
  toasts.success(`已彻底删除 ${n} 项`);
}

export async function actionDeleteSelected() {
  const items = directory.paths.filter((p) => selection.has(p.fullpath));
  await actionDeleteItems(items);
}

export function actionRename(item: PathItem) {
  return (async () => {
    const next = await dialogs.prompt({
      title: "重命名",
      message: item.name,
      promptDefault: item.name,
      confirmText: "重命名",
    });
    if (!next?.trim() || next.trim() === item.name) return;
    const dest = directory.path + encodeURIComponent(next.trim());
    const renamed: [string, string][] = [[dest, item.fullpath]];
    try {
      await moveItem(item.fullpath, dest);
      toasts.success("已重命名", {
        label: "撤销",
        handler: () => void undoMove(renamed),
      });
      await reloadDir();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "重命名失败");
    }
  })();
}

export async function actionMoveItems(items: PathItem[]) {
  if (!items.length) return;
  const dest = await dialogs.prompt({
    title: "移动到",
    message: `将 ${items.length} 项移动到目标目录（以 / 结尾）`,
    promptDefault: directory.path,
    promptLabel: "目标路径",
    confirmText: "移动",
  });
  if (!dest?.trim()) return;
  const base = ensureTrailingSlash(dest.trim());
  const moved: [string, string][] = [];
  let n = 0;
  for (const item of items) {
    const target = base + encodeURIComponent(item.name);
    try {
      await moveItem(item.fullpath, target);
      moved.push([target, item.fullpath]);
      n += 1;
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : `移动失败: ${item.name}`);
    }
  }
  if (n) {
    toasts.success(`已移动 ${n} 项`, { label: "撤销", handler: () => void undoMove(moved) });
  }
  await reloadDir();
}

/** Move sets already reversed; a second undo of the same set is a no-op. */
const undone = new WeakSet<[string, string][]>();

/** Reverse a set of [from, to] moves (used by undo). */
async function undoMove(pairs: [string, string][]) {
  if (undone.has(pairs)) return;
  undone.add(pairs);
  let n = 0;
  for (const [from, to] of pairs) {
    try {
      await moveItem(from, to);
      n += 1;
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "撤销失败");
    }
  }
  if (n) toasts.success(`已撤销 ${n} 项`);
  await reloadDir();
}

export async function actionMoveSelected() {
  const items = directory.paths.filter((p) => selection.has(p.fullpath));
  await actionMoveItems(items);
}

/**
 * Download link for one item: files directly, folders as dufs `?zip`. Behind
 * auth a plain link can't carry the Basic header, so ask dufs for a token link;
 * if that fails (auth off / old dufs) fall back to the plain link.
 */
async function downloadHref(item: PathItem): Promise<string> {
  const plain = item.is_dir ? `${item.fullpath}/?zip` : item.fullpath;
  if (!auth.isAuthed) return plain;
  try {
    const token = (await getToken(item.fullpath, item.is_dir)).trim();
    if (token.length >= 16) {
      const t = encodeURIComponent(token);
      return item.is_dir ? `${item.fullpath}/?zip&token=${t}` : `${item.fullpath}?token=${t}`;
    }
  } catch {
    /* fall back to the plain link */
  }
  return plain;
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.rel = "noopener";
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * dufs can only zip a whole directory, so there is no single archive for an
 * arbitrary selection: one folder → its zip, anything else → one download per
 * item, staggered so browsers accept the burst.
 */
export async function actionZipSelected() {
  const items = directory.paths.filter((p) => selection.has(p.fullpath));
  if (!items.length) return;
  if (items.length > 1) toasts.push(`开始下载 ${items.length} 项`, "info");
  for (const [i, item] of items.entries()) {
    if (i > 0) await wait(250);
    triggerDownload(await downloadHref(item), item.is_dir ? `${item.filename}.zip` : item.filename);
  }
}

export async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      toasts.success("已复制");
      return;
    }
  } catch {
    /* fall through to the legacy path (unfocused document, no permission…) */
  }
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "-1000px";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    if (ok) toasts.success("已复制");
    else toasts.error("复制失败");
  } catch {
    toasts.error("复制失败");
  }
}
