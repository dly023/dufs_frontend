import { circleReveal } from "../lib/motion";

const KEY = {
  view: "dufs-view",
  theme: "dufs-theme",
  sort: "dufs-sort",
  filter: "dufs-filter",
  scope: "dufs-search-scope",
} as const;

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export type ThemeMode = "system" | "light" | "dark" | "oled";
export type ViewMode = "gallery" | "grid" | "list";
export type SortColumn = "name" | "mtime" | "size";
export type SortDirection = "asc" | "desc";
export type TypeFilter = "all" | "image" | "video" | "audio" | "document" | "archive" | "code";
export type SearchScope = "folder" | "global";

interface SortPref {
  column: SortColumn;
  direction: SortDirection;
}

class PrefsStore {
  viewMode = $state<ViewMode>(load(KEY.view, "gallery"));
  theme = $state<ThemeMode>(load(KEY.theme, "system"));

  private savedSort = load<SortPref>(KEY.sort, { column: "name", direction: "asc" });
  sortColumn = $state<SortColumn>(this.savedSort.column);
  sortDirection = $state<SortDirection>(this.savedSort.direction);
  typeFilter = $state<TypeFilter>(load(KEY.filter, "all"));
  searchScope = $state<SearchScope>(load(KEY.scope, "folder"));

  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    save(KEY.view, mode);
  }

  setTheme(mode: ThemeMode, origin?: { x: number; y: number }) {
    const commit = () => {
      this.theme = mode;
      save(KEY.theme, mode);
      applyTheme(mode);
    };
    if (origin && isDark(mode) !== isDark(this.theme)) circleReveal(origin.x, origin.y, commit);
    else commit();
  }

  /** system → light → dark → oled. */
  cycleTheme(origin?: { x: number; y: number }) {
    const i = THEME_ORDER.indexOf(this.theme);
    this.setTheme(THEME_ORDER[(i + 1) % THEME_ORDER.length], origin);
  }

  /** Click a column: same column cycles asc → desc → (name default), new column starts asc. */
  toggleSort(col: SortColumn) {
    if (this.sortColumn === col) {
      if (this.sortDirection === "asc") this.sortDirection = "desc";
      else {
        this.sortColumn = "name";
        this.sortDirection = "asc";
      }
    } else {
      this.sortColumn = col;
      this.sortDirection = "asc";
    }
    this.persistSort();
  }

  setSort(column: SortColumn, direction: SortDirection) {
    this.sortColumn = column;
    this.sortDirection = direction;
    this.persistSort();
  }

  private persistSort() {
    save(KEY.sort, { column: this.sortColumn, direction: this.sortDirection } satisfies SortPref);
  }

  setTypeFilter(filter: TypeFilter) {
    this.typeFilter = filter;
    save(KEY.filter, filter);
  }

  toggleSearchScope() {
    this.searchScope = this.searchScope === "folder" ? "global" : "folder";
    save(KEY.scope, this.searchScope);
  }
}

export const THEME_ORDER: ThemeMode[] = ["system", "light", "dark", "oled"];

const darkQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

function isDark(mode: ThemeMode): boolean {
  return mode === "dark" || mode === "oled" || (mode === "system" && darkQuery().matches);
}

export function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("dark", isDark(mode));
  root.classList.toggle("oled", mode === "oled");
  root.dataset.theme = mode;
}

export const prefs = new PrefsStore();

// Follow the OS when the user has not pinned a theme.
if (typeof window !== "undefined") {
  darkQuery().addEventListener("change", () => {
    if (prefs.theme === "system") applyTheme("system");
  });
}
