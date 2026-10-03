<script lang="ts">
  import Icon from "./Icon.svelte";
  import { dialogs } from "../stores/dialog.svelte";

  const req = $derived(dialogs.current);
  let inputValue = $state("");

  $effect(() => {
    if (req?.kind === "prompt") inputValue = req.promptDefault ?? "";
  });

  function cancel() {
    if (req?.kind === "conflict") dialogs.close(null);
    else dialogs.close(req?.kind === "prompt" ? null : false);
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
    } else if (e.key === "Enter" && req.kind === "conflict" && !(e.target instanceof HTMLButtonElement && e.target.closest(".modal"))) {
      e.preventDefault();
      dialogs.close("overwrite");
    } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement && e.target.closest(".modal"))) {
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
      {#if req.kind === "conflict"}
        <p class="modal-msg conflict-item"><strong>{req.itemLabel}</strong></p>
        {#if (req.remaining ?? 0) > 1}
          <p class="modal-msg num">还有 {req.remaining! - 1} 个同名冲突待处理</p>
        {/if}
      {/if}
      {#if req.kind === "prompt"}
        <input class="input" bind:this={inputEl} placeholder={req.promptLabel} bind:value={inputValue} />
      {/if}
      {#if req.kind === "conflict"}
        <div class="modal-actions">
          <button type="button" class="btn" onclick={() => dialogs.close("skip")}>跳过</button>
          {#if (req.remaining ?? 0) > 1}
            <button type="button" class="btn" onclick={() => dialogs.close("skip-all")}>全部跳过</button>
            <button type="button" class="btn" onclick={() => dialogs.close("all")}>全部覆盖</button>
          {/if}
          <button bind:this={okEl} type="button" class="btn btn-primary" onclick={() => dialogs.close("overwrite")}>覆盖</button>
        </div>
      {:else}
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
      {/if}
    </div>
  </div>
{/if}
