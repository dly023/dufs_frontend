import type { PathItem } from "../dufs/types";
import {
  previewableImageExts,
  previewableVideoExts,
  previewableAudioExts,
  isNovelPreviewExt,
  codeExts,
} from "./exts";

export type PreviewMode =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "markdown"
  | "json"
  | "jsonl"
  | "text"
  | "font"
  | "none";

const jsonlExts = new Set(["jsonl", "ndjson", "jsonlines"]);

const previewableTextExts = new Set([
  "txt", "log", "conf", "ini", "cfg", "properties", "env",
  "csv", "tsv", "sql", "yaml", "yml", "toml", "xml",
  "sh", "bash", "zsh", "bat", "cmd",
]);

const previewableFontExts = new Set(["ttf", "ttc", "otf", "otc", "woff", "woff2"]);

export function detectPreviewMode(item: PathItem | null | undefined): PreviewMode {
  if (!item || item.is_dir) return "none";
  const ext = item.ext.toLowerCase();
  if (previewableImageExts.has(ext)) return "image";
  if (previewableVideoExts.has(ext)) return "video";
  if (previewableAudioExts.has(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "json") return "json";
  if (jsonlExts.has(ext)) return "jsonl";
  if (previewableFontExts.has(ext)) return "font";
  if (previewableTextExts.has(ext) || codeExts.has(ext)) return "text";
  return "none";
}

export function isPreviewable(item: PathItem): boolean {
  return detectPreviewMode(item) !== "none";
}

export { isNovelPreviewExt };

export const TEXT_LIMIT = 512 * 1024;
export const JSONL_HEAD = 64 * 1024;

const editableExts = new Set([
  "md", "markdown", "json", "jsonl", "ndjson", "jsonlines", "txt", "log", "csv", "yml", "yaml", "ini", "conf", "env",
]);

/** Plain-text files the built-in editor can open safely. */
export function isEditable(item: PathItem): boolean {
  if (item.is_dir) return false;
  const e = item.ext.toLowerCase();
  return editableExts.has(e) || previewableTextExts.has(e) || codeExts.has(e);
}
