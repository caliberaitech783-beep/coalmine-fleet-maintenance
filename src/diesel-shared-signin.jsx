import React, { useEffect, useState } from 'react';
import TelegramGate from './telegram-gate.jsx';
import { completeDieselHandoff, dieselStart } from './diesel-handoff.mjs';

export function DieselSharedSignIn({ token, logout }) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    completeDieselHandoff(window.location.search, token, controller.signal, window.fetch)
      .then(outcome => {
        if (controller.signal.aborted) return;
        if (outcome.destination) window.location.replace(outcome.destination);
        else setResult(outcome);
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ message: 'Pulse could not open Diesel. Please try again.' });
      });
    return () => controller.abort();
  }, [token, attempt]);

  return <main className="sign-in-location-screen">
    <section className="sign-in-location-card" aria-live="polite">
      <h1>{result ? 'Diesel sign-in' : 'Opening Diesel…'}</h1>
      {result && <>
        <p>{result.message}</p>
        <div className="sign-in-location-actions">
          <button type="button" className="primary" onClick={() => setAttempt(value => value + 1)}>Try again</button>
          <a href={dieselStart}>Restart Diesel sign-in</a>
          <button type="button" className="secondary" onClick={logout}>Sign out</button>
        </div>
      </>}
    </section>
    {result?.membership && <TelegramGate token={token} logout={logout}/>}
  </main>;
}
