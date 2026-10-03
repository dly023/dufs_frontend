<script lang="ts">
  import { tick } from "svelte";
  import Icon from "../components/Icon.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import { fetchDirectory, fetchFileText, fetchFileHead } from "../lib/dufs/client";
  import { previewableImageExts, isNovelPreviewExt } from "../lib/models/exts";
  import { naturalCompare } from "../lib/models/sort";
  import { ensureTrailingSlash } from "../lib/models/path";
  import { toasts } from "../stores/toast.svelte";
  import { reading } from "../stores/reading.svelte";
  import LazyImage from "../views/LazyImage.svelte";

  interface Props {
    root: PathItem | null;
    onClose: () => void;
  }
  let { root, onClose }: Props = $props();

  let pages = $state<PathItem[]>([]);
  let panels = $state<string[]>([]);
  let loading = $state(false);
  let error = $state("");
  let truncated = $state(false);
  let current = $state(0);
  let night = $state(loadNight());
  let hidden = $state(false);
  let scrollEl = $state<HTMLDivElement>();
  let barEl = $state<HTMLDivElement>();

  const MAX_DEPTH = 4;
  const MAX_PAGES = 800;
  const MAX_TEXT = 8 * 1024 * 1024;
  const total = $derived(pages.length || panels.length);
  /** Chapter folder of the page in view (series: pages live one level down). */
  const chapter = $derived.by(() => {
    const p = pages[current];
    if (!p || !root) return undefined;
    const dir = decodeURIComponent(p.fullpath.slice(0, p.fullpath.lastIndexOf("/")));
    const rootPath = decodeURIComponent(root.fullpath.replace(/\/+$/, ""));
    return dir === rootPath ? undefined : dir.slice(dir.lastIndexOf("/") + 1);
  });

  function loadNight(): boolean {
    try {
      return localStorage.getItem("dufs-comic-night") === "1";
    } catch {
      return false;
    }
  }

  function toggleNight() {
    night = !night;
    try {
      localStorage.setItem("dufs-comic-night", night ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  async function loadImages(start: PathItem) {
    const queue: { path: string; depth: number }[] = [{ path: ensureTrailingSlash(start.fullpath), depth: 0 }];
    const found: PathItem[] = [];
    while (queue.length && found.length < MAX_PAGES) {
      const cur = queue.shift()!;
      const data = await fetchDirectory(cur.path, undefined, { skipCache: true });
      if (!data) continue;
      for (const child of data.paths) {
        if (child.is_dir && cur.depth < MAX_DEPTH) {
          queue.push({ path: ensureTrailingSlash(`${child.fullpath}/`), depth: cur.depth + 1 });
        } else if (!child.is_dir && previewableImageExts.has(child.ext)) {
          found.push(child);
          // Show the first pages while deeper folders are still being scanned.
          if (found.length % 12 === 0) pages = [...found].sort((a, b) => naturalCompare(a.fullpath, b.fullpath));
        }
      }
    }
    pages = found.sort((a, b) => naturalCompare(a.fullpath, b.fullpath));
    if (!pages.length) error = "这个目录里没有找到图片";
  }

  async function loadNovel(file: PathItem) {
    const raw =
      file.size > MAX_TEXT
        ? ((truncated = true), (await fetchFileHead(file.fullpath, MAX_TEXT)).text)
        : await fetchFileText(file.fullpath);
    const paras = raw
      .replace(/\r\n?/g, "\n")
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean);
    panels = paras.length ? paras : raw.split("\n").filter((l) => l.trim());
    if (!panels.length) error = "无法从这个文件生成条漫预览";
  }

  /** Pick up where you left off last time. */
  async function resume() {
    const saved = (root && reading.get(root.fullpath)?.page) || 0;
    if (saved < 2 || saved >= total) return;
    await tick();
    scrollEl?.querySelector(`[data-page="${saved}"]`)?.scrollIntoView({ block: "start" });
    const where = reading.get(root!.fullpath)?.chapter;
    toasts.push(`从${where ? ` ${where} ·` : ""}第 ${saved + 1} 页继续`, "info", {
      label: "从头开始",
      handler: () => scrollEl?.scrollTo({ top: 0 }),
    });
  }

  async function load(start: PathItem) {
    loading = true;
    error = "";
    pages = [];
    panels = [];
    truncated = false;
    current = 0;
    try {
      if (start.is_dir) await loadImages(start);
      else if (isNovelPreviewExt(start.ext)) await loadNovel(start);
      else error = "不支持的条漫来源";
      await resume();
    } catch (e) {
      error = e instanceof Error ? e.message : "无法打开条漫";
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    if (root) void load(root);
  });

  // Current page = whichever crosses the middle of the screen.
  $effect(() => {
    if (!scrollEl || !total) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) if (en.isIntersecting) current = Number((en.target as HTMLElement).dataset.page);
      },
      { root: scrollEl, rootMargin: "-50% 0px -50% 0px" },
    );
    for (const el of scrollEl.querySelectorAll("[data-page]")) io.observe(el);
    return () => io.disconnect();
  });

  $effect(() => {
    if (!root || !total || loading) return;
    reading.set(root.fullpath, { page: current, total, chapter });
  });

  // Scroll: progress bar written straight to the DOM; toolbar tucks away
  // while reading down and returns on the slightest scroll up.
  let frame = 0;
  let lastY = 0;
  function onScroll() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!scrollEl) return;
      const y = scrollEl.scrollTop;
      const max = scrollEl.scrollHeight - scrollEl.clientHeight;
      barEl?.style.setProperty("--p", String(max > 0 ? y / max : 0));
      if (Math.abs(y - lastY) > 6) {
        hidden = y > lastY && y > 120;
        lastY = y;
      }
    });
  }

  function close() {
    onClose();
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || document.querySelector(".modal")) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
    else if (e.key === " " || e.key === "PageDown") {
      // Space pages by ~90% of the screen, like a book.
      e.preventDefault();
      scrollEl?.scrollBy({ top: (scrollEl.clientHeight * 0.9) * (e.shiftKey ? -1 : 1), behavior: "smooth" });
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if root}
  <div class="reader comic" class:is-night={night} role="dialog" aria-modal="true" tabindex="-1" aria-label={root.name}>
    <header class="bar" class:is-hidden={hidden}>
      <button class="icon-btn" type="button" title="返回 (Esc)" onclick={close}>
        <Icon name="chevronLeft" size={18} />
      </button>
      <div class="title">
        <strong class="ellipsis">{root.name}</strong>
        <span class="num">
          {#if total}{current + 1} / {total}{pages.length ? " 页" : " 段"}{:else}{root.is_dir ? "条漫" : "小说分镜"}{/if}
          {#if truncated} · 已截断至 8 MiB{/if}
          {#if loading && total} · 继续扫描…{/if}
        </span>
      </div>
      <button class="icon-btn" type="button" title={night ? "纸张模式" : "夜间模式"} onclick={toggleNight}>
        <Icon name={night ? "sun" : "moon"} size={17} />
      </button>
      <div class="progress" bind:this={barEl} aria-hidden="true"></div>
    </header>

    <div class="scroll" bind:this={scrollEl} onscroll={onScroll}>
      <div class="pages" class:is-text={!!panels.length}>
        {#if loading && !total}
          <p class="note">正在准备…</p>
        {/if}
        {#if error}
          <p class="note">{error}</p>
        {/if}
        {#each pages as page, i (page.fullpath)}
          <!-- LazyImage: native lazy loading, or a deferred authed blob behind dufs auth. -->
          <div class="page" data-page={i}><LazyImage item={page} /></div>
        {/each}
        {#each panels as panel, i (i)}
          <p class="panel" data-page={i}>{panel}</p>
        {/each}
        {#if total && !loading}
          <p class="end">— 完 —</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .comic {
    --paper: oklch(0.95 0.012 80);
    --ink: oklch(0.28 0.015 60);
    position: fixed;
    inset: 0;
    z-index: 80;
    background: var(--paper);
    color: var(--ink);
    animation: fade-in var(--t-2) var(--ease);
  }

  .comic.is-night {
    --paper: oklch(0.16 0.004 60);
    --ink: oklch(0.9 0.01 80);
  }

  .bar {
    position: absolute;
    inset: 0 0 auto;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: 52px;
    padding: 0 var(--s-3);
    background: color-mix(in oklch, var(--paper) 86%, transparent);
    backdrop-filter: blur(14px) saturate(1.2);
    transition: transform var(--t-3) var(--ease-out);
  }

  .bar.is-hidden {
    transform: translateY(-100%);
  }

  .bar .icon-btn {
    color: inherit;
  }

  .bar .icon-btn:hover {
    background: color-mix(in oklch, var(--ink) 8%, transparent);
    color: inherit;
  }

  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.3;
  }

  .title strong {
    font-size: var(--fs-3);
    font-weight: 600;
  }

  .title span {
    opacity: 0.55;
    font-size: var(--fs-1);
  }

  .progress {
    --p: 0;
    position: absolute;
    inset: auto 0 0;
    height: 2px;
    background: var(--accent);
    transform: scaleX(var(--p));
    transform-origin: left;
  }

  .scroll {
    height: 100%;
    overflow: auto;
    overscroll-behavior: contain;
  }

  .pages {
    max-width: 760px;
    margin: 0 auto;
    padding: 52px 0 var(--s-8);
  }

  .page :global(img) {
    display: block;
    width: 100%;
    height: auto;
  }

  /* Unloaded pages hold space, so lazy loading stays lazy. */
  .page:not(:has(:global(img.is-loaded))) {
    aspect-ratio: 2 / 3;
    background: color-mix(in oklch, var(--ink) 5%, transparent);
  }

  .pages.is-text {
    max-width: 640px;
    padding-left: var(--s-5);
    padding-right: var(--s-5);
  }

  .panel {
    margin-top: var(--s-6);
    font-size: 1.0625rem;
    line-height: 1.95;
    letter-spacing: 0.02em;
    text-indent: 2em;
  }

  .note,
  .end {
    padding: var(--s-8) 0;
    text-align: center;
    opacity: 0.5;
    font-size: var(--fs-3);
  }

  .end {
    letter-spacing: 0.3em;
  }
</style>
