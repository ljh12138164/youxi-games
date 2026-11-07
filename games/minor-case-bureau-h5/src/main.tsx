import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@shared/styles/base.css';
import './style.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
