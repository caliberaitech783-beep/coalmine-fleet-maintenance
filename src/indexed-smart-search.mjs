import {normalizeSearchText} from '../smart-search.mjs';

// One index per immutable row collection. Build text only when a nonempty
// search needs it; subsequent queries reuse it instead of walking rich rows.
export function createRowSearchIndex() {
  const cache = new WeakMap();
  return query => {
    const tokens = normalizeSearchText(query).split(' ').filter(Boolean);
    if (!tokens.length) return () => true;
    return row => {
      const cacheable = row !== null && typeof row === 'object';
      let text = cacheable ? cache.get(row) : undefined;
      if (!text) {
        const normalized = normalizeSearchText(row);
        text = [normalized, normalized.replaceAll(' ', '')];
        if (cacheable) cache.set(row, text);
      }
      return tokens.every(token => text[0].includes(token) || text[1].includes(token));
    };
  };
}
