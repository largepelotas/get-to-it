import type { GroceryCategory, Item, List, Tables } from '@/data/types';
import { bySortKey } from '@/lib/order';
import { describeRecurrence } from '@/lib/recurrence';
import { docToMarkdown, escapeMarkdown, parseDoc } from '@/lib/richText';
import { groceryModel } from './grocery';
import { buildTree, type TreeNode } from './tree';

/*
 * Lists as Markdown, for "Copy as Markdown" and the Markdown export. To-do
 * lists become task lists with subtasks indented, grocery lists are grouped
 * by category, and notes use the editor's own Markdown.
 */

type Source = Pick<Tables, 'items' | 'notes'>;

const PRIORITY = ['', 'P1', 'P2', 'P3'];

/** Due date, repeat and priority, as "(due 2026-10-03 15:00, Every week, P1)". */
function taskMeta(item: Item): string {
  const parts: string[] = [];
  if (item.dueDate) parts.push(`due ${item.dueDate}${item.dueTime ? ` ${item.dueTime}` : ''}`);
  if (item.recurrence) parts.push(describeRecurrence(item.recurrence, item.dueDate));
  if (item.priority) parts.push(PRIORITY[item.priority]);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

/** A task's notes, indented to sit under its bullet. */
function notesBlock(item: Item, pad: string): string[] {
  const md = docToMarkdown(parseDoc(item.details));
  if (!md) return [];
  return md.split('\n').map((line) => (line ? pad + line : ''));
}

/** A won't-do task is struck through, so it reads as closed but not done. */
function taskText(item: Item): string {
  const text = escapeMarkdown(item.text);
  return item.checked && item.wontDo ? `~~${text}~~` : text;
}

function taskLines(node: TreeNode, depth: number): string[] {
  const pad = '  '.repeat(depth);
  const { item } = node;
  return [
    `${pad}- [${item.checked ? 'x' : ' '}] ${taskText(item)}${taskMeta(item)}`,
    ...notesBlock(item, `${pad}  `),
    ...node.children.flatMap((child) => taskLines(child, depth + 1)),
  ];
}

function todoMarkdown(items: Record<string, Item>, listId: string): string {
  const live = Object.values(items).filter((i) => i.listId === listId && !i.deletedAt);
  const tree = buildTree(live);
  const open = tree.filter((n) => !n.item.checked);
  const done = tree.filter((n) => n.item.checked);
  const sections: string[] = [];
  if (open.length) sections.push(open.flatMap((n) => taskLines(n, 0)).join('\n'));
  if (done.length) {
    sections.push(`## Completed\n\n${done.flatMap((n) => taskLines(n, 0)).join('\n')}`);
  }
  return sections.join('\n\n');
}

function groceryLine(item: Item, category?: string): string {
  const extra = [item.quantity, category].filter(Boolean).join(', ');
  return `- [${item.checked ? 'x' : ' '}] ${escapeMarkdown(item.text)}${extra ? ` (${escapeMarkdown(extra)})` : ''}`;
}

function groceryMarkdown(
  items: Record<string, Item>,
  listId: string,
  categories: GroceryCategory[],
): string {
  const model = groceryModel(items, listId, categories);
  const sections = model.groups.map(
    (g) =>
      `## ${escapeMarkdown(g.category.name)}\n\n${g.items.map((i) => groceryLine(i)).join('\n')}`,
  );
  if (model.cart.length) {
    sections.push(`## In cart\n\n${model.cart.map((i) => groceryLine(i)).join('\n')}`);
  }
  return sections.join('\n\n');
}

/** The body of a list (without its title) as Markdown. */
export function listBodyMarkdown(
  source: Source,
  list: List,
  categories: GroceryCategory[],
): string {
  switch (list.type) {
    case 'todo':
      return todoMarkdown(source.items, list.id);
    case 'grocery':
      return groceryMarkdown(source.items, list.id, categories);
    case 'note':
      return docToMarkdown(parseDoc(source.notes[list.id]?.content));
  }
}

/** A whole list as a Markdown document with its title as the heading. */
export function listToMarkdown(source: Source, list: List, categories: GroceryCategory[]): string {
  const body = listBodyMarkdown(source, list, categories);
  const title = `# ${escapeMarkdown(list.title)}`;
  return body ? `${title}\n\n${body}\n` : `${title}\n`;
}

// Files for the Markdown export

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** A name that's safe as a file or folder name on macOS and Windows. */
export function safeFileName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 100)
    .trim();
  if (!cleaned) return 'Untitled';
  return RESERVED.test(cleaned) ? `${cleaned}_` : cleaned;
}

export interface MarkdownFile {
  /** Relative path with `/` separators. */
  path: string;
  contents: string;
}

/**
 * One Markdown file per list: lists in a folder go in a subfolder of that
 * name, archived lists under "Archive". Trashed lists are left out. Names
 * that clash get a number.
 */
export function markdownFiles(
  tables: Pick<Tables, 'folders' | 'lists' | 'items' | 'notes'>,
  categories: GroceryCategory[],
): MarkdownFile[] {
  const used = new Set<string>();
  const unique = (dir: string, name: string) => {
    const prefix = dir ? `${dir}/` : '';
    let path = `${prefix}${name}.md`;
    for (let n = 2; used.has(path.toLowerCase()); n++) path = `${prefix}${name} ${n}.md`;
    used.add(path.toLowerCase());
    return path;
  };
  const folderDir = (list: List) => {
    const folder = list.folderId ? tables.folders[list.folderId] : undefined;
    return folder && !folder.deletedAt ? safeFileName(folder.name) : '';
  };

  const lists = Object.values(tables.lists)
    .filter((l) => !l.deletedAt)
    .sort(bySortKey);
  // Live lists first, so they keep the plain names when an archived list clashes.
  const ordered = [...lists.filter((l) => !l.archivedAt), ...lists.filter((l) => l.archivedAt)];
  return ordered.map((list) => {
    const dir = list.archivedAt ? 'Archive' : folderDir(list);
    return {
      path: unique(dir, safeFileName(list.title)),
      contents: listToMarkdown(tables, list, categories),
    };
  });
}
