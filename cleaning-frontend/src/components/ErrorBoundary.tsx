import { Component, type ErrorInfo, type ReactNode } from "react";

import { t } from "../i18n/locale";

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
          {t().feedback.oops}
        </span>
        <h1 className="status-title">{t().feedback.crashTitle}</h1>
        <p className="status-hint">{t().feedback.crashHint}</p>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            {t().feedback.reload}
          </button>
          <a className="btn btn-secondary" href="/">
            {t().common.goToStart}
          </a>
        </div>
      </div>
    );
  }
}
