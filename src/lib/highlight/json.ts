/**
 * Tiny single-pass JSON highlighter → escaped HTML with token spans.
 * No dependency, no parse: works on pretty-printed text and on invalid JSON
 * alike (unknown text is passed through escaped). Strings are matched first,
 * so numbers or keywords inside strings are never coloured.
 */
const TOKEN = /("(?:\\.|[^"\\\n])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|([{}[\],])/g;

/** Above this, colouring costs more than it gives; callers show plain text. */
export const HIGHLIGHT_LIMIT = 300_000;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightJson(src: string): string | null {
  if (src.length > HIGHLIGHT_LIMIT) return null;
  let out = "";
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    out += esc(src.slice(last, m.index));
    const [, str, colon, num, lit, punct] = m;
    if (str !== undefined) {
      out += colon ? `<span class="j-key">${esc(str)}</span>${colon}` : `<span class="j-str">${esc(str)}</span>`;
    } else if (num !== undefined) {
      out += `<span class="j-num">${num}</span>`;
    } else if (lit !== undefined) {
      out += `<span class="j-lit">${lit}</span>`;
    } else {
      out += `<span class="j-pun">${punct}</span>`;
    }
    last = m.index + m[0].length;
  }
  return out + esc(src.slice(last));
}
