/**
 * src/main.jsx
 * Thứ tự provider: I18nProvider (ngôn ngữ) → BrowserRouter → AuthProvider → App
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { I18nProvider } from './i18n/index.js';
import { registerServiceWorker } from './pwa/useInstallPrompt.js';
import './index.css';

// PWA: chỉ đăng ký ở bản build production (dev server của Vite không hợp precache).
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>
);
