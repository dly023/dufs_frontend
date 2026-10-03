/**
 * Scroll position memory across directory navigation.
 * Stores up to 100 entries of path -> scrollTop.
 */
class ScrollMemoryStore {
  private map = new Map<string, number>();
  private readonly MAX_ENTRIES = 100;

  remember(path: string, y: number) {
    if (this.map.has(path)) {
      this.map.delete(path);
    }
    this.map.set(path, y);
    if (this.map.size > this.MAX_ENTRIES) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
  }

  get(path: string): number | undefined {
    return this.map.get(path);
  }

  has(path: string): boolean {
    return this.map.has(path);
  }
}

export const scrollMemory = new ScrollMemoryStore();
