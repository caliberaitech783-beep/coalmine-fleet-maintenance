import React, {useEffect, useState} from 'react';
import {etcCountdown} from './etc-countdown.mjs';
import './etc-countdown.css';

// Every countdown on the page shares one one-second ticker, so a workspace listing a
// hundred open requests wakes once a second instead of a hundred times.
const listeners = new Set();
let ticker = null;
export function subscribeLiveNow(listener) {
  listeners.add(listener);
  if (!ticker) ticker = setInterval(() => { const now = Date.now(); for (const notify of listeners) notify(now); }, 1000);
  return () => {
    listeners.delete(listener);
    if (!listeners.size && ticker) { clearInterval(ticker); ticker = null; }
  };
}
export function liveNowListenerCount() {
  return listeners.size;
}

// Reverse countdown to a request's ETC. Pass `now` to freeze it (exports, tests);
// otherwise it ticks every second while the ETC is still ahead or already overdue.
export default function EtcCountdown({request, now, etcLabel = ''}) {
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const countdown = etcCountdown(request, now ?? liveNow);
  const ticking = now === undefined && countdown.live;
  useEffect(() => ticking ? subscribeLiveNow(setLiveNow) : undefined, [ticking]);
  return <span className={`etc-countdown ${countdown.state}`} data-state={countdown.state} role={countdown.live ? 'timer' : undefined} title={etcLabel ? `ETC ${etcLabel}` : undefined}>{countdown.label}</span>;
}
