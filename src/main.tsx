import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { appReady, createRepository } from './platform';
import { initData } from './store/data';
import './styles/index.css';

async function start() {
  await initData(createRepository());
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  requestAnimationFrame(() => void appReady());
}

void start();
