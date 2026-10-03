/**
 * Should a media player take this key? Only when it is the player's moment
 * (focused, or the full-screen reader), and never from inputs, dialogs, menus
 * or keys another layer already handled.
 */
export function playerOwnsKey(e: KeyboardEvent, root: HTMLElement | undefined, fullView: boolean): boolean {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return false;
  const t = e.target as HTMLElement | null;
  if (t?.closest("textarea, select, [contenteditable]")) return false;
  if (t instanceof HTMLInputElement && !["checkbox", "radio", "range", "button"].includes(t.type)) return false;
  if (document.querySelector(".modal, .menu, .click-away")) return false;
  if (!root || !root.isConnected) return false;
  return fullView || root.contains(document.activeElement);
}
