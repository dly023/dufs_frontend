import type { DufsData, PathItem } from "./types";
import { getExt } from "../models/path";
import { LRUCache, SessionMirror } from "./cache";
import { setRootFromListing } from "../root.svelte";

function getInitialData(): DufsData | undefined {
  const data = window.__INITIAL_DATA__;
  if (data) {
    delete window.__INITIAL_DATA__;
    return data;
  }
  return undefined;
}

const dirCache = new LRUCache<string, DufsData>(48);
/** Plain listings only (never search results), keyed by directory path. */
const dirMirror = new SessionMirror<DufsData>("dufs-dir:");
/** Object URLs for authenticated media (dufs needs the header, which <img> cannot send). */
const blobCache = new LRUCache<string, string>(40, (url) => URL.revokeObjectURL(url));

/** Base64 `user:pass` token for HTTP Basic, or null when unauthenticated. */
let authToken: string | null = null;

/** UTF-8 safe base64 of `user:pass` (btoa alone breaks on non-Latin1 input). */
export function basicAuthToken(user: string, pass: string): string {
  const bytes = new TextEncoder().encode(`${user}:${pass}`);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Set or clear the Basic credentials attached to every dufs request. */
export function setAuthToken(token: string | null): void {
  if (authToken === token) return;
  authToken = token;
  // Media fetched under different credentials must not be reused.
  blobCache.clear();
}

/** Short, non-reversible tag for the current credentials (never store the token itself). */
function credentialTag(): string {
  if (!authToken) return "anon";
  let h = 5381;
  for (let i = 0; i < authToken.length; i += 1) h = ((h << 5) + h + authToken.charCodeAt(i)) | 0;
  return `u${(h >>> 0).toString(36)}`;
}

function enrichPath(item: PathItem, currentPath: string): PathItem {
  item.is_dir = item.path_type === "Dir" || item.path_type === "SymlinkDir";
  item.is_symlink = item.path_type === "SymlinkDir" || item.path_type === "SymlinkFile";
  item.ext = getExt(item.name);
  // Search results carry a relative path in `name`; encode per segment.
  item.fullpath = currentPath + item.name.split("/").map(encodeURIComponent).join("/");
  item.filename = item.name.split("/").pop()!;
  return item;
}

export class DufsHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function dufsFetch(input: string, init?: RequestInit): Promise<Response> {
  const init2 = init ?? {};
  const headers = new Headers(init2.headers);
  if (authToken && !headers.has("Authorization")) headers.set("Authorization", `Basic ${authToken}`);
  init2.headers = headers;
  // "omit" stops the browser from hijacking a 401 + WWW-Authenticate challenge
  // with its native credential prompt, which would leave fetch() pending forever.
  if (init2.credentials === undefined) init2.credentials = "omit";
  const resp = await fetch(input, init2);
  if (resp.status >= 400) {
    throw new DufsHttpError(resp.status, resp.statusText || `HTTP ${resp.status}`);
  }
  return resp;
}

export async function fetchDirectory(
  currentPath: string,
  search?: string,
  opts?: { skipCache?: boolean },
): Promise<DufsData | null> {
  const cacheKey = `${currentPath}:${search ?? ""}`;
  if (!opts?.skipCache) {
    const cached = dirCache.get(cacheKey);
    if (cached) return cached;
  }

  const params = new URLSearchParams([["json", ""]]);
  if (search) params.append("q", search);

  const resp = await dufsFetch(`${currentPath}?${params}`);
  if (!resp.headers.get("Content-Type")?.startsWith("application/json")) {
    // Never hard-navigate the SPA: surface it as an error instead.
    throw new DufsHttpError(resp.status, "服务端返回了非 JSON 响应");
  }

  const data: DufsData = await resp.json();
  setRootFromListing(data.uri_prefix);
  data.paths.forEach((p) => enrichPath(p, currentPath));
  if (search) dirCache.set(cacheKey, data);
  else rememberDirectory(currentPath, data);
  return data;
}

/** Store a plain listing in memory and in the session mirror. */
function rememberDirectory(path: string, data: DufsData): void {
  dirCache.set(`${path}:`, data);
  dirMirror.set(path, credentialTag(), data);
}

/**
 * A listing we can paint right now without touching the network: memory first,
 * then the session mirror (survives reloads). Callers should still revalidate.
 */
export function peekDirectory(path: string): DufsData | null {
  const hot = dirCache.get(`${path}:`);
  if (hot) return hot;
  const warm = dirMirror.get(path, credentialTag());
  if (!warm) return null;
  dirCache.set(`${path}:`, warm);
  return warm;
}

/** Cheap change signature: entries, names, mtimes, sizes and server flags. */
export function listingSignature(d: DufsData | null): string {
  if (!d) return "";
  let s = `${d.paths.length}|${+d.allow_upload}${+d.allow_delete}${+d.allow_archive}${+d.auth}|${d.user ?? ""}|`;
  for (const p of d.paths) s += `${p.name}\u0000${p.mtime}\u0000${p.size}\u0001`;
  return s;
}

export function loadInitialData(currentPath: string): DufsData | undefined {
  const data = getInitialData();
  if (data) {
    setRootFromListing(data.uri_prefix);
    data.paths.forEach((p) => enrichPath(p, currentPath));
    rememberDirectory(currentPath, data);
  }
  return data;
}

export function prefetchDirectory(path: string): void {
  const key = `${path}:`;
  if (dirCache.has(key)) return;
  void fetchDirectory(path).catch(() => {});
}

export function invalidateDirectoryCache(pathPrefix?: string): void {
  if (!pathPrefix) {
    dirCache.clear();
    dirMirror.clear();
    return;
  }
  const prefix = `${pathPrefix}:`;
  for (const key of dirCache.keys()) {
    if (key.startsWith(prefix)) dirCache.delete(key);
  }
  dirMirror.delete(pathPrefix);
}

/**
 * PUT with upload progress. XHR is used because fetch() cannot report upload
 * progress. Returns the XHR so the caller can abort it.
 */
export function uploadFileXhr(
  url: string,
  file: File,
  handlers: {
    onProgress?: (loaded: number, total: number) => void;
    onDone?: () => void;
    onError?: (err: Error) => void;
  },
): XMLHttpRequest {
  const xhr = new XMLHttpRequest();
  xhr.open("PUT", url);
  if (authToken) xhr.setRequestHeader("Authorization", `Basic ${authToken}`);
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) handlers.onProgress?.(e.loaded, e.total);
  };
  xhr.onload = () => {
    if (xhr.status >= 400) handlers.onError?.(new DufsHttpError(xhr.status, xhr.statusText || `HTTP ${xhr.status}`));
    else handlers.onDone?.();
  };
  xhr.onerror = () => handlers.onError?.(new Error("网络错误"));
  xhr.onabort = () => handlers.onError?.(new Error("已取消"));
  xhr.send(file);
  return xhr;
}

/** Bytes already on the server for a partially uploaded file (0 if absent). */
export async function probeUploadOffset(url: string): Promise<number> {
  const resp = await fetch(url, {
    method: "HEAD",
    headers: authHeaders(),
    credentials: "omit",
  });
  if (resp.status === 404) return 0;
  if (!resp.ok) throw new DufsHttpError(resp.status, resp.statusText || `HTTP ${resp.status}`);
  return Number(resp.headers.get("content-length") ?? 0);
}

/** Continue a partial upload via dufs' `PATCH` + `X-Update-Range: append`. */
export function resumeUploadXhr(
  url: string,
  file: File,
  offset: number,
  handlers: {
    onProgress?: (loaded: number, total: number) => void;
    onDone?: () => void;
    onError?: (err: Error) => void;
  },
): XMLHttpRequest {
  const xhr = new XMLHttpRequest();
  xhr.open("PATCH", url);
  if (authToken) xhr.setRequestHeader("Authorization", `Basic ${authToken}`);
  xhr.setRequestHeader("X-Update-Range", "append");
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) handlers.onProgress?.(offset + e.loaded, file.size);
  };
  xhr.onload = () => {
    if (xhr.status >= 400) handlers.onError?.(new DufsHttpError(xhr.status, xhr.statusText || `HTTP ${xhr.status}`));
    else handlers.onDone?.();
  };
  xhr.onerror = () => handlers.onError?.(new Error("网络错误"));
  xhr.onabort = () => handlers.onError?.(new Error("已取消"));
  xhr.send(offset > 0 ? file.slice(offset) : file);
  return xhr;
}

export async function deleteItem(fullpath: string): Promise<void> {
  await dufsFetch(fullpath, { method: "DELETE" });
}

export async function moveItem(fullpath: string, destination: string): Promise<void> {
  await dufsFetch(fullpath, {
    method: "MOVE",
    headers: { Destination: destination },
  });
}

export async function createFolder(url: string): Promise<void> {
  await dufsFetch(url, { method: "MKCOL" });
}

/** Write text back to an existing file (used by the editor). */
export async function saveFile(fullpath: string, content: string): Promise<void> {
  await dufsFetch(fullpath, { method: "PUT", body: content });
}

/** dufs >=0.44 token download link (`?tokengen`). */
export async function getToken(fullpath: string, isDir: boolean): Promise<string> {
  const q = isDir ? "zip&tokengen" : "tokengen";
  const resp = await dufsFetch(`${fullpath}?${q}`);
  return resp.text();
}

export type TextEncoding = "utf-8" | "utf-16le" | "utf-16be" | "gb18030";

/**
 * Decode file bytes the way people actually store text: BOMs first, then strict
 * UTF-8, then GB18030 (a superset of GBK/GB2312 — most legacy Chinese .txt).
 * `cut` = the bytes were truncated (range read): a multi-byte sequence split at
 * the end must not be mistaken for a non-UTF-8 file.
 */
export function decodeText(buf: ArrayBuffer, cut = false): { text: string; encoding: TextEncoding } {
  const b = new Uint8Array(buf);
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(b.subarray(3)), encoding: "utf-8" };
  }
  if (b[0] === 0xff && b[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(b.subarray(2)), encoding: "utf-16le" };
  if (b[0] === 0xfe && b[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(b.subarray(2)), encoding: "utf-16be" };
  // Drop an incomplete trailing UTF-8 sequence (≤3 bytes) before judging.
  let end = b.length;
  if (cut) {
    for (let i = 1; i <= 3 && end - i >= 0; i += 1) {
      const c = b[end - i];
      if ((c & 0xc0) === 0x80) continue; // continuation byte, keep looking back
      const need = c >= 0xf0 ? 4 : c >= 0xe0 ? 3 : c >= 0xc0 ? 2 : 1;
      if (need > i) end -= i;
      break;
    }
  }
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(b.subarray(0, end)), encoding: "utf-8" };
  } catch {
    // GB18030 sequences are ≤4 bytes too; a cut tail decodes to at most one U+FFFD.
    return { text: new TextDecoder("gb18030").decode(b), encoding: "gb18030" };
  }
}

/** Text plus the encoding it was stored in (the editor warns before re-saving non-UTF-8). */
export async function fetchText(fullpath: string): Promise<{ text: string; encoding: TextEncoding }> {
  const resp = await dufsFetch(fullpath);
  return decodeText(await resp.arrayBuffer());
}

export async function fetchFileText(fullpath: string): Promise<string> {
  return (await fetchText(fullpath)).text;
}

/**
 * Fetch a file with credentials and return an object URL usable by <img>.
 * Needed because <img src> cannot carry the Basic Authorization header; without
 * this, images behind dufs auth would 401 (and trigger the browser's own prompt).
 */
export async function fetchBlobUrl(fullpath: string): Promise<string> {
  const cached = blobCache.get(fullpath);
  if (cached) return cached;
  const resp = await dufsFetch(fullpath);
  const url = URL.createObjectURL(await resp.blob());
  blobCache.set(fullpath, url);
  return url;
}

export async function fetchFileHead(
  fullpath: string,
  bytes: number,
): Promise<{ text: string; partial: boolean }> {
  try {
    const resp = await dufsFetch(fullpath, {
      headers: { Range: `bytes=0-${Math.max(0, bytes - 1)}` },
    });
    const partial = resp.status === 206;
    const { text } = decodeText(await resp.arrayBuffer(), partial);
    return { text, partial };
  } catch (e) {
    // dufs answers 416 when the requested range is past EOF (file smaller than
    // the window): the whole file is the answer.
    if (e instanceof DufsHttpError && e.status === 416) {
      return { text: await fetchFileText(fullpath), partial: false };
    }
    throw e;
  }
}

function authHeaders(token?: string | null): Headers {
  const headers = new Headers();
  const t = token ?? authToken;
  if (t) headers.set("Authorization", `Basic ${t}`);
  return headers;
}

/**
 * Verify credentials and return the authenticated username.
 *
 * Uses a standard `GET <dir>?json` with the Basic header rather than dufs'
 * CHECKAUTH method: custom HTTP methods are dropped by some dev proxies and
 * intermediaries, while a plain authenticated GET works everywhere.
 */
export async function checkAuth(token: string): Promise<string> {
  const path = location.pathname || "/";
  const resp = await fetch(`${path}?json`, { headers: authHeaders(token), credentials: "omit" });
  if (resp.status >= 400) {
    throw new DufsHttpError(resp.status, resp.statusText || `HTTP ${resp.status}`);
  }
  const data = (await resp.json().catch(() => null)) as DufsData | null;
  return data?.user ?? "";
}

/**
 * Clear credentials. dufs Basic auth is stateless, so there is no server
 * session to invalidate (its LOGOUT method targets cookie sessions and 401s
 * under Basic); dropping the token is the complete logout.
 */
export function logout(): void {
  authToken = null;
}
