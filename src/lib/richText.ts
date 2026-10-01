/** Minimal TipTap / ProseMirror JSON shapes. */
export interface RichMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface RichNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: RichNode[];
  text?: string;
  marks?: RichMark[];
}

export function emptyDoc(): RichNode {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function parseDoc(json: string | null | undefined): RichNode | null {
  if (!json) return null;
  try {
    const doc = JSON.parse(json) as RichNode;
    return doc && doc.type === 'doc' ? doc : null;
  } catch {
    return null;
  }
}

/** A doc built from plain text, one paragraph per line. */
export function docFromText(text: string): RichNode {
  const lines = text.split('\n');
  return {
    type: 'doc',
    content: lines.map((line) =>
      line ? { type: 'paragraph', content: [{ type: 'text', text: line }] } : { type: 'paragraph' },
    ),
  };
}

const BLOCKS = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'taskItem',
  'horizontalRule',
]);

/** Plain text for search and previews. Blocks are separated by newlines. */
export function docToPlainText(doc: RichNode | null): string {
  if (!doc) return '';
  const out: string[] = [];
  const walk = (node: RichNode) => {
    if (node.type === 'text') {
      out.push(node.text ?? '');
      return;
    }
    if (node.type === 'hardBreak') {
      out.push('\n');
      return;
    }
    node.content?.forEach(walk);
    if (BLOCKS.has(node.type)) out.push('\n');
  };
  walk(doc);
  return out
    .join('')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

export function isDocEmpty(doc: RichNode | null): boolean {
  if (!doc) return true;
  if (docToPlainText(doc).length > 0) return false;
  // Structure without text (e.g. an empty checklist) still counts as content.
  const hasStructure = (node: RichNode): boolean =>
    node.type === 'horizontalRule' ||
    node.type === 'taskItem' ||
    (node.content ?? []).some(hasStructure);
  return !hasStructure(doc);
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]#<>])/g, '\\$1');
}

function inlineToMarkdown(nodes: RichNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '  \n';
      if (node.type !== 'text') return inlineToMarkdown(node.content);
      const marks = node.marks ?? [];
      const has = (t: string) => marks.some((m) => m.type === t);
      if (has('code')) return `\`${node.text ?? ''}\``;
      let text = escapeMarkdown(node.text ?? '');
      if (has('bold')) text = `**${text}**`;
      if (has('italic')) text = `_${text}_`;
      if (has('strike')) text = `~~${text}~~`;
      const link = marks.find((m) => m.type === 'link');
      if (link && typeof link.attrs?.href === 'string') text = `[${text}](${link.attrs.href})`;
      return text;
    })
    .join('');
}

function indent(text: string, prefix: string): string {
  return text
    .split('\n')
    .map((line) => (line ? prefix + line : line))
    .join('\n');
}

function blockToMarkdown(node: RichNode): string {
  switch (node.type) {
    case 'paragraph':
      return inlineToMarkdown(node.content);
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 1));
      return `${'#'.repeat(level)} ${inlineToMarkdown(node.content)}`;
    }
    case 'blockquote':
      return indent(blocksToMarkdown(node.content), '> ');
    case 'codeBlock': {
      const lang = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      const code = (node.content ?? []).map((n) => n.text ?? '').join('');
      return `\`\`\`${lang}\n${code}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      const start = Number(node.attrs?.start) || 1;
      return (node.content ?? [])
        .map((item, i) => {
          const marker =
            node.type === 'orderedList'
              ? `${start + i}.`
              : node.type === 'taskList'
                ? `- [${item.attrs?.checked ? 'x' : ' '}]`
                : '-';
          const body = blocksToMarkdown(item.content, '\n');
          const [first, ...rest] = body.split('\n');
          const pad = ' '.repeat(marker.length + 1);
          return [`${marker} ${first}`, ...rest.map((l) => (l ? pad + l : l))].join('\n');
        })
        .join('\n');
    }
    default:
      return node.content ? blocksToMarkdown(node.content) : '';
  }
}

function blocksToMarkdown(nodes: RichNode[] | undefined, separator = '\n\n'): string {
  return (nodes ?? []).map(blockToMarkdown).join(separator);
}

export function docToMarkdown(doc: RichNode | null): string {
  if (!doc) return '';
  return blocksToMarkdown(doc.content)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
