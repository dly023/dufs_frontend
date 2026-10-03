<script lang="ts">
  import { tick } from "svelte";
  import Icon from "../components/Icon.svelte";
  import { directory } from "../stores/directory.svelte";
  import { auth } from "../stores/auth.svelte";
  import { navigateTo } from "../actions/navigate";
  import { fetchDirectory, prefetchDirectory } from "../lib/dufs/client";
  import { ensureTrailingSlash } from "../lib/models/path";
  import { places, type PlaceEntry } from "../stores/places.svelte";
  import { rootPath } from "../lib/root.svelte";
  import { folderProbes, probeFolder } from "../stores/folderProbe.svelte";

  interface TreeNode {
    name: string;
    path: string;
    children: TreeNode[] | null;
    open: boolean;
    loading?: boolean;
  }

  interface Props {
    open: boolean;
    onNavigate?: () => void;
    onOpenPlace: (entry: PlaceEntry) => void;
  }
  let { open, onNavigate, onOpenPlace }: Props = $props();

  let root = $state<TreeNode>({ name: "根目录", path: rootPath(), children: null, open: true });

  // The tree starts where dufs mounts it (--path-prefix), not at the URL root.
  $effect(() => {
    const top = rootPath();
    if (root.path !== top) root = { name: "根目录", path: top, children: null, open: true };
  });
  let bodyEl = $state<HTMLElement>();

  async function loadChildren(node: TreeNode): Promise<void> {
    if (node.children || node.loading) return;
    node.loading = true;
    try {
      const data = await fetchDirectory(node.path);
      node.children = (data?.paths ?? [])
        .filter((p) => p.is_dir && p.name !== ".trash")
        .map((p) => ({ name: p.name, path: ensureTrailingSlash(`${p.fullpath}/`), children: null, open: false }));
    } catch {
      node.children = [];
    } finally {
      node.loading = false;
    }
  }

  /** Expand down to the current directory and keep its row in view. */
  async function revealCurrent(): Promise<void> {
    await loadChildren(root);
    let node: TreeNode = root;
    let acc = root.path;
    if (!directory.path.startsWith(acc)) return;
    for (const part of directory.path.slice(acc.length).split("/").filter(Boolean)) {
      acc += `${part}/`;
      await loadChildren(node);
      const next = node.children?.find((c) => c.path === acc);
      if (!next) break;
      next.open = true;
      node = next;
    }
    await tick();
    bodyEl?.querySelector(".row.is-active")?.scrollIntoView({ block: "nearest" });
  }

  async function toggle(node: TreeNode, e: MouseEvent) {
    e.stopPropagation();
    if (!node.open && !node.children) await loadChildren(node);
    node.open = !node.open;
  }

  function go(path: string) {
    if (path !== directory.path) navigateTo(path);
    onNavigate?.();
  }

  function refreshTree() {
    root.children = null;
    void revealCurrent();
  }

  const rows = $derived.by(() => {
    const out: { node: TreeNode; depth: number }[] = [];
    const walk = (n: TreeNode, depth: number) => {
      out.push({ node: n, depth });
      if (n.open && n.children) for (const c of n.children) walk(c, depth + 1);
    };
    walk(root, 0);
    return out;
  });

  let lastAuthed = auth.isAuthed;

  $effect(() => {
    void directory.path;
    // Credentials changed: any 401-failed subtree must be dropped and refetched.
    if (auth.isAuthed !== lastAuthed) {
      lastAuthed = auth.isAuthed;
      root.children = null;
    }
    void revealCurrent();
  });
</script>

<aside class="sidebar" class:is-open={open} aria-label="侧栏">
  <div class="body" bind:this={bodyEl}>
    {#if places.bookmarks.length}
      <section>
        <h2 class="label">收藏</h2>
        {#each places.bookmarks as b (b.path)}
          <div class="row-wrap">
            <button
              class="row"
              class:is-active={directory.path === b.path}
              type="button"
              title={b.path}
              onclick={() => (onOpenPlace(b), onNavigate?.())}
            >
              <Icon name="star" size={14} />
              <span class="ellipsis">{b.name}</span>
            </button>
            <button class="icon-btn sm unpin" type="button" title="取消收藏" onclick={() => places.removeBookmark(b.path)}>
              <Icon name="x" size={13} />
            </button>
          </div>
        {/each}
      </section>
    {/if}

    <section>
      <div class="label-row">
        <h2 class="label">文件夹</h2>
        <button class="icon-btn sm" type="button" title="刷新目录树" onclick={refreshTree}>
          <Icon name="refresh" size={13} />
        </button>
      </div>
      <div role="tree" aria-label="目录树">
        {#each rows as { node, depth } (node.path)}
          <div
            class="row"
            class:is-active={directory.path === node.path}
            role="treeitem"
            aria-selected={directory.path === node.path}
            aria-expanded={node.children?.length ? node.open : undefined}
            tabindex="0"
            style:--depth={depth}
            onclick={() => go(node.path)}
            onkeydown={(e) => e.key === "Enter" && go(node.path)}
            onpointerenter={() => node.path !== directory.path && prefetchDirectory(node.path)}
            use:probeFolder={depth > 0 ? node.path : null}
          >
            <button
              class="caret"
              class:is-open={node.open}
              class:is-leaf={(!!node.children && node.children.length === 0) || folderProbes.get(node.path)?.dirs === 0}
              type="button"
              tabindex="-1"
              aria-label={node.open ? "折叠" : "展开"}
              onclick={(e) => void toggle(node, e)}
            >
              <Icon name="chevronRight" size={12} stroke={2} />
            </button>
            <Icon name={depth === 0 ? "home" : "folder"} size={15} />
            <span class="ellipsis">{node.name}</span>
          </div>
        {/each}
      </div>
    </section>
  </div>
</aside>

<style>
  .sidebar {
    flex: 0 0 var(--sidebar-w);
    width: var(--sidebar-w);
    min-height: 0;
    display: none;
    border-right: 1px solid var(--border);
    background: var(--chrome);
  }

  .sidebar.is-open {
    display: flex;
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: var(--s-2) var(--s-2) var(--s-6);
    overscroll-behavior: contain;
  }

  section + section {
    margin-top: var(--s-4);
  }

  .label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .label-row .icon-btn {
    opacity: 0;
    transition: opacity var(--t-2) var(--ease);
  }

  section:hover .label-row .icon-btn,
  .label-row .icon-btn:focus-visible {
    opacity: 1;
  }

  .label {
    height: var(--h-sm);
    display: flex;
    align-items: center;
    padding: 0 var(--s-2);
    color: var(--text-3);
    font-size: var(--fs-1);
    font-weight: 600;
    letter-spacing: 0.06em;
  }

  .row {
    --depth: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: var(--h-sm);
    padding: 0 var(--s-2) 0 calc(4px + var(--depth) * 14px);
    border-radius: var(--r-sm);
    color: var(--text-2);
    font-size: var(--fs-3);
    text-align: left;
    cursor: pointer;
    user-select: none;
    transition: background-color var(--t-1) var(--ease), color var(--t-1) var(--ease);
  }

  .row > :global(svg) {
    flex: 0 0 auto;
    color: var(--text-3);
  }

  .row:hover {
    background: var(--fill);
    color: var(--text);
  }

  .row.is-active {
    background: var(--fill-strong);
    color: var(--text);
    font-weight: 550;
  }

  .row.is-active > :global(svg) {
    color: var(--accent-text);
  }

  .row-wrap {
    position: relative;
  }

  .row-wrap .row {
    padding-left: var(--s-2);
  }

  .unpin {
    position: absolute;
    top: 0;
    right: 0;
    opacity: 0;
  }

  .row-wrap:hover .unpin,
  .unpin:focus-visible {
    opacity: 1;
  }

  .caret {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: var(--r-xs);
    color: var(--text-3);
  }

  .caret:hover {
    background: var(--fill-strong);
    color: var(--text);
  }

  .caret :global(svg) {
    transition: transform var(--t-2) var(--ease-out);
  }

  .caret.is-open :global(svg) {
    transform: rotate(90deg);
  }

  .caret.is-leaf {
    visibility: hidden;
  }

  /* Narrow: an overlay drawer that slides (transform only). */
  @media (max-width: 820px) {
    .sidebar {
      position: absolute;
      inset: 0 auto 0 0;
      z-index: 40;
      display: flex;
      box-shadow: var(--shadow-3);
      transform: translateX(-100%);
      visibility: hidden;
      transition: transform var(--t-3) var(--ease-out), visibility 0s var(--t-3);
    }

    .sidebar.is-open {
      transform: none;
      visibility: visible;
      transition: transform var(--t-3) var(--ease-out);
    }
  }
</style>
