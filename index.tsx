import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerPwaServiceWorker } from './services/pwa/swRegistration.ts';
import { initInstallPrompt } from './services/pwa/installPrompt.ts';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

registerPwaServiceWorker();
initInstallPrompt();
