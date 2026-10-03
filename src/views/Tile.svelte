<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import LazyImage from "./LazyImage.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import { fileKind, isImageExt } from "../lib/models/exts";
  import { formatRelative, formatSize } from "../lib/models/format";
  import { folderProbes, probeFolder } from "../stores/folderProbe.svelte";
  import { reading } from "../stores/reading.svelte";
  import { places } from "../stores/places.svelte";
  import type { IconName } from "../lib/icons";

  interface Props {
    item: PathItem;
    /** media: image-first tile · row: compact folder/file card · card: square grid cell */
    variant: "media" | "row" | "card";
    selected: boolean;
    /** Shown in the preview pane right now. */
    current?: boolean;
    /** The folder we just came back from. */
    flash?: boolean;
    index: number;
  }
  let { item, variant, selected, current = false, flash = false, index }: Props = $props();

  const kind = $derived(fileKind(item.ext, item.is_dir));
  /** Thumbnail the browser failed to decode (e.g. HEIC in Chrome): fall back to the glyph. */
  let thumbFailed = $state(false);
  $effect(() => {
    void item.fullpath;
    thumbFailed = false;
  });
  const showImage = $derived(!item.is_dir && isImageExt(item.ext) && variant !== "row" && !thumbFailed);
  /** Search results carry a relative path in `name`; show the leaf. */
  const label = $derived(item.filename || item.name);
  const where = $derived(item.name.includes("/") ? item.name.slice(0, item.name.lastIndexOf("/")) : "");
  const dirPath = $derived(item.is_dir ? `${item.fullpath}/` : null);
  const probe = $derived(dirPath ? folderProbes.get(dirPath) : undefined);
  const comic = $derived(probe?.comic ?? null);
  const cover = $derived(probe?.cover ?? null);
  const folderIcon = $derived<IconName>(
    probe?.kind === "video" ? "film" : probe?.kind === "audio" ? "music" : probe?.kind === "document" ? "fileText" : "folder",
  );
  /** Where you stopped reading this folder last time. */
  const mark = $derived(comic ? reading.get(item.fullpath) : null);
  const progress = $derived(mark && mark.total && mark.page > 0 ? Math.min(1, (mark.page + 1) / mark.total) : 0);
  /** Changed since you last looked (only for folders you have visited). */
  const fresh = $derived.by(() => {
    if (!dirPath) return false;
    const seen = places.visits[dirPath];
    return !!seen && Math.max(item.mtime, probe?.newest ?? 0) > seen;
  });
  const readHint = $derived(
    mark?.chapter && progress < 1
      ? `继续阅读 · ${mark.chapter}`
      : progress > 0 && progress < 1
        ? `继续阅读 · 第 ${mark!.page + 1} 页`
        : comic === "series"
          ? "阅读 · 从第一话开始连读"
          : "阅读 · 按顺序连读这个文件夹的图片",
  );
  const meta = $derived.by(() => {
    if (where) return where;
    const when = formatRelative(item.mtime);
    if (!item.is_dir) return `${formatSize(item.size)} · ${when}`;
    if (!probe) return when;
    if (comic && progress > 0 && progress < 1) {
      return mark?.chapter ? `读到 ${mark.chapter}` : `读到 ${mark!.page + 1} / ${mark!.total}`;
    }
    if (comic === "pages") return `${probe.count} 页 · ${when}`;
    if (comic === "series") return `${probe.count} 话 · ${when}`;
    return probe.items ? `${probe.items} 项 · ${when}` : `空 · ${when}`;
  });
</script>

<div
  class="tile v-{variant}"
  class:is-selected={selected}
  class:is-current={current}
  class:is-flash={flash}
  class:is-enter={index < 24}
  style:--i={index}
  data-path={item.fullpath}
  data-dir={item.is_dir ? "" : undefined}
  use:probeFolder={dirPath}
>
  <button class="hit" type="button" data-act="open" aria-label={label} title={item.name}></button>

  {#if showImage}
    <div class="media"><LazyImage {item} onfail={() => (thumbFailed = true)} /></div>
  {:else if comic}
    <!-- A comic folder's icon is its "read" button: cover/book at rest, play on approach. -->
    <button class="glyph folder is-comic" class:has-cover={!!cover} type="button" data-act="comic" title={readHint}>
      {#if cover}<LazyImage item={cover} alt="" />{:else}<Icon name="bookOpen" size={variant === "card" ? 30 : 18} stroke={1.5} />{/if}
      <span class="play"><Icon name="play" size={variant === "card" ? 24 : 14} fill stroke={0} /></span>
      {#if progress > 0}<span class="progress" style:--p={progress}></span>{/if}
    </button>
  {:else if cover}
    <div class="glyph folder has-cover"><LazyImage item={cover} alt="" /></div>
  {:else}
    <div class="glyph" class:folder={item.is_dir} style:--hue={kind.hue}>
      <Icon name={item.is_dir ? folderIcon : kind.icon} size={variant === "card" ? 30 : 18} stroke={1.5} />
      {#if !item.is_dir && variant === "card"}<span class="ext">{kind.label}</span>{/if}
    </div>
  {/if}

  <div class="text">
    <span class="name ellipsis">{#if item.is_symlink}<span class="link-badge" title="符号链接"><Icon name="symlink" size={11} stroke={2.25} /></span>{/if}{label}{#if fresh}<span class="fresh" title="上次来过之后有新内容"></span>{/if}</span>
    {#if variant !== "media"}<span class="meta ellipsis num">{meta}</span>{/if}
  </div>

  <input
    class="check pick"
    type="checkbox"
    data-act="select"
    checked={selected}
    tabindex="-1"
    aria-label={`选择 ${label}`}
  />

  <div class="tools">
    {#if variant !== "row"}
      <button class="tool" type="button" data-act="copy" title="复制链接">
        <Icon name="link" size={14} /><Icon name="check" size={14} stroke={2.25} />
      </button>
    {/if}
    {#if variant !== "row"}
    <a
      class="tool"
      data-act="download"
      href={item.is_dir ? `${item.fullpath}/?zip` : item.fullpath}
      download={item.is_dir ? `${label}.zip` : label}
      title="下载"
    ><Icon name="download" size={14} /></a>
    {/if}
    <button class="tool" type="button" data-act="more" title="更多操作"><Icon name="more" size={14} /></button>
  </div>
</div>

<style>
  .tile {
    position: relative;
    min-width: 0;
    border-radius: var(--r-md);
    color: var(--text);
    -webkit-touch-callout: none;
  }

  /* First screenful arrives in a short cascade; the rest just appear. */
  .tile.is-enter {
    animation: tile-in var(--t-3) var(--ease-out) both;
    animation-delay: calc(min(var(--i), 23) * 14ms);
  }

  @keyframes tile-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }

  /* Stretched hit area: the whole tile is one button, tools sit above it. */
  .hit {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
  }

  .hit:focus-visible {
    outline-offset: 2px;
  }

  /* ── media ── */
  .media {
    position: relative;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: var(--r-md);
    background: var(--fill);
    /* Off-screen thumbnails skip style/paint entirely. */
    content-visibility: auto;
    transition: transform var(--t-3) var(--ease-out), border-radius var(--t-3) var(--ease-out);
  }

  .media :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity var(--t-3) var(--ease), transform var(--t-4) var(--ease-out);
  }

  .media :global(img.is-loaded) {
    opacity: 1;
  }

  .media::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.06);
    pointer-events: none;
  }

  .media + .text .name {
    display: block;
    padding: 6px 2px 0;
    color: var(--text-2);
    font-size: var(--fs-2);
  }

  .tile.v-media:hover .media :global(img) {
    transform: scale(1.035);
  }

  /* Selected media shrinks inside an accent frame (Photos-style). */
  .tile.v-media.is-selected .media {
    transform: scale(0.9);
    border-radius: var(--r-lg);
  }

  .tile.v-media.is-selected::before {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    aspect-ratio: 1;
    border-radius: var(--r-md);
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 2px var(--accent);
  }

  /* ── row (folders + files in the gallery) ── */
  .tile.v-row {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    height: 52px;
    padding: 0 var(--s-3) 0 10px;
    border: 1px solid var(--border);
    background: var(--surface);
    transition: background-color var(--t-1) var(--ease), border-color var(--t-1) var(--ease);
  }

  .tile.v-row:hover {
    border-color: var(--border-strong);
    background: color-mix(in oklch, var(--surface), var(--fill) 50%);
  }

  .v-row .text,
  .v-card .text {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .v-row .text {
    flex: 1;
    padding-right: 52px;
  }

  .name {
    font-size: var(--fs-3);
    font-weight: 500;
    line-height: 1.35;
  }

  .meta {
    color: var(--text-3);
    font-size: var(--fs-1);
    line-height: 1.4;
  }

  .glyph {
    flex: 0 0 auto;
    position: relative;
    width: 32px;
    height: 32px;
    border-radius: var(--r-sm);
  }

  /* ── card (grid view) ── */
  .tile.v-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border: 1px solid transparent;
    transition: background-color var(--t-1) var(--ease), border-color var(--t-1) var(--ease);
  }

  .tile.v-card:hover {
    background: var(--fill);
  }

  .v-card .media {
    border-radius: var(--r-sm);
  }

  .v-card .glyph {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    border-radius: var(--r-sm);
  }

  .v-card .ext {
    position: absolute;
    bottom: 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
  }

  .v-card .text {
    align-items: center;
    padding: 0 2px 2px;
    text-align: center;
  }

  .v-card .name {
    max-width: 100%;
    font-size: var(--fs-2);
  }

  .tile.v-card.is-selected,
  .tile.v-row.is-selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  /* The item open in the preview pane. */
  .tile.is-current:not(.is-selected) {
    border-color: var(--accent);
  }

  .tile.v-media.is-current:not(.is-selected) .media::after {
    box-shadow: inset 0 0 0 2px var(--accent), inset 0 0 0 4px var(--bg);
  }

  /* Back from a subfolder: the folder you left glows once. */
  .tile.is-flash {
    animation: came-from 1.6s var(--ease) 0.15s;
  }

  @keyframes came-from {
    0%,
    30% {
      box-shadow: 0 0 0 2px var(--accent), 0 0 0 6px var(--accent-soft);
    }
    100% {
      box-shadow: 0 0 0 2px transparent, 0 0 0 6px transparent;
    }
  }

  /* Folder covers: the first picture stands in for the folder icon. */
  .glyph.has-cover {
    overflow: hidden;
    background: var(--fill);
  }

  .glyph.has-cover :global(img) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transition: opacity var(--t-3) var(--ease);
  }

  .glyph.has-cover :global(img.is-loaded) {
    opacity: 1;
  }

  /* A hairline of how far you have read, along the bottom of the cover. */
  .progress {
    position: absolute;
    inset: auto 0 0;
    height: 3px;
    background: oklch(0 0 0 / 0.25);
  }

  .progress::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--accent);
    transform: scaleX(var(--p));
    transform-origin: left;
  }

  .v-card .progress {
    height: 4px;
  }

  /* Changed since your last visit: a quiet dot, gone once you look. */
  .fresh {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin: 0 0 2px 6px;
    border-radius: 50%;
    background: var(--accent);
    vertical-align: middle;
  }

  /* Comic folders: the icon reads; it swaps book → play on approach. */
  .glyph.is-comic {
    overflow: hidden;
    z-index: 2;
    transition: background-color var(--t-2) var(--ease), color var(--t-2) var(--ease), transform var(--t-2) var(--ease-spring);
  }

  .glyph.is-comic > :global(svg),
  .play {
    transition: opacity var(--t-2) var(--ease), transform var(--t-2) var(--ease-out);
  }

  .play {
    position: absolute;
    inset: 0;
    z-index: 1;
    display: grid;
    place-items: center;
    opacity: 0;
    transform: scale(0.6);
  }

  .glyph.is-comic:hover {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .glyph.is-comic.has-cover:hover {
    color: oklch(1 0 0);
  }

  .glyph.is-comic.has-cover::after {
    content: "";
    position: absolute;
    inset: 0;
    background: oklch(0.2 0.02 var(--accent-h) / 0.5);
    opacity: 0;
    transition: opacity var(--t-2) var(--ease);
  }

  .glyph.is-comic.has-cover:hover::after {
    opacity: 1;
  }

  .glyph.is-comic:hover > :global(svg) {
    opacity: 0;
    transform: scale(0.6);
  }

  .glyph.is-comic:hover .play {
    opacity: 1;
    transform: none;
  }

  .glyph.is-comic:active {
    transform: scale(0.92);
  }

  /* Touch has no approach: show play from the start. */
  @media (hover: none) {
    .glyph.is-comic > :global(svg) {
      opacity: 0;
    }
    .play {
      opacity: 1;
      transform: none;
    }
  }

  /* Symlinks: a small resident mark before the name. */
  .link-badge {
    display: inline-flex;
    vertical-align: -1px;
    margin-right: 4px;
    color: var(--accent-text);
  }

  /* OS files dragged over a folder: it lights up and says what will happen. */
  .tile:global(.is-drop-target) {
    border-color: var(--accent);
    background: var(--accent-soft);
    box-shadow: 0 0 0 3px var(--accent-ring);
  }

  .tile:global(.is-drop-target)::after {
    content: "松开，上传到这里";
    position: absolute;
    z-index: 3;
    left: 50%;
    bottom: calc(100% + 6px);
    padding: 3px 8px;
    border-radius: var(--r-sm);
    background: var(--inverse);
    color: var(--inverse-text);
    font-size: var(--fs-1);
    white-space: nowrap;
    transform: translateX(-50%);
    pointer-events: none;
    animation: fade-in var(--t-2) var(--ease);
  }

  /* The page-level "drop here" overlay steps aside while a folder is targeted. */
  :global(html.drop-into-folder .drop-overlay) {
    opacity: 0;
  }

  /* ── Checkbox + hover tools ── */
  .pick {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 2;
  }

  /* Over pictures the box stays quiet until it matters. */
  .v-media .pick:not(:checked),
  .v-card .pick:not(:checked) {
    border-color: oklch(1 0 0 / 0.9);
    background-color: oklch(0 0 0 / 0.12);
    box-shadow: 0 0 0 1px oklch(0 0 0 / 0.12);
  }

  .v-card .glyph ~ .pick:not(:checked) {
    border-color: var(--border-strong);
    background-color: var(--surface);
    box-shadow: none;
  }

  .v-row .pick {
    top: 50%;
    right: 12px;
    margin-top: -8px;
  }

  .tools {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 2;
    display: flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--r-sm);
    background: color-mix(in oklch, var(--surface) 88%, transparent);
    box-shadow: var(--shadow-1);
    opacity: 0;
    transform: translateY(-2px);
    transition: opacity var(--t-1) var(--ease), transform var(--t-2) var(--ease-out);
  }

  /* Row cards: a resident "more" button, aligned with the checkbox. */
  .v-row .tools {
    top: 50%;
    left: auto;
    right: 34px;
    padding: 0;
    background: none;
    box-shadow: none;
    opacity: 1;
    transform: translateY(-50%);
  }

  .v-row .tool {
    color: var(--text-3);
  }

  .tool {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: var(--r-xs);
    color: var(--text-2);
  }

  .tool:hover {
    background: var(--fill-strong);
    color: var(--text);
  }

  .tool > :global(svg:nth-child(2)) {
    display: none;
  }

  .tool:global(.is-done) {
    color: var(--success);
  }

  .tool:global(.is-done) > :global(svg:first-child) {
    display: none;
  }

  .tool:global(.is-done) > :global(svg:nth-child(2)) {
    display: block;
    animation: check-pop var(--t-3) var(--ease-spring);
  }

  .tile:hover .tools,
  .tile:focus-within .tools {
    opacity: 1;
  }

  .tile:hover .tools,
  .tile:focus-within .tools {
    transform: none;
  }

  .v-row .tools,
  .tile.v-row:hover .tools {
    transform: translateY(-50%);
  }

  /* While selecting, tools would compete with the checkbox. */
  :global(.has-selection) .tools {
    display: none;
  }

  /* Touch: checkboxes surface once a long-press has started selecting. */
  @media (hover: none) {
    .v-media .tools,
    .v-card .tools {
      display: none;
    }
  }
</style>
