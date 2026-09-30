import { useRef, useState } from 'react';

export interface RenameFieldProps {
  initial: string;
  label: string;
  onCommit: (value: string) => void;
  onDone: () => void;
}

/** Inline text field for renaming a sidebar row. Enter or blur saves, Escape cancels. */
export function RenameField({ initial, label, onCommit, onDone }: RenameFieldProps) {
  const [value, setValue] = useState(initial);
  // Enter and the blur that follows unmounting must only save once.
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save && value.trim() && value.trim() !== initial) onCommit(value);
    onDone();
  };
  return (
    <input
      aria-label={label}
      autoFocus
      value={value}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        else if (e.key === 'Escape') finish(false);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="h-6 min-w-0 flex-1 rounded border border-accent bg-surface px-1.5 text-[13px] text-fg outline-none"
    />
  );
}
