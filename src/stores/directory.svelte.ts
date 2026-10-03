import type { DufsData, PathItem } from "../lib/dufs/types";
import {
  fetchDirectory,
  loadInitialData,
  peekDirectory,
  listingSignature,
  DufsHttpError,
} from "../lib/dufs/client";
import { ensureTrailingSlash, pathFromLocation } from "../lib/models/path";
import { naturalCompare } from "../lib/models/sort";
import { getFileCategory } from "../lib/models/exts";
import { suggestsComic } from "../lib/smart/profile";
import { prefs } from "./prefs.svelte";
import { rootPath } from "../lib/root.svelte";

class DirectoryStore {
  path = $state("/");
  raw = $state<DufsData | null>(null);
  loading = $state(false);
  error = $state<string | null>(null);
  /** Active search query; empty when showing a plain listing. */
  search = $state("");
  /** Directory we were in before the last navigation (for "came from" cues). */
  previousPath = $state<string | null>(null);
  /** Scroll positions keyed by path (restored when a reader closes). */
  private scrollY = new Map<string, number>();

  paths = $derived(this.raw?.paths ?? []);

  sortedPaths = $derived.by(() => {
    const filter = prefs.typeFilter;
    const items = this.paths.filter(
      (p) =>
        !(p.is_dir && p.name === ".trash" && this.path === rootPath()) &&
        (filter === "all" || p.is_dir || getFileCategory(p.ext) === filter),
    );
    const col = prefs.sortColumn;
    const desc = prefs.sortDirection === "desc";
    return [...items].sort((a, b) => {
      // Folders always lead, regardless of column.
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let cmp = 0;
      if (col === "name") cmp = naturalCompare(a.name, b.name);
      else if (col === "mtime") cmp = a.mtime - b.mtime;
      else cmp = a.size - b.size;
      return desc ? -cmp : cmp;
    });
  });

  suggestComic = $derived(suggestsComic(this.paths, this.path));

  allowUpload = $derived(!!this.raw?.allow_upload);
  allowDelete = $derived(!!this.raw?.allow_delete);
  allowArchive = $derived(!!this.raw?.allow_archive);
  user = $derived(this.raw?.user ?? null);
  authRequired = $derived(!!this.raw?.auth);

  rememberScroll(y: number) {
    this.scrollY.set(this.path, y);
  }

  takeScroll(): number {
    return this.scrollY.get(this.path) ?? 0;
  }

  /** Bumped per request so a slow, superseded response can never land. */
  private seq = 0;

  async load(path?: string, searchQuery?: string, opts?: { skipCache?: boolean }) {
    const p = ensureTrailingSlash(path ?? this.path);
    if (p !== this.path) this.previousPath = this.path;
    this.path = p;
    this.search = searchQuery?.trim() ?? "";
    const ticket = ++this.seq;

    // Stale-while-revalidate: paint what we have, then always ask the server.
    const cached = !searchQuery ? peekDirectory(p) : null;
    if (cached) this.raw = cached;
    this.loading = !cached;
    this.error = null;

    try {
      const data = await fetchDirectory(p, searchQuery || undefined, { ...opts, skipCache: true });
      if (ticket !== this.seq || !data) return;
      // Same listing: keep the current object so nothing re-renders.
      if (!cached || listingSignature(data) !== listingSignature(this.raw)) this.raw = data;
    } catch (e) {
      if (ticket !== this.seq) return;
      const msg =
        e instanceof DufsHttpError
          ? `${e.status} ${e.message}`
          : e instanceof Error
            ? e.message
            : "加载失败";
      // A cached listing stays usable offline; credentials errors must still surface.
      if (!cached || (e instanceof DufsHttpError && (e.status === 401 || e.status === 403))) this.error = msg;
    } finally {
      if (ticket === this.seq) this.loading = false;
    }
  }

  /** Search within the current directory, or from the root when scope is global. */
  async runSearch(q: string, scope: "folder" | "global") {
    const query = q.trim();
    if (!query) return this.load(this.path, undefined, { skipCache: true });
    this.search = query;
    const ticket = ++this.seq;
    this.loading = true;
    this.error = null;
    try {
      const data = await fetchDirectory(scope === "global" ? rootPath() : this.path, query, {
        skipCache: true,
      });
      if (ticket === this.seq && data) this.raw = data;
    } catch (e) {
      if (ticket !== this.seq) return;
      this.error =
        e instanceof DufsHttpError
          ? `${e.status} ${e.message}`
          : e instanceof Error
            ? e.message
            : "搜索失败";
    } finally {
      if (ticket === this.seq) this.loading = false;
    }
  }

  bootstrapFromUrl() {
    const p = ensureTrailingSlash(pathFromLocation());
    this.path = p;
    const initial = loadInitialData(p);
    if (initial) {
      this.raw = initial;
      return;
    }
    void this.load(p);
  }
}

export const directory = new DirectoryStore();

export type { PathItem };
