import { monotonicFactory } from 'ulid';

const next = monotonicFactory();

/** A ULID: unique, and sorts by creation time. */
export function newId(): string {
  return next();
}
