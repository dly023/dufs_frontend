import type { PathItem } from "../dufs/types";

/**
 * Sibling subtitles for a video: `movie.mp4` → `movie.vtt|srt|ass` and
 * `movie.<label>.vtt|srt|ass`. Converted to WebVTT in the browser (no deps).
 */
export interface SubtitleFile {
  item: PathItem;
  format: "vtt" | "srt" | "ass";
  /** Raw label from the filename (e.g. "zh-CN", "chs"), "" when absent. */
  tag: string;
  /** Human label for the track menu. */
  label: string;
  /** BCP-47-ish language for <track srclang>, "" when unknown. */
  lang: string;
}

const LANGS: [RegExp, string, string][] = [
  [/^(zh[-_]?(cn|hans|sg)?|chs|sc|gb|简体?|简中)$/i, "zh-CN", "简体中文"],
  [/^(zh[-_]?(tw|hk|hant)|cht|tc|big5|繁體?|繁中)$/i, "zh-TW", "繁體中文"],
  [/^(en|eng|english)$/i, "en", "English"],
  [/^(ja|jp|jpn|japanese|日)$/i, "ja", "日本語"],
  [/^(ko|kr|kor)$/i, "ko", "한국어"],
];

export function describeTag(tag: string): { label: string; lang: string } {
  if (!tag) return { label: "字幕", lang: "" };
  for (const [re, lang, label] of LANGS) if (re.test(tag)) return { label, lang };
  return { label: tag, lang: /^[a-z]{2,3}([-_][a-z]{2,4})?$/i.test(tag) ? tag.replace("_", "-") : "" };
}

function stem(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

export function findSubtitles(video: PathItem, siblings: PathItem[]): SubtitleFile[] {
  const base = stem(video.filename).toLowerCase();
  const out: SubtitleFile[] = [];
  for (const p of siblings) {
    if (p.is_dir) continue;
    const name = p.filename.toLowerCase();
    if (!name.startsWith(base)) continue;
    const m = p.filename.slice(base.length).match(/^(?:\.(.+?))?\.(vtt|srt|ass)$/i);
    if (!m) continue;
    const tag = m[1] ?? "";
    out.push({ item: p, format: m[2].toLowerCase() as SubtitleFile["format"], tag, ...describeTag(tag) });
  }
  // Untagged first, then by label, so the "main" track leads.
  return out.sort((a, b) => (a.tag ? 1 : 0) - (b.tag ? 1 : 0) || a.label.localeCompare(b.label));
}

/** Pick the track to show by default: the user's language, else the only one. */
export function preferredTrack(tracks: SubtitleFile[], navLang = navigator.language): number {
  if (!tracks.length) return -1;
  const want = navLang.toLowerCase();
  const exact = tracks.findIndex((t) => t.lang.toLowerCase() === want);
  if (exact >= 0) return exact;
  const prefix = want.split("-")[0];
  const near = tracks.findIndex((t) => t.lang.toLowerCase().split("-")[0] === prefix);
  if (near >= 0) return near;
  const untagged = tracks.findIndex((t) => !t.tag);
  return untagged >= 0 ? untagged : tracks.length === 1 ? 0 : -1;
}

/** SRT → WebVTT: header, comma decimal → dot, drop numeric cue ids. */
export function srtToVtt(srt: string): string {
  const body = srt
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/(\d{1,2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
    .replace(/^\d+\n(?=\d{1,2}:\d{2}:\d{2}\.\d{3}\s*-->)/gm, "");
  return `WEBVTT\n\n${body.trim()}\n`;
}

function assTime(t: string): string {
  // H:MM:SS.cc → HH:MM:SS.mmm
  const m = t.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[.:](\d{1,3})$/);
  if (!m) return "00:00:00.000";
  const ms = m[4].padEnd(3, "0").slice(0, 3);
  return `${m[1].padStart(2, "0")}:${m[2].padStart(2, "0")}:${m[3].padStart(2, "0")}.${ms}`;
}

/** ASS/SSA → WebVTT, text only: Dialogue lines, override tags stripped, \N → newline. */
export function assToVtt(ass: string): string {
  const lines = ass.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  let fields: string[] = ["Layer", "Start", "End", "Style", "Name", "MarginL", "MarginR", "MarginV", "Effect", "Text"];
  let inEvents = false;
  const cues: { start: string; end: string; text: string }[] = [];
  for (const line of lines) {
    const head = line.trim();
    if (/^\[.*\]$/.test(head)) {
      inEvents = /^\[events\]$/i.test(head);
      continue;
    }
    if (!inEvents) continue;
    if (/^format\s*:/i.test(head)) {
      fields = head.replace(/^format\s*:/i, "").split(",").map((f) => f.trim());
      continue;
    }
    if (!/^dialogue\s*:/i.test(head)) continue;
    const rest = head.replace(/^dialogue\s*:/i, "").trimStart();
    // Text is the last field and may itself contain commas.
    const parts = rest.split(",");
    const values = parts.slice(0, fields.length - 1);
    values.push(parts.slice(fields.length - 1).join(","));
    const get = (k: string) => values[fields.findIndex((f) => f.toLowerCase() === k)] ?? "";
    const text = get("text")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\\[Nn]/g, "\n")
      .replace(/\\h/g, " ")
      .trim();
    if (text) cues.push({ start: assTime(get("start")), end: assTime(get("end")), text });
  }
  cues.sort((a, b) => a.start.localeCompare(b.start));
  return `WEBVTT\n\n${cues.map((c) => `${c.start} --> ${c.end}\n${c.text}`).join("\n\n")}\n`;
}

export function toVtt(text: string, format: SubtitleFile["format"]): string {
  if (format === "srt") return srtToVtt(text);
  if (format === "ass") return assToVtt(text);
  return text.replace(/^﻿/, "");
}
