<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import { directory } from "../stores/directory.svelte";
  import { selection } from "../stores/selection.svelte";
  import { prefs, type SortColumn } from "../stores/prefs.svelte";
  import { fileKind } from "../lib/models/exts";
  import { formatRelative, formatSize, formatTimestamp } from "../lib/models/format";
  import { itemEvents, nearEnd } from "./itemEvents";
  import EmptyListing from "./EmptyListing.svelte";
  import { folderProbes, probeFolder } from "../stores/folderProbe.svelte";
  import type { PathItem } from "../lib/dufs/types";

  interface Props {
    items?: PathItem[];
    onOpen: (item: PathItem) => void;
    onPreview: (item: PathItem) => void;
    onFullPreview: (item: PathItem) => void;
    onContextMenu: (e: MouseEvent, item: PathItem) => void;
    onComic: (item: PathItem) => void;
    currentPath?: string | null;
    flashPath?: string | null;
  }
  let { items, onOpen, onPreview, onFullPreview, onContextMenu, onComic, currentPath, flashPath }: Props = $props();

  const PAGE = 300;
  let limit = $state(PAGE);
  $effect(() => {
    void directory.path;
    limit = PAGE;
  });

  const all = $derived(items ?? directory.sortedPaths);
  const allSelected = $derived(all.length > 0 && selection.size >= all.length);

  const events = itemEvents({
    items: () => all,
    onOpen: (item) => (item.is_dir ? onOpen(item) : onPreview(item)),
    onFull: (item) => onFullPreview(item),
    onContextMenu: (e, item) => onContextMenu(e, item),
    onComic: (item) => onComic(item),
  });

  const columns: { id: SortColumn; label: string; cls: string }[] = [
    { id: "name", label: "名称", cls: "c-name" },
    { id: "size", label: "大小", cls: "c-size" },
    { id: "mtime", label: "修改时间", cls: "c-time" },
  ];

  /** Header click: same column flips direction, a new one starts at its natural order. */
  function sortBy(id: SortColumn) {
    if (prefs.sortColumn === id) prefs.setSort(id, prefs.sortDirection === "asc" ? "desc" : "asc");
    else prefs.setSort(id, id === "name" ? "asc" : "desc");
  }
</script>

<div class="list" role="grid" aria-rowcount={all.length}>
  <div class="head" role="row">
    <span class="c-check">
      <input
        class="check"
        type="checkbox"
        aria-label="全选"
        checked={allSelected}
        indeterminate={selection.size > 0 && !allSelected}
        onchange={(e) => (e.currentTarget.checked ? selection.selectAll(all.map((p) => p.fullpath)) : selection.clear())}
      />
    </span>
    {#each columns as c (c.id)}
      <button class="col {c.cls}" class:is-sorted={prefs.sortColumn === c.id} type="button" onclick={() => sortBy(c.id)}>
        {c.label}
        <Icon name={prefs.sortColumn === c.id && prefs.sortDirection === "desc" ? "arrowDown" : "arrowUp"} size={12} stroke={2} />
      </button>
    {/each}
    <span class="c-tools"></span>
  </div>

  <div class="body" {...events}>
    {#each all.slice(0, limit) as item (item.fullpath)}
      {@const kind = fileKind(item.ext, item.is_dir)}
      {@const probe = item.is_dir ? folderProbes.get(`${item.fullpath}/`) : undefined}
      <div
        class="row"
        role="row"
        class:is-selected={selection.has(item.fullpath)}
        class:is-current={currentPath === item.fullpath}
        class:is-flash={flashPath === `${item.fullpath}/`}
        data-path={item.fullpath}
        data-dir={item.is_dir ? "" : undefined}
        use:probeFolder={item.is_dir ? `${item.fullpath}/` : null}
      >
        <span class="c-check">
          <input
            class="check"
            type="checkbox"
            data-act="select"
            tabindex="-1"
            checked={selection.has(item.fullpath)}
            aria-label={`选择 ${item.name}`}
          />
        </span>
        <button class="c-name hit" type="button" data-act="open" title={item.name}>
          <span class="glyph" class:folder={item.is_dir} style:--hue={kind.hue}><Icon name={probe?.comic ? "bookOpen" : probe?.kind === "video" ? "film" : probe?.kind === "audio" ? "music" : probe?.kind === "document" ? "fileText" : kind.icon} size={15} /></span>
          <span class="ellipsis">{item.name}</span>
        </button>
        {#if probe?.comic}
          <button class="read" type="button" data-act="comic" title={probe.comic === "series" ? "从第一话开始连读" : "按顺序连读这个文件夹的图片"}>
            <Icon name="play" size={9} fill stroke={0} />阅读
          </button>
        {/if}
        <span class="c-size num">
          {#if !item.is_dir}{formatSize(item.size)}
          {:else if probe?.comic === "pages"}{probe.count} 页
          {:else if probe?.comic === "series"}{probe.count} 话
          {:else if probe}{probe.items} 项
          {:else}—{/if}
        </span>
        <span class="c-time num" title={formatTimestamp(item.mtime)}>{formatRelative(item.mtime)}</span>
        <span class="c-tools">
          <button class="icon-btn sm" type="button" data-act="copy" title="复制链接">
            <Icon name="link" size={14} /><Icon name="check" size={14} stroke={2.25} />
          </button>
          <a
            class="icon-btn sm"
            data-act="download"
            href={item.is_dir ? `${item.fullpath}/?zip` : item.fullpath}
            download={item.is_dir ? `${item.filename}.zip` : item.filename}
            title="下载"
          ><Icon name="download" size={14} /></a>
          <button class="icon-btn sm" type="button" data-act="more" title="更多操作"><Icon name="more" size={14} /></button>
        </span>
      </div>
    {/each}
  </div>
  {#if limit < all.length}
    <div class="sentinel" use:nearEnd={() => (limit += PAGE)}></div>
  {/if}
</div>

{#if !all.length && !directory.loading}
  <EmptyListing />
{/if}

<style>
  .list {
    /* Name is capped so size/time stay within a glance of it on wide screens;
       the tools column absorbs the rest and keeps its right-edge alignment. */
    --cols: 32px minmax(0, 640px) 96px 128px minmax(92px, 1fr);
    font-size: var(--fs-3);
  }

  .head,
  .row {
    display: grid;
    grid-template-columns: var(--cols);
    align-items: center;
    column-gap: var(--s-2);
    padding: 0 var(--s-2);
  }

  .head {
    height: var(--h-lg);
    border-bottom: 1px solid var(--border);
    color: var(--text-3);
    font-size: var(--fs-2);
  }

  .col {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: var(--h-sm);
    color: inherit;
    font-weight: 500;
  }

  .col :global(svg) {
    opacity: 0;
    transition: opacity var(--t-1) var(--ease);
  }

  .col:hover {
    color: var(--text);
  }

  .col:hover :global(svg),
  .col.is-sorted :global(svg) {
    opacity: 1;
  }

  .col.is-sorted {
    color: var(--text);
  }

  .c-size,
  .head .c-size {
    justify-content: flex-end;
    text-align: right;
  }

  .c-check {
    display: grid;
    place-items: center;
  }

  .row {
    position: relative;
    height: 40px;
    border-radius: var(--r-sm);
    content-visibility: auto;
    contain-intrinsic-size: auto 40px;
    transition: background-color var(--t-1) var(--ease);
  }

  .row + .row::before {
    content: "";
    position: absolute;
    inset: 0 var(--s-2) auto 44px;
    height: 1px;
    background: var(--border);
    opacity: 0.6;
  }

  .row:hover,
  .row:hover + .row::before {
    background: var(--fill);
  }

  .row:hover::before,
  .row:hover + .row::before,
  .row.is-selected::before,
  .row.is-selected + .row::before {
    opacity: 0;
  }

  .row.is-selected {
    background: var(--accent-soft);
  }

  .row.is-current {
    box-shadow: inset 2px 0 0 var(--accent);
  }

  .row.is-flash {
    animation: row-came-from 1.6s var(--ease) 0.15s;
  }

  @keyframes row-came-from {
    0%,
    30% {
      background: var(--accent-soft);
    }
  }

  /* The name cell shares its track with an optional "read" pill. */
  .c-name.hit {
    grid-column: 2;
    grid-row: 1;
  }

  .read {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px 0 7px;
    border-radius: var(--r-full);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: var(--fs-1);
    font-weight: 600;
    transition: background-color var(--t-1) var(--ease);
  }

  .read:hover {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .row:has(.read) .c-name {
    padding-right: 64px;
  }

  .hit {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    height: 100%;
    text-align: left;
  }

  .glyph {
    flex: 0 0 auto;
    width: 24px;
    height: 24px;
    border-radius: var(--r-xs);
  }

  .c-size,
  .c-time {
    color: var(--text-3);
    font-size: var(--fs-2);
    white-space: nowrap;
  }

  /* Resident tools form a quiet right-hand column; the hovered row speaks up. */
  .c-tools {
    display: flex;
    justify-content: flex-end;
    gap: 2px;
  }

  .c-tools .icon-btn {
    color: var(--text-3);
  }

  .row:hover .c-tools .icon-btn {
    color: var(--text-2);
  }

  .c-tools .icon-btn:hover {
    color: var(--text);
  }

  .c-tools .icon-btn > :global(svg:nth-child(2)) {
    display: none;
  }

  .c-tools .icon-btn:global(.is-done) {
    color: var(--success);
  }

  .c-tools .icon-btn:global(.is-done) > :global(svg:first-child) {
    display: none;
  }

  .c-tools .icon-btn:global(.is-done) > :global(svg:nth-child(2)) {
    display: block;
    animation: check-pop var(--t-3) var(--ease-spring);
  }

  @media (hover: none) {
    .c-tools {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .list {
      --cols: 28px minmax(0, 1fr) 72px;
    }
    .c-time,
    .c-tools {
      display: none;
    }
  }

  .sentinel {
    height: 1px;
  }
</style>
