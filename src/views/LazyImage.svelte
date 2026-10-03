<script lang="ts">
  import type { PathItem } from "../lib/dufs/types";
  import { auth } from "../stores/auth.svelte";
  import { fetchBlobUrl } from "../lib/dufs/client";

  interface Props {
    item: PathItem;
    alt?: string;
  }
  let { item, alt }: Props = $props();
  let loaded = $state(false);
  let errored = $state(false);
  let blobSrc = $state<string | null>(null);
  /** Behind auth only: the placeholder has come near the viewport. */
  let near = $state(false);
  let placeholder = $state<HTMLElement>();

  // Behind auth, <img> cannot send the Basic header, so fetch the bytes and use
  // an object URL instead. Without auth, the browser's native lazy loading does it.
  const src = $derived(auth.isAuthed ? (blobSrc ?? "") : item.fullpath);

  /** The element that actually scrolls this image (the listing, the comic strip…). */
  function scrollParent(el: HTMLElement): HTMLElement | null {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === "auto" || o === "scroll") return p;
    }
    return null;
  }

  // Authed fetches are not free: wait until the placeholder is within reach.
  $effect(() => {
    if (!auth.isAuthed || near || !placeholder) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          near = true;
          io.disconnect();
        }
      },
      { root: scrollParent(placeholder), rootMargin: "800px 0px" },
    );
    io.observe(placeholder);
    return () => io.disconnect();
  });

  $effect(() => {
    const path = item.fullpath;
    if (!auth.isAuthed) {
      blobSrc = null;
      return;
    }
    if (!near) return;
    let cancelled = false;
    errored = false;
    loaded = false;
    fetchBlobUrl(path)
      .then((url) => {
        if (!cancelled) blobSrc = url;
      })
      .catch(() => {
        if (!cancelled) errored = true;
      });
    return () => {
      cancelled = true;
    };
  });
</script>

{#if !errored && src}
  <img
    {src}
    alt={alt ?? item.name}
    loading="lazy"
    decoding="async"
    onload={() => (loaded = true)}
    onerror={() => (errored = true)}
    class:is-loaded={loaded}
  />
{:else if !errored}
  <span class="placeholder" bind:this={placeholder} aria-hidden="true"></span>
{/if}

<style>
  .placeholder {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
