// Directory listing with a tiny cache.
import { fetchDirectory } from "./client";

export interface Entry {
  name: string;
  size: number;
  isDir: boolean;
}

const cache = new Map<string, Entry[]>();

/* Load a folder, reusing the cached copy when it is fresh. */
export async function load(path: string, force = false): Promise<Entry[]> {
  if (!force && cache.has(path)) return cache.get(path)!;
  const data = await fetchDirectory(`${path}?json`);
  const entries = data.paths.map((p) => ({ name: p.name, size: p.size ?? 0, isDir: p.is_dir }));
  cache.set(path, entries);
  return entries.length > 0 ? entries : [];
}
