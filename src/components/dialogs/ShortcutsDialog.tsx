import { Fragment } from 'react';
import { Button, Dialog, Kbd } from '@/components/ui';
import { SHORTCUT_HELP } from '@/lib/keymap';
import { closeDialog } from '@/store/ui';

/** Every keyboard shortcut, by section (Mod+/). */
export function ShortcutsDialog() {
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title="Keyboard shortcuts"
      className="w-[min(520px,calc(100vw-32px))]"
      footer={
        <Button variant="primary" onClick={closeDialog}>
          Done
        </Button>
      }
    >
      <div className="-mx-5 max-h-[min(560px,calc(100vh-180px))] space-y-5 overflow-y-auto px-5">
        {SHORTCUT_HELP.map((section) => (
          <section key={section.title}>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-fg-subtle uppercase">
              {section.title}
            </h3>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-sm">
              {section.entries.map((entry) => (
                <Fragment key={entry.label}>
                  <dt className="text-fg">{entry.label}</dt>
                  <dd className="flex items-center justify-end gap-1">
                    {entry.keys.map((keys) => (
                      <Kbd key={keys} shortcut={keys} />
                    ))}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
