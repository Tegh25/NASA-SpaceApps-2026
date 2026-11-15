import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** When this changes (for example the route path) a previous error is cleared. */
  resetKey?: string;
}

interface State {
  error: Error | null;
  key: string | undefined;
}

/**
 * Catches render errors and failed lazy chunks in the routed pages, so one broken page shows a message
 * instead of blanking the whole app. The Cesium globe sits outside it and keeps running.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.key ? { key: props.resetKey, error: null } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Terralog] page crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="absolute inset-0 z-40 grid place-items-center bg-black/50 p-6">
        <div className="console notch max-w-md p-5" role="alert">
          <div className="mb-2 flex items-center gap-2 text-[var(--bad)]">
            <AlertTriangle size={18} aria-hidden />
            <h1 className="text-lg font-semibold">This page hit an error</h1>
          </div>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Something went wrong while drawing this page. You can try again or go back to the globe.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="flex items-center gap-2 rounded-[3px] bg-[var(--moon)] px-4 py-2 text-sm font-semibold text-[#0b1220]"
            >
              <RefreshCw size={15} aria-hidden /> Try again
            </button>
            <a href="/" className="rounded-[3px] border border-[var(--rule-hi)] px-4 py-2 text-sm text-[var(--ink)]">
              Back to the globe
            </a>
          </div>
        </div>
      </div>
    );
  }
}
