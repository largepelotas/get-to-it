/**
 * The tasks a drop moves: the dragged one, or the whole multi-selection when
 * the dragged task is part of it.
 */
export function dropIds(draggedId: string, selection: string[]): string[] {
  return selection.length > 1 && selection.includes(draggedId) ? selection : [draggedId];
}
