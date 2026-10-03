<script lang="ts">
  import { renderMarkdownSafe } from "../lib/sanitize/markdown";

  interface Props {
    /** Markdown from the site config (window.__DUFS_CONFIG__.footer). */
    markdown: string;
  }
  let { markdown }: Props = $props();

  let html = $state("");

  $effect(() => {
    const src = markdown;
    let cancelled = false;
    void renderMarkdownSafe(src)
      .then((out) => {
        if (!cancelled) html = out;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  /** Footer links (备案号, homepage…) leave the file browser in a new tab. */
  function externalLinks(node: HTMLElement) {
    const run = () => {
      for (const a of node.querySelectorAll<HTMLAnchorElement>("a[href]")) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
    };
    const mo = new MutationObserver(run);
    mo.observe(node, { childList: true, subtree: true });
    run();
    return { destroy: () => mo.disconnect() };
  }
</script>

{#if html}
  <footer class="site-footer" use:externalLinks>{@html html}</footer>
{/if}

<style>
  .site-footer {
    margin-top: var(--s-8);
    padding-top: var(--s-4);
    border-top: 1px solid var(--border);
    color: var(--text-3);
    font-size: var(--fs-2);
    line-height: 1.7;
    text-align: center;
    animation: fade-in var(--t-3) var(--ease);
  }

  .site-footer :global(p) {
    margin: 0;
  }

  .site-footer :global(p + p) {
    margin-top: var(--s-1);
  }

  .site-footer :global(a) {
    color: inherit;
    text-decoration: underline;
    text-decoration-color: var(--border-strong);
    text-underline-offset: 3px;
  }

  .site-footer :global(a:hover) {
    color: var(--text-2);
    text-decoration-color: currentColor;
  }

  .site-footer :global(img) {
    display: inline-block;
    max-height: 20px;
    vertical-align: middle;
  }
</style>
