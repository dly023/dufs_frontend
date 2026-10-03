import { auth } from "../../stores/auth.svelte";
import { getToken } from "./client";

/**
 * Cache tokens briefly per path/endpoint.
 * dufs tokengen produces short-lived tokens (typically valid for several minutes).
 * We cache for 60 seconds to avoid repeating tokengen on rapid clicks.
 */
interface CachedToken {
  token: string;
  expiresAt: number;
}
const tokenCache = new Map<string, CachedToken>();
const TOKEN_TTL_MS = 60_000;

async function getCachedToken(path: string, isDir: boolean): Promise<string> {
  const key = `${path}::${isDir ? "zip" : "file"}`;
  const now = Date.now();
  const hit = tokenCache.get(key);
  if (hit && hit.expiresAt > now) {
    return hit.token;
  }
  const token = (await getToken(path, isDir)).trim();
  tokenCache.set(key, { token, expiresAt: now + TOKEN_TTL_MS });
  return token;
}

/**
 * Build tokenized download/view URL.
 * In dufs:
 * - for zip: `fullpath?zip&token=...`
 * - for file: `fullpath?token=...`
 */
function buildTokenUrl(href: string, token: string): string {
  const url = new URL(href, window.location.href);
  url.searchParams.set("token", token);
  return url.toString();
}

/**
 * Global interceptor installed once on document in capture phase.
 * Only activates when `auth.isAuthed` is true.
 * Intercepts clicks on same-origin <a> tags pointing to dufs file/folder paths.
 */
export function setupAuthLinksInterceptor() {
  const bypassingAnchors = new WeakSet<HTMLAnchorElement>();

  async function handleLinkClick(e: MouseEvent, isAux = false) {
    // Only intercept when authenticated
    if (!auth.isAuthed) return;

    // Must be primary button or middle button (auxclick button === 1)
    if (isAux && e.button !== 1) return;
    if (!isAux && e.button !== 0) return;

    const target = e.target as HTMLElement | null;
    const anchor = target?.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;

    // Check if anchor is re-dispatched pass-through fallback
    if (bypassingAnchors.has(anchor)) return;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("blob:") || href.startsWith("data:")) {
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(anchor.href, window.location.href);
    } catch {
      return;
    }

    // Must be same-origin, and not already carrying a token (our own tokenized
    // anchors would otherwise be intercepted again, forever).
    if (parsed.origin !== window.location.origin) return;
    if (parsed.searchParams.has("token")) return;

    // Don't intercept SPA static assets (e.g. /assets/...) or api calls
    const pathname = parsed.pathname;
    if (pathname.startsWith("/assets/") || pathname.startsWith("/@vite/") || pathname.startsWith("/@fs/")) {
      return;
    }

    // Check if link is a download link, file link, or directory zip
    const isZip = parsed.searchParams.has("zip");
    const isDownload = anchor.hasAttribute("download") || isZip;
    const isTargetBlank = anchor.target === "_blank";
    const isNewTab = e.metaKey || e.ctrlKey || e.button === 1 || isTargetBlank;

    // If it's an in-app SPA route navigation (no download, no zip, not external, not file preview link),
    // let Svelte / SPA router handle it.
    // In dufs, download links always have `download` attribute, `?zip`, or are opened in new tab.
    if (!isDownload && !isNewTab && !pathname.endsWith("/") && !anchor.hasAttribute("target")) {
      // Normal click without target=_blank and not download: check if it's meant to be downloaded or opened directly
      return;
    }

    // Stop standard unauthenticated navigation/download
    e.preventDefault();
    e.stopPropagation();

    try {
      const isDir = isZip || pathname.endsWith("/");
      const cleanPath = pathname;
      const token = await getCachedToken(cleanPath, isDir);
      const tokenUrl = buildTokenUrl(anchor.href, token);

      if (isNewTab && !isDownload) {
        window.open(tokenUrl, "_blank", "noopener,noreferrer");
      } else {
        // Trigger download with proper filename preservation
        const tempA = document.createElement("a");
        tempA.href = tokenUrl;
        const dlAttr = anchor.getAttribute("download");
        if (dlAttr !== null && dlAttr !== "") {
          tempA.download = dlAttr;
        } else if (isZip) {
          const folderName = cleanPath.replace(/\/+$/, "").split("/").pop() || "archive";
          tempA.download = `${folderName}.zip`;
        } else {
          tempA.download = cleanPath.split("/").pop() || "download";
        }
        tempA.style.display = "none";
        bypassingAnchors.add(tempA);
        document.body.appendChild(tempA);
        tempA.click();
        document.body.removeChild(tempA);
      }
    } catch (err) {
      console.warn("[dufs auth link] token fetch failed, falling back to original click:", err);
      bypassingAnchors.add(anchor);
      try {
        anchor.click();
      } finally {
        setTimeout(() => bypassingAnchors.delete(anchor), 100);
      }
    }
  }

  document.addEventListener("click", (e) => void handleLinkClick(e, false), true);
  document.addEventListener("auxclick", (e) => void handleLinkClick(e, true), true);
}
