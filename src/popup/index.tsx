import React from 'react';
import ReactDOM from 'react-dom/client';
import { ErrorBoundary } from '@/ui/components/ErrorBoundary';
import App from './App';
import '../ui/theme/globals.css';

/**
 * Module-evaluation failure guard.
 *
 * ErrorBoundary cannot catch errors thrown while this module graph is
 * evaluating (circular imports, TDZ references, missing exports) — those happen
 * before React ever mounts. A failed boot would otherwise render a silent black
 * popup. This handler turns that exact failure mode into a visible message.
 */
window.addEventListener('error', (event) => {
  const root = document.getElementById('root');
  if (root !== null && root.childNodes.length === 0) {
    const message = event.message ?? 'The popup failed to start.';
    root.replaceChildren(
      Object.assign(document.createElement('div'), {
        textContent: `Boot failed: ${message}`,
        style:
          'color:#EF4444;padding:16px;font-family:system-ui,sans-serif;font-size:13px;',
      }),
    );
  }
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
