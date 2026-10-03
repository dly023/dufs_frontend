<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import { fetchFileText, saveFile } from "../lib/dufs/client";
  import { toasts } from "../stores/toast.svelte";

  interface Props {
    item: PathItem | null;
    onClose: () => void;
    onSaved: () => void;
  }
  let { item, onClose, onSaved }: Props = $props();

  let content = $state("");
  let loading = $state(false);
  let saving = $state(false);
  let wrap = $state<"soft" | "off">("soft");
  let area = $state<HTMLTextAreaElement>();

  // Once the text is in, put the caret at the top so you can type immediately.
  $effect(() => {
    if (!area || loading) return;
    area.focus();
    area.setSelectionRange(0, 0);
    area.scrollTop = 0;
  });

  $effect(() => {
    const cur = item;
    if (!cur) return;
    let cancelled = false;
    loading = true;
    content = "";
    fetchFileText(cur.fullpath)
      .then((t) => {
        if (!cancelled) content = t;
      })
      .catch((e) => toasts.error(e instanceof Error ? e.message : "读取失败"))
      .finally(() => {
        if (!cancelled) loading = false;
      });
    return () => {
      cancelled = true;
    };
  });

  async function save() {
    if (!item) return;
    saving = true;
    try {
      await saveFile(item.fullpath, content);
      toasts.success(`已保存 ${item.name}`);
      onSaved();
      onClose();
    } catch (e) {
      toasts.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window onkeydowncapture={(e) => { if (item && e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); onClose(); } }} />

{#if item}
  <div class="modal">
    <button type="button" class="modal-backdrop" tabindex="-1" aria-label="关闭" onclick={onClose}></button>
    <div class="modal-card editor-card" role="dialog" aria-modal="true" aria-label={`编辑 ${item.name}`}>
      <div class="modal-head">
        <h2 title={item.name}>{item.name}</h2>
        <div class="head-actions">
          <button
            class="btn btn-ghost btn-sm"
            type="button"
            title="切换换行"
            onclick={() => (wrap = wrap === "soft" ? "off" : "soft")}
          >
            {wrap === "soft" ? "不换行" : "换行"}
          </button>
          <button class="btn btn-primary btn-sm" type="button" title="保存 (⌘S)" disabled={saving} onclick={save}>
            <Icon name="save" size={14} />{saving ? "保存中…" : "保存"}
          </button>
          <button class="icon-btn sm" type="button" title="关闭 (Esc)" onclick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>
      {#if loading}
        <p class="modal-msg">加载中…</p>
      {:else}
        <textarea
          bind:this={area}
          class="editor"
          wrap={wrap}
          bind:value={content}
          spellcheck="false"
          onkeydown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
              e.preventDefault();
              void save();
            }
          }}
        ></textarea>
      {/if}
    </div>
  </div>
{/if}

<style>
  .editor-card {
    width: min(960px, 100%);
    height: min(86vh, 900px);
  }

  .head-actions {
    display: flex;
    align-items: center;
    gap: var(--s-1);
  }

  .editor {
    flex: 1;
    min-height: 0;
    width: 100%;
    padding: var(--s-3) var(--s-4);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-mono);
    font-size: var(--fs-2);
    line-height: 1.7;
    tab-size: 2;
    resize: none;
    outline: none;
    transition: border-color var(--t-1) var(--ease), box-shadow var(--t-2) var(--ease);
  }

  .editor:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
</style>
