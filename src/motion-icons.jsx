import React from "react";
import "./motion-icons.css";

// Animated header icons shared by every login. Motion lives in motion-icons.css
// (and is switched off under prefers-reduced-motion); the moving dot of the
// pulse uses SVG animateMotion so it follows the trace exactly.

export const PULSE_PATH = "M2 12h4.5l2.5-9 6 18 2.5-9H22";

/** Heartbeat trace that runs left to right with a round dot travelling along it. */
export function PulseIcon({ className = "" }) {
  return <svg className={`pulse-icon ${className}`.trim()} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path className="pulse-icon-trace" d={PULSE_PATH} />
    <circle className="pulse-icon-dot" r="1.9" fill="currentColor" stroke="none">
      <animateMotion dur="1.6s" repeatCount="indefinite" path={PULSE_PATH} />
    </circle>
  </svg>;
}

/** Magnifier with a radar sweep turning inside the lens and a slow focus ring. */
export function SearchScanIcon() {
  return <svg className="search-scan-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true" focusable="false">
    <circle className="scan-lens" cx="10" cy="10" r="6.5" />
    <path className="scan-sweep" d="M10 10 L10 3.5 A6.5 6.5 0 0 1 15.6 6.8 Z" stroke="none" />
    <circle className="scan-focus" cx="10" cy="10" r="8.5" strokeWidth="1" />
    <path d="M15 15l5.5 5.5" />
  </svg>;
}

/** Bell with a rocking body, a swinging clapper and sound waves while ringing. */
export function BellRingIcon({ ringing = false }) {
  return <svg className={`bell-ring-icon${ringing ? " ringing" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path className="bell-wave bell-wave-1" d="M3.5 9.5a8.5 8.5 0 0 1 1.6-4.2M20.5 9.5a8.5 8.5 0 0 0-1.6-4.2" strokeWidth="1.6" />
    <path className="bell-wave bell-wave-2" d="M1.5 10.5a10.5 10.5 0 0 1 2-5.5M22.5 10.5a10.5 10.5 0 0 0-2-5.5" strokeWidth="1.4" />
    <g className="bell-body">
      <path className="bell-cup" d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M12 3v2" />
    </g>
    <circle className="bell-clapper" cx="12" cy="16" r="1.6" fill="currentColor" stroke="none" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>;
}

/** Door that swings open while the arrow leaves (driven by the parent button's hover). */
export function DoorExitIcon() {
  return <svg className="door-exit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path className="door-frame" d="M4 3h9v18H4z" />
    <path className="door-panel" d="M5 4h7v16H5z" />
    <circle cx="10" cy="12" r=".8" fill="currentColor" stroke="none" />
    <g className="door-arrow"><path d="M14 12h7" /><path d="M18 9l3 3-3 3" /></g>
  </svg>;
}
