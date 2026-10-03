<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    title: string;
    triggerClass?: string;
    /** Which trigger edge the menu lines up with. */
    align?: "start" | "end";
    width?: number;
    trigger: Snippet;
    children: Snippet<[() => void]>;
  }
  let { title, triggerClass = "icon-btn", align = "start", width = 200, trigger, children }: Props = $props();

  let open = $state(false);
  let btn = $state<HTMLButtonElement>();
  let pos = $state({ top: 0, left: 0 });

  function close() {
    open = false;
  }

  function toggle() {
    if (open) return close();
    const r = btn!.getBoundingClientRect();
    const raw = align === "end" ? r.right - width : r.left;
    pos = { top: Math.round(r.bottom + 6), left: Math.round(Math.max(8, Math.min(raw, innerWidth - width - 8))) };
    open = true;
  }
</script>

<!-- Capture + preventDefault: Esc closes only this menu, never the layer below. -->
<svelte:window onkeydowncapture={(e) => { if (open && e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); close(); } }} />

<button
  bind:this={btn}
  type="button"
  class={triggerClass}
  class:is-open={open}
  {title}
  aria-haspopup="menu"
  aria-expanded={open}
  onclick={toggle}
>
  {@render trigger()}
</button>

{#if open}
  <button class="click-away" type="button" tabindex="-1" aria-label="关闭菜单" onclick={close}></button>
  <div
    class="menu"
    role="menu"
    style:top={`${pos.top}px`}
    style:left={`${pos.left}px`}
    style:min-width={`${width}px`}
    style:--origin={align === "end" ? "top right" : "top left"}
  >
    {@render children(close)}
  </div>
{/if}
