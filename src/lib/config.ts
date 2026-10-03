import type { ThemeMode, ViewMode } from "../stores/prefs.svelte";

/**
 * Optional site configuration for self-hosters, read once from
 * `window.__DUFS_CONFIG__` (defined in the deployed index.html; no rebuild).
 * Every key is optional; invalid values are ignored with a single warning.
 */
export interface SiteConfig {
  /** Site name; replaces the host at the end of the tab title. */
  title?: string;
  /** Accent hue 0–360 (OKLCH); the whole accent family derives from it. */
  accentHue?: number;
  /** Markdown shown quietly at the end of every listing (e.g. 备案号). */
  footer?: string;
  /** View used until the visitor picks one. */
  defaultView?: ViewMode;
  /** Theme used until the visitor picks one. */
  defaultTheme?: ThemeMode;
}

declare global {
  interface Window {
    __DUFS_CONFIG__?: unknown;
  }
}

const VIEWS: readonly ViewMode[] = ["gallery", "grid", "list"];
const THEMES: readonly ThemeMode[] = ["system", "light", "dark", "oled"];

function read(): Readonly<SiteConfig> {
  const raw = typeof window === "undefined" ? undefined : window.__DUFS_CONFIG__;
  if (raw === undefined || raw === null) return Object.freeze({});
  const problems: string[] = [];
  if (typeof raw !== "object" || Array.isArray(raw)) {
    console.warn("[dufs] __DUFS_CONFIG__ should be an object; ignored.");
    return Object.freeze({});
  }
  const src = raw as Record<string, unknown>;
  const out: SiteConfig = {};

  if (src.title !== undefined) {
    if (typeof src.title === "string" && src.title.trim()) out.title = src.title.trim().slice(0, 80);
    else problems.push("title (non-empty string)");
  }
  if (src.accentHue !== undefined) {
    const h = src.accentHue;
    if (typeof h === "number" && Number.isFinite(h) && h >= 0 && h <= 360) out.accentHue = h;
    else problems.push("accentHue (number 0–360)");
  }
  if (src.footer !== undefined) {
    if (typeof src.footer === "string" && src.footer.trim()) out.footer = src.footer.slice(0, 4000);
    else problems.push("footer (Markdown string)");
  }
  if (src.defaultView !== undefined) {
    if (VIEWS.includes(src.defaultView as ViewMode)) out.defaultView = src.defaultView as ViewMode;
    else problems.push(`defaultView (${VIEWS.join(" | ")})`);
  }
  if (src.defaultTheme !== undefined) {
    if (THEMES.includes(src.defaultTheme as ThemeMode)) out.defaultTheme = src.defaultTheme as ThemeMode;
    else problems.push(`defaultTheme (${THEMES.join(" | ")})`);
  }
  const known = new Set(["title", "accentHue", "footer", "defaultView", "defaultTheme"]);
  for (const k of Object.keys(src)) if (!known.has(k)) problems.push(`unknown key "${k}"`);

  if (problems.length) console.warn(`[dufs] __DUFS_CONFIG__: ignored ${problems.join(", ")}.`);
  return Object.freeze(out);
}

export const siteConfig: Readonly<SiteConfig> = read();

/** True when the visitor has stored their own choice under this key. */
function hasSaved(key: string): boolean {
  try {
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/**
 * Apply config before the first render. Defaults never overwrite a visitor's
 * saved choice and are not persisted, so changing the config later still
 * reaches visitors who never picked anything themselves.
 */
export function applySiteConfig(prefs: { viewMode: ViewMode; theme: ThemeMode }): void {
  if (siteConfig.accentHue !== undefined) {
    document.documentElement.style.setProperty("--accent-h", String(siteConfig.accentHue));
  }
  if (siteConfig.defaultView && !hasSaved("dufs-view")) prefs.viewMode = siteConfig.defaultView;
  if (siteConfig.defaultTheme && !hasSaved("dufs-theme")) prefs.theme = siteConfig.defaultTheme;
}
