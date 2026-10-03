/**
 * Markdown → sanitized HTML. marked + DOMPurify load on first use, so they stay
 * out of the main bundle (most directories never render Markdown).
 */
type Render = (source: string) => Promise<string>;

let renderer: Promise<Render> | null = null;

function load(): Promise<Render> {
  renderer ??= Promise.all([import("marked"), import("dompurify")]).then(([{ marked }, { default: DOMPurify }]) => {
    marked.setOptions({ gfm: true, breaks: false });
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
