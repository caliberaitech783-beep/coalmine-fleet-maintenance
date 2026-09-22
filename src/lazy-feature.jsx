import React, { Component, Suspense, lazy } from "react";
import "./lazy-feature.css";

const CHUNK_RECOVERY_KEY = "bdms:lazy-chunk-recovery-at";
const CHUNK_RECOVERY_WINDOW_MS = 60_000;
const CHUNK_FAILURE_PATTERN = /chunkloaderror|loading chunk|failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i;

export function isLazyChunkFailure(error) {
  const detail = [error?.name, error?.message, String(error || "")].filter(Boolean).join(" ");
  return CHUNK_FAILURE_PATTERN.test(detail);
}

function recoverStaleChunk(error) {
  if (!isLazyChunkFailure(error) || typeof window === "undefined") return false;
  let lastAttempt = 0;
  try {
    lastAttempt = Number(window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) || 0);
  } catch {}
  if (Date.now() - lastAttempt < CHUNK_RECOVERY_WINDOW_MS) return false;
  try {
    window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(Date.now()));
  } catch {}
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("asset-recovery", String(Date.now()));
  window.location.replace(nextUrl.toString());
  return true;
}

export class ApplicationErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, recovering: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    const recovering = recoverStaleChunk(error);
    if (recovering) this.setState({ recovering: true });
    console.error("Nerve Center screen rendering failed.", error);
  }

  reload = () => {
    try {
      window.sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
    } catch {}
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.compact) {
      return <span className="lazy-feature-error compact" role="alert">
        {this.state.recovering ? "Loading the updated screen…" : "Screen unavailable."}
        {!this.state.recovering && <button type="button" onClick={this.reload}>Refresh</button>}
      </span>;
    }
    return <main className="application-recovery" role="alert">
      <div className="application-recovery-card">
        <span className="application-recovery-mark" aria-hidden="true">!</span>
        <h1>{this.state.recovering ? "Updating Nerve Center…" : "This screen could not be displayed"}</h1>
        <p>{this.state.recovering
          ? "A newer application file is available. Your signed-in session is being preserved while the screen reloads."
          : "Your data is safe. Refresh the application to load a clean copy of this screen."}</p>
        {!this.state.recovering && <button type="button" onClick={this.reload}>Refresh application</button>}
      </div>
    </main>;
  }
}

export function createLazyFeature(importer, select = (module) => module.default, options = {}) {
  const LazyComponent = lazy(() => importer().then((module) => ({ default: select(module) })));
  const label = options.loadingLabel || "Loading screen…";
  function LazyFeature(props) {
    const fallback = options.silent
      ? null
      : <div className={`lazy-feature-loading${options.compact ? " compact" : ""}`} role="status" aria-live="polite">
          <span className="lazy-feature-spinner" aria-hidden="true" />
          <b>{label}</b>
        </div>;
    return <ApplicationErrorBoundary compact={options.compact}>
      <Suspense fallback={fallback}><LazyComponent {...props} /></Suspense>
    </ApplicationErrorBoundary>;
  }
  return LazyFeature;
}
