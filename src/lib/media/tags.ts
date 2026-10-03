/**
 * Minimal audio tag reader: ID3v2 (2.3/2.4) and MP4 (iTunes-style) atoms.
 * Reads only title / artist / album / cover — the fields the player shows.
 * The tag header sits at the start of the file, so a bounded Range request
 * is enough in the common case; large covers may fall outside the window
 * and are then silently skipped.
 */

export interface AudioTags {
  title?: string;
  artist?: string;
  album?: string;
  /** Data URL, ready for <img>. */
  cover?: string;
}

/** Tags sit at the file head; covers beyond this window are skipped. */
export const TAG_WINDOW = 512 * 1024;


// ── shared helpers ──

const td = (enc: string) => new TextDecoder(enc);

function blobToDataUrl(bytes: Uint8Array, mime: string): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `data:${mime || "image/jpeg"};base64,${btoa(bin)}`;
}

function decodeString(buf: Uint8Array): string {
  // 0x00 ISO-8859-1, 0x01 UTF-16 w/ BOM, 0x02 UTF-16BE, 0x03 UTF-8.
  if (!buf.length) return "";
  const enc = buf[0];
  const body = buf.subarray(1);
  if (enc === 1) {
    if (body[0] === 0xff && body[1] === 0xfe) return td("utf-16le").decode(body.subarray(2));
    if (body[0] === 0xfe && body[1] === 0xff) return td("utf-16be").decode(body.subarray(2));
    return td("utf-16le").decode(body);
  }
  if (enc === 2) return td("utf-16be").decode(body);
  if (enc === 3) return td("utf-8").decode(body);
  return td("iso-8859-1").decode(body).replace(/\0+$/, "");
}

// ── ID3v2 ──

function parseId3(view: DataView, bytes: Uint8Array): AudioTags {
  if (bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return {};
  const major = bytes[3];
  const flags = bytes[5];
  const size = syncSafe(view, 6);
  let offset = 10;
  if (flags & 0x40) {
    // Extended header: skip it.
    if (major === 4) offset += syncSafe(view, offset);
    else offset += 4 + view.getUint32(offset);
  }
  const end = Math.min(10 + size, bytes.length);
  const out: AudioTags = {};
  const frameHeaderSize = major === 2 ? 6 : 10;
  while (offset + frameHeaderSize <= end) {
    const raw3 = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
    const id = major === 2 ? raw3 : raw3 + String.fromCharCode(bytes[offset + 3]);
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break; // padding or garbage
    let frameSize: number;
    if (major === 2) frameSize = (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
    else if (major === 4) frameSize = syncSafe(view, offset + 4);
    else frameSize = view.getUint32(offset + 4);
    if (frameSize <= 0 || offset + frameHeaderSize + frameSize > end) break;
    const body = bytes.subarray(offset + frameHeaderSize, offset + frameHeaderSize + frameSize);
    // v2.2 names: TT2 title, TP1 artist, TAL album, PIC picture.
    const mapped = major === 2 ? { TT2: "TIT2", TP1: "TPE1", TAL: "TALB", PIC: "APIC" }[id] : id;
    if (mapped === "TIT2") out.title = decodeString(body);
    else if (mapped === "TPE1") out.artist = decodeString(body);
    else if (mapped === "TALB") out.album = decodeString(body);
    else if (mapped === "APIC") out.cover ??= readApic(body, major === 2);
    offset += frameHeaderSize + frameSize;
  }
  return out;
}

function syncSafe(view: DataView, off: number): number {
  return ((view.getUint8(off) & 0x7f) << 21) | ((view.getUint8(off + 1) & 0x7f) << 14) | ((view.getUint8(off + 2) & 0x7f) << 7) | (view.getUint8(off + 3) & 0x7f);
}

function readApic(body: Uint8Array, v2 = false): string | undefined {
  // APIC: enc(1) mime(z) type(1) desc(enc-term) data
  // v2.2 PIC: enc(1) format(3, e.g. "JPG") type(1) desc(enc-term) data
  const enc = body[0];
  let i = 1;
  let mime: string;
  if (v2) {
    mime = { JPG: "image/jpeg", PNG: "image/png" }[td("iso-8859-1").decode(body.subarray(1, 4))] ?? "image/jpeg";
    i = 4;
  } else {
    while (i < body.length && body[i] !== 0) i += 1;
    mime = td("iso-8859-1").decode(body.subarray(1, i));
    i += 1; // NUL
  }
  i += 1; // picture type
  if (enc === 1 || enc === 2) {
    while (i + 1 < body.length && !(body[i] === 0 && body[i + 1] === 0)) i += 2;
    i += 2;
  } else {
    while (i < body.length && body[i] !== 0) i += 1;
    i += 1;
  }
  if (i >= body.length) return undefined;
  return blobToDataUrl(body.subarray(i), mime);
}

// ── MP4 ──

const MP4_TAGS: Record<string, keyof AudioTags> = {
  "©nam": "title",
  "©ART": "artist",
  "©alb": "album",
};

function parseMp4(view: DataView, bytes: Uint8Array): AudioTags {
  if (view.getUint32(0) < 8) return {};
  const brand = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (brand !== "ftyp") return {};
  const out: AudioTags = {};
  scanMoov(view, bytes, 0, bytes.length, out);
  return out;
}

function scanMoov(view: DataView, bytes: Uint8Array, start: number, end: number, out: AudioTags) {
  let off = start;
  while (off + 8 <= end) {
    let size = view.getUint32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    let header = 8;
    if (size === 1) {
      if (off + 16 > end) break;
      size = Number(view.getBigUint64(off + 8));
      header = 16;
    } else if (size === 0) size = end - off;
    if (size < header || off + size > end) break;
    if (type === "moov" || type === "udta" || type === "trak" || type === "mdia" || type === "minf" || type === "stbl") {
      scanMoov(view, bytes, off + header, off + size, out);
    } else if (type === "meta") {
      // Full box: 4 bytes of version/flags follow the header.
      scanMoov(view, bytes, off + header + 4, off + size, out);
    } else if (type === "ilst") {
      scanIlst(view, bytes, off + header, off + size, out);
    }
    off += size;
  }
}

function scanIlst(view: DataView, bytes: Uint8Array, start: number, end: number, out: AudioTags) {
  let off = start;
  while (off + 8 <= end) {
    const size = view.getUint32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    if (size < 8 || off + size > end) break;
    // Each item: [size type][size 'data'][version flags(4) reserved(4)] payload
    const dataOff = off + 8;
    if (dataOff + 16 <= off + size && String.fromCharCode(bytes[dataOff + 4], bytes[dataOff + 5], bytes[dataOff + 6], bytes[dataOff + 7]) === "data") {
      const payload = bytes.subarray(dataOff + 16, off + size);
      const field = MP4_TAGS[type];
      if (field) out[field] = td("utf-8").decode(payload);
      else if (type === "covr" && !out.cover) out.cover = blobToDataUrl(payload, "image/jpeg");
    }
    off += size;
  }
}

// ── public entry ──

/** Read tags from raw header bytes. Returns {} when nothing usable is found. */
export function parseAudioTags(buf: ArrayBuffer): AudioTags {
  if (buf.byteLength < 16) return {};
  const bytes = new Uint8Array(buf);
  const view = new DataView(buf);
  const id3 = parseId3(view, bytes);
  if (id3.title || id3.artist || id3.album || id3.cover) return id3;
  const mp4 = parseMp4(view, bytes);
  if (mp4.title || mp4.artist || mp4.album || mp4.cover) return mp4;
  return {};
}
