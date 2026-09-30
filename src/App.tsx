import { useData } from './store/data';

/** Placeholder shell. The real layout (sidebar, list views) arrives in M1. */
export function App() {
  const listCount = useData((s) => Object.keys(s.tables.lists).length);
  return (
    <main className="flex h-screen items-center justify-center">
      <p>Checklist is set up. {listCount} lists stored.</p>
    </main>
  );
}
