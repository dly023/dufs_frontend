<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import LazyImage from "../views/LazyImage.svelte";
  import UnsupportedImage from "./UnsupportedImage.svelte";
  import { auth } from "../stores/auth.svelte";
  import { fetchBlobUrl } from "../lib/dufs/client";
  import { undecodableImageExts } from "../lib/models/exts";
  import type { PathItem } from "../lib/dufs/types";

  interface Props {
    item: PathItem;
    /** Resolved source (a blob URL behind auth). */
    src: string;
    items: PathItem[];
    index: number;
    /** -1 / 1: which way the last navigation went, for the slide-in. */
    direction: number;
    onPrev: () => void;
    onNext: () => void;
    onSelect: (item: PathItem) => void;
  }
  let { item, src, items, index, direction, onPrev, onNext, onSelect }: Props = $props();

  /** Scale relative to the fitted size (1 = fit); x/y pan in screen px. */
  let scale = $state(1);
  let rotation = $state(0);
  let x = $state(0);
  let y = $state(0);
  let dragging = $state(false);
  let isFullscreen = $state(false);
  let stage = $state<HTMLDivElement>();
  let img = $state<HTMLImageElement>();
  /** Fitted (layout) size of the image, before any transform. */
  let baseW = $state(0);
  let baseH = $state(0);
  let natural = $state({ w: 0, h: 0 });
  let failed = $state(false);
  /** Long-image reading: fit width, scroll vertically. */
  let strip = $state(false);

  const undecodable = $derived(undecodableImageExts.has(item.ext.toLowerCase()));
  const isLong = $derived(natural.w > 0 && natural.h / natural.w > 2.2);
  /** Scale at which one image pixel is one screen pixel. */
  const actual = $derived(baseW && natural.w ? natural.w / baseW : 1);
  const maxScale = $derived(Math.max(8, actual * 2));
  const zoomPct = $derived(Math.round(scale * (baseW && natural.w ? baseW / natural.w : 1) * 100));

  function reset() {
    scale = 1;
    rotation = 0;
    x = 0;
    y = 0;
  }

  $effect(() => {
    void item.fullpath;
    reset();
    natural = { w: 0, h: 0 };
    failed = false;
    strip = false;
  });

  function onLoad() {
    if (!img) return;
    natural = { w: img.naturalWidth, h: img.naturalHeight };
    // Manga strips and screenshots of long pages read top-down, not as a speck.
    if (natural.h / natural.w > 2.2) strip = true;
  }

  /** Keep a zoomed image covering the stage: no flinging it off-screen. */
  function clampPan() {
    if (!stage) return;
    const turned = Math.abs(rotation % 180) === 90;
    const w = (turned ? baseH : baseW) * scale;
    const h = (turned ? baseW : baseH) * scale;
    const limX = Math.max(0, (w - stage.clientWidth) / 2);
    const limY = Math.max(0, (h - stage.clientHeight) / 2);
    x = Math.min(limX, Math.max(-limX, x));
    y = Math.min(limY, Math.max(-limY, y));
  }

  /** Zoom so the image point under (cx, cy) stays put. */
  function zoomTo(next: number, cx?: number, cy?: number) {
    const s0 = scale;
    const s1 = Math.min(maxScale, Math.max(1, next));
    if (s1 === s0) return;
    if (img && stage && cx !== undefined && cy !== undefined) {
      // Untransformed centre (offset* ignore transforms, unlike getBoundingClientRect).
      const r = stage.getBoundingClientRect();
      const c0x = r.left + img.offsetLeft + img.offsetWidth / 2;
      const c0y = r.top + img.offsetTop + img.offsetHeight / 2;
      x = cx - c0x - (s1 / s0) * (cx - c0x - x);
      y = cy - c0y - (s1 / s0) * (cy - c0y - y);
    }
    scale = s1;
    if (scale === 1) {
      x = 0;
      y = 0;
    } else clampPan();
  }

  function stageCenter(): [number, number] {
    const r = stage?.getBoundingClientRect();
    return r ? [r.left + r.width / 2, r.top + r.height / 2] : [0, 0];
  }

  function zoomBy(factor: number) {
    zoomTo(scale * factor, ...stageCenter());
  }

  /** Fit ↔ actual pixels (or 2× for images smaller than the stage), at the point. */
  function toggleZoom(cx: number, cy: number) {
    if (scale > 1.01) reset();
    else zoomTo(actual > 1.05 ? actual : 2, cx, cy);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage?.closest<HTMLElement>(".reader")?.requestFullscreen();
    } catch {
      /* may be denied by policy; the viewer stays usable */
    }
  }

  // ── Pointers: one drags (or swipes to page), two pinch ──
  const pointers = new Map<number, { x: number; y: number }>();
  let start = { x: 0, y: 0, px: 0, py: 0, t: 0 };
  let pinch: { dist: number; mx: number; my: number } | null = null;
  let pinched = false;
  let lastTap: { t: number; x: number; y: number } | null = null;

  function pinchState() {
    const [a, b] = [...pointers.values()];
    return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }

  function onDown(e: PointerEvent) {
    if (strip || e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stage?.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      dragging = false;
      pinched = true;
      pinch = pinchState();
      return;
    }
    if (pointers.size === 1) pinched = false;
    start = { x: e.clientX, y: e.clientY, px: x, py: y, t: performance.now() };
    dragging = true;
  }

  function onMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const now = pinchState();
      zoomTo(scale * (now.dist / pinch.dist), now.mx, now.my);
      x += now.mx - pinch.mx;
      y += now.my - pinch.my;
      clampPan();
      pinch = now;
      return;
    }
    if (!dragging) return;
    x = start.px + (e.clientX - start.x);
    y = scale === 1 ? 0 : start.py + (e.clientY - start.y);
    if (scale > 1) clampPan();
  }

  function onUp(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (stage?.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 1) {
        // Keep panning with the finger that stayed down.
        const [p] = [...pointers.values()];
        start = { x: p.x, y: p.y, px: x, py: y, t: performance.now() };
        dragging = true;
      }
      return;
    }
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - start.x;
    const moved = Math.hypot(dx, e.clientY - start.y);
    // Double tap (touch/pen; mice use dblclick) toggles zoom at the finger.
    if (e.pointerType !== "mouse" && moved < 10 && performance.now() - start.t < 250) {
      const now = performance.now();
      if (lastTap && now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 32) {
        lastTap = null;
        toggleZoom(e.clientX, e.clientY);
        return;
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    if (scale === 1 && !pinched) {
      // Swipe to page; anything shorter springs back.
      if (Math.abs(dx) > 64) (dx > 0 ? onPrev : onNext)();
      x = 0;
    }
  }

  function onWheel(e: WheelEvent) {
    if (strip) {
      // Long-image mode scrolls natively; keep ctrl+wheel from zooming the page.
      if (e.ctrlKey) e.preventDefault();
      return;
    }
    e.preventDefault();
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    zoomTo(scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025)), e.clientX, e.clientY);
  }

  function onKey(e: KeyboardEvent) {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.target as HTMLElement | null)?.closest("input, textarea, [contenteditable]")) return;
    if (document.querySelector(".modal")) return;
    if (e.key === "+" || e.key === "=") zoomBy(1.4);
    else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.4);
    else if (e.key === "0") reset();
    else return;
    e.preventDefault();
  }

  const nearby = $derived(items.slice(Math.max(0, index - 5), Math.min(items.length, index + 6)));

  // Warm the neighbours so paging feels instant. Behind auth, a bare <img>
  // would 401 and trigger the browser's native auth prompt — go via blob.
  $effect(() => {
    for (const n of [items[index - 1], items[index + 1]]) {
      if (!n || undecodableImageExts.has(n.ext.toLowerCase())) continue;
      if (auth.isAuthed) void fetchBlobUrl(n.fullpath).catch(() => {});
      else new Image().src = n.fullpath;
    }
  });
</script>

<svelte:document onfullscreenchange={() => (isFullscreen = !!document.fullscreenElement)} />
<svelte:window onkeydown={onKey} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="stage"
  class:is-dragging={dragging}
  class:is-zoomed={scale > 1}
  class:is-strip={strip}
  bind:this={stage}
  onpointerdown={onDown}
  onpointermove={onMove}
  onpointerup={onUp}
  onpointercancel={onUp}
  onwheel={onWheel}
>
  <!-- The canvas holds (and, for long images, scrolls) the picture; nav and dock stay put. -->
  <div class="canvas" class:is-strip={strip}>
  {#key item.fullpath}
    {#if undecodable || failed}
      <UnsupportedImage {item} tone="stage" />
    {:else if src}
      <img
        class="stage-img"
        class:is-paging={direction !== 0}
        bind:this={img}
        bind:offsetWidth={baseW}
        bind:offsetHeight={baseH}
        {src}
        alt={item.name}
        draggable="false"
        style:--dir={direction}
        style:--natural-w={natural.w ? `${natural.w}px` : undefined}
        style:transform={strip ? undefined : `translate(${x}px, ${y}px) scale(${scale}) rotate(${rotation}deg)`}
        onload={onLoad}
        onerror={() => (failed = true)}
        ondblclick={(e) => !strip && toggleZoom(e.clientX, e.clientY)}
      />
    {/if}
  {/key}
  </div>

  {#if items.length > 1}
    <button class="nav is-prev" type="button" title="上一张 (←)" onclick={onPrev} disabled={index <= 0} onpointerdown={(e) => e.stopPropagation()}>
      <span><Icon name="chevronLeft" size={22} /></span>
    </button>
    <button class="nav is-next" type="button" title="下一张 (→)" onclick={onNext} disabled={index >= items.length - 1} onpointerdown={(e) => e.stopPropagation()}>
      <span><Icon name="chevronRight" size={22} /></span>
    </button>
  {/if}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dock chrome" onpointerdown={(e) => e.stopPropagation()}>
    {#if items.length > 1}
      <div class="film">
        {#each nearby as pic (pic.fullpath)}
          <button
            type="button"
            class:is-current={pic.fullpath === item.fullpath}
            title={pic.name}
            onclick={() => onSelect(pic)}
          >
            <LazyImage item={pic} alt="" />
          </button>
        {/each}
      </div>
      <span class="sep"></span>
    {/if}
    {#if !(undecodable || failed)}
    {#if natural.w}
      <span class="dims num" title="原始尺寸">{natural.w} × {natural.h}</span>
    {/if}
    {#if isLong}
      <button
        class="tool label"
        class:is-on={strip}
        type="button"
        title={strip ? "整张查看" : "按宽度阅读长图"}
        aria-pressed={strip}
        onclick={() => {
          strip = !strip;
          reset();
        }}
      >长图</button>
    {/if}
    <button class="tool" type="button" title="缩小 (-)" onclick={() => zoomBy(1 / 1.4)} disabled={strip || scale <= 1}>
      <Icon name="zoomOut" size={17} />
    </button>
    <button class="tool zoom num" type="button" title="适应屏幕 (0)" onclick={reset} disabled={strip}>{strip ? "适宽" : `${zoomPct}%`}</button>
    <button class="tool" type="button" title="放大 (+)" onclick={() => zoomBy(1.4)} disabled={strip || scale >= maxScale}>
      <Icon name="zoomIn" size={17} />
    </button>
    <button class="tool" type="button" title="旋转 90°" onclick={() => (rotation += 90)} disabled={strip}>
      <Icon name="rotate" size={17} />
    </button>
    {/if}
    <button class="tool" type="button" title="全屏 (F)" onclick={() => void toggleFullscreen()}>
      <Icon name={isFullscreen ? "minimize" : "maximize"} size={17} />
    </button>
  </div>
</div>

<style>
  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    touch-action: none;
    user-select: none;
  }

  .canvas {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 64px 72px 112px;
  }

  .stage.is-zoomed {
    cursor: grab;
  }

  /* Long images: fit the width (never upscale) and scroll down the strip. */
  .stage.is-strip {
    touch-action: pan-y;
    user-select: auto;
  }

  .canvas.is-strip {
    display: block;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 64px var(--s-4) 120px;
  }

  .canvas.is-strip .stage-img {
    width: min(100%, 960px, var(--natural-w, 960px));
    max-width: none;
    max-height: none;
    height: auto;
    margin: 0 auto;
    transition: none;
  }

  .stage.is-dragging {
    cursor: grabbing;
  }

  .stage-img {
    --dir: 0;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 2px;
    transition: transform var(--t-3) var(--ease-out);
  }

  .stage-img.is-paging {
    animation: stage-in var(--t-3) var(--ease-out);
  }

  /* Follow the finger/pointer 1:1 while dragging. */
  .stage.is-dragging .stage-img {
    transition: none;
  }

  @keyframes stage-in {
    from {
      opacity: 0;
      translate: calc(var(--dir) * 40px) 0;
    }
  }

  /* Big edge hit areas; the arrow only surfaces on approach. */
  .nav {
    position: absolute;
    top: 64px;
    bottom: 112px;
    width: 18%;
    max-width: 160px;
    display: flex;
    align-items: center;
    padding: 0 var(--s-4);
    color: oklch(1 0 0);
  }

  .nav.is-prev {
    left: 0;
  }

  .nav.is-next {
    right: 0;
    justify-content: flex-end;
  }

  .nav span {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    background: var(--glass);
    backdrop-filter: blur(12px);
    opacity: 0;
    transform: scale(0.9);
    transition: opacity var(--t-2) var(--ease), transform var(--t-2) var(--ease-out);
  }

  .nav:hover:not(:disabled) span,
  .nav:focus-visible span {
    opacity: 1;
    transform: none;
  }

  .nav:disabled {
    cursor: default;
  }

  .dock {
    position: absolute;
    left: 50%;
    bottom: var(--s-5);
    display: flex;
    align-items: center;
    gap: 2px;
    max-width: calc(100% - 32px);
    padding: 6px;
    border-radius: var(--r-lg);
    background: var(--glass);
    backdrop-filter: blur(16px) saturate(1.4);
    box-shadow: 0 0 0 1px oklch(1 0 0 / 0.08), 0 12px 32px oklch(0 0 0 / 0.4);
    transform: translateX(-50%);
  }

  .film {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .film button {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    overflow: hidden;
    border-radius: var(--r-sm);
    opacity: 0.45;
    transition: opacity var(--t-2) var(--ease), transform var(--t-2) var(--ease-out);
  }

  .film button:hover {
    opacity: 0.8;
  }

  .film button.is-current {
    opacity: 1;
    box-shadow: inset 0 0 0 2px oklch(1 0 0);
  }

  .film :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .sep {
    width: 1px;
    height: 24px;
    margin: 0 var(--s-2);
    background: oklch(1 0 0 / 0.14);
  }

  .tool {
    display: grid;
    place-items: center;
    min-width: 36px;
    height: 36px;
    border-radius: var(--r-md);
    color: oklch(1 0 0 / 0.85);
    transition: background-color var(--t-1) var(--ease);
  }

  .tool:hover:not(:disabled) {
    background: oklch(1 0 0 / 0.12);
    color: oklch(1 0 0);
  }

  .tool:disabled {
    opacity: 0.35;
  }

  .zoom {
    min-width: 52px;
    font-size: var(--fs-2);
  }

  .label {
    padding: 0 10px;
    font-size: var(--fs-2);
  }

  .tool.is-on {
    background: oklch(1 0 0 / 0.16);
    color: oklch(1 0 0);
  }

  .dims {
    padding: 0 var(--s-2);
    color: oklch(1 0 0 / 0.55);
    font-size: var(--fs-2);
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .dims {
      display: none;
    }
  }

  @media (max-width: 640px) {
    .canvas {
      padding: 56px 0 100px;
    }
    .nav {
      display: none;
    }
    .film {
      max-width: 40vw;
    }
  }
</style>
