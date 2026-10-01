import clsx from 'clsx';
import { Check, ChevronRight } from 'lucide-react';
import { ContextMenu as CM, DropdownMenu as DM } from 'radix-ui';
import type { ComponentType, KeyboardEvent, ReactNode } from 'react';
import { Kbd } from './Kbd';
import { cleanEntries, type MenuEntries } from './menuEntries';

type Part<P = object> = ComponentType<P & { className?: string; children?: ReactNode }>;

interface MenuParts {
  Item: Part<{ onSelect?: (event: Event) => void; disabled?: boolean }>;
  Separator: Part;
  Label: Part;
  Sub: Part;
  SubTrigger: Part<{ disabled?: boolean }>;
  SubContent: Part<{ sideOffset?: number; alignOffset?: number }>;
  Portal: Part;
}

const menuContentClass =
  'z-50 min-w-[190px] overflow-hidden rounded-lg border border-line bg-elevated p-1 text-[13px] text-fg shadow-popover outline-none select-none';

const itemClass =
  'relative flex h-7 items-center gap-2 rounded-md px-2 outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg';

/**
 * Set when the chosen entry moves focus itself (e.g. into a rename field), so
 * the closing menu doesn't send focus back to its trigger.
 */
let keepFocusOnClose = false;

function onCloseAutoFocus(event: Event): void {
  if (keepFocusOnClose) event.preventDefault();
  keepFocusOnClose = false;
}

function renderEntries(P: MenuParts, entries: MenuEntries): ReactNode {
  return cleanEntries(entries).map((entry, i) => {
    switch (entry.kind) {
      case 'separator':
        return <P.Separator key={i} className="mx-1 my-1 h-px bg-line" />;
      case 'label':
        return (
          <P.Label key={i} className="px-2 pt-1.5 pb-1 text-xs font-medium text-fg-subtle">
            {entry.label}
          </P.Label>
        );
      case 'sub':
        return (
          <P.Sub key={i}>
            <P.SubTrigger
              disabled={entry.disabled}
              className={clsx(itemClass, 'data-[state=open]:not-data-[highlighted]:bg-hover')}
            >
              <span className="flex size-4 items-center justify-center">{entry.icon}</span>
              <span className="flex-1">{entry.label}</span>
              <ChevronRight className="size-3.5 opacity-60" />
            </P.SubTrigger>
            <P.Portal>
              <P.SubContent sideOffset={4} alignOffset={-5} className={menuContentClass}>
                {renderEntries(P, entry.entries)}
              </P.SubContent>
            </P.Portal>
          </P.Sub>
        );
      default:
        return (
          <P.Item
            key={i}
            disabled={entry.disabled}
            onSelect={() => {
              keepFocusOnClose = !!entry.movesFocus;
              // The open menu traps focus, so let it close before the action focuses anything.
              if (entry.movesFocus) setTimeout(entry.onSelect, 0);
              else entry.onSelect();
            }}
            className={clsx(
              itemClass,
              entry.danger &&
                'text-danger data-[highlighted]:bg-danger data-[highlighted]:text-danger-fg',
            )}
          >
            <span className="flex size-4 items-center justify-center">{entry.icon}</span>
            <span className="flex-1 truncate">{entry.label}</span>
            {entry.checked && <Check className="size-3.5" />}
            {entry.shortcut && <Kbd shortcut={entry.shortcut} plain className="opacity-60" />}
          </P.Item>
        );
    }
  });
}

/** Builds function entries only while the menu is open. */
function LazyEntries({
  parts,
  entries,
}: {
  parts: MenuParts;
  entries: MenuEntries | (() => MenuEntries);
}) {
  return renderEntries(parts, typeof entries === 'function' ? entries() : entries);
}

export interface MenuProps {
  /** The button that opens the menu. Must accept a ref and props (e.g. IconButton). */
  trigger: ReactNode;
  /** Entries, or a function that builds them when the menu opens. */
  entries: MenuEntries | (() => MenuEntries);
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  onOpenChange?: (open: boolean) => void;
}

/** A dropdown menu opened from a button. */
export function Menu({ trigger, entries, align = 'start', side, onOpenChange }: MenuProps) {
  return (
    <DM.Root onOpenChange={onOpenChange}>
      <DM.Trigger asChild>{trigger}</DM.Trigger>
      <DM.Portal>
        <DM.Content
          align={align}
          side={side}
          sideOffset={4}
          className={menuContentClass}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <LazyEntries parts={DM} entries={entries} />
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export interface ContextMenuProps {
  /** Entries are built when the menu opens, so they always reflect current data. */
  entries: MenuEntries | (() => MenuEntries);
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Opens an element's right-click menu from the keyboard: Shift+F10 or the
 * Menu key, as in desktop apps. The menu appears under the element.
 */
function openFromKeyboard(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'ContextMenu' && !(event.key === 'F10' && event.shiftKey)) return;
  // Without this the browser fires its own contextmenu event as well.
  event.preventDefault();
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.dispatchEvent(
    new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + Math.min(32, rect.width / 2),
      clientY: rect.bottom,
    }),
  );
}

/** A right-click menu around a single element. Shift+F10 opens it from the keyboard. */
export function ContextMenu({ entries, children, onOpenChange }: ContextMenuProps) {
  return (
    <CM.Root onOpenChange={onOpenChange}>
      <CM.Trigger asChild onKeyDown={openFromKeyboard}>
        {children}
      </CM.Trigger>
      <CM.Portal>
        <CM.Content className={menuContentClass} onCloseAutoFocus={onCloseAutoFocus}>
          <LazyEntries parts={CM} entries={entries} />
        </CM.Content>
      </CM.Portal>
    </CM.Root>
  );
}
