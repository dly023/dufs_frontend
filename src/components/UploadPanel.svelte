<script lang="ts">
  import { uploads } from "../stores/uploads.svelte";
  import Icon from "./Icon.svelte";

  const pct = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 100);
  let collapsed = $state(false);
  const failed = $derived(uploads.items.filter((it) => it.status === "error").length);
</script>

{#if uploads.total}
  <section class="uploads" aria-live="polite">
    <header>
      <button class="title" type="button" aria-expanded={!collapsed} onclick={() => (collapsed = !collapsed)}>
        {#if uploads.inFlight}
          <span class="ring" style:--p={pct(uploads.overallProgress)}></span>
          正在上传 <span class="num">{uploads.finishedCount}/{uploads.total}</span>
        {:else if failed}
          <Icon name="alert" size={15} />{failed} 个上传失败
        {:else}
          <Icon name="checkCircle" size={15} />上传完成 <span class="num">{uploads.total}</span>
        {/if}
        <Icon name="chevronDown" size={14} />
      </button>
      {#if uploads.inFlight}
        <button class="btn btn-ghost btn-sm" type="button" onclick={() => uploads.cancelAll()}>全部取消</button>
      {:else}
        <button class="icon-btn sm" type="button" title="关闭" onclick={() => uploads.clearFinished()}>
          <Icon name="x" size={14} />
        </button>
      {/if}
    </header>

    {#if !collapsed}
      <ul>
        {#each uploads.items as it (it.id)}
          <li class:is-done={it.status === "done"} class:is-error={it.status === "error" || it.status === "canceled"}>
            <span class="name ellipsis" title={it.relPath}>{it.relPath}</span>
            <span class="state num">
              {#if it.status === "done"}
                <Icon name="check" size={14} stroke={2.25} />
              {:else if it.status === "error"}
                失败
              {:else if it.status === "canceled"}
                已取消
              {:else if it.status === "queued"}
                等待中
              {:else}
                {pct(it.size ? it.loaded / it.size : 0)}%
              {/if}
            </span>
            {#if it.status === "error" || it.status === "canceled"}
              <button class="icon-btn sm" type="button" title="重试" onclick={() => uploads.retry(it.id)}>
                <Icon name="refresh" size={13} />
              </button>
            {:else if it.status === "uploading" || it.status === "queued"}
              <button class="icon-btn sm" type="button" title="取消" onclick={() => uploads.cancel(it.id)}>
                <Icon name="x" size={13} />
              </button>
            {/if}
            {#if it.status === "uploading"}
              <span class="bar" style:--p={it.size ? it.loaded / it.size : 0}></span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  /* Drops down from the upload button it belongs to. */
  .uploads {
    position: fixed;
    top: calc(var(--topbar-h) + 8px);
    right: var(--s-3);
    z-index: 55;
    width: min(340px, calc(100vw - 32px));
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--surface);
    box-shadow: var(--shadow-3);
    transform-origin: top right;
    animation: toast-in var(--t-3) var(--ease-spring);
  }

  @media (max-width: 640px) {
    .uploads {
      top: auto;
      right: 12px;
      bottom: max(12px, env(safe-area-inset-bottom));
      left: 12px;
      width: auto;
      transform-origin: bottom center;
    }
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: 48px;
    padding: 0 var(--s-2) 0 var(--s-2);
  }

  .title {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: var(--h-md);
    padding: 0 var(--s-2);
    border-radius: var(--r-sm);
    font-size: var(--fs-3);
    font-weight: 600;
  }

  .title > :global(svg:last-child) {
    margin-left: auto;
    color: var(--text-3);
    transition: transform var(--t-2) var(--ease-out);
  }

  .title[aria-expanded="false"] > :global(svg:last-child) {
    transform: rotate(180deg);
  }

  .title > :global(svg:first-child) {
    color: var(--success);
  }

  .ring {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: conic-gradient(var(--accent) calc(var(--p) * 1%), var(--fill-strong) 0);
    mask: radial-gradient(circle, transparent 5px, black 5.5px);
  }

  ul {
    max-height: 240px;
    overflow: auto;
    padding: 0 var(--s-2) var(--s-2);
    border-top: 1px solid var(--border);
  }

  li {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: 36px;
    padding: 0 var(--s-1) 0 var(--s-2);
    font-size: var(--fs-2);
  }

  .name {
    flex: 1;
    color: var(--text-2);
  }

  .state {
    flex: 0 0 auto;
    color: var(--text-3);
  }

  li.is-done .state {
    color: var(--success);
  }

  li.is-error .state {
    color: var(--danger);
  }

  .bar {
    position: absolute;
    left: var(--s-2);
    right: var(--s-2);
    bottom: 4px;
    height: 2px;
    border-radius: 1px;
    background: var(--accent);
    transform: scaleX(var(--p));
    transform-origin: left;
    transition: transform var(--t-2) linear;
  }
</style>
