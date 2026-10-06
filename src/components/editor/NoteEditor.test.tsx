import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { MemoryRepository } from '@/data/memory';
import { docToMarkdown, parseDoc, type RichNode } from '@/lib/richText';
import { archiveList, createList } from '@/store/actions/lists';
import { setNoteContent } from '@/store/actions/notes';
import { redo, resetForTests, undo, useData } from '@/store/data';
import { openList, useUI } from '@/store/ui';

let list: string;

beforeEach(() => {
  resetForTests(new MemoryRepository());
  useUI.setState({ view: { kind: 'today' }, dialog: null, renaming: null, selectedItemId: null });
  list = createList({ type: 'note', title: 'Plans' });
  openList(list);
});

afterEach(() => vi.restoreAllMocks());

const note = () => useData.getState().tables.notes[list];
const markdown = () => docToMarkdown(parseDoc(note().content));
const editor = () => screen.findByRole('textbox', { name: 'Note' });
const toolbar = () => within(screen.getByRole('toolbar', { name: 'Formatting' }));

const linkDoc: RichNode = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'See ' },
        {
          type: 'text',
          text: 'the site',
          marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
        },
      ],
    },
  ],
};

describe('note editor', () => {
  it('saves what is typed, with Markdown-style shortcuts', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await editor());
    await user.keyboard('# Trip{Enter}Pack **light**{Enter}- passport{Enter}tickets{Enter}{Enter}');
    await user.keyboard('[[ ] book hotel');
    expect(markdown()).toBe(
      '# Trip\n\nPack **light**\n\n- passport\n- tickets\n\n- [ ] book hotel',
    );
    expect(note().plainText).toBe('Trip\nPack light\npassport\ntickets\nbook hotel');
  });

  it('formats with the toolbar and undoes inside the editor', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await editor());
    await user.click(toolbar().getByRole('button', { name: 'Bold' }));
    expect(toolbar().getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true');
    await user.keyboard('Loud');
    await user.click(toolbar().getByRole('button', { name: 'Checklist' }));
    expect(markdown()).toBe('- [ ] **Loud**');
    expect(await editor()).toHaveFocus();
    await user.keyboard('{Control>}z{/Control}');
    expect(markdown()).toBe('**Loud**');
  });

  it('indents and outdents list items from the toolbar', async () => {
    // Without these buttons Tab and Shift-Tab are the only way to nest a list item.
    const user = userEvent.setup();
    render(<App />);
    await user.click(await editor());
    await user.keyboard('- one{Enter}two');
    await user.click(toolbar().getByRole('button', { name: 'Indent' }));
    const ed = await editor();
    expect(ed.querySelector('li > ul > li')).toHaveTextContent('two');
    expect(ed.querySelectorAll('ul ul')).toHaveLength(1);
    await user.click(toolbar().getByRole('button', { name: 'Outdent' }));
    expect(ed.querySelector('ul ul')).toBeNull();
    expect(ed.querySelectorAll('li')).toHaveLength(2);
  });

  it('adds links that open in the browser only when Mod-clicked', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const user = userEvent.setup();
    render(<App />);
    await user.click(await editor());
    await user.keyboard('Docs: ');
    await user.click(toolbar().getByRole('button', { name: 'Link' }));
    const address = screen.getByRole('textbox', { name: 'Link address' });
    await user.type(address, 'javascript:alert(1){Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a web address');
    await user.clear(address);
    await user.type(address, 'example.com/docs{Enter}');
    expect(markdown()).toBe('Docs: [example.com/docs](https://example.com/docs)');
    expect(await editor()).toHaveFocus();

    const link = within(await editor()).getByText('example.com/docs');
    await user.click(link);
    expect(open).not.toHaveBeenCalled();
    await user.keyboard('{Control>}');
    await user.click(link);
    await user.keyboard('{/Control}');
    expect(open).toHaveBeenCalledWith('https://example.com/docs', '_blank', 'noopener,noreferrer');
  });

  it('follows changes made outside the editor, such as undo', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await editor());
    await user.keyboard('Draft');
    await user.click(screen.getByRole('textbox', { name: 'List name' }));
    act(() => undo());
    expect(await editor()).toHaveTextContent('');
    act(() => redo());
    expect(await editor()).toHaveTextContent('Draft');
    act(() => setNoteContent(list, linkDoc));
    expect(await editor()).toHaveTextContent('See the site');
  });

  it('is read-only in an archived note, where a plain click opens links', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    setNoteContent(list, linkDoc);
    archiveList(list);
    openList(list);
    const user = userEvent.setup();
    render(<App />);
    const box = await editor();
    expect(box).toHaveAttribute('aria-readonly', 'true');
    expect(box).toHaveAttribute('contenteditable', 'false');
    expect(screen.queryByRole('toolbar', { name: 'Formatting' })).not.toBeInTheDocument();
    await user.click(within(box).getByText('the site'));
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });
});
