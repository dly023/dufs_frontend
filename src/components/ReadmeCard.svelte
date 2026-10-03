<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import { directory } from "../stores/directory.svelte";
  import { fetchFileText } from "../lib/dufs/client";
  import { renderMarkdownSafe } from "../lib/sanitize/markdown";
  import { enhanceMarkdown } from "../lib/preview/markdownEnhance";
  import type { PathItem } from "../lib/dufs/types";

  type Matcher = (name: string) => boolean;

  /**
   * Fallback chain, most specific first. The first file in the directory that
   * matches an earlier rule wins; later rules are progressively weaker hints.
   */
  const CHAIN: Matcher[] = [
    // 0 — the canonical names
    (n) => n === "readme.md" || n === "readme.markdown",
    // 1 — README in other plain formats
    (n) => n === "readme.txt" || n === "readme" || n === "readme.rst",
    // 2 — named docs (en + zh)
    (n) =>
      [
        "index.md", "index.markdown", "home.md", "about.md", "description.md",
        "doc.md", "docs.md", "manual.md", "guide.md", "usage.md", "install.md",
        "changelog.md", "changes.md", "todo.md", "notes.md",
        "about.txt", "doc.txt", "docs.txt", "manual.txt", "guide.txt", "usage.txt",
        "notes.txt", "changelog.txt",
        "说明.md", "说明.txt", "介绍.md", "简介.md", "使用说明.md", "使用.md",
        "帮助.md", "目录.md", "首页.md", "readme.zh.md", "readme-zh.md", "说明文档.md",
      ].includes(n),
    // 3 — licenses
    (n) => ["license.md", "license.txt", "license", "licence", "copying"].includes(n),
    // 4 — any markdown
    (n) => n.endsWith(".md") || n.endsWith(".markdown") || n.endsWith(".mdx"),
    // 5 — any plain-text prose (kept as the weakest fallback; collapsed by default)
    (n) => n.endsWith(".txt") || n.endsWith(".text") || n.endsWith(".rst") || n.endsWith(".org"),
  ];

  function rank(name: string): number {
    const n = name.toLowerCase();
    for (let i = 0; i < CHAIN.length; i += 1) if (CHAIN[i](n)) return i;
    return -1;
  }

  /** All candidates in the current directory, ordered by the chain then name. */
  const candidates = $derived.by(() => {
    const list = directory.sortedPaths
      .filter((p) => !p.is_dir)
      .map((p) => ({ item: p, r: rank(p.name) }))
      .filter((e) => e.r >= 0);
    list.sort((a, b) => (a.r !== b.r ? a.r - b.r : a.item.name.localeCompare(b.item.name, "zh")));
    return list.map((e) => e.item);
  });

  let pickedIndex = $state(0);
  const picked: PathItem | null = $derived(candidates[pickedIndex] ?? candidates[0] ?? null);

  let expanded = $state(true);

  // Real READMEs open; the weakest guess (any stray .txt) starts folded.
  $effect(() => {
    const file = picked;
    expanded = file ? rank(file.name) < CHAIN.length - 1 : true;
  });
  let html = $state("");
  let text = $state("");

  // Reset the choice when the directory changes.
  $effect(() => {
    void directory.path;
    pickedIndex = 0;
  });

  /** Show the head of a file; huge docs are windowed rather than fully rendered. */
  const CARD_LIMIT = 256 * 1024;

  $effect(() => {
    const file = picked;
    html = "";
    text = "";
    if (!file) return;
    let cancelled = false;
    (async () => {
      try {
        const raw = await fetchFileText(file.fullpath);
        const clipped = raw.length > CARD_LIMIT ? `${raw.slice(0, CARD_LIMIT)}\n\n…（内容过长，已截断；双击文件查看全文）` : raw;
        const ext = file.ext.toLowerCase();
        if (ext === "md" || ext === "markdown" || ext === "mdx") {
          const rendered = await renderMarkdownSafe(clipped);
          if (!cancelled) html = rendered;
        } else if (!cancelled) {
          text = clipped;
        }
      } catch {
        /* a failed readme should never break the listing */
      }
    })();
    return () => {
      cancelled = true;
    };
  });

  function cycle(delta: number) {
    if (!candidates.length) return;
    pickedIndex = (pickedIndex + delta + candidates.length) % candidates.length;
  }
</script>

{#if picked}
  <section class="readme">
    <header>
      <button class="toggle" type="button" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
        <Icon name="bookOpen" size={15} />
        <span class="ellipsis" title={picked.fullpath}>{picked.filename}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {#if candidates.length > 1}
        <div class="switch" title={`${candidates.length} 篇说明文档`}>
          <button class="icon-btn sm" type="button" title="上一篇" onclick={() => cycle(-1)}>
            <Icon name="chevronLeft" size={14} />
          </button>
          <span class="num">{pickedIndex + 1}/{candidates.length}</span>
          <button class="icon-btn sm" type="button" title="下一篇" onclick={() => cycle(1)}>
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
      {/if}
    </header>
    {#if expanded}
      <div class="content">
        {#if html}
          <div class="prose" use:enhanceMarkdown={picked}>{@html html}</div>
        {:else}
          <pre class="mono-block">{text}</pre>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .readme {
    margin-top: var(--s-8);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--surface);
    overflow: hidden;
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: 44px;
    padding: 0 var(--s-2) 0 var(--s-1);
    border-bottom: 1px solid var(--border);
  }

  .toggle {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    height: var(--h-md);
    padding: 0 var(--s-3);
    border-radius: var(--r-sm);
    color: var(--text-2);
    font-size: var(--fs-3);
    font-weight: 600;
  }

  .toggle:hover {
    color: var(--text);
  }

  .toggle > :global(svg:last-child) {
    flex: 0 0 auto;
    color: var(--text-3);
    transition: transform var(--t-2) var(--ease-out);
  }

  .toggle[aria-expanded="false"] > :global(svg:last-child) {
    transform: rotate(-90deg);
  }

  .toggle .ellipsis {
    flex: 0 1 auto;
  }

  .switch {
    display: flex;
    align-items: center;
    gap: 2px;
    color: var(--text-3);
    font-size: var(--fs-2);
  }

  .content {
    max-height: 70vh;
    overflow: auto;
    padding: var(--s-5) var(--s-6) var(--s-6);
  }

  .content > :global(*) {
    max-width: 72ch;
  }

  section:has(.toggle[aria-expanded="false"]) header {
    border-bottom-color: transparent;
  }
</style>
