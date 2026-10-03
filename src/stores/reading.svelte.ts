import { SvelteMap } from "svelte/reactivity";

/**
 * Where you stopped in each comic, keyed by its root folder path (no trailing
 * slash, as ComicReader sees it). Lets the parent listing show progress and
 * resume a series at the right chapter.
 */
export interface ReadingMark {
  page: number;
  total: number;
  /** Chapter folder name the page belongs to (series only). */
  chapter?: string;
  at: number;
}

const PREFIX = "dufs-comic:";

function parse(raw: string | null): ReadingMark | null {
  if (!raw) return null;
  try {
    return raw.startsWith("{") ? (JSON.parse(raw) as ReadingMark) : { page: Number(raw) || 0, total: 0, at: 0 };
  } catch {
    return null;
  }
}

/** All marks are read once up front, so lookups stay pure (safe inside $derived). */
function loadAll(): SvelteMap<string, ReadingMark> {
  const out = new SvelteMap<string, ReadingMark>();
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const mark = parse(localStorage.getItem(key));
      if (mark) out.set(key.slice(PREFIX.length), mark);
    }
  } catch {
    /* storage unavailable */
  }
  return out;
}

class ReadingStore {
  private marks = loadAll();

  get(root: string): ReadingMark | null {
    return this.marks.get(root) ?? null;
  }

  set(root: string, mark: Omit<ReadingMark, "at">) {
    const next = { ...mark, at: Date.now() };
    this.marks.set(root, next);
    try {
      localStorage.setItem(PREFIX + root, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
}

export const reading = new ReadingStore();
