import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary, Failure } from './components/Failure';
import { homeView } from './commands';
import { applyPalette, applyTheme, resolveTheme } from './lib/theme';
import { appReady, createRepository, setZoom } from './platform';
import { initData, useData } from './store/data';
import { seedIfNeeded } from './store/seed';
import { navigate } from './store/ui';
import './styles/index.css';

async function start() {
  const root = createRoot(document.getElementById('root')!);
  try {
    await initData(createRepository());
  } catch (err) {
    // The data couldn't be read (or was saved by a newer version). Say so rather
    // than leaving the window hidden, and touch nothing.
    console.error('Loading failed', err);
    applyTheme(resolveTheme('system'));
    root.render(<Failure title="Checklist couldn’t open your data" error={err} />);
    requestAnimationFrame(() => void appReady());
    return;
  }
  // In development a new data set starts with sample data instead of the starter lists.
  if (import.meta.env.DEV) (await import('./store/sampleData')).seedSampleData();
  seedIfNeeded();
  navigate(homeView());
  // Set the theme and zoom before the first paint so there's no flash of the wrong one.
  const { theme, palette, zoom } = useData.getState().settings;
  applyTheme(resolveTheme(theme));
  applyPalette(palette);
  void setZoom(zoom).catch(() => {});
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
  requestAnimationFrame(() => void appReady());
}

void start();
