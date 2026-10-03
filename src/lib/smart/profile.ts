import type { PathItem } from "../dufs/types";
import { isImageExt } from "../models/exts";

/** A folder reads like a comic chapter: several images, and mostly images. */
export function looksLikeChapter(images: number, files: number): boolean {
  return images >= 4 && images / Math.max(1, files) >= 0.6;
}

/** Whether to offer comic reading for the listed directory. */
export function suggestsComic(paths: PathItem[], path: string): boolean {
  if (/\/manga(?:\/|$)/i.test(path)) return true;
  const files = paths.filter((p) => !p.is_dir);
  return looksLikeChapter(files.filter((p) => isImageExt(p.ext)).length, files.length);
}
