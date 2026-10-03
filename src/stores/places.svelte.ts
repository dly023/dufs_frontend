const BK = "dufs-bookmarks";
const RC = "dufs-recents";
const RECENT_MAX = 25;

export interface PlaceEntry {
  path: string;
  name: string;
  isDir: boolean;
  ts?: number;
}

function load(key: string): PlaceEntry[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PlaceEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(key: string, list: PlaceEntry[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

const VISITS = "dufs-visits";
const VISITS_MAX = 400;

function loadVisits(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(VISITS) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

class PlacesStore {
  /** Last time each directory was left (ms), for "changed since you looked" dots. */
  visits = $state<Record<string, number>>(loadVisits());

  /** Record that you have seen `path` as of now (called on enter and on leave). */
  markVisited(path: string) {
    const next = { ...this.visits, [path]: Date.now() };
    const keys = Object.keys(next);
    if (keys.length > VISITS_MAX) {
      keys.sort((a, b) => next[a] - next[b]);
      for (const k of keys.slice(0, keys.length - VISITS_MAX)) delete next[k];
    }
    this.visits = next;
    try {
      localStorage.setItem(VISITS, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  bookmarks = $state<PlaceEntry[]>(load(BK));
  recents = $state<PlaceEntry[]>(load(RC));

  isBookmarked(path: string) {
    return this.bookmarks.some((b) => b.path === path);
  }

  toggleBookmark(entry: PlaceEntry) {
    if (this.isBookmarked(entry.path)) {
      this.bookmarks = this.bookmarks.filter((b) => b.path !== entry.path);
    } else {
      this.bookmarks = [{ path: entry.path, name: entry.name, isDir: entry.isDir }, ...this.bookmarks].slice(0, 50);
    }
    persist(BK, this.bookmarks);
  }

  removeBookmark(path: string) {
    this.bookmarks = this.bookmarks.filter((b) => b.path !== path);
    persist(BK, this.bookmarks);
  }

  pushRecent(entry: Omit<PlaceEntry, "ts">) {
    this.recents = [
      { ...entry, ts: Date.now() },
      ...this.recents.filter((r) => r.path !== entry.path),
    ].slice(0, RECENT_MAX);
    persist(RC, this.recents);
  }

}

export const places = new PlacesStore();
