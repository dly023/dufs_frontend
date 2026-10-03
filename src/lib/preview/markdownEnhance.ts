import type { PathItem } from "../dufs/types";
import { fetchBlobUrl } from "../dufs/client";
import { auth } from "../../stores/auth.svelte";
import { navigateTo } from "../../actions/navigate";
import { copyText } from "../../actions/files";
import { highlightJson } from "../highlight/json";
import { ICONS } from "../icons";

/**
 * Svelte action applied to rendered Markdown (`use:enhanceMarkdown={item}`).
 *
 * The markup comes from `renderMarkdownSafe` (sanitized) and is injected with
 * {@html} after mount, so a MutationObserver re-runs the passes; every pass is
 * idempotent (processed nodes are marked) so our own edits settle immediately.
 *
 * Links into the dufs tree never hard-navigate the SPA away:
 * - folders → SPA navigation;
 * - files → a cancelable `dufs:open-path` CustomEvent on window
 *   (`detail: { path }`, an encoded dufs path). A listener that handles it calls
 *   `preventDefault()`; if nobody does, the file opens in a new tab.
 */

const svg = (name: keyof typeof ICONS) =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/** Directory of a file's encoded fullpath, with trailing slash. */
function baseOf(item: PathItem): string {
  const p = item.fullpath;
  return item.is_dir ? `${p.replace(/\/+$/, "")}/` : p.slice(0, p.lastIndexOf("/") + 1) || "/";
}

type Target = { kind: "external"; href: string } | { kind: "anchor"; id: string } | { kind: "tree"; path: string; hash: string };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

function resolve(raw: string, base: string): Target | null {
  const href = raw.trim();
  if (!href) return null;
  if (href.startsWith("#")) return { kind: "anchor", id: decodeURIComponent(href.slice(1)) };
  if (SCHEME.test(href) || href.startsWith("//")) {
    let url: URL;
    try {
      url = new URL(href, location.href);
    } catch {
      return null;
    }
    if (url.origin !== location.origin) return { kind: "external", href: url.href };
    return { kind: "tree", path: url.pathname, hash: url.hash };
  }
  try {
    const url = new URL(href, `${location.origin}${base}`);
    return { kind: "tree", path: url.pathname, hash: url.hash };
  } catch {
    return null;
  }
}

/** CJK-safe slug: letters/numbers of any script, everything else → "-". */
function slugify(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "section"
  );
}

function enhanceHeadings(root: HTMLElement) {
  const used = new Set<string>();
  for (const h of root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
    if (h.dataset.anchor) {
      used.add(h.dataset.anchor);
      continue;
    }
    let slug = slugify(h.textContent ?? "");
    for (let n = 2; used.has(slug); n += 1) slug = `${slugify(h.textContent ?? "")}-${n}`;
    used.add(slug);
    h.dataset.anchor = slug;
    // Prefixed so a heading can never collide with the app's own ids.
    h.id = `md-${slug}`;
    const a = document.createElement("a");
    a.className = "h-anchor";
    a.href = `#${slug}`;
    a.setAttribute("aria-label", "链接到此标题");
    a.textContent = "#";
    h.append(a);
  }
}

function scrollToAnchor(root: HTMLElement, id: string) {
  const target =
    root.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(id)}"]`) ??
    root.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(slugify(id))}"]`) ??
    root.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"], [name="${CSS.escape(id)}"]`);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function enhanceLinks(root: HTMLElement, base: string) {
  for (const a of root.querySelectorAll<HTMLAnchorElement>("a[href]:not([data-md])")) {
    a.dataset.md = "1";
    if (a.classList.contains("h-anchor")) continue;
    const t = resolve(a.getAttribute("href") ?? "", base);
    if (!t) continue;
    if (t.kind === "external") {
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else if (t.kind === "tree") {
      // Real absolute href, so copy-link / middle-click / new-tab all work.
      a.href = t.path + t.hash;
      a.dataset.tree = t.path;
    }
  }
}

function enhanceImages(root: HTMLElement, base: string) {
  for (const img of root.querySelectorAll<HTMLImageElement>("img[data-src]")) {
    const raw = img.dataset.src ?? "";
    img.removeAttribute("data-src");
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("load", () => img.classList.add("is-loaded"), { once: true });
    const t = resolve(raw, base);
    if (!t || t.kind === "anchor") continue;
    if (t.kind === "external") {
      img.referrerPolicy = "no-referrer";
      img.src = t.href;
    } else if (auth.isAuthed) {
      // <img> cannot send the Basic header: fetch the bytes instead.
      fetchBlobUrl(t.path)
        .then((url) => (img.src = url))
        .catch(() => img.classList.add("is-broken"));
    } else {
      img.src = t.path;
    }
  }
}

function enhanceCode(root: HTMLElement) {
  for (const code of root.querySelectorAll<HTMLElement>("pre > code:not([data-md])")) {
    code.dataset.md = "1";
    const pre = code.parentElement as HTMLElement;
    const lang = (/language-([\w+#.-]+)/.exec(code.className)?.[1] ?? "").toLowerCase();
    const text = code.textContent ?? "";
    const paint = (html: string | null) => {
      if (html === null || code.textContent !== text) return;
      code.innerHTML = html;
      code.classList.add("code-json");
    };
    if (lang === "json" || lang === "jsonl" || lang === "json5") paint(highlightJson(text));
    // The general highlighter is its own chunk: fences render now, colour follows.
    else if (lang) void import("../highlight/code").then((m) => paint(m.highlightCode(text, lang)));
    const wrap = document.createElement("div");
    wrap.className = "code-wrap";
    const bar = document.createElement("div");
    bar.className = "code-bar";
    if (lang) {
      const label = document.createElement("span");
      label.className = "code-lang";
      label.textContent = lang;
      bar.append(label);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "code-copy";
    btn.title = "复制代码";
    btn.innerHTML = svg("copy") + svg("check");
    btn.addEventListener("click", () => {
      void copyText(text.replace(/\n$/, "")).then(() => {
        btn.classList.add("is-done");
        setTimeout(() => btn.classList.remove("is-done"), 1400);
      });
    });
    bar.append(btn);
    pre.replaceWith(wrap);
    wrap.append(bar, pre);
  }
}

function enhanceBlocks(root: HTMLElement) {
  // Wide tables scroll on their own instead of stretching the page.
  for (const table of root.querySelectorAll<HTMLTableElement>("table:not([data-md])")) {
    table.dataset.md = "1";
    if (table.parentElement?.classList.contains("table-wrap")) continue;
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    table.replaceWith(wrap);
    wrap.append(table);
  }
  // Task lists: read-only checkboxes in the app's own style.
  for (const box of root.querySelectorAll<HTMLInputElement>("li > input[type=checkbox]:not([data-md])")) {
    box.dataset.md = "1";
    box.classList.add("check");
    box.disabled = true;
    box.tabIndex = -1;
    box.parentElement?.classList.add("task");
    box.closest("ul, ol")?.classList.add("task-list");
  }
}

export function enhanceMarkdown(node: HTMLElement, item: PathItem) {
  let current = item;

  function run() {
    const base = baseOf(current);
    enhanceHeadings(node);
    enhanceLinks(node, base);
    enhanceImages(node, base);
    enhanceCode(node);
    enhanceBlocks(node);
  }

  function onClick(e: MouseEvent) {
    const a = (e.target as Element).closest<HTMLAnchorElement>("a[href]");
    if (!a || !node.contains(a)) return;
    const href = a.getAttribute("href") ?? "";
    if (href.startsWith("#")) {
      e.preventDefault();
      scrollToAnchor(node, decodeURIComponent(href.slice(1)));
      return;
    }
    const path = a.dataset.tree;
    // Let the browser handle modified clicks (new tab / window) with the real href.
    if (!path || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (path.endsWith("/")) {
      navigateTo(path);
      return;
    }
    const handled = !window.dispatchEvent(new CustomEvent("dufs:open-path", { detail: { path }, cancelable: true }));
    if (!handled) window.open(a.href, "_blank", "noopener,noreferrer");
  }

  const observer = new MutationObserver(run);
  observer.observe(node, { childList: true });
  node.addEventListener("click", onClick);
  run();

  return {
    update(next: PathItem) {
      current = next;
      run();
    },
    destroy() {
      observer.disconnect();
      node.removeEventListener("click", onClick);
    },
  };
}
