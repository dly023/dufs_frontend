<script lang="ts">
  import Icon from "./Icon.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import { places, type PlaceEntry } from "../stores/places.svelte";
  import { fileKind } from "../lib/models/exts";
  import type { IconName } from "../lib/icons";

  interface Props {
    open: boolean;
    onClose: () => void;
    onPick: (item: PathItem) => void;
    onOpenPlace: (entry: PlaceEntry) => void;
    onCommand: (id: string) => void;
    items: PathItem[];
    commands: { id: string; label: string; hint?: string }[];
  }
  let { open, onClose, onPick, onOpenPlace, onCommand, items, commands }: Props = $props();

  let query = $state("");
  let active = $state(0);
  let inputEl = $state<HTMLInputElement>();
  let listEl = $state<HTMLElement>();

  type Row =
    | { kind: "cmd"; id: string; label: string; hint?: string }
    | { kind: "item"; item: PathItem }
    | { kind: "recent"; entry: PlaceEntry };

  /** Empty query: where you have been. Typing: files here, then commands. */
  const groups = $derived.by<{ title: string; rows: Row[] }[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const recent = places.recents.slice(0, 8).map((entry) => ({ kind: "recent" as const, entry }));
      const cmds = commands.map((c) => ({ kind: "cmd" as const, ...c }));
      return [
        ...(recent.length ? [{ title: "最近", rows: recent }] : []),
        { title: "命令", rows: cmds },
      ];
    }
    const files = items
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 40)
      .map((item) => ({ kind: "item" as const, item }));
    const cmds = commands
      .filter((c) => c.label.toLowerCase().includes(q))
      .map((c) => ({ kind: "cmd" as const, ...c }));
    return [
      ...(files.length ? [{ title: "此目录", rows: files }] : []),
      ...(cmds.length ? [{ title: "命令", rows: cmds }] : []),
    ];
  });
  const rows = $derived(groups.flatMap((g) => g.rows));

  $effect(() => {
    if (open) {
      query = "";
      active = 0;
      requestAnimationFrame(() => inputEl?.focus());
    }
  });

  $effect(() => {
    void query;
    active = 0;
  });

  $effect(() => {
    listEl?.querySelector(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  });

  function run(row: Row | undefined) {
    if (!row) return;
    onClose();
    if (row.kind === "cmd") onCommand(row.id);
    else if (row.kind === "item") onPick(row.item);
    else onOpenPlace(row.entry);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      active = (active + 1) % Math.max(1, rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = (active - 1 + rows.length) % Math.max(1, rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(rows[active]);
    }
  }

  function iconOf(row: Row): IconName {
    if (row.kind === "cmd") return "chevronRight";
    if (row.kind === "recent") return row.entry.isDir ? "folder" : "clock";
    return fileKind(row.item.ext, row.item.is_dir).icon;
  }
</script>

{#if open}
  <div class="modal palette-wrap">
    <button class="modal-backdrop" type="button" tabindex="-1" aria-label="关闭" onclick={onClose}></button>
    <div class="palette" role="dialog" aria-modal="true" aria-label="命令面板">
      <div class="field-row">
        <Icon name="search" size={17} />
        <input
          bind:this={inputEl}
          bind:value={query}
          placeholder="跳转到文件、最近位置或执行命令…"
          onkeydown={onKey}
          aria-controls="palette-list"
        />
        <kbd class="kbd">esc</kbd>
      </div>
      <div class="list" id="palette-list" role="listbox" bind:this={listEl}>
        {#if !rows.length}
          <p class="none">没有匹配项</p>
        {/if}
        {#each groups as g (g.title)}
          <div class="menu-label">{g.title}</div>
          {#each g.rows as row (row.kind === "cmd" ? `c-${row.id}` : row.kind === "item" ? `i-${row.item.fullpath}` : `r-${row.entry.path}`)}
            {@const i = rows.indexOf(row)}
            <button
              type="button"
              role="option"
              class="menu-item"
              class:is-hl={i === active}
              aria-selected={i === active}
              data-row={i}
              onpointermove={() => (active = i)}
              onclick={() => run(row)}
            >
              <Icon name={iconOf(row)} />
              {#if row.kind === "cmd"}
                <span class="ellipsis">{row.label}</span>
                {#if row.hint}<span class="hint"><kbd class="kbd">{row.hint}</kbd></span>{/if}
              {:else if row.kind === "item"}
                <span class="ellipsis">{row.item.name}</span>
              {:else}
                <span class="ellipsis">{row.entry.name}</span>
                <span class="hint ellipsis">{decodeURIComponent(row.entry.path)}</span>
              {/if}
            </button>
          {/each}
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .palette-wrap {
    place-items: start center;
    padding-top: 14vh;
  }

  .palette {
    position: relative;
    width: min(560px, 100%);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--surface);
    box-shadow: var(--shadow-3);
    animation: modal-in var(--t-3) var(--ease-out);
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    height: 52px;
    padding: 0 var(--s-4);
    border-bottom: 1px solid var(--border);
    color: var(--text-3);
  }

  .field-row input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    background: none;
    color: var(--text);
    font-size: var(--fs-5);
    outline: none;
  }

  .field-row input::placeholder {
    color: var(--text-3);
  }

  .list {
    max-height: min(56vh, 420px);
    overflow: auto;
    padding: var(--s-1) var(--s-2) var(--s-2);
  }

  .list .menu-item {
    height: 36px;
  }

  .list .menu-item:hover {
    background: none;
  }

  .list .menu-item.is-hl {
    background: var(--fill);
  }

  .list .menu-item.is-hl > :global(svg) {
    color: var(--accent-text);
  }

  .list .hint {
    max-width: 50%;
  }

  .none {
    padding: var(--s-6);
    color: var(--text-3);
    text-align: center;
  }
</style>
