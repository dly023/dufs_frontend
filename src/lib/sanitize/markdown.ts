/**
 * Markdown → sanitized HTML. marked + DOMPurify load on first use, so they stay
 * out of the main bundle (most directories never render Markdown).
 *
 * Images are emitted with `data-src` instead of `src`: the markup is inserted
 * before we know which directory it belongs to, and a premature request would
 * hit the wrong URL (or trigger the browser's auth prompt behind dufs auth).
 * `enhanceMarkdown` resolves and loads them.
 */
type Render = (source: string) => Promise<string>;

let renderer: Promise<Render> | null = null;

function load(): Promise<Render> {
  renderer ??= Promise.all([import("marked"), import("dompurify")]).then(([{ marked }, { default: DOMPurify }]) => {
    marked.setOptions({ gfm: true, breaks: false });
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "IMG" && node.hasAttribute("src")) {
        node.setAttribute("data-src", node.getAttribute("src") ?? "");
        node.removeAttribute("src");
      }
    });
    return async (source: string) =>
      DOMPurify.sanitize(String(await marked.parse(source)), { USE_PROFILES: { html: true } });
  });
  // A failed chunk load (e.g. flaky network) should be retryable next time.
  renderer.catch(() => (renderer = null));
  return renderer;
}

export async function renderMarkdownSafe(source: string): Promise<string> {
  return (await load())(source);
}
