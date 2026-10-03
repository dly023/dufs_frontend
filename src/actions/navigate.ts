import { dirName, ensureTrailingSlash, pathFromLocation } from "../lib/models/path";
import { scrollMemory } from "../stores/scrollMemory";
import { places } from "../stores/places.svelte";
import type { ViewMode } from "../stores/prefs.svelte";
import { prefs } from "../stores/prefs.svelte";
import { directory } from "../stores/directory.svelte";
import { selection } from "../stores/selection.svelte";

export type PreviewKind = "comic" | "file" | null;

export function readUrlState(): {
  path: string;
  view: ViewMode | null;
  preview: PreviewKind;
  file: string | null;
} {
  const params = new URLSearchParams(location.search);
  const viewParam = params.get("view");
  const view =
    viewParam === "gallery" || viewParam === "grid" || viewParam === "list"
      ? viewParam
      : null;
  const previewRaw = params.get("preview");
  const preview: PreviewKind =
    previewRaw === "comic" ? "comic" : previewRaw === "file" ? "file" : null;
  const file = params.get("file");
  const path = ensureTrailingSlash(pathFromLocation());
  return { path, view, preview, file };
}

export function writeUrl(opts: {
  path?: string;
  view?: ViewMode;
  preview?: PreviewKind;
  file?: string | null;
  replace?: boolean;
}) {
  const url = new URL(location.href);
  if (opts.path !== undefined) {
    url.pathname = ensureTrailingSlash(opts.path);
  }
  if (opts.view !== undefined) {
    if (opts.view === "gallery") url.searchParams.delete("view");
    else url.searchParams.set("view", opts.view);
  }
  if (opts.preview !== undefined) {
    if (!opts.preview) url.searchParams.delete("preview");
    else url.searchParams.set("preview", opts.preview);
  }
  if (opts.file !== undefined) {
    if (!opts.file) url.searchParams.delete("file");
    else url.searchParams.set("file", opts.file);
  }
  const next = url.pathname + url.search + url.hash;
  if (opts.replace) history.replaceState(null, "", next);
  else history.pushState(null, "", next);
}

export function navigateTo(path: string, opts?: { isReturn?: boolean }) {
  const p = ensureTrailingSlash(path);
  // Remember previous folder scroll position if leaving
  if (directory.path && directory.path !== p) {
    const mainEl = document.querySelector<HTMLElement>(".main");
    if (mainEl) scrollMemory.remember(directory.path, mainEl.scrollTop);
  }
  // Leaving counts as having seen it: changes you made inside don't come back as "new".
  places.markVisited(directory.path);
  places.markVisited(p);
  selection.clear();
  writeUrl({ path: p, preview: null, file: null });
  places.pushRecent({ path: p, name: dirName(p), isDir: true });
  void directory.load(p);
}

export function setView(mode: ViewMode) {
  prefs.setViewMode(mode);
  writeUrl({ view: mode, replace: true });
}

/** `file` carries the comic root so a folder can be read from its parent. */
export function openComicPreview(root?: string) {
  writeUrl({ preview: "comic", file: root ?? null });
}

export function closePreview() {
  writeUrl({ preview: null, file: null, replace: true });
}
