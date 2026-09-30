import clsx from 'clsx';
import type { ReactNode } from 'react';
import type { RichNode } from '@/lib/richText';
import { openClickedLink } from './editor/openClickedLink';

function withMarks(node: RichNode, key: number): ReactNode {
  let out: ReactNode = node.text ?? '';
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'code') out = <code>{out}</code>;
    else if (mark.type === 'link' && typeof mark.attrs?.href === 'string')
      out = <a href={mark.attrs.href}>{out}</a>;
  }
  return <span key={key}>{out}</span>;
}

function renderNodes(nodes: RichNode[] | undefined): ReactNode {
  return nodes?.map((node, i) => renderNode(node, i));
}

/** The same elements TipTap renders, so `.rich-text` styles both alike. */
function renderNode(node: RichNode, key: number): ReactNode {
  const children = renderNodes(node.content);
  switch (node.type) {
    case 'text':
      return withMarks(node, key);
    case 'hardBreak':
      return <br key={key} />;
    case 'heading': {
      const level = Number(node.attrs?.level);
      const Tag = level === 2 ? 'h2' : level >= 3 ? 'h3' : 'h1';
      return <Tag key={key}>{children}</Tag>;
    }
    case 'bulletList':
      return <ul key={key}>{children}</ul>;
    case 'orderedList':
      return (
        <ol key={key} start={Number(node.attrs?.start) || undefined}>
          {children}
        </ol>
      );
    case 'taskList':
      return (
        <ul key={key} data-type="taskList">
          {children}
        </ul>
      );
    case 'taskItem':
      return (
        <li key={key} data-checked={!!node.attrs?.checked}>
          <label>
            <input type="checkbox" checked={!!node.attrs?.checked} readOnly disabled />
          </label>
          <div>{children}</div>
        </li>
      );
    case 'listItem':
      return <li key={key}>{children}</li>;
    case 'blockquote':
      return <blockquote key={key}>{children}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case 'horizontalRule':
      return <hr key={key} />;
    case 'paragraph':
      return <p key={key}>{children}</p>;
    default:
      return <div key={key}>{children}</div>;
  }
}

/** Read-only rendering of a rich-text doc, also shown while the editor loads. */
export function RichTextPreview({ doc, className }: { doc: RichNode; className?: string }) {
  return (
    <div className={clsx('rich-text', className)} onClick={(e) => openClickedLink(e, true)}>
      {renderNodes(doc.content)}
    </div>
  );
}
