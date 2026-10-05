import { useEffect, useRef, useState } from 'react';
import { Button, Dialog } from '@/components/ui';
import { ABOUT_LINKS, APP_NAME, loadNotices } from '@/lib/about';
import { openUrl } from '@/platform';

function LicencesDialog({
  open,
  onClose,
  onCloseAutoFocus,
}: {
  open: boolean;
  onClose: () => void;
  onCloseAutoFocus: (event: Event) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadNotices().then((notices) => live && setText(notices));
    return () => {
      live = false;
    };
  }, [open]);
  return (
    <Dialog
      open={open}
      onOpenChange={(open) => !open && onClose()}
      onCloseAutoFocus={onCloseAutoFocus}
      title="Third-party licences"
      description={`The libraries ${APP_NAME} is built with, and their licences.`}
      className="w-[min(640px,calc(100vw-32px))]"
      footer={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {/* Focusable so the keyboard can scroll it. */}
      <pre
        tabIndex={0}
        aria-label="Third-party licence notices"
        className="max-h-[min(420px,calc(100vh-240px))] overflow-auto rounded-md border border-line bg-surface p-3 font-mono text-xs break-words whitespace-pre-wrap text-fg select-text"
      >
        {text ?? 'Loading…'}
      </pre>
    </Dialog>
  );
}

export function AboutSection() {
  const [licencesOpen, setLicencesOpen] = useState(false);
  const licencesButton = useRef<HTMLDivElement>(null);
  return (
    <>
      <div>
        <p className="text-sm font-medium text-fg">{APP_NAME}</p>
        <p className="text-xs text-fg-subtle">Version {__APP_VERSION__}</p>
      </div>
      <p className="text-sm text-fg">
        Free and open source, under the MIT licence. Everything stays on this computer.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void openUrl(ABOUT_LINKS.releases)}>
          Check for a newer version
        </Button>
        <Button onClick={() => void openUrl(ABOUT_LINKS.issues)}>Report a problem</Button>
        <Button onClick={() => void openUrl(ABOUT_LINKS.source)}>Source code</Button>
      </div>
      <div ref={licencesButton}>
        <Button variant="ghost" onClick={() => setLicencesOpen(true)}>
          Third-party licences
        </Button>
      </div>
      <LicencesDialog
        open={licencesOpen}
        onClose={() => setLicencesOpen(false)}
        // Back to the button that opened it, or focus is left on nothing with Settings still open.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          licencesButton.current?.querySelector('button')?.focus();
        }}
      />
    </>
  );
}
