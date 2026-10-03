<script lang="ts">
  import { onMount } from "svelte";
  import TopBar from "./shell/TopBar.svelte";
  import Sidebar from "./shell/Sidebar.svelte";
  import DirHeader from "./shell/DirHeader.svelte";
  import GalleryView from "./views/GalleryView.svelte";
  import GridView from "./views/GridView.svelte";
  import ListView from "./views/ListView.svelte";
  import ComicReader from "./readers/ComicReader.svelte";
  import PreviewPane from "./readers/PreviewPane.svelte";
  import FullPreview from "./readers/FullPreview.svelte";
  import Icon from "./components/Icon.svelte";
  import ShareDialog from "./components/ShareDialog.svelte";
  import EditDialog from "./components/EditDialog.svelte";
  import ReadmeCard from "./components/ReadmeCard.svelte";
  import CommandPalette from "./components/CommandPalette.svelte";
  import ShortcutsDialog from "./components/ShortcutsDialog.svelte";
  import ConfirmDialog from "./components/ConfirmDialog.svelte";
  import ToastHost from "./components/ToastHost.svelte";
  import ContextMenu from "./components/ContextMenu.svelte";
  import LoginDialog from "./components/LoginDialog.svelte";
  import TrashDialog from "./components/TrashDialog.svelte";
  import UploadPanel from "./components/UploadPanel.svelte";
  import { directory } from "./stores/directory.svelte";
  import { selection } from "./stores/selection.svelte";
  import { prefs } from "./stores/prefs.svelte";
  import { auth } from "./stores/auth.svelte";
  import { toasts } from "./stores/toast.svelte";
  import { uploads } from "./stores/uploads.svelte";
  import { places, type PlaceEntry } from "./stores/places.svelte";
  import { folderProbes } from "./stores/folderProbe.svelte";
  import { readUrlState, writeUrl, closePreview, openComicPreview, navigateTo, setView } from "./actions/navigate";
  import { invalidateDirectoryCache } from "./lib/dufs/client";
  import { directoryItemFromPath, dirName, ensureTrailingSlash, parentDir } from "./lib/models/path";
  import { scrollMemory } from "./stores/scrollMemory";
  import { localFilter } from "./stores/filter.svelte";
  import { detectPreviewMode, isPreviewable } from "./lib/models/preview";
  import { heroMorph, thumbOf } from "./lib/motion";
  import {
    actionUploadFiles,
    actionUploadDataTransfer,
    actionNewFolder,
    actionDeleteSelected,
    actionMoveSelected,
    actionZipSelected,
  } from "./actions/files";
  import type { PathItem } from "./lib/dufs/types";

  const NARROW = "(max-width: 820px)";

  let previewItem = $state<PathItem | null>(null);
  /** Side preview pane (stay in the listing). */
  let paneItem = $state<PathItem | null>(null);
  let paneWidth = $state(loadPaneWidth());
  let shareItem = $state<PathItem | null>(null);
  let editItem = $state<PathItem | null>(null);
  let comicRoot = $state<PathItem | null>(null);
  let pendingFile = $state<string | null>(null);
  let loginOpen = $state(false);
  let trashOpen = $state(false);
  let paletteOpen = $state(false);
  let shortcutsOpen = $state(false);
  let mainEl = $state<HTMLElement>();
  let fileInput = $state<HTMLInputElement>();
  let dragDepth = $state(0);
  let ctx = $state<{ item: PathItem; x: number; y: number } | null>(null);
  let narrow = $state(window.matchMedia(NARROW).matches);
  let sidebarOpen = $state(!window.matchMedia(NARROW).matches);
  let flashPath = $state<string | null>(null);

  const dragging = $derived(dragDepth > 0);
  const anyReader = $derived(!!previewItem || !!comicRoot);

  // ── Page title: says where you are and what is happening ──
  $effect(() => {
    const host = location.host;
    const here = dirName(directory.path);
    let main = here;
    if (previewItem || paneItem) {
      const it = (previewItem ?? paneItem)!;
      const list = directory.sortedPaths.filter((p) => isPreviewable(p));
      const i = list.findIndex((p) => p.fullpath === it.fullpath);
      main = `${it.filename}${i >= 0 && list.length > 1 ? ` (${i + 1}/${list.length})` : ""} · ${here}`;
    } else if (comicRoot) {
      main = `条漫 · ${comicRoot.name}`;
    } else if (directory.search) {
      main = `“${directory.search}” 的结果 · ${here}`;
    } else if (selection.size) {
      main = `已选 ${selection.size} 项 · ${here}`;
    }
    const prefix = uploads.inFlight ? `↑ ${Math.round(uploads.overallProgress * 100)}% · ` : "";
    document.title = `${prefix}${main} — ${host}`;
  });

  // Typing in search narrows the current listing instantly; server search
  // results are shown as returned.
  const visiblePaths = $derived.by(() => {
    const q = localFilter.query.trim().toLowerCase();
    if (!q || directory.search) return directory.sortedPaths;
    return directory.sortedPaths.filter((p) => p.name.toLowerCase().includes(q));
  });

  // Scroll memory: once per arrival, as soon as the listing is on screen —
  // back where you were in folders you have seen, at the top of new ones.
  let restoredFor = "";
  $effect(() => {
    const p = directory.path;
    if (directory.loading || restoredFor === p) return;
    restoredFor = p;
    const y = scrollMemory.get(p) ?? 0;
    requestAnimationFrame(() => {
      if (mainEl && p === directory.path) mainEl.scrollTop = y;
    });
  });

  // ── "Came from" cue: returning to a parent highlights the folder you left ──
  $effect(() => {
    const prev = directory.previousPath;
    const here = directory.path;
    if (!prev || prev === here || parentDir(prev) !== here) {
      flashPath = null;
      return;
    }
    flashPath = prev;
    requestAnimationFrame(() => {
      mainEl?.querySelector(".is-flash")?.scrollIntoView({ block: "nearest" });
    });
    const t = setTimeout(() => (flashPath = null), 2000);
    return () => clearTimeout(t);
  });

  /** Until you drag it, the pane scales with the screen. */
  function defaultPaneWidth(): number {
    return Math.round(Math.min(640, Math.max(380, window.innerWidth * 0.24)));
  }

  function loadPaneWidth(): number {
    try {
      const v = Number(localStorage.getItem("dufs-pane-width"));
      return v >= 280 ? v : defaultPaneWidth();
    } catch {
      return defaultPaneWidth();
    }
  }

  function startPaneResize(e: PointerEvent) {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = paneWidth;
    const maxW = Math.min(960, window.innerWidth * 0.7);
    let frame = 0;
    const onMove = (me: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        paneWidth = Math.round(Math.max(280, Math.min(maxW, startW + (startX - me.clientX))));
      });
    };
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      try {
        localStorage.setItem("dufs-pane-width", String(paneWidth));
      } catch {
        /* ignore */
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  }

  function syncFromUrl() {
    const state = readUrlState();
    if (state.view) prefs.setViewMode(state.view);
    comicRoot = state.preview === "comic" ? comicItemFromUrl(state.file ?? state.path) : null;
    pendingFile = state.preview === "file" ? state.file : null;
  }

  /** Resolve a deep-linked file once its directory has loaded. */
  $effect(() => {
    if (!pendingFile) return;
    const found = directory.sortedPaths.find((p) => p.fullpath === pendingFile);
    if (!found) return;
    paneItem = found;
    pendingFile = null;
  });

  function openFolder(item: PathItem) {
    navigateTo(ensureTrailingSlash(`${item.fullpath}/`));
  }

  /** Side pane: stay in the listing. */
  function openPreview(item: PathItem) {
    if (item.is_dir) return;
    paneItem = item;
    places.pushRecent({ path: item.fullpath, name: item.filename, isDir: false });
    writeUrl({ preview: "file", file: item.fullpath, replace: true });
  }

  /** Full-screen reader; images morph out of their thumbnail. */
  function openFull(item: PathItem) {
    if (item.is_dir) return;
    if (!isPreviewable(item)) {
      window.open(item.fullpath, "_blank", "noopener,noreferrer");
      return;
    }
    directory.rememberScroll(mainEl?.scrollTop ?? 0);
    places.pushRecent({ path: item.fullpath, name: item.filename, isDir: false });
    const commit = () => {
      previewItem = item;
      writeUrl({ preview: "file", file: item.fullpath, replace: true });
    };
    if (detectPreviewMode(item) === "image") {
      heroMorph(thumbOf(item.fullpath), commit, () => document.querySelector<HTMLElement>(".stage-img"));
    } else commit();
  }

  function closePane() {
    paneItem = null;
    closePreview();
  }

  function closeReaders() {
    const y = directory.takeScroll();
    const leaving = previewItem;
    const commit = () => {
      previewItem = null;
      comicRoot = null;
      pendingFile = null;
      closePreview();
      if (mainEl) mainEl.scrollTop = y;
      // You may have paged far away in the lightbox; land on that picture.
      if (leaving) thumbOf(leaving.fullpath)?.closest(".tile")?.scrollIntoView({ block: "nearest" });
    };
    if (leaving && detectPreviewMode(leaving) === "image") {
      heroMorph(document.querySelector<HTMLElement>(".stage-img"), commit, () => thumbOf(leaving.fullpath));
    } else commit();
  }

  /** Comic root from the URL: a folder (trailing slash) or a novel file. */
  function comicItemFromUrl(path: string): PathItem {
    if (path.endsWith("/")) return directoryItemFromPath(path);
    return directory.sortedPaths.find((p) => p.fullpath === path) ?? { ...directoryItemFromPath(path), is_dir: false, path_type: "File", ext: path.split(".").pop() ?? "" };
  }

  function openComic(item?: PathItem) {
    directory.rememberScroll(mainEl?.scrollTop ?? 0);
    const root = item?.is_dir ? directoryItemFromPath(ensureTrailingSlash(`${item.fullpath}/`)) : (item ?? directoryItemFromPath(directory.path));
    comicRoot = root;
    openComicPreview(root.is_dir ? ensureTrailingSlash(`${root.fullpath}/`) : root.fullpath);
  }

  function openPlace(entry: PlaceEntry) {
    if (entry.isDir) {
      navigateTo(entry.path);
      return;
    }
    const parent = entry.path.slice(0, entry.path.lastIndexOf("/") + 1) || "/";
    writeUrl({ path: parent, preview: "file", file: entry.path, replace: false });
    pendingFile = entry.path;
    void directory.load(parent);
  }

  const paletteCommands = [
    { id: "refresh", label: "刷新当前目录", hint: "R" },
    { id: "newFolder", label: "新建文件夹" },
    { id: "upload", label: "上传文件" },
    { id: "view-gallery", label: "切换到画廊视图" },
    { id: "view-grid", label: "切换到网格视图" },
    { id: "view-list", label: "切换到列表视图" },
    { id: "bookmark", label: "收藏 / 取消收藏当前目录" },
    { id: "theme", label: "切换主题" },
    { id: "trash", label: "打开回收站" },
    { id: "shortcuts", label: "快捷键帮助", hint: "?" },
  ];

  function runCommand(id: string) {
    switch (id) {
      case "refresh":
        void refreshDir();
        break;
      case "newFolder":
        void actionNewFolder();
        break;
      case "upload":
        fileInput?.click();
        break;
      case "view-gallery":
      case "view-grid":
      case "view-list":
        setView(id.slice(5) as "gallery" | "grid" | "list");
        break;
      case "bookmark":
        places.toggleBookmark({ path: directory.path, name: dirName(directory.path), isDir: true });
        break;
      case "theme":
        prefs.cycleTheme();
        break;
      case "trash":
        trashOpen = true;
        break;
      case "shortcuts":
        shortcutsOpen = true;
        break;
    }
  }

  async function onLogout() {
    auth.logout();
    invalidateDirectoryCache();
    folderProbes.reset();
    toasts.success("已退出登录");
    await directory.load(directory.path, undefined, { skipCache: true });
  }

  function onContextMenu(e: MouseEvent, item: PathItem) {
    e.preventDefault();
    ctx = { item, x: e.clientX, y: e.clientY };
  }

  function goUp() {
    if (directory.path !== "/") navigateTo(parentDir(directory.path));
  }

  async function refreshDir() {
    await directory.load(directory.path, undefined, { skipCache: true });
    toasts.success("已刷新");
  }

  function selectAll() {
    selection.selectAll(directory.sortedPaths.map((p) => p.fullpath));
  }

  /** Paste images/files from the clipboard as uploads. */
  function onPaste(e: ClipboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, [contenteditable]")) return;
    if (!directory.allowUpload) return;
    const items = e.clipboardData?.items;
    if (!items?.length) return;
    const files: File[] = [];
    for (const it of Array.from(items)) {
      if (it.kind !== "file") continue;
      const f = it.getAsFile();
      if (!f) continue;
      const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const ext = f.name.split(".").pop() || f.type.split("/")[1] || "bin";
      const baseName = f.name && f.name !== "image.png" ? f.name : `paste-${ts}.${ext}`;
      files.push(new File([f], baseName, { type: f.type, lastModified: f.lastModified }));
    }
    if (files.length) {
      e.preventDefault();
      toasts.push(`正在上传粘贴的 ${files.length} 个文件`, "info");
      void actionUploadFiles(files);
    }
  }

  /** True while the user is typing; toggles (checkbox, radio, range) don't count. */
  function isTyping(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false;
    if (t instanceof HTMLInputElement) return !["checkbox", "radio", "range", "button"].includes(t.type);
    return !!t.closest("textarea, select, [contenteditable]");
  }

  function onKey(e: KeyboardEvent) {
    // An overlay already consumed this key (menus/dialogs handle Esc in capture).
    if (e.defaultPrevented || isTyping(e.target)) return;
    if (paletteOpen || shortcutsOpen || anyReader || document.querySelector(".modal")) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (mod && key === "k") {
      e.preventDefault();
      paletteOpen = true;
    } else if (e.key === "?") {
      e.preventDefault();
      shortcutsOpen = true;
    } else if (mod && key === "a") {
      e.preventDefault();
      selectAll();
    } else if (e.key === "Delete" || (mod && e.key === "Backspace")) {
      if (selection.size && directory.allowDelete) void actionDeleteSelected();
    } else if (e.key === "Backspace" && !selection.size) {
      e.preventDefault();
      goUp();
    } else if (key === "r" && !mod) {
      void refreshDir();
    } else if (e.key === " " && !mod) {
      const picked = directory.sortedPaths.filter((p) => selection.has(p.fullpath));
      if (picked.length === 1 && !picked[0].is_dir) {
        e.preventDefault();
        openPreview(picked[0]);
      }
    } else if (e.key === "Escape") {
      // Peel one layer at a time: context menu → pane → selection.
      if (ctx) ctx = null;
      else if (paneItem) closePane();
      else selection.clear();
    } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && !mod) {
      moveFocus(e);
    }
  }

  /**
   * Arrow keys move focus between items by their position on screen, so they
   * also cross the gallery's sections. Focus is not selection: Enter / click
   * opens, Shift+Arrow extends the selection.
   */
  function moveFocus(e: KeyboardEvent) {
    if (paneItem) return; // the pane pages with arrows itself
    const tiles = Array.from(mainEl?.querySelectorAll<HTMLElement>("[data-path]") ?? []);
    if (!tiles.length) return;
    const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>("[data-path]");
    const from = current ? tiles.indexOf(current) : -1;
    let to = from;
    if (from < 0 || e.key === "Home") to = 0;
    else if (e.key === "End") to = tiles.length - 1;
    else if (e.key === "ArrowLeft") to = Math.max(0, from - 1);
    else if (e.key === "ArrowRight") to = Math.min(tiles.length - 1, from + 1);
    else {
      // Up/Down: nearest row above/below, then the closest column in it.
      const r = tiles[from].getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const down = e.key === "ArrowDown";
      let rowY = down ? Infinity : -Infinity;
      for (const t of tiles) {
        const y = t.getBoundingClientRect().top;
        if (down ? y > r.top + 4 && y < rowY : y < r.top - 4 && y > rowY) rowY = y;
      }
      if (!Number.isFinite(rowY)) return;
      let best = Infinity;
      tiles.forEach((t, i) => {
        const tr = t.getBoundingClientRect();
        if (Math.abs(tr.top - rowY) > 4) return;
        const d = Math.abs(tr.left + tr.width / 2 - cx);
        if (d < best) {
          best = d;
          to = i;
        }
      });
    }
    e.preventDefault();
    const target = tiles[to];
    if (e.shiftKey) {
      const order = tiles.map((t) => t.dataset.path!);
      if (from >= 0 && !selection.has(order[from])) selection.setAt(order[from], true, from);
      selection.toggleAt(order[to], to, order, true);
    }
    target.scrollIntoView({ block: "nearest" });
    target.querySelector<HTMLElement>(".hit")?.focus({ preventScroll: true });
  }

  function onDragEnter(e: DragEvent) {
    if (!directory.allowUpload || !e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
    dragDepth += 1;
  }

  onMount(() => {
    directory.bootstrapFromUrl();
    syncFromUrl();
    places.pushRecent({ path: directory.path, name: dirName(directory.path), isDir: true });
    places.markVisited(directory.path);
    const onPop = () => {
      const state = readUrlState();
      if (mainEl && state.path !== directory.path) {
        scrollMemory.remember(directory.path, mainEl.scrollTop);
      }
      places.markVisited(directory.path);
      places.markVisited(state.path);
      void directory.load(state.path).then(() => syncFromUrl());
      if (state.preview !== "file") {
        previewItem = null;
        paneItem = null;
      }
      if (state.preview !== "comic") comicRoot = null;
    };
    const mq = window.matchMedia(NARROW);
    const onMq = () => {
      narrow = mq.matches;
      sidebarOpen = !mq.matches;
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("keydown", onKey);
    window.addEventListener("paste", onPaste);
    mq.addEventListener("change", onMq);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("paste", onPaste);
      mq.removeEventListener("change", onMq);
    };
  });

  const viewProps = $derived({
    items: visiblePaths,
    onOpen: openFolder,
    onPreview: openPreview,
    onFullPreview: openFull,
    onContextMenu,
    onComic: (item: PathItem) => openComic(item),
    currentPath: paneItem?.fullpath ?? null,
    flashPath,
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="app"
  ondragenter={onDragEnter}
  ondragover={(e) => dragDepth > 0 && e.preventDefault()}
  ondragleave={() => (dragDepth = Math.max(0, dragDepth - 1))}
  ondrop={(e) => {
    if (!dragging) return;
    e.preventDefault();
    dragDepth = 0;
    if (e.dataTransfer) void actionUploadDataTransfer(e.dataTransfer);
  }}
>
  <TopBar
    onUpload={() => fileInput?.click()}
    onNewFolder={() => void actionNewFolder()}
    onLogin={() => (loginOpen = true)}
    onLogout={() => void onLogout()}
    onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
    onRefresh={() => void refreshDir()}
    onSelectAll={selectAll}
    onOpenTrash={() => (trashOpen = true)}
    onPalette={() => (paletteOpen = true)}
    onShortcuts={() => (shortcutsOpen = true)}
  />

  <div class="body">
    {#if sidebarOpen && narrow}
      <button class="scrim" type="button" aria-label="关闭侧栏" onclick={() => (sidebarOpen = false)}></button>
    {/if}
    <Sidebar
      open={sidebarOpen}
      onOpenPlace={openPlace}
      onNavigate={() => narrow && (sidebarOpen = false)}
    />

    <div class="workspace">
      {#if directory.loading}<div class="loading-bar" aria-hidden="true"></div>{/if}
      <main class="main" class:has-selection={selection.size > 0} bind:this={mainEl}>
        {#if directory.error}
          <div class="empty">
            <span class="empty-icon"><Icon name="alert" size={22} /></span>
            {#if /^40[13]/.test(directory.error)}
              <strong>需要登录</strong>
              <p>这个目录受保护，登录后即可访问。</p>
            {:else}
              <strong>加载失败</strong>
              <p>{directory.error}</p>
            {/if}
            <div class="empty-actions">
              <button class="btn" type="button" onclick={() => directory.load(directory.path, undefined, { skipCache: true })}>
                <Icon name="refresh" size={14} />重试
              </button>
              {#if /^40[13]/.test(directory.error)}
                <button class="btn btn-primary" type="button" onclick={() => (loginOpen = true)}>登录</button>
              {/if}
            </div>
          </div>
        {:else}
          <DirHeader
            onComic={() => openComic()}
            onClearSearch={() => void directory.runSearch("", prefs.searchScope)}
            onDelete={() => void actionDeleteSelected()}
            onMove={() => void actionMoveSelected()}
            onZip={actionZipSelected}
            onSelectAll={selectAll}
          />
          {#if prefs.viewMode === "gallery"}
            <GalleryView {...viewProps} />
          {:else if prefs.viewMode === "grid"}
            <GridView {...viewProps} />
          {:else}
            <ListView {...viewProps} />
          {/if}
          {#if !directory.search}<ReadmeCard />{/if}
        {/if}
      </main>

      {#if paneItem}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="resizer" role="separator" aria-orientation="vertical" onpointerdown={startPaneResize}></div>
        <div class="pane" style:width={`${paneWidth}px`}>
          <PreviewPane
            item={paneItem}
            allItems={directory.sortedPaths}
            onClose={closePane}
            onNavigate={openPreview}
            onExpand={openFull}
            onShare={(it) => (shareItem = it)}
            onComic={(it) => openComic(it)}
            onEdit={(it) => (editItem = it)}
          />
        </div>
      {/if}
    </div>
  </div>

</div>

<input
  bind:this={fileInput}
  type="file"
  multiple
  hidden
  onchange={(e) => {
    const files = e.currentTarget.files;
    if (files) void actionUploadFiles(files);
    e.currentTarget.value = "";
  }}
/>

{#if dragging}
  <div class="drop-overlay">
    <div>
      <Icon name="upload" size={28} />
      <strong>松开即可上传</strong>
      <span>到「{dirName(directory.path)}」</span>
    </div>
  </div>
{/if}

{#if previewItem}
  <FullPreview
    item={previewItem}
    allItems={directory.sortedPaths}
    onClose={closeReaders}
    onShare={(it) => (shareItem = it)}
    onNavigate={(item) => {
      previewItem = item;
      writeUrl({ preview: "file", file: item.fullpath, replace: true });
    }}
  />
{/if}

{#if comicRoot}
  <ComicReader root={comicRoot} onClose={closeReaders} />
{/if}

{#if ctx}
  <ContextMenu
    item={ctx.item}
    x={ctx.x}
    y={ctx.y}
    onClose={() => (ctx = null)}
    onPreview={openPreview}
    onFullPreview={openFull}
    onEdit={(it) => (editItem = it)}
    onShare={(it) => (shareItem = it)}
    onComic={(it) => openComic(it)}
  />
{/if}

<ConfirmDialog />
<ToastHost />
<UploadPanel />
<LoginDialog open={loginOpen} onClose={() => (loginOpen = false)} />
<TrashDialog open={trashOpen} onClose={() => (trashOpen = false)} />
<ShareDialog
  url={shareItem ? location.origin + shareItem.fullpath : null}
  title={shareItem?.filename}
  onClose={() => (shareItem = null)}
/>
<EditDialog
  item={editItem}
  onClose={() => (editItem = null)}
  onSaved={() => {
    // A pane showing the edited file must re-read it, not keep the old text.
    if (paneItem && editItem && paneItem.fullpath === editItem.fullpath) paneItem = { ...paneItem };
    void directory.load(directory.path, undefined, { skipCache: true });
  }}
/>
<CommandPalette
  open={paletteOpen}
  onClose={() => (paletteOpen = false)}
  items={directory.sortedPaths}
  commands={paletteCommands}
  onCommand={runCommand}
  onOpenPlace={openPlace}
  onPick={(item) => (item.is_dir ? openFolder(item) : openPreview(item))}
/>
<ShortcutsDialog open={shortcutsOpen} onClose={() => (shortcutsOpen = false)} />

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .body {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .scrim {
    position: absolute;
    inset: 0;
    z-index: 35;
    background: oklch(0.15 0.01 var(--neutral-h) / 0.32);
    animation: fade-in var(--t-2) var(--ease);
    cursor: default;
  }

  .workspace {
    position: relative;
    flex: 1;
    min-width: 0;
    display: flex;
  }

  .main {
    flex: 1;
    min-width: 0;
    overflow: auto;
    padding: 0 var(--gutter) 96px;
    overscroll-behavior: contain;
  }

  .resizer {
    position: relative;
    flex: 0 0 1px;
    background: var(--border);
    cursor: col-resize;
    touch-action: none;
  }

  /* Wide invisible grip; the line itself stays a hairline. */
  .resizer::after {
    content: "";
    position: absolute;
    inset: 0 -4px;
    z-index: 1;
    transition: background-color var(--t-2) var(--ease);
  }

  .resizer:hover::after,
  .resizer:active::after {
    background: var(--accent-soft);
  }

  .pane {
    flex: 0 0 auto;
    min-width: 0;
    display: flex;
    background: var(--surface);
    animation: pane-in var(--t-3) var(--ease-out);
  }

  @keyframes pane-in {
    from {
      opacity: 0;
      transform: translateX(16px);
    }
  }

  @media (max-width: 900px) {
    .resizer {
      display: none;
    }
    .pane {
      position: absolute;
      inset: 0 0 0 auto;
      z-index: 30;
      max-width: 100%;
      box-shadow: var(--shadow-3);
    }
  }

  /* Phones: the pane takes the whole workspace (beats the inline drag width). */
  @media (max-width: 640px) {
    .pane {
      inset: 0;
      width: auto !important;
    }
    .main {
      --gutter: var(--s-3);
    }
  }
</style>
