import { Component, type ErrorInfo, type ReactNode } from "react";

interface State {
  error: Error | null;
}

export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Page failed to render", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="status-page" role="alert">
        <span className="status-code" aria-hidden="true">
          Oops
        </span>
        <h1 className="status-title">This page could not be shown</h1>
        <p className="status-hint">
          Reload the page. If it keeps happening, the app and the server may be different versions — restart the server
          or ask your administrator.
        </p>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Reload page
          </button>
          <a className="btn btn-secondary" href="/">
            Go to start page
          </a>
        </div>
      </div>
    );
  }
}
