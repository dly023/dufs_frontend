class SelectionStore {
  selected = $state<Set<string>>(new Set());
  /** Anchor index for shift-range selection. */
  lastIndex = -1;

  get size() {
    return this.selected.size;
  }

  has(path: string) {
    return this.selected.has(path);
  }

  toggle(path: string) {
    const next = new Set(this.selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    this.selected = next;
  }

  setSelected(path: string, on: boolean) {
    if (on === this.selected.has(path)) return;
    const next = new Set(this.selected);
    if (on) next.add(path);
    else next.delete(path);
    this.selected = next;
  }

  /** Explicit membership change that also moves the shift-range anchor. */
  setAt(path: string, on: boolean, index: number) {
    this.setSelected(path, on);
    this.lastIndex = index;
  }

  /**
   * Toggle with optional shift-range. `shift` extends from the last anchor to
   * `index` within `order`; otherwise it is a plain toggle.
   */
  toggleAt(path: string, index: number, order: string[], shift: boolean) {
    if (shift && this.lastIndex >= 0) {
      const start = Math.min(this.lastIndex, index);
      const end = Math.max(this.lastIndex, index);
      const next = new Set(this.selected);
      for (let i = start; i <= end; i += 1) next.add(order[i]);
      this.selected = next;
    } else {
      this.toggle(path);
    }
    this.lastIndex = index;
  }

  clear() {
    this.selected = new Set();
    this.lastIndex = -1;
  }

  selectAll(paths: string[]) {
    this.selected = new Set(paths);
    this.lastIndex = -1;
  }
}

export const selection = new SelectionStore();
