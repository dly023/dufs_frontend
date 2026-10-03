/**
 * Filter store for local client-side directory filtering.
 * Updates immediately or debounced, and filters directory items by name substring without network request.
 */
class FilterStore {
  query = $state("");

  set(q: string) {
    this.query = q;
  }

  clear() {
    this.query = "";
  }
}

export const localFilter = new FilterStore();
