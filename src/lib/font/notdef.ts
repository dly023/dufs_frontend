import notdefUrl from "../../assets/AND-Regular.woff2?url";

/**
 * "Adobe NotDef" maps every codepoint to a visible .notdef box. Stacked after a
 * previewed face, missing glyphs show as boxes instead of silently falling back
 * to a system font. Loaded once, on first use, as its own cached asset.
 */
let ready: Promise<void> | null = null;

export function ensureNotDef(): Promise<void> {
  ready ??= new FontFace("Adobe NotDef", `url(${notdefUrl})`)
    .load()
    .then((f) => {
      document.fonts.add(f);
    })
    .catch(() => {
      ready = null; // retry next time
    });
  return ready;
}
