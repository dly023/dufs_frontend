<script lang="ts">
  import Icon from "./Icon.svelte";
  import { prefs, type TypeFilter } from "../stores/prefs.svelte";
  import { localFilter } from "../stores/filter.svelte";
  import { directory } from "../stores/directory.svelte";
  import { getFileCategory } from "../lib/models/exts";
  import type { IconName } from "../lib/icons";


  interface Props {
    query: string;
  }
  let { query }: Props = $props();

  const CHIPS: { id: TypeFilter; label: string; icon: IconName }[] = [
    { id: "image", label: "图片", icon: "images" },
    { id: "video", label: "视频", icon: "film" },
    { id: "audio", label: "音频", icon: "music" },
    { id: "document", label: "文档", icon: "fileText" },
  ];

  // How many items the current text + a type chip would leave standing.
  const countFor = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<TypeFilter, number>();
    for (const c of CHIPS) {
      let n = 0;
      for (const p of directory.paths) {
        if (p.is_dir) continue;
        if (q && !p.name.toLowerCase().includes(q)) continue;
        if (c.id !== "all" && getFileCategory(p.ext) !== c.id) continue;
        n += 1;
      }
      map.set(c.id, n);
    }
    return map;
  });

  function apply(id: TypeFilter) {
    prefs.setTypeFilter(id);
    localFilter.set(query);
  }
</script>

<div class="suggest" role="listbox" aria-label="按类型筛选">
  {#if query.trim()}
    <p class="num hint">{countFor.get("image")! + countFor.get("video")! + countFor.get("audio")! + countFor.get("document")!} 个匹配 · Enter 全站搜索</p>
  {/if}
  <div class="chips">
    {#each CHIPS as c (c.id)}
      <button
        class="chip"
        class:is-on={prefs.typeFilter === c.id}
        type="button"
        onclick={() => apply(c.id)}
        disabled={countFor.get(c.id) === 0 && prefs.typeFilter !== c.id}
      >
        <Icon name={c.icon} size={15} />
        {c.label}
        <span class="num">{countFor.get(c.id)}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .suggest {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    left: 0;
    z-index: var(--z-2, 20);
    padding: var(--s-2);
    border-radius: var(--r-md);
    background: var(--surface-2, var(--surface));
    border: 1px solid var(--border);
    box-shadow: var(--shadow-2);
    animation: fade-in var(--t-2) var(--ease);
  }

  .hint {
    margin: 0 0 var(--s-1) var(--s-1);
    color: var(--text-3);
    font-size: var(--fs-2);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-1);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px var(--s-2);
    border-radius: 999px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-2);
    font-size: var(--fs-2);
    cursor: pointer;
  }

  .chip:hover:not(:disabled) {
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .chip.is-on {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-text);
  }

  .chip .num {
    color: inherit;
    opacity: 0.7;
    font-size: var(--fs-1);
  }

  .chip:disabled {
    opacity: 0.4;
    cursor: default;
  }
</style>
