/**
 * Minimal, defensive OpenType reader for the font viewer: names, glyph count,
 * Unicode coverage (cmap 4/12), variable axes (fvar), style hints. Handles
 * TTF/OTF, WOFF (zlib) and the first face of a TTC. WOFF2 needs Brotli, so it
 * reports file-level info only. Never throws: every table is optional.
 */

export type FontFormat = "ttf" | "otf" | "woff" | "woff2" | "ttc" | "unknown";

export interface FontAxis {
  tag: string;
  min: number;
  def: number;
  max: number;
  name: string;
}

export interface Coverage {
  key: string;
  label: string;
  have: number;
  total: number;
}

export interface FontInfo {
  format: FontFormat;
  family: string;
  subfamily: string;
  version: string;
  designer: string;
  glyphs: number;
  /** Sorted, merged [start, end] codepoint ranges that map to a real glyph. */
  ranges: [number, number][];
  coverage: Coverage[];
  hasCjk: boolean;
  italic: boolean;
  weight: number;
  axes: FontAxis[];
  /** Why some details are missing (e.g. WOFF2), shown quietly. */
  note: string;
}

type Tables = Map<string, DataView>;

const tagOf = (v: DataView, o: number) =>
  String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

function inBounds(v: DataView, o: number, n: number): boolean {
  return o >= 0 && n >= 0 && o + n <= v.byteLength;
}

function sniff(v: DataView): FontFormat {
  if (v.byteLength < 12) return "unknown";
  const t = tagOf(v, 0);
  if (t === "wOFF") return "woff";
  if (t === "wOF2") return "woff2";
  if (t === "ttcf") return "ttc";
  if (t === "OTTO") return "otf";
  if (v.getUint32(0) === 0x00010000 || t === "true") return "ttf";
  return "unknown";
}

const WANTED = new Set(["name", "maxp", "cmap", "fvar", "OS/2", "head"]);

function sfntTables(v: DataView, base: number): Tables {
  const out: Tables = new Map();
  if (!inBounds(v, base, 12)) return out;
  const n = v.getUint16(base + 4);
  for (let i = 0; i < n; i += 1) {
    const r = base + 12 + i * 16;
    if (!inBounds(v, r, 16)) break;
    const tag = tagOf(v, r);
    if (!WANTED.has(tag)) continue;
    const off = v.getUint32(r + 8);
    const len = v.getUint32(r + 12);
    if (inBounds(v, off, len)) out.set(tag, new DataView(v.buffer, v.byteOffset + off, len));
  }
  return out;
}

async function inflate(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function woffTables(v: DataView): Promise<Tables> {
  const out: Tables = new Map();
  const n = v.getUint16(12);
  for (let i = 0; i < n; i += 1) {
    const r = 44 + i * 20;
    if (!inBounds(v, r, 20)) break;
    const tag = tagOf(v, r);
    if (!WANTED.has(tag)) continue;
    const off = v.getUint32(r + 4);
    const comp = v.getUint32(r + 8);
    const orig = v.getUint32(r + 12);
    if (!inBounds(v, off, comp)) continue;
    const raw = new Uint8Array(v.buffer as ArrayBuffer, v.byteOffset + off, comp);
    try {
      const bytes = comp < orig ? await inflate(raw) : raw.slice();
      out.set(tag, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    } catch {
      /* a broken table is just missing info */
    }
  }
  return out;
}

// ── name ──
interface NameRec {
  id: number;
  platform: number;
  lang: number;
  text: string;
}

function readNames(t: DataView | undefined): NameRec[] {
  if (!t || t.byteLength < 6) return [];
  const count = t.getUint16(2);
  const strOff = t.getUint16(4);
  const recs: NameRec[] = [];
  const utf16 = new TextDecoder("utf-16be");
  const latin = new TextDecoder("latin1");
  for (let i = 0; i < count; i += 1) {
    const r = 6 + i * 12;
    if (!inBounds(t, r, 12)) break;
    const platform = t.getUint16(r);
    const encoding = t.getUint16(r + 2);
    const lang = t.getUint16(r + 4);
    const id = t.getUint16(r + 6);
    const len = t.getUint16(r + 8);
    const off = strOff + t.getUint16(r + 10);
    if (!inBounds(t, off, len)) continue;
    const bytes = new Uint8Array(t.buffer, t.byteOffset + off, len);
    const wide = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10 || encoding === 0));
    if (platform !== 0 && platform !== 1 && platform !== 3) continue;
    recs.push({ id, platform, lang, text: (wide ? utf16 : latin).decode(bytes).trim() });
  }
  return recs;
}

/** Prefer Simplified Chinese, then US English, then anything Windows/Unicode, then Mac. */
function pickName(recs: NameRec[], ...ids: number[]): string {
  for (const id of ids) {
    const c = recs.filter((r) => r.id === id && r.text);
    if (!c.length) continue;
    const score = (r: NameRec) =>
      r.platform === 3 && r.lang === 0x0804 ? 0 : r.platform === 3 && r.lang === 0x0409 ? 1 : r.platform !== 1 ? 2 : 3;
    return c.sort((a, b) => score(a) - score(b))[0].text;
  }
  return "";
}

// ── cmap ──
function cmapRanges(t: DataView | undefined): [number, number][] {
  if (!t || t.byteLength < 4) return [];
  const n = t.getUint16(2);
  let best = -1;
  let bestRank = 99;
  for (let i = 0; i < n; i += 1) {
    const r = 4 + i * 8;
    if (!inBounds(t, r, 8)) break;
    const p = t.getUint16(r);
    const e = t.getUint16(r + 2);
    const off = t.getUint32(r + 4);
    if (!inBounds(t, off, 4)) continue;
    const fmt = t.getUint16(off);
    const rank =
      fmt === 12 && (p === 3 || p === 0) ? 0 : fmt === 4 && ((p === 3 && e === 1) || p === 0) ? 1 : 99;
    if (rank < bestRank) {
      bestRank = rank;
      best = off;
    }
  }
  if (best < 0) return [];
  const fmt = t.getUint16(best);
  const out: [number, number][] = [];
  const push = (a: number, b: number) => {
    const last = out[out.length - 1];
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  };
  if (fmt === 12) {
    if (!inBounds(t, best, 16)) return [];
    const groups = t.getUint32(best + 12);
    for (let i = 0; i < groups; i += 1) {
      const g = best + 16 + i * 12;
      if (!inBounds(t, g, 12)) break;
      const a = t.getUint32(g);
      const b = t.getUint32(g + 4);
      if (b >= a && b <= 0x10ffff) push(a, b);
    }
  } else if (fmt === 4) {
    if (!inBounds(t, best, 14)) return [];
    const segX2 = t.getUint16(best + 6);
    const seg = segX2 / 2;
    const ends = best + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const rangeOffs = deltas + segX2;
    if (!inBounds(t, rangeOffs, segX2)) return [];
    for (let i = 0; i < seg; i += 1) {
      const end = t.getUint16(ends + i * 2);
      const start = t.getUint16(starts + i * 2);
      const delta = t.getUint16(deltas + i * 2);
      const ro = t.getUint16(rangeOffs + i * 2);
      if (start === 0xffff) continue;
      let runStart = -1;
      for (let c = start; c <= end; c += 1) {
        let glyph: number;
        if (ro === 0) glyph = (c + delta) & 0xffff;
        else {
          const at = rangeOffs + i * 2 + ro + (c - start) * 2;
          glyph = inBounds(t, at, 2) ? t.getUint16(at) : 0;
          if (glyph) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph) {
          if (runStart < 0) runStart = c;
        } else if (runStart >= 0) {
          push(runStart, c - 1);
          runStart = -1;
        }
      }
      if (runStart >= 0) push(runStart, end);
    }
  }
  return out;
}

function countIn(ranges: [number, number][], a: number, b: number): number {
  let n = 0;
  for (const [s, e] of ranges) {
    if (e < a) continue;
    if (s > b) break;
    n += Math.min(e, b) - Math.max(s, a) + 1;
  }
  return n;
}

export function hasCodepoint(ranges: [number, number][], cp: number): boolean {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const [s, e] = ranges[mid];
    if (cp < s) hi = mid - 1;
    else if (cp > e) lo = mid + 1;
    else return true;
  }
  return false;
}

const BUCKETS: { key: string; label: string; spans: [number, number][] }[] = [
  { key: "latin", label: "拉丁", spans: [[0x20, 0x7e]] },
  { key: "latin1", label: "拉丁扩展", spans: [[0xa0, 0xff], [0x100, 0x17f]] },
  { key: "cjk", label: "汉字", spans: [[0x4e00, 0x9fff]] },
  { key: "cjkp", label: "中文标点", spans: [[0x3000, 0x303f], [0xff00, 0xffef]] },
  { key: "kana", label: "假名", spans: [[0x3040, 0x30ff]] },
  { key: "hangul", label: "谚文", spans: [[0xac00, 0xd7a3]] },
  { key: "greek", label: "希腊", spans: [[0x370, 0x3ff]] },
  { key: "cyrillic", label: "西里尔", spans: [[0x400, 0x4ff]] },
];

// ── fvar / misc ──
function readAxes(t: DataView | undefined, names: NameRec[]): FontAxis[] {
  if (!t || t.byteLength < 16) return [];
  const axesOff = t.getUint16(4);
  const count = t.getUint16(8);
  const size = t.getUint16(10);
  const fixed = (o: number) => t.getInt32(o) / 65536;
  const out: FontAxis[] = [];
  for (let i = 0; i < count; i += 1) {
    const r = axesOff + i * size;
    if (!inBounds(t, r, 20)) break;
    const tag = tagOf(t, r);
    const nameId = t.getUint16(r + 18);
    out.push({
      tag,
      min: fixed(r + 4),
      def: fixed(r + 8),
      max: fixed(r + 12),
      name: AXIS_NAMES[tag] || pickName(names, nameId) || tag,
    });
  }
  return out;
}

const AXIS_NAMES: Record<string, string> = { wght: "字重", wdth: "字宽", ital: "斜体", slnt: "倾斜", opsz: "视觉尺寸" };

function emptyInfo(format: FontFormat, note = ""): FontInfo {
  return {
    format,
    family: "",
    subfamily: "",
    version: "",
    designer: "",
    glyphs: 0,
    ranges: [],
    coverage: [],
    hasCjk: false,
    italic: false,
    weight: 400,
    axes: [],
    note,
  };
}

export async function parseFont(buffer: ArrayBuffer): Promise<FontInfo> {
  try {
    const v = new DataView(buffer);
    const format = sniff(v);
    if (format === "woff2") return emptyInfo(format, "WOFF2 采用 Brotli 压缩，暂不解析字体内部信息");
    if (format === "unknown") return emptyInfo(format, "无法识别的字体格式");
    let tables: Tables;
    if (format === "woff") tables = await woffTables(v);
    else if (format === "ttc") tables = v.byteLength >= 16 ? sfntTables(v, v.getUint32(12)) : new Map();
    else tables = sfntTables(v, 0);

    const info = emptyInfo(format, format === "ttc" ? "字体集合（TTC），显示第一个字体" : "");
    const names = readNames(tables.get("name"));
    info.family = pickName(names, 16, 1);
    info.subfamily = pickName(names, 17, 2);
    // "Version 2.004-H2;hotconv 1.0.118;…" → "2.004-H2"
    info.version = pickName(names, 5).replace(/^Version\s*/i, "").split(";")[0].trim();
    info.designer = pickName(names, 9, 8);

    const maxp = tables.get("maxp");
    if (maxp && maxp.byteLength >= 6) info.glyphs = maxp.getUint16(4);

    info.ranges = cmapRanges(tables.get("cmap"));
    info.coverage = BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      total: b.spans.reduce((n, [a, z]) => n + z - a + 1, 0),
      have: b.spans.reduce((n, [a, z]) => n + countIn(info.ranges, a, z), 0),
    }));
    info.hasCjk = (info.coverage.find((c) => c.key === "cjk")?.have ?? 0) > 0;

    const os2 = tables.get("OS/2");
    if (os2 && os2.byteLength >= 64) {
      info.weight = os2.getUint16(4);
      info.italic = (os2.getUint16(62) & 1) === 1;
    }
    const head = tables.get("head");
    if (head && head.byteLength >= 46 && head.getUint16(44) & 2) info.italic = true;
    if (/italic|oblique|斜/i.test(info.subfamily)) info.italic = true;

    info.axes = readAxes(tables.get("fvar"), names);
    return info;
  } catch {
    return emptyInfo("unknown", "读取字体信息失败");
  }
}
