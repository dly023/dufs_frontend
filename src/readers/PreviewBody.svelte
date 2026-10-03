<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import type { PreviewMode } from "../lib/models/preview";
  import type { createPreviewContent } from "../lib/preview/content.svelte";
  import { enhanceMarkdown } from "../lib/preview/markdownEnhance";

  interface Props {
    item: PathItem;
    mode: PreviewMode;
    content: ReturnType<typeof createPreviewContent>;
    variant: "pane" | "full";
    /** Lets players move to a sibling file (e.g. the next track). */
    onNavigate?: (item: PathItem) => void;
  }
  let { item, mode, content, variant, onNavigate }: Props = $props();

  // Heavier viewers load on first use, keeping the main bundle lean.
  const loadCode = () => import("./CodeView.svelte");
  const loadVideo = () => import("./VideoPlayer.svelte");
  const loadAudio = () => import("./AudioPlayer.svelte");
  const src = $derived(content.src);
  const text = $derived(content.text);
  const html = $derived(content.html);
  const loading = $derived(content.loading);
  const error = $derived(content.error);

  const JSONL_PAGE = 50;
  let jsonlLimit = $state(JSONL_PAGE);
  $effect(() => {
    void item.fullpath;
    jsonlLimit = JSONL_PAGE;
  });

  /** JSONL: one line per record (scan) or pretty-printed (read). Remembered. */
  let jsonlExpanded = $state(loadExpanded());
  function loadExpanded(): boolean {
    try {
      return localStorage.getItem("dufs-jsonl-expanded") === "1";
    } catch {
      return false;
    }
  }
  function setExpanded(on: boolean) {
    jsonlExpanded = on;
    try {
      localStorage.setItem("dufs-jsonl-expanded", on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  // Font preview controls
  let fontSample = $state("");
  let fontSize = $state(32);
  let fontWeight = $state(400);
  const fontFamily = `dufs-font-${Math.random().toString(36).slice(2, 8)}`;
</script>

{#if loading && !src && !text && !html}
  <p class="hint">加载中…</p>
{:else if error}
  <p class="hint is-error">{error}</p>
{:else if mode === "image"}
  {#if src}<img class="media {variant}" {src} alt={item.name} />{/if}
{:else if mode === "video"}
  {#if src}{#await loadVideo() then m}<m.default {item} {src} {variant} />{/await}{/if}
{:else if mode === "audio"}
  {#await loadAudio() then m}<m.default {item} {src} {variant} onTrack={onNavigate} />{/await}
{:else if mode === "pdf"}
  {#if src}<embed class="pdf {variant}" {src} type="application/pdf" />{/if}
{:else if mode === "markdown"}
  <div class="doc prose" use:enhanceMarkdown={item}>{@html html}</div>
{:else if mode === "json"}
  {#if content.code}
    <pre class="doc mono-block code-json">{@html content.code}</pre>
  {:else}
    <pre class="doc mono-block">{text}</pre>
  {/if}
{:else if mode === "jsonl"}
  <div class="doc jsonl" class:is-compact={!jsonlExpanded}>
    <div class="jsonl-bar">
      {#if content.note}<p class="jsonl-note num">{content.note}</p>{/if}
      <div class="seg" style:--n="2" style:--i={jsonlExpanded ? 1 : 0} role="tablist" aria-label="JSONL 显示方式">
        <button type="button" role="tab" aria-selected={!jsonlExpanded} onclick={() => setExpanded(false)}>紧凑</button>
        <button type="button" role="tab" aria-selected={jsonlExpanded} onclick={() => setExpanded(true)}>展开</button>
      </div>
    </div>
    {#each content.records.slice(0, jsonlLimit) as r (r.line)}
      {@const shown = jsonlExpanded ? r.html : r.rawHtml}
      <div class="jsonl-rec" class:is-invalid={!r.valid}>
        <span class="jsonl-line num" title={r.valid ? `第 ${r.line} 行` : `第 ${r.line} 行 · 不是合法 JSON`}>{r.line}</span>
        {#if shown}<pre class="mono-block code-json">{@html shown}</pre>{:else}<pre class="mono-block">{jsonlExpanded ? r.text : r.raw}</pre>{/if}
      </div>
    {/each}
    {#if content.records.length > jsonlLimit}
      <button class="btn btn-ghost btn-sm jsonl-more" type="button" onclick={() => (jsonlLimit += JSONL_PAGE)}>
        再显示 {Math.min(JSONL_PAGE, content.records.length - jsonlLimit)} 条 · 还有 {content.records.length - jsonlLimit} 条
      </button>
    {/if}
  </div>
{:else if mode === "text"}
  {#await loadCode() then m}<m.default {item} {text} {variant} />{/await}
{:else if mode === "font"}
  <div class="font">
    <div class="sample" style={`font-family:"${fontFamily}";font-size:${fontSize}px;font-weight:${fontWeight}`}>
      {fontSample || "The quick brown fox jumps over the lazy dog. 0123456789 你好，世界。"}
    </div>
    <input class="input" placeholder="输入文字预览…" bind:value={fontSample} />
    <label class="slider">字号 <span class="num">{fontSize}px</span>
      <input type="range" min="8" max="96" bind:value={fontSize} />
    </label>
    <label class="slider">字重 <span class="num">{fontWeight}</span>
      <input type="range" min="100" max="900" step="100" bind:value={fontWeight} />
    </label>
    {#if src}
      <!-- eslint-disable-next-line -->
      {@html `<style>@font-face { font-family: "${fontFamily}"; src: url("${src}"); }</style>`}
    {/if}
  </div>
{:else}
  <div class="hint">
    <Icon name="file" size={28} stroke={1.5} />
    <p>这种文件无法直接预览</p>
    <a class="btn btn-sm" href={item.fullpath} download={item.filename}><Icon name="download" size={14} />下载</a>
  </div>
{/if}

<style>
  .hint {
    margin: auto;
    padding: var(--s-6);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-2);
    color: var(--text-3);
    font-size: var(--fs-3);
    text-align: center;
  }

  .hint.is-error {
    color: var(--danger);
  }

  .media {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .media.pane {
    border-radius: var(--r-sm);
    box-shadow: var(--shadow-2);
  }

  .media.full {
    max-height: calc(100dvh - 120px);
    border-radius: var(--r-sm);
  }

  .pdf {
    width: 100%;
    height: 100%;
    min-height: 60vh;
    border: 0;
  }

  .pdf.full {
    height: calc(100dvh - 100px);
  }

  .doc {
    align-self: stretch;
    padding: var(--s-4);
  }

  /* JSON Lines: one block per record, real line numbers in a quiet gutter. */
  .jsonl {
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
  }

  .jsonl-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    flex-wrap: wrap;
  }

  .jsonl-note {
    color: var(--text-3);
    font-size: var(--fs-2);
  }

  /* Compact: records read like a log, one tight row each. */
  .jsonl.is-compact {
    gap: 0;
  }

  .jsonl.is-compact .jsonl-bar {
    margin-bottom: var(--s-2);
  }

  .jsonl.is-compact .jsonl-rec {
    padding: 5px var(--s-3);
    border-radius: 0;
    background: none;
    box-shadow: inset 0 -1px 0 var(--border);
  }

  .jsonl.is-compact .jsonl-rec.is-invalid {
    box-shadow: inset 2px 0 0 var(--danger), inset 0 -1px 0 var(--border);
  }

  .jsonl.is-compact .jsonl-rec:hover {
    background: var(--fill);
  }

  .jsonl-rec {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: var(--s-3);
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: inset 0 0 0 1px var(--border);
  }

  .jsonl-rec.is-invalid {
    box-shadow: inset 2px 0 0 var(--danger), inset 0 0 0 1px var(--border);
  }

  .jsonl-more {
    align-self: center;
    margin-top: var(--s-3);
  }

  .jsonl-line {
    min-width: 2ch;
    padding-top: 1px;
    color: var(--text-3);
    font-family: var(--font-mono);
    font-size: var(--fs-1);
    text-align: right;
    user-select: none;
  }

  .font {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    padding: var(--s-4);
  }

  .sample {
    padding: var(--s-4);
    border-radius: var(--r-md);
    background: var(--surface);
    line-height: 1.4;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .slider {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    color: var(--text-2);
    font-size: var(--fs-2);
  }

  .slider input {
    flex: 1;
    accent-color: var(--accent);
  }
</style>
