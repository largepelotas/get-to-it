import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { homeView } from './commands';
import { applyPalette, applyTheme, resolveTheme } from './lib/theme';
import { appReady, createRepository } from './platform';
import { initData, useData } from './store/data';
import { seedIfNeeded } from './store/seed';
import { navigate } from './store/ui';
import './styles/index.css';

async function start() {
  await initData(createRepository());
  seedIfNeeded();
  navigate(homeView());
  // Set the theme before the first paint so there's no flash of the wrong one.
  const { theme, palette } = useData.getState().settings;
  applyTheme(resolveTheme(theme));
  applyPalette(palette);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  requestAnimationFrame(() => void appReady());
}

void start();
