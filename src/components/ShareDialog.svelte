<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import { toasts } from "../stores/toast.svelte";

  interface Props {
    url: string | null;
    title?: string;
    onClose: () => void;
  }
  let { url, title, onClose }: Props = $props();

  let qr = $state("");
  let error = $state("");

  $effect(() => {
    const u = url;
    qr = "";
    error = "";
    if (!u) return;
    let cancelled = false;
    (async () => {
      try {
        const QR = (await import("qrcode")).default;
        const png = await QR.toDataURL(u, {
          margin: 1,
          width: 320,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (!cancelled) qr = png;
      } catch (e) {
        if (!cancelled) error = e instanceof Error ? e.message : "二维码生成失败";
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toasts.success("已复制链接");
    } catch {
      toasts.error("复制失败");
    }
  }

  /** Pull focus into the dialog on open (keys stop reaching the page behind). */
  function grabFocus(node: HTMLElement) {
    requestAnimationFrame(() => node.focus({ preventScroll: true }));
  }
</script>

<svelte:window onkeydowncapture={(e) => { if (url && e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); onClose(); } }} />

{#if url}
  <div class="modal">
    <button type="button" class="modal-backdrop" tabindex="-1" aria-label="关闭" onclick={onClose}></button>
    <div tabindex="-1" use:grabFocus class="modal-card share-card" role="dialog" aria-modal="true" aria-label="扫码打开">
      <div class="modal-head">
        <h2>扫码打开</h2>
        <button class="icon-btn sm" type="button" title="关闭 (Esc)" onclick={onClose}><Icon name="x" size={16} /></button>
      </div>
      <div class="body">
        {#if qr}
          <img class="qr" src={qr} alt="二维码" />
        {:else if error}
          <p class="modal-msg">{error}</p>
        {:else}
          <div class="qr is-empty">生成中…</div>
        {/if}
        {#if title}<p class="name" title={title}>{title}</p>{/if}
        <div class="url">
          <span class="ellipsis" title={url}>{decodeURIComponent(url)}</span>
          <button class="btn btn-sm" type="button" onclick={copy}>
            <Icon name="copy" size={14} />复制
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .share-card {
    width: min(360px, 100%);
  }

  .body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-3);
  }

  .qr {
    width: 220px;
    height: 220px;
    padding: 10px;
    border-radius: var(--r-md);
    background: white;
    box-shadow: 0 0 0 1px var(--border);
    image-rendering: pixelated;
    animation: modal-in var(--t-3) var(--ease-out);
  }

  .qr.is-empty {
    display: grid;
    place-items: center;
    color: var(--text-3);
    font-size: var(--fs-2);
    background: var(--fill);
  }

  .name {
    max-width: 100%;
    font-weight: 600;
    text-align: center;
    overflow-wrap: anywhere;
  }

  .url {
    width: 100%;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    padding: 4px 4px 4px 10px;
    border-radius: var(--r-md);
    background: var(--fill);
    color: var(--text-2);
    font-size: var(--fs-2);
  }

  .url span {
    flex: 1;
  }
</style>
