import { describe, expect, it } from 'vitest';
import {
  docFromText,
  docToMarkdown,
  docToPlainText,
  emptyDoc,
  isDocEmpty,
  parseDoc,
  type RichNode,
} from './richText';

const text = (t: string, ...marks: string[]): RichNode => ({
  type: 'text',
  text: t,
  marks: marks.map((type) => ({ type })),
});
const p = (...content: RichNode[]): RichNode => ({ type: 'paragraph', content });

const doc: RichNode = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [text('Plan')] },
    p(text('Ship '), text('v1', 'bold'), text(' soon')),
    {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [p(text('One'))] },
        {
          type: 'listItem',
          content: [
            p(text('Two')),
            { type: 'bulletList', content: [{ type: 'listItem', content: [p(text('Nested'))] }] },
          ],
        },
      ],
    },
    {
      type: 'taskList',
      content: [
        { type: 'taskItem', attrs: { checked: true }, content: [p(text('Done'))] },
        { type: 'taskItem', attrs: { checked: false }, content: [p(text('Todo'))] },
      ],
    },
    {
      type: 'orderedList',
      attrs: { start: 1 },
      content: [{ type: 'listItem', content: [p(text('First'))] }],
    },
    p({
      type: 'text',
      text: 'docs',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    }),
    {
      type: 'codeBlock',
      attrs: { language: 'ts' },
      content: [{ type: 'text', text: 'let a = 1;' }],
    },
    { type: 'blockquote', content: [p(text('Quote'))] },
  ],
};

describe('docToMarkdown', () => {
  it('serialises common blocks and marks', () => {
    expect(docToMarkdown(doc)).toBe(
      [
        '## Plan',
        '',
        'Ship **v1** soon',
        '',
        '- One',
        '- Two',
        '  - Nested',
        '',
        '- [x] Done',
        '- [ ] Todo',
        '',
        '1. First',
        '',
        '[docs](https://example.com)',
        '',
        '```ts',
        'let a = 1;',
        '```',
        '',
        '> Quote',
      ].join('\n'),
    );
  });

  it('escapes markdown characters in text', () => {
    expect(docToMarkdown(docFromText('a *b* [c]'))).toBe('a \\*b\\* \\[c\\]');
  });
});

describe('plain text helpers', () => {
  it('extracts text with line breaks between blocks', () => {
    expect(docToPlainText(docFromText('one\ntwo'))).toBe('one\ntwo');
    expect(docToPlainText(doc)).toContain('Ship v1 soon\nOne\nTwo\nNested');
  });

  it('detects empty docs', () => {
    expect(isDocEmpty(emptyDoc())).toBe(true);
    expect(isDocEmpty(null)).toBe(true);
    expect(isDocEmpty(docFromText('x'))).toBe(false);
    expect(
      isDocEmpty({ type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem' }] }] }),
    ).toBe(false);
  });

  it('parses only valid docs', () => {
    expect(parseDoc('not json')).toBeNull();
    expect(parseDoc('{"type":"paragraph"}')).toBeNull();
    expect(parseDoc(JSON.stringify(emptyDoc()))).toEqual(emptyDoc());
  });
});
