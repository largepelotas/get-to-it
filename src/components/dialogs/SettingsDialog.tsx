import { useEffect, useState, type ReactNode } from 'react';
import { Button, Dialog, Input, Select } from '@/components/ui';
import { BUILT_IN_VIEWS, type BuiltInView, type Settings } from '@/data/types';
import { backUpNow, exportJson, exportMarkdown, importJson, showBackups } from '@/dataCommands';
import { formatTimestamp, isTimeString } from '@/lib/dates';
import { cleanMinutes, MAX_BREAK_MINUTES, MAX_FOCUS_MINUTES } from '@/lib/focus';
import { SHORTCUTS } from '@/lib/keymap';
import { formatShortcut } from '@/lib/shortcuts';
import { PALETTES } from '@/lib/theme';
import { cleanZoom, formatZoom, ZOOM_LEVELS } from '@/lib/zoom';
import { canBackUp, getLaunchAtLogin, isMac, isTauri, setLaunchAtLogin } from '@/platform';
import { BACKUPS_KEPT } from '@/store/backup';
import { setSetting, useData } from '@/store/data';
import { liveTodoLists } from '@/store/sidebar';
import { closeDialog } from '@/store/ui';
import { GroceryCategoriesEditor } from './GroceryCategoriesEditor';
import { MatrixSettingsFields } from './MatrixSettingsFields';

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
      <div className="w-48 shrink-0">{children}</div>
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

/** A length in whole minutes; saved once the typed value is valid, and reset to the stored one on blur. */
function MinutesField({
  id,
  setting,
  max,
}: {
  id: string;
  setting: 'focusMinutes' | 'breakMinutes';
  max: number;
}) {
  const stored = useData((s) => s.settings[setting]);
  const [draft, setDraft] = useState(String(stored));
  return (
    <Input
      id={id}
      type="number"
      min={1}
      max={max}
      step={1}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const minutes = cleanMinutes(e.target.valueAsNumber, 0, max);
        if (minutes) setSetting(setting, minutes);
      }}
      onBlur={() => setDraft(String(stored))}
    />
  );
}

/** The daily review: a checkbox, and its time once it's on. */
function DailyReview() {
  const stored = useData((s) => s.settings.dailyReviewTime);
  const [draft, setDraft] = useState(stored ?? '09:00');
  return (
    <>
      <Toggle
        id="settings-daily-review"
        label="Daily review reminder"
        hint="A “Plan your day” notification with what’s due. Skipped if Get To It isn’t running."
        checked={stored !== null}
        onChange={(on) => {
          const time = isTimeString(draft) ? draft : '09:00';
          setDraft(time);
          setSetting('dailyReviewTime', on ? time : null);
        }}
      />
      {stored !== null && (
        <Row label="Daily review at" htmlFor="settings-daily-review-time">
          <Input
            id="settings-daily-review-time"
            type="time"
            required
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (isTimeString(e.target.value)) setSetting('dailyReviewTime', e.target.value);
            }}
            onBlur={() => setDraft(stored)}
          />
        </Row>
      )}
    </>
  );
}

const VIEW_NAME: Record<BuiltInView, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  next7: 'Next 7 days',
  upcoming: 'Upcoming',
  calendar: 'Calendar',
  matrix: 'Eisenhower matrix',
  completed: 'Completed',
  stats: 'Statistics',
  reminders: 'Reminders',
};

/** One checkbox per built-in view: whether the sidebar lists it. */
function SidebarViews() {
  const hidden = useData((s) => s.settings.hiddenViews);
  return (
    <>
      {BUILT_IN_VIEWS.map((name) => (
        <Toggle
          key={name}
          id={`settings-show-${name}`}
          label={`Show ${VIEW_NAME[name]}`}
          checked={!hidden.includes(name)}
          onChange={(show) =>
            setSetting(
              'hiddenViews',
              BUILT_IN_VIEWS.filter((v) => (v === name ? !show : hidden.includes(v))),
            )
          }
        />
      ))}
      <p className="text-xs text-fg-subtle">
        A hidden view is still in the command palette. Reminders shows anyway while some are
        waiting.
      </p>
    </>
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

function DataSection() {
  const backupsEnabled = useData((s) => s.settings.backupsEnabled);
  const lastBackupAt = useData((s) => s.settings.lastBackupAt);
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<void>) => () => {
    setBusy(true);
    void action().finally(() => setBusy(false));
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={run(exportJson)}>
          Export…
        </Button>
        <Button disabled={busy} onClick={run(importJson)}>
          Import…
        </Button>
        <Button disabled={busy} onClick={run(exportMarkdown)}>
          Export as Markdown…
        </Button>
      </div>
      <p className="text-xs text-fg-subtle">
        Export saves everything to a JSON file that Import can read back. Importing replaces
        everything that’s here.
      </p>
      <Toggle
        id="settings-backups"
        label="Back up automatically every day"
        hint={
          !canBackUp
            ? 'Only in the desktop app.'
            : lastBackupAt
              ? `Last backup: ${formatTimestamp(lastBackupAt)}. The last ${BACKUPS_KEPT} are kept.`
              : `No backup yet. The last ${BACKUPS_KEPT} are kept.`
        }
        checked={canBackUp && backupsEnabled}
        disabled={!canBackUp}
        onChange={(next) => setSetting('backupsEnabled', next)}
      />
      {canBackUp && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={run(backUpNow)}>
            Back up now
          </Button>
          <Button variant="ghost" onClick={showBackups}>
            Show backups
          </Button>
        </div>
      )}
    </>
  );
}

/** The window's zoom. Kept per computer, since it's about the screen rather than the data. */
function ZoomField() {
  const zoom = useData((s) => s.settings.zoom);
  return (
    <>
      <Row label="Zoom" htmlFor="settings-zoom">
        <Select
          id="settings-zoom"
          value={String(zoom)}
          onChange={(e) => setSetting('zoom', cleanZoom(Number(e.target.value)))}
        >
          {ZOOM_LEVELS.map((level) => (
            <option key={level} value={String(level)}>
              {formatZoom(level)}
            </option>
          ))}
        </Select>
      </Row>
      <p className="text-xs text-fg-subtle">
        {formatShortcut(SHORTCUTS.zoomIn, isMac)} and {formatShortcut(SHORTCUTS.zoomOut, isMac)}{' '}
        change it too. Set per computer, so a bigger screen can have its own.
      </p>
    </>
  );
}

/** Which to-do list the app opens on, and where quick add files a task from Today and the other views. */
function DefaultList() {
  const lists = useData((s) => s.tables.lists);
  const folders = useData((s) => s.tables.folders);
  const defaultListId = useData((s) => s.settings.defaultListId);
  const choices = liveTodoLists({ lists, folders });
  if (!choices.length) return null;
  const current = choices.some((l) => l.id === defaultListId) ? defaultListId! : '';
  return (
    <Row label="Default list" htmlFor="settings-default-list">
      <Select
        id="settings-default-list"
        value={current}
        onChange={(e) => setSetting('defaultListId', e.target.value || null)}
      >
        {!current && <option value="">None</option>}
        {choices.map((list) => {
          const folder = list.folderId ? folders[list.folderId]?.name : null;
          return (
            <option key={list.id} value={list.id}>
              {folder ? `${folder} › ${list.title}` : list.title}
            </option>
          );
        })}
      </Select>
    </Row>
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
          <Row label="Colour scheme" htmlFor="settings-palette">
            <Select
              id="settings-palette"
              value={settings.palette}
              onChange={(e) => set('palette')(e.target.value as Settings['palette'])}
            >
              {PALETTES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Row>
          <ZoomField />
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
          <DefaultList />
          <Toggle
            id="settings-parse-dates"
            label="Read dates in new tasks"
            hint="“Call Sam tomorrow 3pm p1” gets a due date, time and priority."
            checked={settings.parseDates}
            onChange={set('parseDates')}
          />
        </Section>

        <Section title="Sidebar">
          <SidebarViews />
        </Section>

        <Section title="Eisenhower matrix">
          <MatrixSettingsFields />
        </Section>

        <Section title="Reminders">
          <Row label="Remind about all-day tasks at" htmlFor="settings-all-day-time">
            <AllDayTimeField />
          </Row>
          <DailyReview />
          <Toggle
            id="settings-close-to-tray"
            label="Keep running in the tray when the window is closed"
            hint="Reminders only go off while Get To It is running."
            checked={settings.closeToTray}
            onChange={set('closeToTray')}
          />
          <LaunchAtLogin />
        </Section>

        <Section title="Focus timer">
          <Row label="Pomodoro length (minutes)" htmlFor="settings-focus-minutes">
            <MinutesField
              id="settings-focus-minutes"
              setting="focusMinutes"
              max={MAX_FOCUS_MINUTES}
            />
          </Row>
          <Row label="Break length (minutes)" htmlFor="settings-break-minutes">
            <MinutesField
              id="settings-break-minutes"
              setting="breakMinutes"
              max={MAX_BREAK_MINUTES}
            />
          </Row>
        </Section>

        <Section title="Grocery categories">
          <GroceryCategoriesEditor />
        </Section>

        <Section title="Data">
          <DataSection />
        </Section>
      </div>
    </Dialog>
  );
}
