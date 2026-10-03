import { rootPath } from "../root.svelte";

export function getExt(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0) return "";
  return name.slice(i + 1).toLowerCase();
}

export function ensureTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

export function pathFromLocation(): string {
  const raw = location.pathname;
  const segments = raw
    .split("/")
    .filter(Boolean)
    .map((s) => `/${encodeURIComponent(decodeURIComponent(s))}`);
  return segments.join("") || "/";
}

export function directoryItemFromPath(path: string): import("./../dufs/types").PathItem {
  const clean = path.replace(/\/+$/, "") || "/";
  const name =
    clean === "/"
      ? "root"
      : decodeURIComponent(clean.split("/").filter(Boolean).pop() || "folder");
  return {
    path_type: "Dir",
    name,
    mtime: 0,
    size: 0,
    is_dir: true,
    is_symlink: false,
    ext: "",
    fullpath: clean,
    filename: name,
  };
}

/** Human name of a directory path (the tree root → 根目录). */
export function dirName(path: string): string {
  if (ensureTrailingSlash(path) === rootPath()) return "根目录";
  const last = path.split("/").filter(Boolean).pop();
  return last ? decodeURIComponent(last) : "根目录";
}

/** Parent directory with trailing slash ("/a/b/" → "/a/"); never above the root. */
export function parentDir(path: string): string {
  const root = rootPath();
  if (!path.startsWith(root) || path === root) return root;
  const segs = path.split("/").filter(Boolean);
  segs.pop();
  const parent = segs.length ? `/${segs.join("/")}/` : "/";
  return parent.startsWith(root) ? parent : root;
}

export interface Crumb {
  label: string;
  path: string;
}

/** Breadcrumbs from the tree root (not the URL root) down to `path`. */
export function crumbsOf(path: string): Crumb[] {
  const root = rootPath();
  const out: Crumb[] = [{ label: "根目录", path: root }];
  if (!path.startsWith(root)) return out;
  let acc = root.slice(0, -1);
  for (const seg of path.slice(root.length).split("/").filter(Boolean)) {
    acc += `/${seg}`;
    out.push({ label: decodeURIComponent(seg), path: `${acc}/` });
  }
  return out;
}
