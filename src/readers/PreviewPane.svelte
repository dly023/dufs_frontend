<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import {
    detectPreviewMode,
    isPreviewable,
    isNovelPreviewExt,
    isEditable,
  } from "../lib/models/preview";
  import { createPreviewContent } from "../lib/preview/content.svelte";
  import { formatSize, formatTimestamp } from "../lib/models/format";
  import { copyText } from "../actions/files";
  import PreviewBody from "./PreviewBody.svelte";
  import Dropdown from "../components/Dropdown.svelte";

  interface Props {
    item: PathItem;
    allItems: PathItem[];
    onClose: () => void;
    onNavigate: (item: PathItem) => void;
    onExpand: (item: PathItem) => void;
    onShare: (item: PathItem) => void;
    onEdit?: (item: PathItem) => void;
    onComic?: (item: PathItem) => void;
  }
  let { item, allItems, onClose, onNavigate, onExpand, onShare, onEdit, onComic }: Props = $props();

  const previewables = $derived(allItems.filter((p) => isPreviewable(p)));
  const index = $derived(previewables.findIndex((p) => p.fullpath === item.fullpath));
  const mode = $derived(detectPreviewMode(item));
  const content = createPreviewContent(() => item);
  const editable = $derived(isEditable(item));

  function prev() {
    if (index > 0) onNavigate(previewables[index - 1]);
  }
  function next() {
    if (index >= 0 && index < previewables.length - 1) onNavigate(previewables[index + 1]);
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement | null;
    const typing = t instanceof HTMLInputElement ? !["checkbox", "radio", "range", "button"].includes(t.type) : !!t?.closest("textarea, select, [contenteditable]");
    if (typing) return;
    if (document.querySelector(".reader, .modal")) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      prev();
    } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      next();
    }
  }
  $effect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
</script>

<aside class="pane" aria-label="预览">
  <div class="bar">
    <button class="icon-btn sm" type="button" title="上一个 (←)" onclick={prev} disabled={index <= 0}>
      <Icon name="chevronLeft" size={16} />
    </button>
    <button class="icon-btn sm" type="button" title="下一个 (→)" onclick={next} disabled={index >= previewables.length - 1}>
      <Icon name="chevronRight" size={16} />
    </button>
    {#if previewables.length > 1}<span class="count num">{index + 1} / {previewables.length}</span>{/if}
    <span class="spacer"></span>
    <a class="icon-btn sm" href={item.fullpath} download={item.filename} title="下载">
      <Icon name="download" size={15} />
    </a>
    <button class="icon-btn sm" type="button" title="全屏查看" onclick={() => onExpand(item)}>
      <Icon name="expand" size={15} />
    </button>
    <Dropdown title="更多" triggerClass="icon-btn sm" align="end" width={184}>
      {#snippet trigger()}<Icon name="more" size={15} />{/snippet}
      {#snippet children(close)}
        <button class="menu-item" type="button" onclick={() => (close(), void copyText(location.origin + item.fullpath))}>
          <Icon name="link" />复制链接
        </button>
        <button class="menu-item" type="button" onclick={() => (close(), onShare(item))}>
          <Icon name="qr" />二维码分享
        </button>
        <a class="menu-item" href={item.fullpath} target="_blank" rel="noopener noreferrer" onclick={close}>
          <Icon name="external" />新标签页打开
        </a>
        {#if onComic && isNovelPreviewExt(item.ext)}
          <button class="menu-item" type="button" title="把文本按段落排成条漫阅读" onclick={() => (close(), onComic(item))}>
            <Icon name="bookOpen" />阅读
          </button>
        {/if}
        {#if onEdit && editable}
          <button class="menu-item" type="button" onclick={() => (close(), onEdit(item))}>
            <Icon name="edit" />编辑
          </button>
        {/if}
      {/snippet}
    </Dropdown>
    <button class="icon-btn sm" type="button" title="关闭 (Esc)" onclick={onClose}>
      <Icon name="x" size={16} />
    </button>
  </div>

  <div class="info">
    <h2 class="name" title={item.name}>{item.filename}</h2>
    <p class="meta num">{formatSize(item.size)} · {formatTimestamp(item.mtime)}</p>
  </div>

  <div class="body" class:is-media={mode === "image" || mode === "video"}>
    {#key item.fullpath}
      <div class="swap">
        <PreviewBody
          {item}
          {mode}
          {content}
          variant="pane"
        />
      </div>
    {/key}
  </div>
</aside>

<style>
  .pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 48px;
    padding: 0 var(--s-2);
    border-bottom: 1px solid var(--border);
  }

  .count {
    margin-left: var(--s-1);
    color: var(--text-3);
    font-size: var(--fs-2);
  }

  .spacer {
    flex: 1;
  }

  .info {
    padding: var(--s-4) var(--s-4) var(--s-3);
  }

  .name {
    font-size: var(--fs-4);
    font-weight: 600;
    line-height: 1.4;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .meta {
    margin-top: 2px;
    color: var(--text-3);
    font-size: var(--fs-2);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    margin: 0 var(--s-3) var(--s-3);
    border-radius: var(--r-md);
    background: var(--fill);
  }

  /* Transparent images sit on a quiet checkerboard. */
  .body.is-media {
    display: flex;
    background-color: var(--fill);
    background-image: conic-gradient(var(--fill-strong) 25%, transparent 0 50%, var(--fill-strong) 0 75%, transparent 0);
    background-size: 16px 16px;
  }

  .swap {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    animation: fade-in var(--t-2) var(--ease);
  }

  .body.is-media .swap {
    flex: 1;
    align-items: center;
    justify-content: center;
    padding: var(--s-3);
  }
</style>
