import type { ReactNode } from 'react';
import type { RichNode } from '@/lib/richText';

function withMarks(node: RichNode, key: number): ReactNode {
  let out: ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'code')
      out = <code className="rounded bg-hover px-1 font-mono text-[0.9em]">{out}</code>;
    else if (mark.type === 'link') out = <span className="text-accent underline">{out}</span>;
  }
  return <span key={key}>{out}</span>;
}

function renderNodes(nodes: RichNode[] | undefined): ReactNode {
  return nodes?.map((node, i) => renderNode(node, i));
}

function renderNode(node: RichNode, key: number): ReactNode {
  const children = renderNodes(node.content);
  switch (node.type) {
    case 'text':
      return withMarks(node, key);
    case 'hardBreak':
      return <br key={key} />;
    case 'heading': {
      const level = Number(node.attrs?.level);
      const idx = level === 2 ? 1 : level >= 3 ? 2 : 0;
      const cls = [
        'mt-5 mb-2 text-xl font-bold',
        'mt-4 mb-2 text-lg font-semibold',
        'mt-3 mb-1 font-semibold',
      ];
      const Tag = (['h2', 'h3', 'h4'] as const)[idx];
      return (
        <Tag key={key} className={cls[idx]}>
          {children}
        </Tag>
      );
    }
    case 'bulletList':
      return (
        <ul key={key} className="my-2 list-disc pl-6">
          {children}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} className="my-2 list-decimal pl-6">
          {children}
        </ol>
      );
    case 'taskList':
      return (
        <ul key={key} className="my-2 pl-1">
          {children}
        </ul>
      );
    case 'taskItem':
      return (
        <li key={key} className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={!!node.attrs?.checked}
            readOnly
            disabled
            className="mt-1"
          />
          <div>{children}</div>
        </li>
      );
    case 'listItem':
      return (
        <li key={key} className="my-0.5">
          {children}
        </li>
      );
    case 'blockquote':
      return (
        <blockquote key={key} className="my-2 border-l-2 border-line-strong pl-3 text-fg-muted">
          {children}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre key={key} className="my-2 rounded-md bg-hover p-3 font-mono text-[13px]">
          {children}
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} className="my-4 border-line" />;
    case 'paragraph':
      return (
        <p key={key} className="my-1.5 min-h-[1lh]">
          {children}
        </p>
      );
    default:
      return <div key={key}>{children}</div>;
  }
}

/** Read-only rendering of a rich-text doc. The editable version arrives with the notes editor (M6). */
export function RichTextPreview({ doc }: { doc: RichNode }) {
  return <div className="leading-relaxed select-text">{renderNodes(doc.content)}</div>;
}
