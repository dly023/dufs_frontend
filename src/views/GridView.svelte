<script lang="ts">
  import Tile from "./Tile.svelte";
  import EmptyListing from "./EmptyListing.svelte";
  import { directory } from "../stores/directory.svelte";
  import { selection } from "../stores/selection.svelte";
  import { actionUploadDataTransfer } from "../actions/files";
  import { ensureTrailingSlash } from "../lib/models/path";
  import { itemEvents, nearEnd } from "./itemEvents";
  import type { PathItem } from "../lib/dufs/types";

  interface Props {
    items?: PathItem[];
    onOpen: (item: PathItem) => void;
    onPreview: (item: PathItem) => void;
    onFullPreview: (item: PathItem) => void;
    onContextMenu: (e: MouseEvent, item: PathItem) => void;
    onComic: (item: PathItem) => void;
    currentPath?: string | null;
    flashPath?: string | null;
  }
  let { items, onOpen, onPreview, onFullPreview, onContextMenu, onComic, currentPath, flashPath }: Props = $props();

  const all = $derived(items ?? directory.sortedPaths);

  const PAGE = 200;
  let limit = $state(PAGE);
  $effect(() => {
    void directory.path;
    limit = PAGE;
  });

  const events = itemEvents({
    items: () => all,
    onOpen: (item) => (item.is_dir ? onOpen(item) : onPreview(item)),
    onFull: (item) => onFullPreview(item),
    onContextMenu: (e, item) => onContextMenu(e, item),
    onComic: (item) => onComic(item),
    onDropInto: (folder, dt) => void actionUploadDataTransfer(dt, ensureTrailingSlash(`${folder.fullpath}/`)),
    canDrop: () => directory.allowUpload,
  });
</script>

<div class="grid" {...events}>
  {#each all.slice(0, limit) as item, i (item.fullpath)}
    <Tile
      {item}
      variant="card"
      index={i}
      selected={selection.has(item.fullpath)}
      current={currentPath === item.fullpath}
      flash={flashPath === `${item.fullpath}/`}
    />
  {/each}
</div>
{#if limit < all.length}
  <div class="sentinel" use:nearEnd={() => (limit += PAGE)}></div>
{/if}

{#if !all.length && !directory.loading}
  <EmptyListing />
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(112px, 7vw, 168px), 1fr));
    gap: var(--s-2);
  }

  .sentinel {
    height: 1px;
  }
</style>
