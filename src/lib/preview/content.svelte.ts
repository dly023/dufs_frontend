import type { PathItem } from "../dufs/types";
import { detectPreviewMode, TEXT_LIMIT, JSONL_HEAD, type PreviewMode } from "../models/preview";
import { fetchFileText, fetchFileHead, fetchBlobUrl } from "../dufs/client";
import { renderMarkdownSafe } from "../sanitize/markdown";
import { auth } from "../../stores/auth.svelte";
import { formatSize } from "../models/format";
import { highlightJson } from "../highlight/json";

/** One JSON Lines record, pretty-printed and (when small enough) coloured. */
export interface JsonlRecord {
  line: number;
  text: string;
  html: string | null;
  valid: boolean;
}

const JSONL_SHOWN = 30;

/**
 * Loads whatever is needed to render a preview for the current item.
 * Behind dufs auth, binary media is fetched as a blob so <img>/<video> get bytes.
 */
export function createPreviewContent(getItem: () => PathItem | null) {
  let mode = $state<PreviewMode>("none");
  let src = $state("");
  let text = $state("");
  let html = $state("");
  /** Highlighted JSON (escaped HTML), or "" to fall back to `text`. */
  let code = $state("");
  let records = $state<JsonlRecord[]>([]);
  /** One-line summary shown above JSONL records. */
  let note = $state("");
  let loading = $state(false);
  let error = $state("");

  async function readText(item: PathItem): Promise<string> {
    const size = item.size ?? 0;
    if (size > TEXT_LIMIT) return (await fetchFileHead(item.fullpath, TEXT_LIMIT)).text;
    return fetchFileText(item.fullpath);
  }

  $effect(() => {
    const item = getItem();
    src = "";
    text = "";
    html = "";
    code = "";
    records = [];
    note = "";
    error = "";
    if (!item) {
      mode = "none";
      return;
    }
    mode = detectPreviewMode(item);
    if (mode === "none") return;

    let cancelled = false;
    loading = true;
    (async () => {
      try {
        if (mode === "image" || mode === "video" || mode === "audio" || mode === "pdf" || mode === "font") {
          src = auth.isAuthed ? await fetchBlobUrl(item.fullpath) : item.fullpath;
        } else if (mode === "markdown") {
          const raw = await readText(item);
          const rendered = await renderMarkdownSafe(raw);
          if (!cancelled) html = rendered;
        } else if (mode === "json") {
          const raw = await readText(item);
          if (cancelled) return;
          try {
            text = JSON.stringify(JSON.parse(raw), null, 2);
          } catch {
            text = raw;
          }
          code = highlightJson(text) ?? "";
        } else if (mode === "jsonl") {
          // Only the head of the file is fetched; the last line may be cut mid-JSON.
          const { text: chunk, partial } = await fetchFileHead(item.fullpath, JSONL_HEAD);
          if (cancelled) return;
          const lines = chunk.split("\n");
          if (partial) lines.pop();
          // Keep real line numbers (blank lines still count) for orientation.
          const numbered = lines.map((l, i) => ({ l, line: i + 1 })).filter((x) => x.l.trim());
          records = numbered.slice(0, JSONL_SHOWN).map(({ l, line }) => {
            try {
              const pretty = JSON.stringify(JSON.parse(l), null, 2);
              return { line, text: pretty, html: highlightJson(pretty), valid: true };
            } catch {
              return { line, text: l, html: null, valid: false };
            }
          });
          note = partial
            ? `前 ${records.length} 条 · 文件共 ${formatSize(item.size)}，仅读取开头部分`
            : `${numbered.length > records.length ? `前 ${records.length} / ` : ""}${numbered.length} 条 · ${formatSize(item.size)}`;
        } else if (mode === "text") {
          const raw = await readText(item);
          if (!cancelled) text = raw.length > TEXT_LIMIT ? `${raw.slice(0, TEXT_LIMIT)}\n\n…（已截断）` : raw;
        }
      } catch (e) {
        if (!cancelled) error = e instanceof Error ? e.message : "读取失败";
      } finally {
        if (!cancelled) loading = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  });

  return {
    get mode() {
      return mode;
    },
    get src() {
      return src;
    },
    get text() {
      return text;
    },
    get html() {
      return html;
    },
    get code() {
      return code;
    },
    get records() {
      return records;
    },
    get note() {
      return note;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
  };
}
