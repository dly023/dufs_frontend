<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import { parseFont, hasCodepoint, type FontInfo } from "../lib/font/parse";
  import { ensureNotDef } from "../lib/font/notdef";
  import { formatSize } from "../lib/models/format";

  interface Props {
    item: PathItem;
    /** Font URL; already a blob URL behind auth. */
    src: string;
    variant: "pane" | "full";
  }
  let { item, src, variant }: Props = $props();

  const CJK_TEXT = "天地玄黄，宇宙洪荒。The quick brown fox jumps over the lazy dog 0123456789";
  const LATIN_TEXT = "The quick brown fox jumps over the lazy dog. 0123456789";
  const WATERFALL = [12, 16, 20, 28, 40, 56, 72];
  const LATIN_UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const LATIN_LOWER = "abcdefghijklmnopqrstuvwxyz";
  const DIGITS_PUNCT = "0123456789!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~";
  const CJK_COMMON =
    "的一是不了人我在有他这中大来上国个到说们为子和你地出道也时年得就那要下以生会自着去之过家学对可她里后小么心多天而能好都然没日于起还发成事只作当想看文无开手十用主行方又如前所本见经头面公同三已老从动两长";

  let face = $state("");
  let info = $state<FontInfo | null>(null);
  let bytes = $state(0);
  let error = $state("");
  let loading = $state(true);

  let tab = $state<"line" | "waterfall" | "chars">("line");
  let sample = $state("");
  let size = $state(48);
  let weight = $state(400);
  let italic = $state(false);
  let dark = $state(false);
  /** Current value per variable axis tag. */
  let axisValues = $state<Record<string, number>>({});

  const variable = $derived((info?.axes.length ?? 0) > 0);
  const text = $derived(sample || (info?.hasCjk ? CJK_TEXT : LATIN_TEXT));
  const fvs = $derived(
    variable ? Object.entries(axisValues).map(([t, v]) => `"${t}" ${Math.round(v * 100) / 100}`).join(", ") : "normal",
  );
  const coverage = $derived(info?.coverage.filter((c) => c.have > 0 || c.key === "latin") ?? []);
  const grid = $derived.by(() => {
    if (!info) return [];
    const groups = [
      { title: "大写字母", chars: LATIN_UPPER },
      { title: "小写字母", chars: LATIN_LOWER },
      { title: "数字与标点", chars: DIGITS_PUNCT },
    ];
    if (info.hasCjk) groups.push({ title: "常用汉字", chars: CJK_COMMON });
    return groups.map((g) => ({
      title: g.title,
      cells: Array.from(g.chars).map((ch) => {
        const cp = ch.codePointAt(0)!;
        return { ch, cp, missing: info!.ranges.length > 0 && !hasCodepoint(info!.ranges, cp) };
      }),
    }));
  });
  const missingCount = $derived(grid.reduce((n, g) => n + g.cells.filter((c) => c.missing).length, 0));

  // Fetch once; the same bytes feed both the parser and the FontFace.
  $effect(() => {
    const url = src;
    if (!url) return;
    let cancelled = false;
    let added: FontFace | null = null;
    loading = true;
    error = "";
    info = null;
    face = "";
    void ensureNotDef();
    (async () => {
      try {
        const buf = await (await fetch(url)).arrayBuffer();
        if (cancelled) return;
        bytes = buf.byteLength;
        const parsed = await parseFont(buf);
        if (cancelled) return;
        const name = `dufs-fv-${Math.random().toString(36).slice(2, 9)}`;
        const ff = new FontFace(name, buf);
        await ff.load();
        if (cancelled) return;
        document.fonts.add(ff);
        added = ff;
        info = parsed;
        axisValues = Object.fromEntries(parsed.axes.map((a) => [a.tag, a.def]));
        weight = parsed.weight || 400;
        face = name;
      } catch {
        if (!cancelled) error = "无法加载这个字体文件";
      } finally {
        if (!cancelled) loading = false;
      }
    })();
    return () => {
      cancelled = true;
      if (added) document.fonts.delete(added);
    };
  });

  function fmtAxis(v: number): string {
    return Number.isInteger(v) ? String(v) : v.toFixed(1);
  }
</script>

<div
  class="fv {variant}"
  class:is-dark={dark}
  style:--ff={face ? `"${face}", "Adobe NotDef"` : "inherit"}
  style:--fvs={fvs}
  style:--fw={variable ? "normal" : weight}
  style:--fst={italic ? "italic" : "normal"}
>
  {#if loading}
    <p class="hint">读取字体…</p>
  {:else if error}
    <p class="hint is-error">{error}</p>
  {:else if info}
    <header class="head">
      <h3 class="family ellipsis" title={info.family || item.filename}>{info.family || item.filename}</h3>
      <p class="meta num">
        {[info.subfamily, info.version && `版本 ${info.version}`, info.glyphs && `${info.glyphs.toLocaleString()} 个字形`, `${info.format.toUpperCase()} · ${formatSize(bytes)}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {#if info.designer}<p class="meta">设计 {info.designer}</p>{/if}
      {#if coverage.length || variable}
        <div class="chips">
          {#if variable}<span class="chip-q is-accent">可变字体 · {info.axes.length} 个轴</span>{/if}
          {#each coverage as c (c.key)}
            <span class="chip-q num" title={`${c.label}：${c.have.toLocaleString()} / ${c.total.toLocaleString()}`}>
              {c.label}
              {c.key === "cjk" ? `${c.have.toLocaleString()} / ${c.total.toLocaleString()}` : `${Math.round((c.have / c.total) * 100)}%`}
            </span>
          {/each}
        </div>
      {/if}
      {#if info.note}<p class="note">{info.note}</p>{/if}
    </header>

    <div class="controls">
      <div class="seg" style:--n="3" style:--i={tab === "line" ? 0 : tab === "waterfall" ? 1 : 2} role="tablist" aria-label="预览方式">
        <button type="button" role="tab" aria-selected={tab === "line"} onclick={() => (tab = "line")}>试排</button>
        <button type="button" role="tab" aria-selected={tab === "waterfall"} onclick={() => (tab = "waterfall")}>瀑布</button>
        <button type="button" role="tab" aria-selected={tab === "chars"} onclick={() => (tab = "chars")}>字符</button>
      </div>
      <span class="spacer"></span>
      {#if !info.italic}
        <button class="icon-btn sm style-btn" class:is-on={italic} type="button" title="斜体（合成）" aria-pressed={italic} onclick={() => (italic = !italic)}>
          <span class="italic-i">I</span>
        </button>
      {/if}
      <button class="icon-btn sm" type="button" title={dark ? "浅色纸张" : "深色纸张"} onclick={() => (dark = !dark)}>
        <Icon name={dark ? "sun" : "moon"} size={15} />
      </button>
    </div>

    {#if tab !== "chars"}
      <input class="input" placeholder="输入文字试排…" bind:value={sample} aria-label="试排文字" />
    {/if}

    <div class="sliders">
      {#if tab === "line"}
        <label class="slider">
          <span>字号</span>
          <input type="range" min="10" max="128" bind:value={size} />
          <span class="val num">{size}px</span>
        </label>
      {/if}
      {#if variable}
        {#each info.axes as a (a.tag)}
          <label class="slider" title={`${a.tag} · ${fmtAxis(a.min)}–${fmtAxis(a.max)}`}>
            <span>{a.name}</span>
            <input
              type="range"
              min={a.min}
              max={a.max}
              step={a.max - a.min > 20 ? 1 : 0.1}
              value={axisValues[a.tag]}
              oninput={(e) => (axisValues = { ...axisValues, [a.tag]: Number(e.currentTarget.value) })}
            />
            <span class="val num">{fmtAxis(axisValues[a.tag] ?? a.def)}</span>
          </label>
        {/each}
      {:else}
        <label class="slider" title="静态字体由浏览器合成粗细，仅供参考">
          <span>字重</span>
          <input type="range" min="100" max="900" step="100" bind:value={weight} />
          <span class="val num">{weight}</span>
        </label>
      {/if}
    </div>

    <div class="paper">
      {#if tab === "line"}
        <p class="sample line" style:--size={`${size}px`}>{text}</p>
      {:else if tab === "waterfall"}
        {#each WATERFALL as px (px)}
          <div class="wf-row">
            <span class="wf-px num">{px}</span>
            <p class="sample wf" style:--size={`${px}px`}>{text}</p>
          </div>
        {/each}
      {:else}
        {#if missingCount}<p class="note on-paper">缺 {missingCount} 个字符，以方框显示</p>{/if}
        {#each grid as g (g.title)}
          <section class="group">
            <h4>{g.title}</h4>
            <div class="cells">
              {#each g.cells as c (c.cp)}
                <span
                  class="cell"
                  class:is-missing={c.missing}
                  title={`${c.missing ? "缺字 · " : ""}U+${c.cp.toString(16).toUpperCase().padStart(4, "0")}`}
                >{c.ch}</span>
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .fv {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: var(--s-3);
    min-width: 0;
    padding: var(--s-4);
  }

  .hint {
    margin: auto;
    padding: var(--s-6);
    color: var(--text-3);
    font-size: var(--fs-3);
  }

  .hint.is-error {
    color: var(--danger);
  }

  .head {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* The family name is set in the face itself: the first specimen. */
  .family {
    font-family: var(--ff);
    font-variation-settings: var(--fvs);
    font-size: 1.75rem;
    font-weight: normal;
    line-height: 1.25;
  }

  .full .family {
    font-size: 2.25rem;
  }

  .meta {
    color: var(--text-3);
    font-size: var(--fs-2);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: var(--s-2);
  }

  .chip-q {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px;
    border-radius: var(--r-full);
    background: var(--fill);
    color: var(--text-2);
    font-size: var(--fs-1);
    white-space: nowrap;
  }

  .chip-q.is-accent {
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 600;
  }

  .note {
    margin-top: var(--s-1);
    color: var(--text-3);
    font-size: var(--fs-1);
  }

  .controls {
    display: flex;
    align-items: center;
    gap: var(--s-1);
  }

  .spacer {
    flex: 1;
  }

  .italic-i {
    font-family: Georgia, "Times New Roman", serif;
    font-size: var(--fs-4);
    font-style: italic;
    font-weight: 600;
  }

  .sliders {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--s-1) var(--s-4);
  }

  .slider {
    display: grid;
    grid-template-columns: 4.5em minmax(0, 1fr) 3.5em;
    align-items: center;
    gap: var(--s-2);
    color: var(--text-2);
    font-size: var(--fs-2);
  }

  .slider input {
    width: 100%;
    accent-color: var(--accent);
  }

  .val {
    color: var(--text-3);
    text-align: right;
  }

  /* The paper: its own light/dark, independent of the app theme. */
  .paper {
    --paper: var(--surface);
    --ink: var(--text);
    --rule: var(--border);
    display: flex;
    flex-direction: column;
    gap: var(--s-2);
    min-width: 0;
    padding: var(--s-4) var(--s-5);
    border-radius: var(--r-md);
    background: var(--paper);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px var(--rule);
    overflow-x: auto;
    transition: background-color var(--t-2) var(--ease), color var(--t-2) var(--ease);
  }

  .fv.is-dark .paper {
    --paper: var(--stage);
    --ink: oklch(0.95 0 0);
    --rule: oklch(1 0 0 / 0.08);
  }

  .sample {
    font-family: var(--ff);
    font-size: var(--size);
    font-style: var(--fst);
    font-weight: var(--fw);
    font-variation-settings: var(--fvs);
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .wf-row {
    display: grid;
    grid-template-columns: 2.5em minmax(0, 1fr);
    align-items: baseline;
    gap: var(--s-3);
    padding: var(--s-1) 0;
    border-bottom: 1px solid var(--rule);
  }

  .wf-row:last-child {
    border-bottom: 0;
  }

  .wf-px {
    color: color-mix(in oklch, var(--ink) 45%, transparent);
    font-size: var(--fs-1);
    text-align: right;
  }

  .wf {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pane .wf {
    white-space: normal;
  }

  .group h4 {
    margin-bottom: var(--s-2);
    color: color-mix(in oklch, var(--ink) 50%, transparent);
    font-size: var(--fs-1);
    font-weight: 600;
    letter-spacing: 0.04em;
  }

  .group + .group {
    margin-top: var(--s-3);
  }

  .note.on-paper {
    margin: 0;
    color: color-mix(in oklch, var(--ink) 55%, transparent);
  }

  .cells {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 4px;
  }

  .pane .cells {
    grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
  }

  .cell {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border-radius: var(--r-xs);
    box-shadow: inset 0 0 0 1px var(--rule);
    font-family: var(--ff);
    font-size: 1.375rem;
    font-style: var(--fst);
    font-weight: var(--fw);
    font-variation-settings: var(--fvs);
    line-height: 1;
    cursor: default;
  }

  .cell:hover {
    background: color-mix(in oklch, var(--ink) 6%, transparent);
  }

  .cell.is-missing {
    color: color-mix(in oklch, var(--ink) 30%, transparent);
    box-shadow: inset 0 0 0 1px var(--danger-soft);
  }

  @media (max-width: 640px) {
    .fv {
      padding: var(--s-3);
    }
    .paper {
      padding: var(--s-3);
    }
  }
</style>
