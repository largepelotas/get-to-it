import type { ChainedCommands, Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import clsx from 'clsx';
import {
  Bold,
  Code,
  ExternalLink,
  Heading1,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  SquareCode,
  Strikethrough,
  TextQuote,
  Underline,
  Unlink,
} from 'lucide-react';
import { Fragment, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, IconButton, Input, Popover } from '@/components/ui';
import { normalizeUrl } from '@/lib/links';
import { isMac, openUrl } from '@/platform';

interface Tool {
  id: string;
  label: string;
  icon: ReactNode;
  shortcut?: string;
  active?: (editor: Editor) => boolean;
  run: (chain: ChainedCommands, editor: Editor) => ChainedCommands;
}

const icon = 'size-4';

const TOOLS: Record<string, Tool> = {
  h1: {
    id: 'h1',
    label: 'Heading 1',
    icon: <Heading1 className={icon} />,
    shortcut: 'Mod+Alt+1',
    active: (e) => e.isActive('heading', { level: 1 }),
    run: (c) => c.toggleHeading({ level: 1 }),
  },
  h2: {
    id: 'h2',
    label: 'Heading 2',
    icon: <Heading2 className={icon} />,
    shortcut: 'Mod+Alt+2',
    active: (e) => e.isActive('heading', { level: 2 }),
    run: (c) => c.toggleHeading({ level: 2 }),
  },
  h3: {
    id: 'h3',
    label: 'Heading 3',
    icon: <Heading3 className={icon} />,
    shortcut: 'Mod+Alt+3',
    active: (e) => e.isActive('heading', { level: 3 }),
    run: (c) => c.toggleHeading({ level: 3 }),
  },
  bold: {
    id: 'bold',
    label: 'Bold',
    icon: <Bold className={icon} />,
    shortcut: 'Mod+B',
    active: (e) => e.isActive('bold'),
    run: (c) => c.toggleBold(),
  },
  italic: {
    id: 'italic',
    label: 'Italic',
    icon: <Italic className={icon} />,
    shortcut: 'Mod+I',
    active: (e) => e.isActive('italic'),
    run: (c) => c.toggleItalic(),
  },
  underline: {
    id: 'underline',
    label: 'Underline',
    icon: <Underline className={icon} />,
    shortcut: 'Mod+U',
    active: (e) => e.isActive('underline'),
    run: (c) => c.toggleUnderline(),
  },
  strike: {
    id: 'strike',
    label: 'Strikethrough',
    icon: <Strikethrough className={icon} />,
    shortcut: 'Mod+Shift+S',
    active: (e) => e.isActive('strike'),
    run: (c) => c.toggleStrike(),
  },
  code: {
    id: 'code',
    label: 'Inline code',
    icon: <Code className={icon} />,
    shortcut: 'Mod+E',
    active: (e) => e.isActive('code'),
    run: (c) => c.toggleCode(),
  },
  bullets: {
    id: 'bullets',
    label: 'Bulleted list',
    icon: <List className={icon} />,
    shortcut: 'Mod+Shift+8',
    active: (e) => e.isActive('bulletList'),
    run: (c) => c.toggleBulletList(),
  },
  numbers: {
    id: 'numbers',
    label: 'Numbered list',
    icon: <ListOrdered className={icon} />,
    shortcut: 'Mod+Shift+7',
    active: (e) => e.isActive('orderedList'),
    run: (c) => c.toggleOrderedList(),
  },
  tasks: {
    id: 'tasks',
    label: 'Checklist',
    icon: <ListTodo className={icon} />,
    shortcut: 'Mod+Shift+9',
    active: (e) => e.isActive('taskList'),
    run: (c) => c.toggleTaskList(),
  },
  outdent: {
    id: 'outdent',
    label: 'Outdent',
    icon: <IndentDecrease className={icon} />,
    shortcut: 'Shift+Tab',
    run: (c, e) => c.liftListItem(e.isActive('taskItem') ? 'taskItem' : 'listItem'),
  },
  indent: {
    id: 'indent',
    label: 'Indent',
    icon: <IndentIncrease className={icon} />,
    shortcut: 'Tab',
    run: (c, e) => c.sinkListItem(e.isActive('taskItem') ? 'taskItem' : 'listItem'),
  },
  quote: {
    id: 'quote',
    label: 'Quote',
    icon: <TextQuote className={icon} />,
    shortcut: 'Mod+Shift+B',
    active: (e) => e.isActive('blockquote'),
    run: (c) => c.toggleBlockquote(),
  },
  codeBlock: {
    id: 'codeBlock',
    label: 'Code block',
    icon: <SquareCode className={icon} />,
    shortcut: 'Mod+Alt+C',
    active: (e) => e.isActive('codeBlock'),
    run: (c) => c.toggleCodeBlock(),
  },
  divider: {
    id: 'divider',
    label: 'Divider',
    icon: <Minus className={icon} />,
    run: (c) => c.setHorizontalRule(),
  },
};

/** Tool ids in groups, with `link` for the link button. */
const LAYOUTS = {
  full: [
    ['h1', 'h2', 'h3'],
    ['bold', 'italic', 'underline', 'strike', 'code'],
    ['bullets', 'numbers', 'tasks', 'outdent', 'indent'],
    ['quote', 'codeBlock', 'divider', 'link'],
  ],
  compact: [['bold', 'italic', 'bullets', 'tasks', 'link']],
};

/** The link address editor, in a popover from the toolbar's link button. */
function LinkButton({
  editor,
  active,
  tabIndex,
  onFocus,
}: {
  editor: Editor;
  active: boolean;
  tabIndex: number;
  onFocus: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState('');
  const [invalid, setInvalid] = useState(false);
  const current = open ? (editor.getAttributes('link').href as string | undefined) : undefined;

  const close = () => setOpen(false);
  const apply = () => {
    const text = href.trim();
    if (!text) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return close();
    }
    const url = normalizeUrl(text);
    if (!url) return setInvalid(true);
    if (editor.state.selection.empty && !editor.isActive('link')) {
      editor
        .chain()
        .focus()
        .insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href: url } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
    close();
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setHref((editor.getAttributes('link').href as string | undefined) ?? '');
          setInvalid(false);
        }
        setOpen(next);
      }}
      onCloseAutoFocus={(e) => {
        e.preventDefault();
        editor.commands.focus();
      }}
      className="w-72 space-y-2"
      trigger={
        <IconButton
          label={active ? 'Edit link' : 'Link'}
          icon={<Link className={icon} />}
          aria-pressed={active}
          tabIndex={tabIndex}
          data-tool="link"
          onFocus={onFocus}
          onMouseDown={(e) => e.preventDefault()}
          className={clsx(active && 'bg-selected text-fg')}
        />
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Input
          aria-label="Link address"
          aria-invalid={invalid}
          placeholder="Paste or type a link"
          value={href}
          onChange={(e) => {
            setHref(e.target.value);
            setInvalid(false);
          }}
          autoFocus
        />
        {invalid && (
          <p role="alert" className="mt-1 text-xs text-danger">
            Enter a web address or an email address.
          </p>
        )}
      </form>
      <div className="flex items-center gap-1">
        {current && (
          <>
            <Button size="sm" variant="ghost" onClick={() => void openUrl(current)}>
              <ExternalLink aria-hidden className="size-3.5" />
              Open
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                close();
              }}
            >
              <Unlink aria-hidden className="size-3.5" />
              Remove
            </Button>
          </>
        )}
        <span className="flex-1" />
        <Button size="sm" variant="primary" onClick={apply}>
          {current ? 'Update' : 'Add link'}
        </Button>
      </div>
      <p className="text-xs text-fg-subtle">{isMac ? '⌘' : 'Ctrl'}-click a link to open it.</p>
    </Popover>
  );
}

export interface EditorToolbarProps {
  editor: Editor;
  variant: 'full' | 'compact';
  className?: string;
}

/**
 * Formatting buttons. One tab stop: arrow keys, Home and End move between
 * the buttons, and the buttons don't take focus from the text when clicked.
 */
export function EditorToolbar({ editor, variant, className }: EditorToolbarProps) {
  const groups = LAYOUTS[variant];
  const ids = groups.flat();
  const [focusIndex, setFocusIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      Object.fromEntries(
        ids.map((id) => [id, id === 'link' ? e.isActive('link') : !!TOOLS[id].active?.(e)]),
      ),
  });

  const onKeyDown = (e: KeyboardEvent) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    let next: number | null = null;
    if (step) next = (focusIndex + step + ids.length) % ids.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = ids.length - 1;
    if (next === null) return;
    e.preventDefault();
    setFocusIndex(next);
    ref.current?.querySelector<HTMLElement>(`[data-tool="${ids[next]}"]`)?.focus();
  };

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="Formatting"
      onKeyDown={onKeyDown}
      className={clsx('flex flex-wrap items-center gap-0.5', className)}
    >
      {groups.map((group, g) => (
        <Fragment key={g}>
          {g > 0 && <span aria-hidden className="mx-1 h-4 w-px bg-line-strong" />}
          {group.map((id) => {
            const tabIndex = ids.indexOf(id) === focusIndex ? 0 : -1;
            if (id === 'link') {
              return (
                <LinkButton
                  key={id}
                  editor={editor}
                  active={active.link}
                  tabIndex={tabIndex}
                  onFocus={() => setFocusIndex(ids.indexOf(id))}
                />
              );
            }
            const tool = TOOLS[id];
            const pressed = tool.active ? active[id] : undefined;
            return (
              <IconButton
                key={id}
                label={tool.label}
                shortcut={tool.shortcut}
                icon={tool.icon}
                aria-pressed={pressed}
                tabIndex={tabIndex}
                data-tool={id}
                onMouseDown={(e) => e.preventDefault()}
                onFocus={() => setFocusIndex(ids.indexOf(id))}
                onClick={() => tool.run(editor.chain().focus(), editor).run()}
                className={clsx(pressed && 'bg-selected text-fg')}
              />
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
