import { flushSync } from "svelte";

/**
 * View Transition helpers. Every helper degrades to a plain synchronous update
 * when the API is missing or the user prefers reduced motion, so callers never
 * branch on support themselves.
 */

type VTDocument = Document & {
  startViewTransition?: (cb: () => void | Promise<void>) => {
    ready: Promise<void>;
    finished: Promise<void>;
  };
};

const doc = () => document as VTDocument;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function canTransition(): boolean {
  return typeof doc().startViewTransition === "function" && !reducedMotion();
}

/** Cross-fade the whole page across a state change (e.g. view mode switch). */
export function crossFade(update: () => void): void {
  if (!canTransition()) return update();
  doc().startViewTransition!(() => {
    update();
    flushSync();
  });
}

/** Reveal a theme change as a circle growing from (x, y). */
export function circleReveal(x: number, y: number, update: () => void): void {
  if (!canTransition()) return update();
  const root = document.documentElement;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.classList.add("vt-theme");
  const vt = doc().startViewTransition!(() => {
    update();
    flushSync();
  });
  vt.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 460, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
  vt.finished.finally(() => root.classList.remove("vt-theme"));
}

function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Morph `from` into whatever `findTarget` returns after `update` runs — a shared
 * element transition (thumbnail ⇄ reader). Either end may be missing; the page
 * then simply cross-fades.
 */
export function heroMorph(
  from: HTMLElement | null | undefined,
  update: () => void,
  findTarget: () => HTMLElement | null | undefined,
): void {
  if (!canTransition()) return update();
  const source = from && inViewport(from) ? from : null;
  if (source) source.style.viewTransitionName = "hero";
  let target: HTMLElement | null = null;
  const vt = doc().startViewTransition!(async () => {
    if (source) source.style.viewTransitionName = "";
    update();
    flushSync();
    const to = findTarget();
    if (source && to && inViewport(to)) {
      target = to;
      to.style.viewTransitionName = "hero";
      // Snapshot only once pixels exist, but never stall the UI for long.
      if (to instanceof HTMLImageElement && !to.complete) {
        await Promise.race([to.decode().catch(() => {}), wait(160)]);
      }
    }
  });
  vt.finished.finally(() => {
    if (target) target.style.viewTransitionName = "";
  });
}

/** Look up a rendered tile's thumbnail by item path. */
export function thumbOf(fullpath: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-path="${CSS.escape(fullpath)}"] img`);
}
