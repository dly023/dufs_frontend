/**
 * Hand a media URL to a desktop player. Browsers can't launch apps directly,
 * so we use custom protocol schemes and clipboard-friendly commands.
 * Works only when the URL is reachable from the user's machine (no auth blob).
 */

export interface PlayerTarget {
  id: string;
  label: string;
  /** `null` = clipboard-only (no protocol scheme). */
  scheme: string | null;
}

const PLAYERS: PlayerTarget[] = [
  { id: "iina", label: "IINA (macOS)", scheme: "iina://weblink?url={enc}" },
  { id: "vlc", label: "VLC", scheme: "vlc://stream?url={enc}" },
  { id: "potplayer", label: "PotPlayer (Windows)", scheme: "potplayer://{raw}" },
];

export const playerList = PLAYERS;

export function playerSchemeUrl(target: PlayerTarget, url: string): string | null {
  if (!target.scheme) return null;
  return target.scheme.replace("{enc}", encodeURIComponent(url)).replace("{raw}", url);
}

/** `mpv "https://…"` — quote args the way shells want, incl. Windows backslashes. */
function shellQuote(arg: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg;
  return `"${arg.replace(/(["\\])/g, "\\$1")}"`;
}

export function mpvCommand(url: string): string {
  return `mpv ${shellQuote(url)}`;
}

export function vlcCommand(url: string): string {
  return `vlc ${shellQuote(url)}`;
}

/**
 * Build an M3U playlist for a set of sibling media files.
 * Returns a download if the caller supplies it; we hand back the text so the
 * caller can pick blob vs. clipboard.
 */
export function m3uPlaylist(entries: { name: string; url: string }[]): string {
  const lines = ["#EXTM3U"];
  for (const e of entries) {
    lines.push(`#EXTINF:-1,${e.name.replace(/\r?\n/g, " ")}`);
    lines.push(e.url);
  }
  return lines.join("\n") + "\n";
}

/** Blob URL for the playlist, ready for `<a download>`. Caller revokes. */
export function m3uBlobUrl(entries: { name: string; url: string }[]): { url: string; revoke: () => void } {
  const url = URL.createObjectURL(new Blob([m3uPlaylist(entries)], { type: "audio/x-mpegurl" }));
  return { url, revoke: () => URL.revokeObjectURL(url) };
}

/** Filesystem-safe name for the downloaded playlist. */
export function playlistName(base: string): string {
  return `${base.replace(/[\\/:*?"<>|]+/g, "_").trim() || "playlist"}.m3u`;
}
