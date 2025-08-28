import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { initializeFrontendObservability } from './observability/faro';
import { ErrorBoundary } from './components/observability/ErrorBoundary';
// Initialize Grafana Faro as early as possible in app startup
initializeFrontendObservability();
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
