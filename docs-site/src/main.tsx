import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { PortalAuthProvider } from './contexts/PortalAuthContext';
import { applyBrandCssVars } from './portal/brand';
import './styles/portal.css';

applyBrandCssVars();

document.documentElement.classList.add('brown-theme');
document.body.classList.add('brown-theme');

const root = document.getElementById('root');
if (!root) throw new Error('#root not found');

createRoot(root).render(
  <StrictMode>
    <PortalAuthProvider>
      <App />
    </PortalAuthProvider>
  </StrictMode>,
);
