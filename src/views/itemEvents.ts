import type { PathItem } from "../lib/dufs/types";
import { selection } from "../stores/selection.svelte";
import { prefetchDirectory } from "../lib/dufs/client";
import { copyText } from "../actions/files";
import { ensureTrailingSlash } from "../lib/models/path";

/**
 * One delegated handler set per view instead of closures on every tile.
 * Tiles/rows carry `data-path`; controls inside them carry `data-act`.
 */
export interface ItemEventOptions {
  items: () => PathItem[];
  /** Plain activation (click / Enter) of an item. */
  onOpen: (item: PathItem) => void;
  /** Double click on a file. */
  onFull: (item: PathItem) => void;
  onContextMenu: (e: MouseEvent, item: PathItem) => void;
  /** Read a folder as a comic straight from its parent. */
  onComic?: (item: PathItem) => void;
  /** OS files dropped onto a folder tile/row go into that folder. */
  onDropInto?: (folder: PathItem, dt: DataTransfer) => void;
  /** Whether dropping is allowed right now (e.g. upload permission). */
  canDrop?: () => boolean;
}

function linkOf(item: PathItem): string {
  return `${location.origin}${item.fullpath}${item.is_dir ? "/" : ""}`;
}

export function itemEvents(o: ItemEventOptions) {
  let index = new Map<string, number>();
  let indexed: PathItem[] | null = null;

  function lookup(e: Event): { el: HTMLElement; item: PathItem; i: number; act?: string; actEl?: HTMLElement } | null {
    const target = e.target as Element;
    const el = target.closest<HTMLElement>("[data-path]");
    if (!el) return null;
    const list = o.items();
    if (list !== indexed) {
      indexed = list;
      index = new Map(list.map((p, i) => [p.fullpath, i]));
    }
    const i = index.get(el.dataset.path!);
    if (i === undefined) return null;
    const actEl = target.closest<HTMLElement>("[data-act]") ?? undefined;
    return { el, item: list[i], i, act: actEl?.dataset.act, actEl };
  }

  function toggle(hit: { item: PathItem; i: number }, shift: boolean) {
    selection.toggleAt(hit.item.fullpath, hit.i, o.items().map((p) => p.fullpath), shift);
  }

  // Touch: long-press starts a selection (and swallows the click that follows).
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let pressed = false;
  let pressAt = { x: 0, y: 0 };

  // Drop target: the folder under the pointer while OS files are dragged over.
  let dropEl: HTMLElement | null = null;
  function setDropTarget(el: HTMLElement | null) {
    if (dropEl === el) return;
    dropEl?.classList.remove("is-drop-target");
    dropEl = el;
    el?.classList.add("is-drop-target");
    // Lets the page-level "drop to upload here" overlay step aside for the folder.
    document.documentElement.classList.toggle("drop-into-folder", !!el);
  }
  const draggingFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
  const dropEnabled = (e: DragEvent) => !!o.onDropInto && draggingFiles(e) && (o.canDrop?.() ?? true);

  function flashDone(el: HTMLElement) {
    el.classList.add("is-done");
    setTimeout(() => el.classList.remove("is-done"), 1400);
  }

  return {
    onpointerdown(e: PointerEvent) {
      if (e.pointerType === "mouse") return;
      const hit = lookup(e);
      if (!hit || (hit.act && hit.act !== "open")) return;
      pressed = false;
      pressAt = { x: e.clientX, y: e.clientY };
      clearTimeout(pressTimer);
      pressTimer = setTimeout(() => {
        pressed = true;
        toggle(hit, false);
        navigator.vibrate?.(10);
      }, 480);
    },
    onpointerup() {
      clearTimeout(pressTimer);
    },
    onpointercancel() {
      clearTimeout(pressTimer);
    },
    onclick(e: MouseEvent) {
      if (pressed) {
        pressed = false;
        return;
      }
      const hit = lookup(e);
      if (!hit) return;
      switch (hit.act) {
        case "select":
          toggle(hit, e.shiftKey);
          return;
        case "copy":
          void copyText(linkOf(hit.item)).then(() => flashDone(hit.actEl!));
          return;
        case "download":
          return;
        case "comic":
          o.onComic?.(hit.item);
          return;
        case "more": {
          const r = hit.actEl!.getBoundingClientRect();
          o.onContextMenu(new MouseEvent("contextmenu", { clientX: r.right - 4, clientY: r.bottom + 4 }), hit.item);
          return;
        }
      }
      // While anything is selected, a click extends the selection instead of
      // opening — the same rule as every photo manager.
      if (e.shiftKey || e.metaKey || e.ctrlKey || selection.size > 0) {
        toggle(hit, e.shiftKey);
        return;
      }
      o.onOpen(hit.item);
    },
    ondblclick(e: MouseEvent) {
      const hit = lookup(e);
      if (!hit || hit.act !== undefined && hit.act !== "open") return;
      if (!hit.item.is_dir && selection.size === 0) o.onFull(hit.item);
    },
    oncontextmenu(e: MouseEvent) {
      const hit = lookup(e);
      if (!hit) return;
      e.preventDefault();
      // A long-press on touch fires contextmenu too; it already meant "select".
      if (pressed || (e as PointerEvent).pointerType === "touch") return;
      o.onContextMenu(e, hit.item);
    },
    onpointermove(e: PointerEvent) {
      if (e.pointerType !== "mouse" && Math.hypot(e.clientX - pressAt.x, e.clientY - pressAt.y) > 8) {
        clearTimeout(pressTimer);
      }
    },
    ondragover(e: DragEvent) {
      if (!dropEnabled(e)) return;
      const el = (e.target as Element).closest<HTMLElement>("[data-dir]");
      setDropTarget(el);
      if (el) {
        e.preventDefault();
        e.dataTransfer!.dropEffect = "copy";
      }
    },
    ondragleave(e: DragEvent) {
      const to = e.relatedTarget as Node | null;
      if (dropEl && (!to || !dropEl.contains(to))) setDropTarget(null);
    },
    ondrop(e: DragEvent) {
      setDropTarget(null);
      if (!dropEnabled(e)) return;
      const hit = lookup(e);
      if (!hit?.item.is_dir) return; // not on a folder: the page-level drop handles it
      e.preventDefault();
      e.stopPropagation();
      // Read the DataTransfer now — it is only accessible during this event.
      o.onDropInto!(hit.item, e.dataTransfer!);
      // The app's drop handler won't see this event; a data-less drop resets
      // its drag counter so the page overlay can't get stuck.
      document.querySelector(".app")?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true }));
    },
    onpointerover(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      const el = (e.target as Element).closest<HTMLElement>("[data-dir]");
      if (el) prefetchDirectory(ensureTrailingSlash(`${el.dataset.path}/`));
    },
  };
}

/** Grow a windowed list when its sentinel nears the viewport. */
export function nearEnd(node: HTMLElement, onReach: () => void) {
  let cb = onReach;
  const io = new IntersectionObserver((entries) => entries[0]?.isIntersecting && cb(), { rootMargin: "1200px 0px" });
  io.observe(node);
  return {
    update(next: () => void) {
      cb = next;
    },
    destroy() {
      io.disconnect();
    },
  };
}
