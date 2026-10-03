<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import Dropdown from "../components/Dropdown.svelte";
  import { directory } from "../stores/directory.svelte";
  import { prefs, THEME_ORDER, type ThemeMode } from "../stores/prefs.svelte";
  import { auth } from "../stores/auth.svelte";
  import { trash } from "../stores/trash.svelte";
  import { places } from "../stores/places.svelte";
  import { uploads } from "../stores/uploads.svelte";
  import { navigateTo } from "../actions/navigate";
  import { crumbsOf, dirName } from "../lib/models/path";
  import type { IconName } from "../lib/icons";
  import { localFilter } from "../stores/filter.svelte";

  interface Props {
    onUpload: () => void;
    onNewFolder: () => void;
    onLogin: () => void;
    onLogout: () => void;
    onToggleSidebar: () => void;
    onRefresh: () => void;
    onSelectAll: () => void;
    onOpenTrash: () => void;
    onPalette: () => void;
    onShortcuts: () => void;
  }
  let p: Props = $props();

  let draft = $state("");
  let searchEl = $state<HTMLInputElement>();
  let filterTimer = 0;

  $effect(() => {
    // Keep local filter in sync with draft input debounced ~80ms
    const q = draft;
    clearTimeout(filterTimer);
    filterTimer = window.setTimeout(() => {
      localFilter.set(q);
    }, 80);
    return () => clearTimeout(filterTimer);
  });

  const crumbs = $derived(crumbsOf(directory.path));
  const bookmarked = $derived(places.isBookmarked(directory.path));
  const user = $derived(auth.user ?? directory.user);
  const uploadPct = $derived(uploads.inFlight ? Math.round(uploads.overallProgress * 100) : null);

  const themes: Record<ThemeMode, { label: string; icon: IconName }> = {
    system: { label: "跟随系统", icon: "monitor" },
    light: { label: "浅色", icon: "sun" },
    dark: { label: "深色", icon: "moon" },
    oled: { label: "纯黑 OLED", icon: "moon" },
  };

  // Keep the field in sync when search is cleared elsewhere, and start every
  // folder unfiltered.
  $effect(() => {
    if (!directory.search) draft = "";
  });

  let lastPath = directory.path;
  $effect(() => {
    if (directory.path === lastPath) return;
    lastPath = directory.path;
    draft = "";
    localFilter.clear();
  });

  function submit(e: Event) {
    e.preventDefault();
    void directory.runSearch(draft, prefs.searchScope);
  }

  function toggleScope() {
    prefs.toggleSearchScope();
    if (draft.trim()) void directory.runSearch(draft, prefs.searchScope);
    searchEl?.focus();
  }

  function themeFrom(e: MouseEvent) {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    prefs.cycleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }

  /** "/" focuses search from anywhere (GitHub / YouTube convention). */
  function onWindowKey(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const t = e.target as HTMLElement;
    const typing = t instanceof HTMLInputElement ? !["checkbox", "radio", "range", "button"].includes(t.type) : !!t.closest("textarea, select, [contenteditable]");
    if (typing) {
      if (e.key === "Escape" && t === searchEl) {
        e.preventDefault();
        draft = "";
        localFilter.clear();
        searchEl.blur();
        if (directory.search) void directory.runSearch("", prefs.searchScope);
      }
      return;
    }
    if (e.key === "/" && !e.metaKey && !e.ctrlKey && !document.querySelector(".modal, .reader")) {
      e.preventDefault();
      searchEl?.focus();
      searchEl?.select();
    }
  }
</script>

<svelte:window onkeydown={onWindowKey} />

<header class="topbar">
  <button class="icon-btn" type="button" title="侧栏" onclick={p.onToggleSidebar}>
    <Icon name="sidebar" size={17} />
  </button>

  <nav class="crumbs" aria-label="路径">
    {#each crumbs as c, i (c.path)}
      {#if i > 0}<Icon name="chevronRight" size={13} />{/if}
      {#if i === crumbs.length - 1}
        <span class="crumb is-here" title={c.label} aria-current="page">{c.label}</span>
      {:else}
        <button class="crumb" type="button" title={c.label} onclick={() => navigateTo(c.path)}>
          {#if i === 0}<Icon name="home" size={15} /><span class="sr-only">{c.label}</span>{:else}{c.label}{/if}
        </button>
      {/if}
    {/each}
    <button
      class="icon-btn sm star"
      class:is-on={bookmarked}
      type="button"
      title={bookmarked ? "取消收藏" : "收藏此目录"}
      onclick={() => places.toggleBookmark({ path: directory.path, name: dirName(directory.path), isDir: true })}
    >
      <Icon name="star" size={15} fill={bookmarked} />
    </button>
  </nav>

  <form class="search" role="search" onsubmit={submit}>
    <Icon name="search" size={15} />
    <input
      bind:this={searchEl}
      bind:value={draft}
      type="search"
      enterkeyhint="search"
      placeholder={prefs.searchScope === "global" ? "搜索全站" : "搜索此目录"}
      aria-label="搜索"
    />
    <button
      class="scope"
      type="button"
      title="切换搜索范围"
      onclick={toggleScope}
    >{prefs.searchScope === "global" ? "全站" : "此目录"}</button>
    <kbd class="kbd">/</kbd>
  </form>

  <div class="actions">
    {#if directory.allowUpload}
      <button class="btn btn-primary upload" type="button" title="上传文件（也可拖拽或粘贴）" onclick={p.onUpload}>
        {#if uploadPct !== null}
          <span class="ring" style:--p={uploadPct} aria-hidden="true"></span>
          <span class="num">{uploadPct}%</span>
        {:else}
          <Icon name="upload" size={15} />
          <span class="upload-label">上传</span>
        {/if}
      </button>
      <button class="icon-btn" type="button" title="新建文件夹" onclick={p.onNewFolder}>
        <Icon name="folderPlus" size={17} />
      </button>
    {/if}

    <button class="icon-btn" type="button" title={`主题：${themes[prefs.theme].label}`} onclick={themeFrom}>
      <Icon name={themes[prefs.theme].icon} size={17} />
    </button>

    <Dropdown title="更多" align="end" width={216}>
      {#snippet trigger()}<Icon name="more" size={17} />{/snippet}
      {#snippet children(close)}
        <button class="menu-item" type="button" onclick={() => (close(), p.onRefresh())}>
          <Icon name="refresh" />刷新<span class="hint">R</span>
        </button>
        <button class="menu-item" type="button" onclick={() => (close(), p.onSelectAll())}>
          <Icon name="checkSquare" />全选<span class="hint">⌘A</span>
        </button>
        {#if directory.allowArchive}
          <a class="menu-item" href={`${directory.path}?zip`} download onclick={close}>
            <Icon name="download" />下载此目录 (zip)
          </a>
        {/if}
        {#if directory.allowDelete}
          <button class="menu-item" type="button" onclick={() => (close(), p.onOpenTrash())}>
            <Icon name="trash" />回收站
            {#if trash.count}<span class="hint num">{trash.count}</span>{/if}
          </button>
        {/if}
        <div class="menu-sep"></div>
        <div class="menu-label">主题</div>
        {#each THEME_ORDER as t (t)}
          <button
            class="menu-item"
            class:is-active={prefs.theme === t}
            type="button"
            onclick={() => (close(), prefs.setTheme(t))}
          >
            <Icon name={themes[t].icon} />{themes[t].label}
            {#if prefs.theme === t}<span class="hint"><Icon name="check" size={14} /></span>{/if}
          </button>
        {/each}
        <div class="menu-sep"></div>
        <button class="menu-item" type="button" onclick={() => (close(), p.onPalette())}>
          <Icon name="search" />命令面板<span class="hint">⌘K</span>
        </button>
        <button class="menu-item" type="button" onclick={() => (close(), p.onShortcuts())}>
          <Icon name="keyboard" />快捷键<span class="hint">?</span>
        </button>
        {#if auth.isAuthed}
          <div class="menu-sep"></div>
          <button class="menu-item is-danger" type="button" onclick={() => (close(), p.onLogout())}>
            <Icon name="logout" />退出登录
          </button>
        {/if}
      {/snippet}
    </Dropdown>

    {#if auth.isAuthed}
      <span class="avatar" title={`已登录：${user ?? ""}`}>{(user ?? "?").slice(0, 1).toUpperCase()}</span>
    {:else if directory.authRequired || /^40[13]/.test(directory.error ?? "")}
      <button class="btn btn-ghost" type="button" onclick={p.onLogin}>
        <Icon name="user" size={15} />登录
      </button>
    {/if}
  </div>
</header>

<style>
  .topbar {
    position: relative;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: var(--topbar-h);
    padding: 0 var(--s-3);
    border-bottom: 1px solid var(--border);
    background: var(--chrome);
  }

  /* ── Breadcrumbs: middle segments give way first ── */
  .crumbs {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    color: var(--text-3);
    font-size: var(--fs-4);
  }

  .crumbs > :global(svg) {
    flex: 0 0 auto;
  }

  .crumb {
    flex: 0 1 auto;
    min-width: 2.5em;
    max-width: 14em;
    height: var(--h-sm);
    padding: 0 6px;
    border-radius: var(--r-sm);
    color: var(--text-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: background-color var(--t-1) var(--ease), color var(--t-1) var(--ease);
  }

  button.crumb:first-child {
    display: inline-grid;
    place-items: center;
    min-width: var(--h-sm);
    padding: 0;
  }

  button.crumb:hover {
    background: var(--fill);
    color: var(--text);
  }

  .crumb.is-here {
    flex-shrink: 0.2;
    display: inline-flex;
    align-items: center;
    max-width: 22em;
    color: var(--text);
    font-weight: 600;
  }

  .star {
    margin-left: 2px;
    color: var(--text-3);
    opacity: 0;
    transition: opacity var(--t-2) var(--ease), color var(--t-1) var(--ease);
  }

  .crumbs:hover .star,
  .star:focus-visible,
  .star.is-on {
    opacity: 1;
  }

  .star.is-on {
    background: none;
    color: var(--warning);
  }

  @media (hover: none) {
    .star {
      opacity: 1;
    }
  }

  /* ── Search ── */
  .search {
    flex: 0 1 320px;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: var(--h-md);
    padding: 0 4px 0 10px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    color: var(--text-3);
    transition: border-color var(--t-1) var(--ease), box-shadow var(--t-2) var(--ease);
  }

  .search:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }

  .search input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    background: none;
    color: var(--text);
    font-size: var(--fs-3);
    outline: none;
  }

  .search input::placeholder {
    color: var(--text-3);
  }

  .search input::-webkit-search-cancel-button {
    display: none;
  }

  .scope {
    flex: 0 0 auto;
    height: 22px;
    padding: 0 7px;
    border-radius: var(--r-xs);
    background: var(--fill);
    color: var(--text-2);
    font-size: var(--fs-1);
    font-weight: 550;
    transition: background-color var(--t-1) var(--ease), color var(--t-1) var(--ease);
  }

  .scope:hover {
    background: var(--fill-strong);
    color: var(--text);
  }

  /* The hint is for discovery; it steps aside once you are typing. Keyed on
     the input itself: pressing the scope button must not shift the layout
     under the cursor (the click would land elsewhere and be lost). */
  .search:has(input:focus) .kbd {
    display: none;
  }

  .search .kbd {
    margin-right: 2px;
  }

  /* ── Actions ── */
  .actions {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: var(--s-2);
  }

  .upload {
    margin-right: var(--s-1);
    min-width: 76px;
  }

  /* Upload progress lives in the button that started it. */
  .ring {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: conic-gradient(currentColor calc(var(--p) * 1%), color-mix(in oklch, currentColor 30%, transparent) 0);
    mask: radial-gradient(circle, transparent 4px, black 4.5px);
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    margin-left: var(--s-1);
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: var(--fs-2);
    font-weight: 650;
  }

  @media (max-width: 720px) {
    .topbar {
      gap: var(--s-1);
      padding: 0 var(--s-2);
    }
    .search {
      flex-basis: 160px;
    }
    .search .kbd,
    .scope {
      display: none;
    }
    .upload {
      min-width: 0;
      width: var(--h-md);
      padding: 0;
    }
    .upload-label {
      display: none;
    }
    .actions {
      margin-left: 0;
    }
  }

  @media (max-width: 480px) {
    .crumbs > :not(:nth-last-child(-n + 3)) {
      display: none;
    }
    .search {
      flex-basis: 40px;
    }
  }
</style>
