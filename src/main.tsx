import { StrictMode, Suspense, lazy, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/martian-mono/standard.css';
import '@fontsource/bungee/latin-400.css';
import '@fontsource/bungee/latin-ext-400.css';
import '@fontsource-variable/schibsted-grotesk/wght.css';
import './styles/tokens.css';
import { ErrorBoundary } from './ErrorBoundary';
import { isBoardRoute } from './routes';

const Board = lazy(() => import('./board/Board'));
const Host = lazy(() => import('./host/Host'));

function App() {
  const [board, setBoard] = useState(isBoardRoute);
  useEffect(() => {
    const onHash = () => setBoard(isBoardRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>{board ? <Board /> : <Host />}</Suspense>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
