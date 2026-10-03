/**
 * The top of the browsable tree. dufs can be mounted under a URL prefix
 * (`--path-prefix files` → everything lives under `/files/`); nothing in the
 * app may navigate, search or build paths above it.
 *
 * Seeded synchronously from where our own bundle was served
 * (`<prefix>__dufs_vX.Y.Z__/assets/index.js`), then confirmed by the
 * `uri_prefix` dufs reports in every listing.
 */
function fromBundleUrl(): string {
  try {
    const m = new URL(import.meta.url).pathname.match(/^(.*\/)__dufs_v[^/]+__\//);
    if (m) return m[1];
  } catch {
    /* not served by dufs (dev) */
  }
  return "/";
}

function normalize(prefix: string): string {
  const p = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return p.endsWith("/") ? p : `${p}/`;
}

let root = $state(normalize(fromBundleUrl()));

/** Current tree root, always with leading and trailing slash. */
export function rootPath(): string {
  return root;
}

/** Adopt the prefix a dufs listing reports (`uri_prefix`). */
export function setRootFromListing(uriPrefix: string | null | undefined): void {
  if (!uriPrefix) return;
  const next = normalize(uriPrefix);
  if (next !== root) root = next;
}

export function isRoot(path: string): boolean {
  return path === root;
}

/** `path` if it lies inside the tree, otherwise the root. */
export function clampToRoot(path: string): string {
  return path.startsWith(root) ? path : root;
}
