import type { ColorName } from '@/data/types';
import { colorVar } from '@/lib/theme';

/** A small dot showing a list colour, or an empty ring for none. */
export function Swatch({ color }: { color: ColorName | null }) {
  return color ? (
    <span className="size-2.5 rounded-full" style={{ background: colorVar(color) }} />
  ) : (
    <span className="size-2.5 rounded-full border border-fg-subtle" />
  );
}
