import clsx from 'clsx';
import { lazy, Suspense } from 'react';
import { RichTextPreview } from '@/components/RichTextPreview';
import { parseDoc } from '@/lib/richText';
import type { RichTextEditorProps } from './RichTextEditor';

// TipTap is large, so the editor loads separately the first time it's shown.
const RichTextEditor = lazy(() =>
  import('./RichTextEditor').then((m) => ({ default: m.RichTextEditor })),
);

/** The rich-text editor, showing a read-only preview of the content while it loads. */
export function RichTextField(props: RichTextEditorProps) {
  const doc = parseDoc(props.content);
  const fallback = (
    <div className={props.className}>
      {props.variant === 'note' && !props.readOnly && <div className="mb-3 h-10" />}
      <div
        className={clsx(
          props.variant === 'note' ? 'min-h-[50vh] text-[15px]' : 'min-h-24 px-2 py-1.5 text-sm',
        )}
      >
        {doc && (
          <RichTextPreview
            doc={doc}
            className={props.variant === 'compact' ? 'rich-text-compact' : undefined}
          />
        )}
      </div>
    </div>
  );
  return (
    <Suspense fallback={fallback}>
      <RichTextEditor {...props} />
    </Suspense>
  );
}
