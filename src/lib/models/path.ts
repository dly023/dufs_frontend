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

/** Human name of a directory path ("/" → 根目录). */
export function dirName(path: string): string {
  const last = path.split("/").filter(Boolean).pop();
  return last ? decodeURIComponent(last) : "根目录";
}

/** Parent directory of a path, with trailing slash ("/a/b/" → "/a/"). */
export function parentDir(path: string): string {
  const segs = path.split("/").filter(Boolean);
  segs.pop();
  return segs.length ? `/${segs.join("/")}/` : "/";
}

export interface Crumb {
  label: string;
  path: string;
}

export function crumbsOf(path: string): Crumb[] {
  const out: Crumb[] = [{ label: "根目录", path: "/" }];
  let acc = "";
  for (const seg of path.split("/").filter(Boolean)) {
    acc += `/${seg}`;
    out.push({ label: decodeURIComponent(seg), path: `${acc}/` });
  }
  return out;
}
