import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useMemo, useRef, useState } from 'react';
import { dropOnColumn } from '@/commands';
import { dropIds } from '@/components/calendar/dropIds';
import type { BoardColumn } from '@/store/board';
import type { DueRow } from '@/store/smart';
import { selectedIds, selectItem } from '@/store/ui';
import { columnDropId, columnKeyFromDropId } from './boardDrop';
import { SmartList, type SmartSection } from './SmartList';

/**
 * Columns of cards, one per group. Dragging a card onto another column
 * changes the task to fit it (its section, priority, day, label or list).
 */
export function Board({
  columns,
  homeListId,
  onExitTop,
}: {
  columns: BoardColumn[];
  homeListId?: string;
  onExitTop?: () => void;
}) {
  const [dragged, setDragged] = useState<DueRow | null>(null);
  // The column the card was picked up from, so a label drop can replace that column's label.
  const source = useRef<BoardColumn | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const sections = useMemo<SmartSection[]>(
    () =>
      columns.map((c) => ({
        key: c.key,
        title: c.title,
        rows: c.rows,
        tone: c.tone,
        timeOnly: c.timeOnly,
        emptyText: 'No tasks',
        dropId: c.drop ? columnDropId(c.key) : undefined,
      })),
    [columns],
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragged(null);
    const from = source.current;
    source.current = null;
    const key = over ? columnKeyFromDropId(String(over.id)) : null;
    const target = key ? columns.find((c) => c.key === key) : undefined;
    if (!target?.drop || target.key === from?.key) return;
    const id = String(active.id);
    dropOnColumn(dropIds(id, selectedIds()), target.drop, from?.drop ?? null);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={({ active }) => {
        const id = String(active.id);
        const from = columns.find((c) => c.rows.some((r) => r.item.id === id)) ?? null;
        source.current = from;
        setDragged(from?.rows.find((r) => r.item.id === id) ?? null);
        // Keep a multi-selection the card belongs to; otherwise the card alone is selected.
        if (!selectedIds().includes(id)) selectItem(id);
      }}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        source.current = null;
        setDragged(null);
      }}
    >
      <SmartList
        board
        draggable
        sections={sections}
        homeListId={homeListId}
        onExitTop={onExitTop}
      />
      <DragOverlay>
        {dragged && (
          <div className="flex h-8 items-center rounded-md bg-elevated px-3 text-sm shadow-popover">
            <span className="truncate">{dragged.item.text}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
