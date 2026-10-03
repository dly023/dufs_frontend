<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import LazyImage from "../views/LazyImage.svelte";
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

  let scale = $state(1);
  let rotation = $state(0);
  let x = $state(0);
  let y = $state(0);
  let dragging = $state(false);
  let isFullscreen = $state(false);
  let stage = $state<HTMLDivElement>();
  let start = { x: 0, y: 0, px: 0, py: 0 };

  const clamp = (v: number) => Math.min(8, Math.max(1, v));

  function reset() {
    scale = 1;
    rotation = 0;
    x = 0;
    y = 0;
  }

  function zoomBy(factor: number) {
    scale = clamp(Number((scale * factor).toFixed(3)));
    if (scale === 1) {
      x = 0;
      y = 0;
    }
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stage?.closest<HTMLElement>(".reader")?.requestFullscreen();
    } catch {
      /* may be denied by policy; the viewer stays usable */
    }
  }

  $effect(() => {
    void item.fullpath;
    reset();
  });

  function onDown(e: PointerEvent) {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, px: x, py: y };
    dragging = true;
    stage?.setPointerCapture(e.pointerId);
  }

  function onMove(e: PointerEvent) {
    if (!dragging) return;
    x = start.px + (e.clientX - start.x);
    y = scale === 1 ? 0 : start.py + (e.clientY - start.y);
  }

  function onUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    const dx = e.clientX - start.x;
    if (scale === 1) {
      // Swipe to page; anything shorter springs back.
      if (Math.abs(dx) > 64) (dx > 0 ? onPrev : onNext)();
      x = 0;
    }
    if (stage?.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId);
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    zoomBy(Math.exp(-e.deltaY * 0.0025));
  }

  const nearby = $derived(items.slice(Math.max(0, index - 5), Math.min(items.length, index + 6)));

  // Warm the neighbours so paging feels instant.
  $effect(() => {
    for (const n of [items[index - 1], items[index + 1]]) {
      if (n) new Image().src = n.fullpath;
    }
  });
</script>

<svelte:document onfullscreenchange={() => (isFullscreen = !!document.fullscreenElement)} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="stage"
  class:is-dragging={dragging}
  class:is-zoomed={scale > 1}
  bind:this={stage}
  onpointerdown={onDown}
  onpointermove={onMove}
  onpointerup={onUp}
  onpointercancel={onUp}
  onwheel={onWheel}
>
  {#key item.fullpath}
    {#if src}
      <img
        class="stage-img"
        class:is-paging={direction !== 0}
        {src}
        alt={item.name}
        draggable="false"
        style:--dir={direction}
        style:transform={`translate(${x}px, ${y}px) scale(${scale}) rotate(${rotation}deg)`}
        ondblclick={() => (scale === 1 ? (scale = 2.5) : reset())}
      />
    {/if}
  {/key}

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
        {#each nearby as img (img.fullpath)}
          <button
            type="button"
            class:is-current={img.fullpath === item.fullpath}
            title={img.name}
            onclick={() => onSelect(img)}
          >
            <LazyImage item={img} alt="" />
          </button>
        {/each}
      </div>
      <span class="sep"></span>
    {/if}
    <button class="tool" type="button" title="缩小" onclick={() => zoomBy(1 / 1.4)} disabled={scale <= 1}>
      <Icon name="zoomOut" size={17} />
    </button>
    <button class="tool zoom num" type="button" title="重置" onclick={reset}>{Math.round(scale * 100)}%</button>
    <button class="tool" type="button" title="放大" onclick={() => zoomBy(1.4)}>
      <Icon name="zoomIn" size={17} />
    </button>
    <button class="tool" type="button" title="旋转 90°" onclick={() => (rotation += 90)}>
      <Icon name="rotate" size={17} />
    </button>
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
    display: grid;
    place-items: center;
    overflow: hidden;
    padding: 64px 72px 112px;
    touch-action: none;
    user-select: none;
  }

  .stage.is-zoomed {
    cursor: grab;
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

  @media (max-width: 640px) {
    .stage {
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
