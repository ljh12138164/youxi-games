import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@shared/styles/base.css';
import './style.css';
import { App } from './App';
import { prepareApprovedArt } from './render/approvedArt';

const root = createRoot(document.getElementById('root')!);
root.render(<div role="status">正在加载角色与装备素材…</div>);
prepareApprovedArt().then(() => root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)).catch(() => {
  root.render(<div role="alert">角色素材加载失败，请刷新页面重试。</div>);
});
