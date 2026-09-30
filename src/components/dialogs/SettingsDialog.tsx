import { useEffect, useState, type ReactNode } from 'react';
import { Button, Dialog, Input, Select } from '@/components/ui';
import type { Settings } from '@/data/types';
import { isTimeString } from '@/lib/dates';
import { getLaunchAtLogin, isTauri, setLaunchAtLogin } from '@/platform';
import { setSetting, useData } from '@/store/data';
import { closeDialog } from '@/store/ui';
import { GroceryCategoriesEditor } from './GroceryCategoriesEditor';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h3 className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={htmlFor} className="flex-1 text-sm text-fg">
        {label}
      </label>
      <div className="w-36 shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 size-4 shrink-0 accent-accent disabled:opacity-50"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm text-fg">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-fg-subtle">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}

/** The all-day reminder time; saved once it's a whole valid time. */
function AllDayTimeField() {
  const stored = useData((s) => s.settings.allDayReminderTime);
  const [draft, setDraft] = useState(stored);
  return (
    <Input
      id="settings-all-day-time"
      type="time"
      required
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        if (isTimeString(e.target.value)) setSetting('allDayReminderTime', e.target.value);
      }}
      onBlur={() => setDraft(stored)}
    />
  );
}

function LaunchAtLogin() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    getLaunchAtLogin().then(setEnabled, (err: unknown) => setError(String(err)));
  }, []);
  return (
    <Toggle
      id="settings-launch-at-login"
      label="Open at login"
      hint={
        error
          ? `Couldn’t read this setting: ${error}`
          : isTauri
            ? 'Starts in the tray, so reminders work from the moment you sign in.'
            : 'Only in the desktop app.'
      }
      checked={!!enabled}
      disabled={enabled === null}
      onChange={(next) => {
        setEnabled(next);
        setLaunchAtLogin(next).catch((err: unknown) => {
          setEnabled(!next);
          setError(String(err));
        });
      }}
    />
  );
}

export function SettingsDialog() {
  const settings = useData((s) => s.settings);
  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      setSetting(key, value);

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && closeDialog()}
      title="Settings"
      className="w-[min(460px,calc(100vw-32px))]"
      footer={
        <Button variant="primary" onClick={closeDialog}>
          Done
        </Button>
      }
    >
      <div className="-mx-5 max-h-[min(560px,calc(100vh-180px))] space-y-6 overflow-y-auto px-5">
        <Section title="General">
          <Row label="Theme" htmlFor="settings-theme">
            <Select
              id="settings-theme"
              value={settings.theme}
              onChange={(e) => set('theme')(e.target.value as Settings['theme'])}
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </Row>
          <Row label="Week starts on" htmlFor="settings-week-start">
            <Select
              id="settings-week-start"
              value={settings.weekStartsOn}
              onChange={(e) => set('weekStartsOn')(Number(e.target.value) as 0 | 1)}
            >
              <option value={1}>Monday</option>
              <option value={0}>Sunday</option>
            </Select>
          </Row>
          <Toggle
            id="settings-parse-dates"
            label="Read dates in new tasks"
            hint="“Call Sam tomorrow 3pm p1” gets a due date, time and priority."
            checked={settings.parseDates}
            onChange={set('parseDates')}
          />
        </Section>

        <Section title="Reminders">
          <Row label="Remind about all-day tasks at" htmlFor="settings-all-day-time">
            <AllDayTimeField />
          </Row>
          <Toggle
            id="settings-close-to-tray"
            label="Keep running in the tray when the window is closed"
            hint="Reminders only go off while Checklist is running."
            checked={settings.closeToTray}
            onChange={set('closeToTray')}
          />
          <LaunchAtLogin />
        </Section>

        <Section title="Grocery categories">
          <GroceryCategoriesEditor />
        </Section>
      </div>
    </Dialog>
  );
}
