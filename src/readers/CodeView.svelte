<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import CsvTable from "./CsvTable.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import { highlightCode, languageOf, splitHighlightedLines } from "../lib/highlight/code";
  import { parseCsv } from "../lib/highlight/csv";
  import { TEXT_LIMIT } from "../lib/models/preview";
  import { formatSize } from "../lib/models/format";
  import { copyText } from "../actions/files";

  interface Props {
    item: PathItem;
    text: string;
    variant: "pane" | "full";
  }
  let { item, text, variant }: Props = $props();

  /** Lines mounted at once; more on demand (a 512 KB log can be ~20k lines). */
  const LINE_PAGE = 2000;
  const CSV_ROWS = 2000;
  const MARKER = "…（已截断）";

  const ext = $derived(item.ext.toLowerCase());
  const lang = $derived(languageOf(ext));
  const isLog = $derived(ext === "log");
  const isCsv = $derived(ext === "csv" || ext === "tsv");

  /** The loader may cut big files; drop its marker and any half line it left. */
  const truncated = $derived(text.endsWith(MARKER) || item.size > TEXT_LIMIT);
  const body = $derived.by(() => {
    let t = text.endsWith(MARKER) ? text.slice(0, -MARKER.length).replace(/\n+$/, "") : text;
    if (truncated) {
      const cut = t.lastIndexOf("\n");
      if (cut > 0) t = t.slice(0, cut);
    }
    return t.endsWith("\n") ? t.slice(0, -1) : t;
  });

  // Preferences: wrap per kind (prose wraps, code doesn't), CSV table vs raw.
  const wrapKey = $derived(`dufs-wrap-${lang ? "code" : "text"}`);
  let wrap = $state(false);
  let tableMode = $state(true);
  $effect(() => {
    try {
      const v = localStorage.getItem(wrapKey);
      wrap = v === null ? !lang : v === "1";
    } catch {
      wrap = !lang;
    }
  });

  function toggleWrap() {
    wrap = !wrap;
    try {
      localStorage.setItem(wrapKey, wrap ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  const csv = $derived(isCsv && tableMode ? parseCsv(body, ext === "tsv" ? "\t" : ",", CSV_ROWS + 1) : null);
  const highlighted = $derived(lang && !(isCsv && tableMode) ? highlightCode(body, lang) : null);
  const lines = $derived(highlighted !== null ? splitHighlightedLines(highlighted) : body.split("\n"));
  const total = $derived(lines.length);

  let shown = $state(LINE_PAGE);
  $effect(() => {
    void item.fullpath;
    shown = LINE_PAGE;
  });

  /** Mount in chunks so the browser can skip painting off-screen ones. */
  const chunks = $derived.by(() => {
    const out: { start: number; lines: string[] }[] = [];
    const end = Math.min(shown, total);
    for (let s = 0; s < end; s += 200) out.push({ start: s, lines: lines.slice(s, Math.min(end, s + 200)) });
    return out;
  });

  const LOG_ERR = /\b(?:ERROR|ERR|FATAL|CRIT(?:ICAL)?|PANIC|EXCEPTION|Traceback)\b/;
  const LOG_WARN = /\b(?:WARN(?:ING)?)\b/;
  function level(line: string): "err" | "warn" | "" {
    if (!isLog) return "";
    if (LOG_ERR.test(line)) return "err";
    if (LOG_WARN.test(line)) return "warn";
    return "";
  }

  let copied = $state(false);
  async function copyAll() {
    await copyText(body);
    copied = true;
    setTimeout(() => (copied = false), 1400);
  }

  const kindLabel = $derived(ext ? ext.toUpperCase() : "TEXT");
</script>

<div class="code-view {variant}" class:is-wrap={wrap}>
  <div class="bar">
    <span class="meta num">
      <span class="kind">{kindLabel}</span>
      {#if csv}
        {Math.max(0, csv.rows.length - 1).toLocaleString()}{csv.capped ? "+" : ""} 行 · {csv.columns} 列
      {:else}
        {total.toLocaleString()} 行
      {/if}
    </span>
    <span class="spacer"></span>
    {#if isCsv}
      <div class="seg" role="tablist" aria-label="显示方式" style:--n="2" style:--i={tableMode ? 0 : 1}>
        <button type="button" role="tab" aria-selected={tableMode} onclick={() => (tableMode = true)}>表格</button>
        <button type="button" role="tab" aria-selected={!tableMode} onclick={() => (tableMode = false)}>原文</button>
      </div>
    {/if}
    {#if !csv}
      <button class="icon-btn sm" class:is-on={wrap} type="button" title={wrap ? "关闭自动换行" : "自动换行"} aria-pressed={wrap} onclick={toggleWrap}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M3 12h15a3 3 0 0 1 0 6h-4"/><path d="m16 16-2 2 2 2"/><path d="M3 18h7"/></svg>
      </button>
    {/if}
    <button class="icon-btn sm" class:is-done={copied} type="button" title="复制全部" onclick={() => void copyAll()}>
      <Icon name={copied ? "check" : "copy"} size={14} />
    </button>
  </div>

  {#if csv}
    <CsvTable data={csv} maxRows={CSV_ROWS} {variant} />
  {:else}
    <div class="scroller">
      <div class="lines" style:--gutter={`${String(total).length}ch`}>
        {#each chunks as chunk (chunk.start)}
          <div class="chunk" style:--rows={chunk.lines.length}>
            {#each chunk.lines as line, j (chunk.start + j)}
              {@const lv = level(line)}
              <div class="row" class:err={lv === "err"} class:warn={lv === "warn"}>
                <span class="ln" aria-hidden="true">{chunk.start + j + 1}</span>
                {#if highlighted !== null}<span class="lc">{@html line}</span>{:else}<span class="lc">{line}</span>{/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
    {#if shown < total}
      <button class="more btn btn-sm" type="button" onclick={() => (shown += LINE_PAGE * 2)}>
        显示更多 · 还有 <span class="num">{(total - shown).toLocaleString()}</span> 行
      </button>
    {/if}
  {/if}

  {#if truncated}
    <div class="cut">
      <span>文件较大（{formatSize(item.size)}），只预览了开头 {formatSize(TEXT_LIMIT)}。</span>
      <a class="btn btn-sm" href={item.fullpath} download={item.filename}><Icon name="download" size={13} />下载完整文件</a>
    </div>
  {/if}
</div>

<style>
  .code-view {
    --cv-bg: var(--surface);
    align-self: stretch;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    padding: var(--s-3) var(--s-4) var(--s-4);
    background: var(--cv-bg);
  }

  .code-view.pane {
    padding: var(--s-2) var(--s-2) var(--s-3);
    border-radius: var(--r-md);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: var(--h-sm);
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--text-3);
    font-size: var(--fs-2);
  }

  .kind {
    padding: 1px 6px;
    border-radius: var(--r-xs);
    background: var(--fill);
    color: var(--text-2);
    font-family: var(--font-mono);
    font-size: var(--fs-1);
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .spacer {
    flex: 1;
  }

  .bar .seg {
    margin-right: var(--s-1);
  }

  .bar .seg > button {
    height: 24px;
    min-width: 44px;
  }

  /* Horizontal scroll lives here so the pane itself never overflows. */
  .scroller {
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior-x: contain;
  }

  .lines {
    width: max-content;
    min-width: 100%;
    font-family: var(--font-mono);
    font-size: var(--fs-2);
    line-height: 1.65;
    tab-size: 4;
  }

  .is-wrap .lines {
    width: auto;
  }

  .chunk {
    content-visibility: auto;
    contain-intrinsic-size: auto calc(var(--rows) * 1.65em);
  }

  .row {
    display: grid;
    grid-template-columns: calc(var(--gutter) + 14px) minmax(0, 1fr);
  }

  .ln {
    position: sticky;
    left: 0;
    padding-right: 12px;
    background: var(--cv-bg);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
    text-align: right;
    user-select: none;
    opacity: 0.7;
  }

  .pane .row {
    grid-template-columns: calc(var(--gutter) + 10px) minmax(0, 1fr);
  }

  .pane .ln {
    padding-right: 8px;
  }

  .lc {
    min-height: 1.65em;
    white-space: pre;
    color: var(--text);
  }

  .is-wrap .lc {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  /* Logs: a restrained cue on problem lines, nothing louder. */
  .row.err .lc {
    background: var(--danger-soft);
  }

  .row.err .ln {
    box-shadow: inset -2px 0 0 var(--danger);
    color: var(--danger);
    opacity: 1;
  }

  .row.warn .lc {
    background: color-mix(in oklch, var(--warning) 12%, transparent);
  }

  .row.warn .ln {
    box-shadow: inset -2px 0 0 var(--warning);
    opacity: 1;
  }

  .more {
    align-self: center;
    margin-top: var(--s-2);
  }

  .cut {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-2);
    margin-top: var(--s-2);
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-md);
    background: var(--fill);
    color: var(--text-2);
    font-size: var(--fs-2);
  }
</style>
