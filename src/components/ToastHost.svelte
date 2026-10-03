<script lang="ts">
  import Icon from "./Icon.svelte";
  import { toasts } from "../stores/toast.svelte";
  import type { IconName } from "../lib/icons";

  const icons: Record<string, IconName> = {
    info: "info",
    success: "checkCircle",
    warning: "alert",
    error: "alert",
  };
</script>

<div class="toasts" aria-live="polite">
  {#each toasts.items as t (t.id)}
    <div class="toast is-{t.kind}" role={t.kind === "error" ? "alert" : "status"}>
      <Icon name={icons[t.kind]} size={16} />
      <span>{t.message}</span>
      {#if t.action}
        <button
          class="toast-action"
          type="button"
          onclick={() => {
            t.action?.handler();
            toasts.dismiss(t.id);
          }}
        >
          {t.action.label}
        </button>
      {/if}
    </div>
  {/each}
</div>
