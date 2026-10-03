<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import type { PreviewMode } from "../lib/models/preview";
  import type { createPreviewContent } from "../lib/preview/content.svelte";
  import { enhanceMarkdown } from "../lib/preview/markdownEnhance";
  import CodeView from "./CodeView.svelte";

  interface Props {
    item: PathItem;
    mode: PreviewMode;
    content: ReturnType<typeof createPreviewContent>;
    variant: "pane" | "full";
  }
  let { item, mode, content, variant }: Props = $props();
  const src = $derived(content.src);
  const text = $derived(content.text);
  const html = $derived(content.html);
  const loading = $derived(content.loading);
  const error = $derived(content.error);

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
  {#if src}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video class="media {variant}" {src} controls autoplay preload="metadata"></video>
  {/if}
{:else if mode === "audio"}
  <div class="audio">
    <span class="disc"><Icon name="music" size={32} stroke={1.5} /></span>
    <div class="audio-name">{item.filename}</div>
    {#if src}
      <!-- svelte-ignore a11y_media_has_caption -->
      <audio {src} controls autoplay preload="metadata"></audio>
    {/if}
  </div>
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
  <div class="doc jsonl">
    {#if content.note}<p class="jsonl-note num">{content.note}</p>{/if}
    {#each content.records as r (r.line)}
      <div class="jsonl-rec" class:is-invalid={!r.valid}>
        <span class="jsonl-line num" title={r.valid ? `第 ${r.line} 行` : `第 ${r.line} 行 · 不是合法 JSON`}>{r.line}</span>
        {#if r.html}<pre class="mono-block code-json">{@html r.html}</pre>{:else}<pre class="mono-block">{r.text}</pre>{/if}
      </div>
    {/each}
  </div>
{:else if mode === "text"}
  <CodeView {item} {text} {variant} />
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

  .jsonl-note {
    color: var(--text-3);
    font-size: var(--fs-2);
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

  .jsonl-line {
    min-width: 2ch;
    padding-top: 1px;
    color: var(--text-3);
    font-family: var(--font-mono);
    font-size: var(--fs-1);
    text-align: right;
    user-select: none;
  }

  .audio {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    padding: var(--s-6);
  }

  .disc {
    display: grid;
    place-items: center;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: radial-gradient(circle, var(--surface) 0 14px, var(--fill-strong) 15px);
    color: var(--text-3);
    box-shadow: var(--shadow-2);
  }

  .audio-name {
    font-weight: 600;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .audio audio {
    width: 100%;
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
