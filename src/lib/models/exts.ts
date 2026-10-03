import type { IconName } from "../icons";

export const previewableImageExts = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg", "heic", "heif",
]);

export const previewableVideoExts = new Set([
  "mp4", "webm", "mkv", "mov", "m4v",
]);

export const previewableAudioExts = new Set([
  "mp3", "flac", "wav", "aac", "ogg", "m4a",
]);

const novelPreviewExts = new Set(["txt", "md", "markdown"]);

export function isNovelPreviewExt(ext: string): boolean {
  return novelPreviewExts.has(ext.toLowerCase());
}

export function isImageExt(ext: string): boolean {
  return previewableImageExts.has(ext.toLowerCase());
}

export type FileCategory = "all" | "image" | "video" | "audio" | "document" | "archive" | "code";

const documentExts = new Set([
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "pdf", "epub", "txt", "md", "markdown",
]);
const archiveExts = new Set(["zip", "tar", "gz", "bz2", "xz", "zst", "rar", "7z"]);
export const codeExts = new Set([
  "c", "h", "cc", "cpp", "cxx", "hpp", "cs", "go", "java", "js", "jsx", "cjs", "mjs",
  "ts", "tsx", "php", "py", "pyi", "pyx", "html", "css", "lua", "rs", "kt", "json", "xml",
  "sh", "bash", "zsh", "cmd", "bat", "vue", "svelte", "ini", "conf", "yml", "yaml", "toml",
  "sql", "rb", "swift", "dart", "scss", "less", "dockerfile", "makefile",
]);

export function getFileCategory(ext: string): FileCategory {
  const e = ext.toLowerCase();
  if (previewableImageExts.has(e)) return "image";
  if (previewableVideoExts.has(e) || e === "flv" || e === "avi" || e === "wmv" || e === "m3u8") return "video";
  if (previewableAudioExts.has(e) || e === "opus" || e === "oga" || e === "ape") return "audio";
  if (documentExts.has(e)) return "document";
  if (archiveExts.has(e)) return "archive";
  if (codeExts.has(e)) return "code";
  return "all";
}


export interface FileKind {
  icon: IconName;
  /** Short badge text, e.g. "PDF". */
  label: string;
  /** OKLCH hue for the badge tint. */
  hue: number;
}

/** Visual identity of a file type: icon + short label + tint. */
export function fileKind(ext: string, isDir = false): FileKind {
  if (isDir) return { icon: "folder", label: "", hue: 215 };
  const e = ext.toLowerCase();
  const label = (e || "file").slice(0, 4).toUpperCase();
  if (e === "pdf") return { icon: "fileText", label, hue: 25 };
  if (["ttf", "otf", "woff", "woff2", "ttc", "otc"].includes(e)) return { icon: "font", label, hue: 20 };
  if (["srt", "vtt", "ass", "ssa"].includes(e)) return { icon: "captions", label, hue: 300 };
  switch (getFileCategory(e)) {
    case "image":
      return { icon: "images", label, hue: 215 };
    case "video":
      return { icon: "film", label, hue: 300 };
    case "audio":
      return { icon: "music", label, hue: 340 };
    case "archive":
      return { icon: "archive", label, hue: 70 };
    case "code":
      return { icon: "fileCode", label, hue: 155 };
    case "document":
      return { icon: "fileText", label, hue: 255 };
    default:
      return { icon: "file", label, hue: 255 };
  }
}
