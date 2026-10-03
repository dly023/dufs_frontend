<script lang="ts">
  import Icon from "./Icon.svelte";
  import { dialogs } from "../stores/dialog.svelte";

  const req = $derived(dialogs.current);
  let inputValue = $state("");

  $effect(() => {
    if (req?.kind === "prompt") inputValue = req.promptDefault ?? "";
  });

  function cancel() {
    dialogs.close(req?.kind === "prompt" ? null : false);
  }

  function confirm() {
    if (!req) return;
    if (req.kind === "prompt") {
      const v = inputValue.trim();
      if (!v) return;
      dialogs.close(v);
    } else {
      dialogs.close(true);
    }
  }

  let inputEl = $state<HTMLInputElement>();
  let okEl = $state<HTMLButtonElement>();
  let returnTo: HTMLElement | null = null;

  // Focus the field (text selected) or the primary button; give focus back on close.
  $effect(() => {
    if (!req) return;
    returnTo = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => {
      if (inputEl) {
        inputEl.focus();
        inputEl.select();
      } else okEl?.focus();
    });
    return () => {
      if (returnTo?.isConnected) returnTo.focus({ preventScroll: true });
      returnTo = null;
    };
  });

  /** Enter/Esc work wherever focus happens to be while the dialog is open. */
  function onKey(e: KeyboardEvent) {
    if (!req || e.defaultPrevented) return;
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement && e.target.closest(".modal"))) {
      // A focused dialog button keeps its own Enter; everything else confirms.
      e.preventDefault();
      confirm();
    }
  }
</script>

<svelte:window onkeydowncapture={onKey} />

{#if req}
  <div class="modal">
    <button type="button" class="modal-backdrop" tabindex="-1" aria-label="关闭" onclick={cancel}></button>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="dlg-title">
      <div class="modal-head">
        <h2 id="dlg-title">{req.title}</h2>
        <button class="icon-btn sm" type="button" title="关闭 (Esc)" onclick={cancel}><Icon name="x" size={16} /></button>
      </div>
      <p class="modal-msg">{req.message}</p>
      {#if req.kind === "prompt"}
        <input class="input" bind:this={inputEl} placeholder={req.promptLabel} bind:value={inputValue} />
      {/if}
      <div class="modal-actions">
        <button type="button" class="btn" onclick={cancel}>{req.cancelText ?? "取消"}</button>
        <button
          bind:this={okEl}
          type="button"
          class="btn"
          class:btn-danger={req.danger}
          class:btn-primary={!req.danger}
          onclick={confirm}
        >
          {req.confirmText ?? "确定"}
        </button>
      </div>
    </div>
  </div>
{/if}
