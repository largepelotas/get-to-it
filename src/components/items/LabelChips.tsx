import { openLabel } from '@/store/ui';
import type { Label } from '@/data/types';
import { LabelDot } from './LabelPicker';

/** A task's labels as small chips. Each opens that label's view; none is a tab stop. */
export function LabelChips({ labels }: { labels: Label[] }) {
  if (!labels.length) return null;
  return (
    <span className="flex max-w-56 min-w-0 items-center gap-1 overflow-hidden">
      {labels.map((label) => (
        <button
          key={label.id}
          type="button"
          tabIndex={-1}
          aria-label={`Label ${label.name}, open`}
          title={label.name}
          onClick={(e) => {
            e.stopPropagation();
            openLabel(label.id);
          }}
          className="flex max-w-28 min-w-0 shrink-0 items-center gap-1 rounded-full border border-line px-1.5 py-px text-[11px] leading-4 text-fg-muted hover:bg-line hover:text-fg"
        >
          <LabelDot color={label.color} />
          <span className="truncate">{label.name}</span>
        </button>
      ))}
    </span>
  );
}
