import { SvelteMap } from "svelte/reactivity";
import { fetchDirectory } from "../lib/dufs/client";
import { getFileCategory, isImageExt } from "../lib/models/exts";
import { naturalCompare } from "../lib/models/sort";
import { ensureTrailingSlash } from "../lib/models/path";
import { looksLikeChapter } from "../lib/smart/profile";
import type { DufsData, PathItem } from "../lib/dufs/types";

/**
 * Peeks into folders as they scroll into view, so the parent listing can say
 * "38 页" / "12 话" and offer comic reading without opening the folder first.
 * Bounded: visible tiles only, a few requests at a time, cancelled when they
 * scroll away before starting. Results double as a prefetch.
 */
export interface FolderProbe {
  /** Direct children. */
  items: number;
  /** Direct sub-folders (0 → a leaf in the tree). */
  dirs: number;
  /** "pages": the folder itself is a chapter; "series": it holds chapters. */
  comic: "pages" | "series" | null;
  /** Pages for a chapter, chapters for a series. */
  count: number;
  /** A small-enough first picture to stand in for the folder. */
  cover: PathItem | null;
  /** What the folder mostly holds, when one kind clearly dominates. */
  kind: "video" | "audio" | "document" | null;
  /** Newest change among direct children (ms). */
  newest: number;
}

const CONCURRENCY = 4;
/** dufs has no thumbnails: never pull a huge original just to draw a cover. */
const COVER_MAX_BYTES = 2 * 1024 * 1024;

function shape(d: DufsData | null) {
  const paths = (d?.paths ?? []).filter((p) => p.name !== ".trash");
  const dirs = paths.filter((p) => p.is_dir);
  const files = paths.filter((p) => !p.is_dir);
  const images = files.filter((p) => isImageExt(p.ext)).sort((a, b) => naturalCompare(a.name, b.name));
  return { paths, dirs, files, images };
}

type Shape = ReturnType<typeof shape>;

const isChapter = (s: Shape) => looksLikeChapter(s.images.length, s.files.length);

function coverOf(s: Shape): PathItem | null {
  return s.images.slice(0, 10).find((p) => p.size > 0 && p.size <= COVER_MAX_BYTES) ?? null;
}

function dominantKind(s: Shape): FolderProbe["kind"] {
  if (s.files.length < 3) return null;
  const tally = { video: 0, audio: 0, document: 0 };
  for (const f of s.files) {
    const c = getFileCategory(f.ext);
    if (c === "video" || c === "audio" || c === "document") tally[c] += 1;
  }
  const [k, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  return n / s.files.length >= 0.6 ? (k as FolderProbe["kind"]) : null;
}

async function probe(path: string): Promise<FolderProbe> {
  const own = shape(await fetchDirectory(path));
  const base = {
    items: own.paths.length,
    dirs: own.dirs.length,
    newest: own.paths.reduce((m, p) => Math.max(m, p.mtime), 0),
    kind: dominantKind(own),
  };
  if (isChapter(own)) return { ...base, comic: "pages", count: own.images.length, cover: coverOf(own) };
  // Mostly sub-folders: check whether the first one reads like a chapter.
  if (own.dirs.length >= 1 && own.files.length <= 2) {
    const first = [...own.dirs].sort((a, b) => naturalCompare(a.name, b.name))[0];
    const child = shape(await fetchDirectory(ensureTrailingSlash(`${first.fullpath}/`)));
    if (isChapter(child)) return { ...base, comic: "series", count: own.dirs.length, cover: coverOf(child) };
  }
  // A stray picture in a folder of documents shouldn't become its face.
  const mostlyImages = own.images.length * 2 >= own.files.length && own.images.length > 0;
  return { ...base, comic: null, count: 0, cover: mostlyImages ? coverOf(own) : null };
}

class FolderProbes {
  results = new SvelteMap<string, FolderProbe>();
  private queue: string[] = [];
  private running = 0;
  private seen = new Set<string>();

  get(path: string): FolderProbe | undefined {
    return this.results.get(path);
  }

  request(path: string) {
    if (this.seen.has(path)) return;
    this.seen.add(path);
    this.queue.push(path);
    this.pump();
  }

  /** Drop a queued probe (tile scrolled away before it started). */
  cancel(path: string) {
    const i = this.queue.indexOf(path);
    if (i < 0) return;
    this.queue.splice(i, 1);
    this.seen.delete(path);
  }

  /** Forget everything (auth change, uploads, deletes) and re-probe what is on screen. */
  reset() {
    this.queue = [];
    this.seen.clear();
    this.results.clear();
    if (!io) return;
    for (const node of observed) {
      io.unobserve(node);
      io.observe(node);
    }
  }

  private pump() {
    while (this.running < CONCURRENCY && this.queue.length) {
      const path = this.queue.shift()!;
      this.running += 1;
      probe(path)
        .then((r) => this.results.set(path, r))
        .catch(() => {})
        .finally(() => {
          this.running -= 1;
          this.pump();
        });
    }
  }
}

export const folderProbes = new FolderProbes();

/** Svelte action: probe a folder tile once it is near the viewport. */
let io: IntersectionObserver | null = null;
const targets = new WeakMap<Element, string>();
const observed = new Set<Element>();

function observer(): IntersectionObserver {
  io ??= new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        const path = targets.get(en.target);
        if (!path) continue;
        if (en.isIntersecting) folderProbes.request(path);
        else folderProbes.cancel(path);
      }
    },
    { rootMargin: "200px 0px" },
  );
  return io;
}

export function probeFolder(node: HTMLElement, path: string | null) {
  const attach = (p: string | null) => {
    if (!p) return;
    targets.set(node, p);
    observed.add(node);
    observer().observe(node);
  };
  attach(path);
  return {
    update(next: string | null) {
      observer().unobserve(node);
      observed.delete(node);
      attach(next);
    },
    destroy() {
      observer().unobserve(node);
      targets.delete(node);
      observed.delete(node);
    },
  };
}
