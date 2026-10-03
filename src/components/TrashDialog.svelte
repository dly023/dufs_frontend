<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import { trash } from "../stores/trash.svelte";
  import {
    actionRestoreTrashEntries,
    actionPurgeTrashEntry,
    actionEmptyTrash,
  } from "../actions/files";
  import { formatRelative, formatSize } from "../lib/models/format";

  interface Props {
    open: boolean;
    onClose: () => void;
  }
  let { open, onClose }: Props = $props();

  function when(ts: number): string {
    return new Date(ts).toLocaleString();
  }

  /** Pull focus into the dialog on open (keys stop reaching the page behind). */
  function grabFocus(node: HTMLElement) {
    requestAnimationFrame(() => node.focus({ preventScroll: true }));
  }
</script>

<svelte:window onkeydowncapture={(e) => { if (open && e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); onClose(); } }} />

{#if open}
  <div class="modal">
    <button type="button" class="modal-backdrop" tabindex="-1" aria-label="关闭" onclick={onClose}></button>
    <div tabindex="-1" use:grabFocus class="modal-card trash-card" role="dialog" aria-modal="true" aria-label="回收站">
      <div class="modal-head">
        <h2>回收站</h2>
        <div class="head-actions">
          {#if trash.items.length}
            <button class="btn btn-ghost btn-sm danger" type="button" onclick={() => void actionEmptyTrash()}>清空回收站</button>
          {/if}
          <button class="icon-btn sm" type="button" title="关闭 (Esc)" onclick={onClose}><Icon name="x" size={16} /></button>
        </div>
      </div>

      {#if !trash.items.length}
        <div class="empty-mini"><Icon name="trash" size={22} stroke={1.5} /><p>回收站是空的</p><span>删除的文件会先放在这里，可随时恢复。</span></div>
      {:else}
        <ul class="list">
          {#each trash.items as entry (entry.id)}
            <li>
              <span class="glyph"><Icon name={entry.isDir ? "folder" : "file"} size={16} /></span>
              <span class="main">
                <span class="name ellipsis" title={entry.name}>{entry.name}</span>
                <span class="meta ellipsis num" title={when(entry.deletedAt)}>{decodeURIComponent(entry.originalPath)} · {formatSize(entry.size)} · {formatRelative(entry.deletedAt)}</span>
              </span>
              <button
                class="btn btn-sm"
                type="button"
                title="恢复到原位置"
                onclick={() => void actionRestoreTrashEntries([entry])}
              >
                恢复
              </button>
              <button
                class="icon-btn sm purge"
                type="button"
                title="彻底删除"
                onclick={() => void actionPurgeTrashEntry(entry)}
              >
                <Icon name="trash" size={15} />
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .trash-card {
    width: min(520px, 100%);
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: var(--s-1);
  }

  .danger {
    color: var(--danger);
  }

  .danger:hover {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .list {
    max-height: min(60vh, 420px);
    overflow: auto;
    margin: 0 calc(var(--s-2) * -1);
  }

  li {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    min-height: 52px;
    padding: 0 var(--s-2);
    border-radius: var(--r-md);
  }

  li:hover {
    background: var(--fill);
  }

  .glyph {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: var(--r-sm);
    background: var(--fill);
    color: var(--text-2);
  }

  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .name {
    font-size: var(--fs-3);
    font-weight: 500;
  }

  .meta {
    color: var(--text-3);
    font-size: var(--fs-1);
  }

  .purge:hover {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .empty-mini {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-1);
    padding: var(--s-6) 0;
    color: var(--text-3);
    font-size: var(--fs-2);
  }

  .empty-mini p {
    margin-top: var(--s-2);
    color: var(--text);
    font-size: var(--fs-4);
    font-weight: 600;
  }
</style>
