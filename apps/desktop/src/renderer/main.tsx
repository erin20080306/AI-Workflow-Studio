import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { DesktopAgentApp } from './app';
import './styles.css';

const root = document.querySelector('#root');
if (root === null) {
  throw new Error('Desktop Agent root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <DesktopAgentApp />
  </StrictMode>,
);
