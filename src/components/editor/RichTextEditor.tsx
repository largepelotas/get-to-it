import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import clsx from 'clsx';
import { useEffect, useRef } from 'react';
import { emptyDoc, isDocEmpty, parseDoc, type RichNode } from '@/lib/richText';
import { isMac } from '@/platform';
import { EditorToolbar } from './EditorToolbar';
import { openClickedLink } from './openClickedLink';

export interface RichTextEditorProps {
  /** The stored TipTap JSON, or null for an empty doc. */
  content: string | null;
  onChange: (doc: RichNode) => void;
  readOnly?: boolean;
  /** `note` has the full toolbar above; `compact` (task notes) a small one below. */
  variant: 'note' | 'compact';
  label: string;
  placeholder?: string;
  className?: string;
}

function extensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        // Clicks are handled below, so links open in the default browser.
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: 'https',
        HTMLAttributes: { target: null, rel: 'noopener noreferrer nofollow' },
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder }),
  ];
}

/**
 * The TipTap editor for notes and task notes. It keeps its own undo history
 * while focused (the app's undo shortcuts ignore text fields) and follows the
 * stored content when something else changes it, such as the app's undo.
 */
export function RichTextEditor({
  content,
  onChange,
  readOnly = false,
  variant,
  label,
  placeholder = '',
  className,
}: RichTextEditorProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  // The content this editor last saved or loaded, to tell our own saves from outside changes.
  const known = useRef(content);

  const attributes = (readOnly: boolean): Record<string, string> => ({
    role: 'textbox',
    'aria-multiline': 'true',
    'aria-label': label,
    ...(readOnly ? { 'aria-readonly': 'true' } : {}),
    class: clsx(
      'rich-text',
      variant === 'note'
        ? 'min-h-[50vh] pb-16 text-[15px]'
        : 'rich-text-compact min-h-24 rounded-md px-2 py-1.5 text-sm focus:bg-hover',
    ),
  });

  const editor = useEditor({
    extensions: extensions(placeholder),
    content: parseDoc(content) ?? emptyDoc(),
    editable: !readOnly,
    editorProps: { attributes: attributes(readOnly) },
    onUpdate: ({ editor: e }) => {
      const doc = e.getJSON() as RichNode;
      known.current = JSON.stringify(doc);
      onChangeRef.current(doc);
    },
  });

  useEffect(() => {
    if (content === known.current) return;
    known.current = content;
    const doc = parseDoc(content) ?? emptyDoc();
    const current = editor.getJSON() as RichNode;
    // Task notes store an empty doc as null.
    if (isDocEmpty(doc) && isDocEmpty(current)) return;
    if (JSON.stringify(doc) === JSON.stringify(current)) return;
    editor.chain().setMeta('addToHistory', false).setContent(doc, { emitUpdate: false }).run();
  }, [editor, content]);

  useEffect(() => {
    if (editor.isEditable === !readOnly) return;
    editor.setOptions({
      editable: !readOnly,
      editorProps: { ...editor.options.editorProps, attributes: attributes(readOnly) },
    });
    // `attributes` only depends on props that don't change while mounted (the editor is keyed).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, readOnly]);

  const body = (
    <EditorContent
      editor={editor}
      onClick={(e) => openClickedLink(e, readOnly || (isMac ? e.metaKey : e.ctrlKey))}
    />
  );

  if (variant === 'note') {
    return (
      <div className={className}>
        {!readOnly && (
          <EditorToolbar
            editor={editor}
            variant="full"
            className="sticky top-0 z-10 -mx-2 mb-3 bg-surface px-2 py-1.5"
          />
        )}
        {body}
      </div>
    );
  }
  return (
    <div className={clsx('group', className)}>
      {body}
      {!readOnly && (
        <EditorToolbar
          editor={editor}
          variant="compact"
          className="mt-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 has-[[data-state=open]]:opacity-100"
        />
      )}
    </div>
  );
}
