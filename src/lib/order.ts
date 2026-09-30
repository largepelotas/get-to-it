import { generateKeyBetween } from 'fractional-indexing';

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function bySortKey<T extends { sortKey: string; id: string }>(a: T, b: T): number {
  return compareKeys(a.sortKey, b.sortKey) || compareKeys(a.id, b.id);
}

/**
 * A sort key that falls between two neighbours. Either side may be null for
 * "start" or "end". Duplicate or out-of-order neighbours (possible after an
 * import) fall back to placing the key just after `before`.
 */
export function keyBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    return generateKeyBetween(before, null);
  }
  return generateKeyBetween(before, after);
}

/** A key after every key in `keys`. */
export function keyAtEnd(keys: string[]): string {
  let max: string | null = null;
  for (const k of keys) if (max === null || k > max) max = k;
  return keyBetween(max, null);
}

/** A key before every key in `keys`. */
export function keyAtStart(keys: string[]): string {
  let min: string | null = null;
  for (const k of keys) if (min === null || k < min) min = k;
  return keyBetween(null, min);
}
