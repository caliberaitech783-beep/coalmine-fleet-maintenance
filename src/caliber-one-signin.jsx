import React, { useEffect, useState } from 'react';
import { completeHrHandoff, completeMisHandoff, hrBack, misManualUrl } from './caliber-one-handoff.mjs';

// Shown for a moment while Pulse opens MIS or HR Pulse for a person already signed in to Pulse.
export function CaliberOneSignIn({ application, token, logout }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const mis = application === 'MIS';
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    let remember = false;
    try { remember = Boolean(localStorage.getItem('nerveCenterSession')); } catch { /* private window */ }
    const run = mis
      ? completeMisHandoff(window.location.search, token, remember, controller.signal, window.fetch)
      : completeHrHandoff(window.location.search, token, controller.signal, window.fetch);
    run.then(outcome => {
      if (controller.signal.aborted) return;
      if (outcome.destination) window.location.replace(outcome.destination);
      else setResult(outcome);
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ message: `Pulse could not open ${mis ? 'MIS' : 'HR Pulse'}. Please try again.` });
    });
    return () => controller.abort();
  }, [token, attempt, mis]);

  const name = mis ? 'MIS' : 'HR Pulse';
  return <main className="sign-in-location-screen">
    <section className="sign-in-location-card" aria-live="polite">
      <h1>{result ? `${name} sign-in` : `Opening ${name}…`}</h1>
      {result && <>
        <p>{result.message}</p>
        <div className="sign-in-location-actions">
          <button type="button" className="primary" onClick={() => setAttempt(value => value + 1)}>Try again</button>
          {mis
            ? <a href={misManualUrl(window.location.href)}>Sign in to MIS another way</a>
            : <a href={hrBack('signin')}>Back to HR Pulse</a>}
          <button type="button" className="secondary" onClick={logout}>Sign out of Pulse</button>
        </div>
      </>}
    </section>
  </main>;
}
