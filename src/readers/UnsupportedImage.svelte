<script lang="ts">
  import Icon from "../components/Icon.svelte";
  import type { PathItem } from "../lib/dufs/types";
  import { imageFormatName } from "../lib/models/exts";
  import { formatSize } from "../lib/models/format";

  interface Props {
    item: PathItem;
    /** "stage": on the dark reader stage; "pane": in the side preview. */
    tone?: "stage" | "pane";
  }
  let { item, tone = "pane" }: Props = $props();
</script>

<div class="unsupported {tone}">
  <span class="glyph"><Icon name="images" size={26} stroke={1.5} /></span>
  <strong>{imageFormatName(item.ext)} · <span class="num">{formatSize(item.size)}</span></strong>
  <p>浏览器无法直接显示这种图片</p>
  <div class="actions">
    <a class="btn btn-sm btn-primary" href={item.fullpath} download={item.filename}>
      <Icon name="download" size={14} />下载
    </a>
    <a class="btn btn-sm" href={item.fullpath} target="_blank" rel="noopener noreferrer">
      <Icon name="external" size={14} />新标签打开
    </a>
  </div>
</div>

<style>
  .unsupported {
    margin: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--s-2);
    max-width: 320px;
    padding: var(--s-6) var(--s-5);
    text-align: center;
    animation: fade-in var(--t-3) var(--ease);
  }

  .glyph {
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    margin-bottom: var(--s-1);
    border-radius: var(--r-lg);
    background: var(--fill);
    color: var(--text-3);
  }

  strong {
    font-size: var(--fs-4);
    font-weight: 600;
  }

  p {
    color: var(--text-3);
    font-size: var(--fs-3);
  }

  .actions {
    display: flex;
    gap: var(--s-2);
    margin-top: var(--s-2);
  }

  /* On the always-dark reader stage. */
  .stage {
    color: oklch(0.96 0 0);
  }

  .stage .glyph {
    background: oklch(1 0 0 / 0.08);
    color: oklch(1 0 0 / 0.6);
  }

  .stage p {
    color: oklch(1 0 0 / 0.55);
  }

  .stage .btn:not(.btn-primary) {
    border-color: oklch(1 0 0 / 0.16);
    background: oklch(1 0 0 / 0.06);
    color: oklch(0.96 0 0);
    box-shadow: none;
  }
</style>
