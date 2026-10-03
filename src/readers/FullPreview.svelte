<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import { detectPreviewMode, isPreviewable } from "../lib/models/preview";
  import { createPreviewContent } from "../lib/preview/content.svelte";
  import { formatSize } from "../lib/models/format";
  import PreviewBody from "./PreviewBody.svelte";
  import ImageStage from "./ImageStage.svelte";

  interface Props {
    item: PathItem | null;
    allItems: PathItem[];
    onClose: () => void;
    onNavigate: (item: PathItem) => void;
    onShare?: (item: PathItem) => void;
  }
  let { item, allItems, onClose, onNavigate, onShare }: Props = $props();

  const mode = $derived(item ? detectPreviewMode(item) : "none");
  const isImage = $derived(mode === "image");
  // Images page through images; documents page through anything previewable.
  const list = $derived(allItems.filter((p) => (isImage ? detectPreviewMode(p) === "image" : isPreviewable(p))));
  const index = $derived(item ? list.findIndex((p) => p.fullpath === item.fullpath) : -1);
  const content = createPreviewContent(() => item);

  let direction = $state(0);
  let idle = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  function go(delta: number) {
    const next = list[index + delta];
    if (!next) return;
    direction = delta;
    onNavigate(next);
  }

  /** Chrome fades out while you look and returns the moment you move. */
  function wake() {
    idle = false;
    clearTimeout(idleTimer);
    if (isImage) idleTimer = setTimeout(() => (idle = true), 2600);
  }

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, [contenteditable]")) return;
    if (document.querySelector(".modal")) return;
    if (e.defaultPrevented) return;
    wake();
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
    else if (e.key === "ArrowLeft") go(-1);
    else if (e.key === "ArrowRight") go(1);
    else if (e.key.toLowerCase() === "f" && isImage) {
      const el = document.querySelector<HTMLElement>(".reader");
      void (document.fullscreenElement ? document.exitFullscreen() : el?.requestFullscreen())?.catch(() => {});
    }
  }

  $effect(() => {
    wake();
    return () => clearTimeout(idleTimer);
  });
</script>

<svelte:window onkeydown={onKey} />

{#if item}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="reader" class:is-doc={!isImage} class:is-idle={idle} onpointermove={wake} role="dialog" aria-modal="true" tabindex="-1" aria-label={item.filename}>
    <header class="head chrome">
      <div class="title">
        <strong class="ellipsis" title={item.name}>{item.filename}</strong>
        <span class="num">
          {#if list.length > 1 && index >= 0}{index + 1} / {list.length}{" · "}{/if}{formatSize(item.size)}
        </span>
      </div>
      <div class="actions">
        {#if onShare}
          <button class="icon-btn" type="button" title="二维码分享" onclick={() => onShare(item)}>
            <Icon name="qr" size={17} />
          </button>
        {/if}
        <a class="icon-btn" href={item.fullpath} target="_blank" rel="noopener noreferrer" title="新标签页打开">
          <Icon name="external" size={17} />
        </a>
        <a class="icon-btn" href={item.fullpath} download={item.filename} title="下载">
          <Icon name="download" size={17} />
        </a>
        <button class="icon-btn" type="button" title="关闭 (Esc)" onclick={onClose}>
          <Icon name="x" size={18} />
        </button>
      </div>
    </header>

    {#if isImage}
      <ImageStage
        {item}
        src={content.src}
        items={list}
        {index}
        {direction}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onSelect={(it) => {
          direction = Math.sign(list.indexOf(it) - index);
          onNavigate(it);
        }}
      />
    {:else}
      <div class="doc">
        {#key item.fullpath}
          <div class="sheet" class:is-wide={mode === "pdf" || mode === "video"}>
            <PreviewBody
              {item}
              {mode}
              {content}
              variant="full"
            />
          </div>
        {/key}
      </div>
      {#if list.length > 1}
        <button class="page is-prev" type="button" title="上一个 (←)" disabled={index <= 0} onclick={() => go(-1)}>
          <Icon name="chevronLeft" size={20} />
        </button>
        <button class="page is-next" type="button" title="下一个 (→)" disabled={index >= list.length - 1} onclick={() => go(1)}>
          <Icon name="chevronRight" size={20} />
        </button>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .reader {
    position: fixed;
    inset: 0;
    z-index: 80;
    display: flex;
    flex-direction: column;
    background: var(--stage);
    color: oklch(0.96 0 0);
    animation: fade-in var(--t-2) var(--ease);
  }

  .reader.is-doc {
    background: var(--bg);
    color: var(--text);
  }

  .head {
    position: absolute;
    inset: 0 0 auto;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: var(--s-3);
    height: 56px;
    padding: 0 var(--s-3) 0 var(--s-5);
    background: linear-gradient(oklch(0 0 0 / 0.55), transparent);
  }

  .is-doc .head {
    position: relative;
    background: var(--chrome);
    border-bottom: 1px solid var(--border);
  }

  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: var(--s-3);
  }

  .title strong {
    font-size: var(--fs-4);
    font-weight: 600;
  }

  .title span {
    flex: 0 0 auto;
    opacity: 0.6;
    font-size: var(--fs-2);
  }

  .actions {
    display: flex;
    gap: 2px;
  }

  .reader:not(.is-doc) .icon-btn {
    color: oklch(1 0 0 / 0.8);
  }

  .reader:not(.is-doc) .icon-btn:hover {
    background: oklch(1 0 0 / 0.12);
    color: oklch(1 0 0);
  }

  /* Idle: chrome steps aside, the picture stays. */
  .reader :global(.chrome) {
    transition: opacity var(--t-3) var(--ease);
  }

  .reader.is-idle :global(.chrome) {
    opacity: 0;
  }

  .reader.is-idle {
    cursor: none;
  }

  .doc {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: var(--s-6) var(--s-4) var(--s-8);
  }

  .sheet {
    max-width: 860px;
    min-height: 200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--surface);
    box-shadow: var(--shadow-1);
    overflow: hidden;
    animation: fade-in var(--t-2) var(--ease);
  }

  .sheet.is-wide {
    max-width: 1200px;
    background: var(--fill);
  }

  .sheet > :global(.doc) {
    padding: var(--s-6) var(--s-8);
  }

  .page {
    position: fixed;
    top: 50%;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--surface);
    color: var(--text-2);
    box-shadow: var(--shadow-2);
    transform: translateY(-50%);
    transition: color var(--t-1) var(--ease), transform var(--t-2) var(--ease-spring);
  }

  .page:hover:not(:disabled) {
    color: var(--text);
  }

  .page:active:not(:disabled) {
    transform: translateY(-50%) scale(0.92);
  }

  .page:disabled {
    opacity: 0;
    pointer-events: none;
  }

  .page.is-prev {
    left: var(--s-4);
  }

  .page.is-next {
    right: var(--s-4);
  }

  @media (max-width: 1000px) {
    .page {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .sheet > :global(.doc) {
      padding: var(--s-4);
    }
    .doc {
      padding: var(--s-3);
    }
  }
</style>
