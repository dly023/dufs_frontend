<script lang="ts">
  import Tile from "./Tile.svelte";
  import EmptyListing from "./EmptyListing.svelte";
  import { directory } from "../stores/directory.svelte";
  import { selection } from "../stores/selection.svelte";
  import { isImageExt } from "../lib/models/exts";
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
  const folders = $derived(all.filter((p) => p.is_dir));
  const images = $derived(all.filter((p) => !p.is_dir && isImageExt(p.ext)));
  const others = $derived(all.filter((p) => !p.is_dir && !isImageExt(p.ext)));

  const PAGE = 120;
  let imageLimit = $state(PAGE);
  let otherLimit = $state(PAGE);
  $effect(() => {
    void directory.path;
    imageLimit = PAGE;
    otherLimit = PAGE;
  });

  // In a gallery, looking at a picture means the lightbox; files get the side pane.
  const events = itemEvents({
    items: () => all,
    onOpen: (item) => (item.is_dir ? onOpen(item) : isImageExt(item.ext) ? onFullPreview(item) : onPreview(item)),
    onFull: (item) => onFullPreview(item),
    onContextMenu: (e, item) => onContextMenu(e, item),
    onComic: (item) => onComic(item),
    onDropInto: (folder, dt) => void actionUploadDataTransfer(dt, ensureTrailingSlash(`${folder.fullpath}/`)),
    canDrop: () => directory.allowUpload,
  });
</script>

<div class="gallery" {...events}>
  {#if folders.length}
    <section>
      <h2 class="section-label">文件夹 <span class="num">{folders.length}</span></h2>
      <div class="rows">
        {#each folders as item, i (item.fullpath)}
          <Tile
            {item}
            variant="row"
            index={i}
            selected={selection.has(item.fullpath)}
            flash={flashPath === `${item.fullpath}/`}
          />
        {/each}
      </div>
    </section>
  {/if}

  {#if images.length}
    <section>
      <h2 class="section-label">图片 <span class="num">{images.length}</span></h2>
      <div class="media-grid">
        {#each images.slice(0, imageLimit) as item, i (item.fullpath)}
          <Tile
            {item}
            variant="media"
            index={folders.length + i}
            selected={selection.has(item.fullpath)}
            current={currentPath === item.fullpath}
          />
        {/each}
      </div>
      {#if imageLimit < images.length}
        <div class="sentinel" use:nearEnd={() => (imageLimit += PAGE)}></div>
      {/if}
    </section>
  {/if}

  {#if others.length}
    <section>
      <h2 class="section-label">文件 <span class="num">{others.length}</span></h2>
      <div class="rows">
        {#each others.slice(0, otherLimit) as item, i (item.fullpath)}
          <Tile
            {item}
            variant="row"
            index={folders.length + images.length + i}
            selected={selection.has(item.fullpath)}
            current={currentPath === item.fullpath}
          />
        {/each}
      </div>
      {#if otherLimit < others.length}
        <div class="sentinel" use:nearEnd={() => (otherLimit += PAGE)}></div>
      {/if}
    </section>
  {/if}

  {#if !all.length && !directory.loading}
    <EmptyListing />
  {/if}
</div>

<style>
  .gallery {
    display: flex;
    flex-direction: column;
    gap: var(--s-6);
  }

  .rows {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(clamp(220px, 13vw, 320px), 1fr));
    gap: var(--s-2);
  }

  .media-grid {
    display: grid;
    /* Tiles grow on big screens rather than multiplying into tiny columns. */
    grid-template-columns: repeat(auto-fill, minmax(clamp(168px, 10vw, 260px), 1fr));
    gap: var(--s-4) var(--s-3);
  }

  @media (max-width: 640px) {
    .media-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: var(--s-3) var(--s-2);
    }
    .rows {
      grid-template-columns: 1fr 1fr;
    }
  }

  @media (max-width: 420px) {
    .rows {
      grid-template-columns: 1fr;
    }
  }

  .sentinel {
    height: 1px;
  }
</style>
