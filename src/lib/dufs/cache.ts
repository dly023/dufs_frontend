export class LRUCache<K, V> {
  private map = new Map<K, V>();
  constructor(
    private max = 20,
    private onEvict?: (value: V, key: K) => void,
  ) {}

  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, v);
    return v;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value;
      if (first !== undefined) {
        const evicted = this.map.get(first);
        this.map.delete(first);
        if (evicted !== undefined) this.onEvict?.(evicted, first);
      }
    }
  }

  clear(): void {
    if (this.onEvict) for (const [k, v] of this.map) this.onEvict(v, k);
    this.map.clear();
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  keys(): K[] {
    return [...this.map.keys()];
  }
}

/**
 * A small, size-capped sessionStorage mirror of recent directory listings, so a
 * reload (or a revisit after the in-memory LRU evicted it) can paint instantly.
 * Entries are tagged with a credential fingerprint and ignored after it changes.
 */
export class SessionMirror<V> {
  private index: string[] = [];

  constructor(
    private prefix: string,
    private maxEntries = 30,
    private maxEntryChars = 200_000,
  ) {
    try {
      this.index = JSON.parse(sessionStorage.getItem(`${prefix}index`) ?? "[]") as string[];
    } catch {
      this.index = [];
    }
  }

  get(key: string, tag: string): V | undefined {
    try {
      const raw = sessionStorage.getItem(this.prefix + key);
      if (!raw) return undefined;
      const entry = JSON.parse(raw) as { t: string; v: V };
      return entry.t === tag ? entry.v : undefined;
    } catch {
      return undefined;
    }
  }

  set(key: string, tag: string, value: V): void {
    try {
      const raw = JSON.stringify({ t: tag, v: value });
      if (raw.length > this.maxEntryChars) return;
      sessionStorage.setItem(this.prefix + key, raw);
      this.index = [key, ...this.index.filter((k) => k !== key)];
      for (const old of this.index.splice(this.maxEntries)) sessionStorage.removeItem(this.prefix + old);
      sessionStorage.setItem(`${this.prefix}index`, JSON.stringify(this.index));
    } catch {
      // Quota or storage disabled: the mirror is best-effort.
    }
  }

  delete(key: string): void {
    try {
      sessionStorage.removeItem(this.prefix + key);
      this.index = this.index.filter((k) => k !== key);
      sessionStorage.setItem(`${this.prefix}index`, JSON.stringify(this.index));
    } catch {
      /* ignore */
    }
  }

  clear(): void {
    try {
      for (const k of this.index) sessionStorage.removeItem(this.prefix + k);
      sessionStorage.removeItem(`${this.prefix}index`);
    } catch {
      /* ignore */
    }
    this.index = [];
  }

  keys(): string[] {
    return [...this.index];
  }
}
