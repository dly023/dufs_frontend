import { rootPath } from "../lib/root.svelte";
const KEY = "dufs-trash";

export interface TrashEntry {
  id: string;
  /** Full dufs path inside the trash directory. */
  trashPath: string;
  /** Where the item came from (parent dir + name). */
  originalPath: string;
  name: string;
  isDir: boolean;
  size: number;
  deletedAt: number;
}

function load(): TrashEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrashEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(list: TrashEntry[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

class TrashStore {
  items = $state<TrashEntry[]>(load());

  get count() {
    return this.items.length;
  }

  add(entry: TrashEntry) {
    this.items = [entry, ...this.items];
    persist(this.items);
  }

  remove(id: string) {
    this.items = this.items.filter((t) => t.id !== id);
    persist(this.items);
  }

  clear() {
    this.items = [];
    persist(this.items);
  }
}

export const trash = new TrashStore();

/** Trash directory on the server, at the top of the served tree (honours --path-prefix). */
export function trashDir(): string {
  return `${rootPath()}.trash/`;
}

export function genTrashId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
