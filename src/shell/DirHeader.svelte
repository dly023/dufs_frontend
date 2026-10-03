<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import Dropdown from "../components/Dropdown.svelte";
  import { directory } from "../stores/directory.svelte";
  import { selection } from "../stores/selection.svelte";
  import { prefs, type SortColumn, type TypeFilter, type ViewMode } from "../stores/prefs.svelte";
  import { setView } from "../actions/navigate";
  import { dirName } from "../lib/models/path";
  import { formatSize } from "../lib/models/format";
  import { isImageExt } from "../lib/models/exts";
  import { localFilter } from "../stores/filter.svelte";
  import { crossFade } from "../lib/motion";
  import type { IconName } from "../lib/icons";

  interface Props {
    onComic: () => void;
    onClearSearch: () => void;
    onDelete: () => void;
    onMove: () => void;
    onZip: () => void;
    onSelectAll: () => void;
  }
  let { onComic, onClearSearch, onDelete, onMove, onZip, onSelectAll }: Props = $props();

  const selecting = $derived(selection.size > 0);
  const allSelected = $derived(selection.size >= directory.sortedPaths.length);
  const selectedBytes = $derived(
    directory.sortedPaths.reduce((n, p) => (selection.has(p.fullpath) && !p.is_dir ? n + p.size : n), 0),
  );

  const modes: { id: ViewMode; icon: IconName; label: string }[] = [
    { id: "gallery", icon: "images", label: "画廊" },
    { id: "grid", icon: "grid", label: "网格" },
    { id: "list", icon: "list", label: "列表" },
  ];
  const sorts: { id: SortColumn; label: string }[] = [
    { id: "name", label: "名称" },
    { id: "mtime", label: "修改时间" },
    { id: "size", label: "大小" },
  ];
  const filters: { id: TypeFilter; label: string; icon: IconName }[] = [
    { id: "all", label: "全部类型", icon: "file" },
    { id: "image", label: "图片", icon: "images" },
    { id: "video", label: "视频", icon: "film" },
    { id: "audio", label: "音频", icon: "music" },
    { id: "document", label: "文档", icon: "fileText" },
    { id: "archive", label: "压缩包", icon: "archive" },
    { id: "code", label: "代码", icon: "fileCode" },
  ];

  const viewIndex = $derived(Math.max(0, modes.findIndex((m) => m.id === prefs.viewMode)));
  const sortLabel = $derived(sorts.find((s) => s.id === prefs.sortColumn)?.label ?? "名称");
  const filter = $derived(filters.find((f) => f.id === prefs.typeFilter) ?? filters[0]);

  /** "3 个文件夹 · 6 张图片 · 2 个文件 · 3.9 KB" — only the parts that exist. */
  const summary = $derived.by(() => {
    const lq = localFilter.query.trim().toLowerCase();
    if (lq) {
      const total = directory.sortedPaths.length;
      const matched = directory.sortedPaths.filter((p) => p.name.toLowerCase().includes(lq)).length;
      return `筛选 “${localFilter.query.trim()}” · ${matched} / ${total}`;
    }
    if (prefs.typeFilter !== "all") {
      // Filtered: say how much of the folder is showing, never "空文件夹".
      const files = directory.paths.filter((p) => !p.is_dir && p.name !== ".trash").length;
      const shown = directory.sortedPaths.filter((p) => !p.is_dir).length;
      const dirs = directory.sortedPaths.length - shown;
      return `${dirs ? `${dirs} 个文件夹 · ` : ""}筛选「${filter.label}」· ${shown} / ${files} 个文件`;
    }
    let dirs = 0;
    let images = 0;
    let files = 0;
    let bytes = 0;
    for (const p of directory.sortedPaths) {
      if (p.is_dir) dirs += 1;
      else {
        bytes += p.size;
        if (isImageExt(p.ext)) images += 1;
        else files += 1;
      }
    }
    const parts: string[] = [];
    if (dirs) parts.push(`${dirs} 个文件夹`);
    if (images) parts.push(`${images} 张图片`);
    if (files) parts.push(`${files} 个文件`);
    if (images || files) parts.push(formatSize(bytes));
    return parts.length ? parts.join(" · ") : "空文件夹";
  });

  function pickView(id: ViewMode) {
    if (id !== prefs.viewMode) crossFade(() => setView(id));
  }
</script>

<div class="dirhead" class:is-selecting={selecting}>
  {#if selecting}
    <div class="main swap">
      <h1 class="title">
        <button class="icon-btn sm" type="button" title="取消选择 (Esc)" onclick={() => selection.clear()}>
          <Icon name="x" size={16} />
        </button>
        {#key selection.size}<span class="count num">{selection.size}</span>{/key} 项已选
      </h1>
      <p class="meta num">
        共 {directory.sortedPaths.length} 项{selectedBytes ? ` · ${formatSize(selectedBytes)}` : ""}
        {#if !allSelected}<button class="clear" type="button" onclick={onSelectAll}>全选</button>{/if}
      </p>
    </div>
    <div class="tools swap">
      {#if directory.allowUpload}
        <button class="btn btn-sm" type="button" onclick={onMove}><Icon name="move" size={14} />移动到…</button>
      {/if}
      {#if directory.allowArchive}
        <button class="btn btn-sm" type="button" onclick={onZip}><Icon name="package" size={14} />打包下载</button>
      {/if}
      {#if directory.allowDelete}
        <button class="btn btn-sm btn-danger" type="button" onclick={onDelete}><Icon name="trash" size={14} />删除</button>
      {/if}
    </div>
  {:else}
  <div class="main">
    {#if directory.search}
      <h1 class="title ellipsis">“{directory.search}”</h1>
      <p class="meta">
        <span class="num">{directory.sortedPaths.length}</span> 个结果 ·
        {prefs.searchScope === "global" ? "全站" : dirName(directory.path)}
        <button class="clear" type="button" onclick={onClearSearch}>
          <Icon name="x" size={12} stroke={2.25} />清除搜索
        </button>
      </p>
    {:else}
      <h1 class="title ellipsis" title={dirName(directory.path)}>{dirName(directory.path)}</h1>
      <p class="meta num">{summary}</p>
    {/if}
  </div>

  <div class="tools">
    {#if directory.suggestComic && !directory.search}
      <button class="chip" type="button" title="按顺序连读本目录（含子目录）的图片" onclick={onComic}>
        <Icon name="bookOpen" size={14} />阅读
      </button>
    {/if}

    <Dropdown title="类型筛选" triggerClass="btn btn-ghost btn-sm" align="end" width={168}>
      {#snippet trigger()}
        <Icon name="filter" size={14} />
        <span class:active={prefs.typeFilter !== "all"}>{filter.label}</span>
      {/snippet}
      {#snippet children(close)}
        {#each filters as f (f.id)}
          <button
            class="menu-item"
            class:is-active={prefs.typeFilter === f.id}
            type="button"
            onclick={() => (close(), prefs.setTypeFilter(f.id))}
          >
            <Icon name={f.icon} />{f.label}
            {#if prefs.typeFilter === f.id}<span class="hint"><Icon name="check" size={14} /></span>{/if}
          </button>
        {/each}
      {/snippet}
    </Dropdown>

    <Dropdown title="排序" triggerClass="btn btn-ghost btn-sm" align="end" width={168}>
      {#snippet trigger()}
        <Icon name={prefs.sortDirection === "desc" ? "arrowDown" : "arrowUp"} size={14} />
        <span>{sortLabel}</span>
      {/snippet}
      {#snippet children(close)}
        {#each sorts as s (s.id)}
          <button
            class="menu-item"
            class:is-active={prefs.sortColumn === s.id}
            type="button"
            onclick={() => (close(), prefs.setSort(s.id, prefs.sortColumn === s.id ? prefs.sortDirection : s.id === "name" ? "asc" : "desc"))}
          >
            {s.label}
            {#if prefs.sortColumn === s.id}<span class="hint"><Icon name="check" size={14} /></span>{/if}
          </button>
        {/each}
        <div class="menu-sep"></div>
        <button class="menu-item" class:is-active={prefs.sortDirection === "asc"} type="button" onclick={() => (close(), prefs.setSort(prefs.sortColumn, "asc"))}>
          <Icon name="arrowUp" />升序
        </button>
        <button class="menu-item" class:is-active={prefs.sortDirection === "desc"} type="button" onclick={() => (close(), prefs.setSort(prefs.sortColumn, "desc"))}>
          <Icon name="arrowDown" />降序
        </button>
      {/snippet}
    </Dropdown>

    <div class="seg" role="tablist" aria-label="视图" style:--i={viewIndex}>
      {#each modes as m (m.id)}
        <button
          type="button"
          role="tab"
          aria-selected={prefs.viewMode === m.id}
          title={m.label}
          onclick={() => pickView(m.id)}
        >
          <Icon name={m.icon} size={15} />
        </button>
      {/each}
    </div>
  </div>
  {/if}
</div>

<style>
  .dirhead {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: var(--s-3) var(--s-4);
    margin: 0 calc(var(--gutter) * -1);
    padding: var(--s-5) var(--gutter) var(--s-4);
    background: var(--bg);
  }

  /* A hairline appears only once content scrolls beneath the header. */
  @supports (animation-timeline: scroll()) {
    .dirhead {
      animation: dirhead-lift linear both;
      animation-timeline: scroll(nearest block);
      animation-range: 0 24px;
    }
  }

  @keyframes dirhead-lift {
    from {
      box-shadow: 0 1px 0 transparent;
    }
    to {
      box-shadow: 0 1px 0 var(--border);
    }
  }

  .main {
    flex: 1 1 240px;
    min-width: 0;
  }

  /* Selection takes over the header in place: same slot, same height. */
  .dirhead.is-selecting {
    background: color-mix(in oklch, var(--bg), var(--accent) 5%);
  }

  .swap {
    animation: swap-in var(--t-2) var(--ease-out);
  }

  @keyframes swap-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  .is-selecting .title {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    margin-left: -6px;
  }

  .is-selecting .title .icon-btn {
    width: 26px;
    height: 26px;
  }

  .count {
    display: inline-block;
    color: var(--accent-text);
    animation: count-tick var(--t-3) var(--ease-out);
  }

  @keyframes count-tick {
    from {
      opacity: 0.3;
      transform: translateY(-35%);
    }
  }

  .is-selecting .meta {
    padding-left: 30px;
  }

  .tools .btn-sm {
    height: var(--h-md);
  }

  .title {
    height: 26px;
    font-size: var(--fs-6);
    font-weight: 650;
    line-height: 26px;
    letter-spacing: -0.015em;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 20px;
    margin-top: 2px;
    color: var(--text-3);
    font-size: var(--fs-2);
  }

  .clear {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    margin-left: var(--s-1);
    padding: 1px 7px 1px 5px;
    border-radius: var(--r-full);
    background: var(--fill);
    color: var(--text-2);
    font-size: var(--fs-1);
  }

  .clear:hover {
    background: var(--fill-strong);
    color: var(--text);
  }

  .tools {
    display: flex;
    align-items: center;
    gap: var(--s-1);
  }

  .tools .chip {
    margin-right: var(--s-2);
  }

  .active {
    color: var(--accent-text);
  }

  @media (max-width: 640px) {
    .dirhead {
      padding-top: var(--s-4);
      padding-bottom: var(--s-3);
    }
    .tools {
      width: 100%;
    }
    .tools .seg {
      margin-left: auto;
    }
  }
</style>
