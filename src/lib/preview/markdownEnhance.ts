import type { PathItem } from "../dufs/types";

/**
 * Svelte action applied to rendered Markdown (`use:enhanceMarkdown={item}`).
 * Post-render behaviour lives here: link handling, images, code blocks.
 */
export function enhanceMarkdown(node: HTMLElement, item: PathItem) {
  void node;
  void item;
  return {
    update(_next: PathItem) {},
    destroy() {},
  };
}
