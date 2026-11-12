import { Component, type ReactNode } from 'react';
import { resetGameKeepQuestions } from './game/store';

interface State {
  error: Error | null;
}

/** Last line of defence: a broken save must never leave a blank screen. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h1>Coś poszło nie tak</h1>
        <p>Zapisana gra jest uszkodzona. Możesz ją wyzerować — pytania i ustawienia zostaną zachowane.</p>
        <pre>{this.state.error.message}</pre>
        <button
          type="button"
          onClick={() => {
            resetGameKeepQuestions();
            window.location.reload();
          }}
        >
          Wyzeruj grę i odśwież
        </button>
      </div>
    );
  }
}
