/**
 * Lightweight code highlighter → escaped HTML with `.syn-*` spans, or null when
 * the language is unknown / the text is too large (callers then show plain text).
 *
 * One combined regex per language, one pass over the text. Each rule is a
 * capture group; identifiers are looked up in keyword/literal sets instead of
 * being baked into the regex, so the tables stay readable and cheap.
 */

/** Above this, colouring costs more than it gives. */
export const CODE_HIGHLIGHT_LIMIT = 300_000;

type Kind = "key" | "str" | "num" | "lit" | "com" | "pun" | "ident" | "plain";

interface Lang {
  rules: [Kind, string][];
  keywords?: Set<string>;
  literals?: Set<string>;
  /** Case-insensitive keyword lookup (SQL). */
  ci?: boolean;
}

const words = (s: string) => new Set(s.split(/\s+/).filter(Boolean));

const NUM = String.raw`\b0[xX][\da-fA-F_]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b`;
const IDENT = String.raw`[A-Za-z_$][\w$]*`;
const DQ = String.raw`"(?:\\.|[^"\\\n])*"`;
const SQ = String.raw`'(?:\\.|[^'\\\n])*'`;

const CLIKE_KEYWORDS = words(`
  abstract as async await break case catch class const continue debugger default defer delete do else enum
  export extends final finally fn for from func function go if impl implements import in instanceof interface
  internal is keyof let loop match mod move mut namespace new of override package private protected pub public
  readonly return satisfies select static struct super switch this throw throws trait try type typeof union
  unsafe use val var void where while with yield chan map range fallthrough goto sizeof typedef extern
  include define ifdef ifndef endif inline register volatile signed unsigned template typename using virtual
  operator friend crate dyn ref self Self get set declare module require`);
const CLIKE_LITERALS = words("true false null undefined nil None NaN Infinity");

const clike: Lang = {
  rules: [
    ["com", String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`],
    ["str", String.raw`\`(?:\\.|[^\`\\])*\`|${DQ}|${SQ}`],
    ["num", NUM],
    ["ident", IDENT],
  ],
  keywords: CLIKE_KEYWORDS,
  literals: CLIKE_LITERALS,
};

const python: Lang = {
  rules: [
    ["com", String.raw`#[^\n]*`],
    ["str", String.raw`[rbfuRBFU]{0,2}(?:"""[\s\S]*?"""|'''[\s\S]*?'''|${DQ}|${SQ})`],
    ["lit", String.raw`@[\w.]+`],
    ["num", NUM],
    ["ident", IDENT],
  ],
  keywords: words(`and as assert async await break class continue def del elif else except finally for from
    global if import in is lambda match case nonlocal not or pass raise return try while with yield self cls print`),
  literals: words("True False None"),
};

const ruby: Lang = {
  rules: [
    ["com", String.raw`#[^\n]*`],
    ["str", `${DQ}|${SQ}`],
    ["lit", String.raw`:[A-Za-z_]\w*`],
    ["num", NUM],
    ["ident", IDENT],
  ],
  keywords: words(`alias and begin break case class def defined do else elsif end ensure for if in module next
    not or redo rescue retry return self super then undef unless until when while yield require attr_accessor`),
  literals: words("true false nil"),
};

const shell: Lang = {
  rules: [
    ["com", String.raw`(?:^|(?<=\s))#[^\n]*`],
    ["str", `${DQ}|${SQ}`],
    ["lit", String.raw`\$\{[^}\n]*\}|\$[A-Za-z_]\w*|\$[0-9#?@*$!-]`],
    ["num", String.raw`\b\d+\b`],
    ["ident", String.raw`[A-Za-z_][\w-]*`],
  ],
  keywords: words(`if then else elif fi for in do done case esac while until function return export local
    readonly declare set unset source exit break continue shift trap select time`),
  literals: words("true false"),
};

const sql: Lang = {
  rules: [
    ["com", String.raw`--[^\n]*|\/\*[\s\S]*?\*\/`],
    ["str", SQ],
    ["num", NUM],
    ["ident", String.raw`[A-Za-z_]\w*|"[^"\n]*"|\`[^\`\n]*\``],
  ],
  ci: true,
  keywords: words(`select from where and or not insert into values update set delete create table index view
    drop alter add column primary key foreign references join left right inner outer full cross on group by
    order having limit offset union all distinct as case when then else end in is like between exists
    asc desc default constraint unique check returning with recursive begin commit rollback transaction
    if replace truncate grant revoke cascade count sum avg min max coalesce cast integer int bigint text
    varchar char boolean date timestamp serial real float double numeric`),
  literals: words("null true false"),
};

const yaml: Lang = {
  rules: [
    ["com", String.raw`(?:^|(?<=\s))#[^\n]*`],
    // A key: start of line (after indentation / list dash), up to the colon.
    ["key", String.raw`(?<=^[ \t]*(?:-[ \t]+)?)(?!-[ \t])(?:${DQ}|${SQ}|[^\s#:'"{}[\],&*!|>][^\n:#]*?)(?=[ \t]*:(?:[ \t]|$))`],
    ["str", `${DQ}|${SQ}`],
    ["lit", String.raw`[&*][\w-]+|![\w!/.-]*|\b(?:true|false|null|yes|no|on|off|True|False|Null|NULL|TRUE|FALSE)\b|~`],
    ["num", String.raw`(?<![\w.-])[-+]?(?:\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?|\.inf|\.nan)(?![\w.-])`],
    ["pun", String.raw`(?<=^[ \t]*)-(?=[ \t]|$)|^---$|^\.\.\.$`],
  ],
};

const ini: Lang = {
  rules: [
    ["com", String.raw`^[ \t]*[#;][^\n]*|(?<=[ \t])#[^\n]*`],
    ["lit", String.raw`^[ \t]*\[[^\]\n]*\]`],
    ["key", String.raw`^[ \t]*[\w.\-"'@$]+(?=[ \t]*[=:])`],
    ["str", `${DQ}|${SQ}`],
    ["lit", String.raw`\b(?:true|false|on|off|yes|no|null|none)\b`],
    ["num", String.raw`(?<![\w.-])[-+]?\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?(?![\w.-])`],
  ],
};

const css: Lang = {
  rules: [
    ["com", String.raw`\/\*[\s\S]*?\*\/|(?<![:\w])\/\/[^\n]*`],
    ["str", `${DQ}|${SQ}`],
    ["lit", String.raw`@[\w-]+|![\w]+|\$[\w-]+|--[\w-]+`],
    // A property name: followed by a colon whose value ends the declaration.
    ["key", String.raw`[\w-]+(?=[ \t]*:[^{};\n]*(?:;|\}|$))`],
    ["num", String.raw`#[\da-fA-F]{3,8}\b|(?<![\w-])-?\d*\.?\d+(?:%|[a-zA-Z]+)?`],
  ],
};

const markup: Lang = {
  rules: [
    ["com", String.raw`<!--[\s\S]*?-->`],
    ["key", String.raw`<\/?[A-Za-z][\w:.-]*|\/?>`],
    ["lit", String.raw`(?<=\s)[@:A-Za-z_][\w:.@-]*(?=\s*=)`],
    ["str", `${DQ}|${SQ}`],
    ["pun", String.raw`\{[^{}\n]*\}`],
  ],
};

const LANGS: Record<string, Lang> = { clike, python, ruby, shell, sql, yaml, ini, css, markup };

const EXT_LANG: Record<string, string> = {
  js: "clike", jsx: "clike", mjs: "clike", cjs: "clike", ts: "clike", tsx: "clike", mts: "clike", cts: "clike",
  go: "clike", rs: "clike", java: "clike", kt: "clike", kts: "clike", scala: "clike", swift: "clike",
  dart: "clike", c: "clike", h: "clike", cc: "clike", cpp: "clike", cxx: "clike", hpp: "clike", cs: "clike",
  php: "clike", lua: "clike", zig: "clike", groovy: "clike", gradle: "clike",
  javascript: "clike", typescript: "clike", rust: "clike", golang: "clike", csharp: "clike",
  py: "python", pyi: "python", pyx: "python", python: "python",
  rb: "ruby", ruby: "ruby",
  sh: "shell", bash: "shell", zsh: "shell", fish: "shell", shell: "shell", console: "shell",
  dockerfile: "shell", makefile: "shell", env: "ini",
  sql: "sql", psql: "sql", mysql: "sql",
  yml: "yaml", yaml: "yaml",
  toml: "ini", ini: "ini", cfg: "ini", conf: "ini", properties: "ini", editorconfig: "ini",
  css: "css", scss: "css", less: "css", sass: "css",
  html: "markup", htm: "markup", xml: "markup", svg: "markup", vue: "markup", svelte: "markup", xhtml: "markup",
  plist: "markup",
};

/** Normalised language id for a file extension or a Markdown fence tag. */
export function languageOf(extOrTag: string): string | null {
  return EXT_LANG[extOrTag.toLowerCase()] ?? null;
}

const compiled = new Map<string, RegExp>();

function regexFor(id: string, lang: Lang): RegExp {
  let re = compiled.get(id);
  if (!re) {
    re = new RegExp(lang.rules.map(([, src]) => `(${src})`).join("|"), "gm");
    compiled.set(id, re);
  }
  re.lastIndex = 0;
  return re;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightCode(src: string, lang: string): string | null {
  if (src.length > CODE_HIGHLIGHT_LIMIT) return null;
  const id = LANGS[lang] ? lang : languageOf(lang);
  const def = id ? LANGS[id] : undefined;
  if (!id || !def) return null;
  const re = regexFor(id, def);
  let out = "";
  let last = 0;
  for (const m of src.matchAll(re)) {
    const text = m[0];
    if (!text) continue;
    const at = m.index;
    out += esc(src.slice(last, at));
    last = at + text.length;
    let g = 1;
    while (g < m.length && m[g] === undefined) g += 1;
    let kind = def.rules[g - 1]?.[0] ?? "plain";
    if (kind === "ident") {
      const w = def.ci ? text.toLowerCase() : text;
      kind = def.literals?.has(w) ? "lit" : def.keywords?.has(w) ? "key" : "plain";
    }
    out += kind === "plain" ? esc(text) : `<span class="syn-${kind}">${esc(text)}</span>`;
  }
  return out + esc(src.slice(last));
}

/**
 * Split highlighted HTML into per-line HTML, closing a span at each line end
 * and reopening it on the next line (tokens like block comments span lines).
 * Spans are never nested, so one open class is all the state needed.
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = [];
  let open: string | null = null;
  let cur = "";
  const re = /<span class="([^"]+)">|<\/span>|\n/g;
  let last = 0;
  for (const m of html.matchAll(re)) {
    cur += html.slice(last, m.index);
    last = m.index + m[0].length;
    if (m[0] === "\n") {
      if (open) cur += "</span>";
      lines.push(cur);
      cur = open ? `<span class="${open}">` : "";
    } else if (m[1]) {
      open = m[1];
      cur += m[0];
    } else {
      open = null;
      cur += m[0];
    }
  }
  cur += html.slice(last);
  lines.push(cur);
  return lines;
}
