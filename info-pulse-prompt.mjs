export const INFO_PULSE_PROMPT_INTERVAL_MS = 4 * 60 * 60 * 1000;
export const INFO_PULSE_PROMPT_HOLD_MS = 60_000;

export function infoPulsePromptKey(session = {}) {
  return String(session.login || session.name || '').trim().toLowerCase();
}

// The login prompt opens once per four hours for a user, however many times
// they sign in or from whichever device. A reload inside the mandatory minute
// resumes the same countdown instead of restarting it or skipping the prompt.
export function infoPulsePromptDecision(lastShownAt, now = Date.now(), {intervalMs = INFO_PULSE_PROMPT_INTERVAL_MS, holdMs = INFO_PULSE_PROMPT_HOLD_MS} = {}) {
  const shown = lastShownAt instanceof Date ? lastShownAt.getTime() : typeof lastShownAt === 'number' ? lastShownAt : Date.parse(lastShownAt || '');
  if (!Number.isFinite(shown) || shown > now || now - shown >= intervalMs) return {show: true, claim: true, shownAt: now, closeAfterMs: holdMs, nextAvailableAt: now + intervalMs};
  if (now - shown < holdMs) return {show: true, claim: false, shownAt: shown, closeAfterMs: holdMs - (now - shown), nextAvailableAt: shown + intervalMs};
  return {show: false, claim: false, shownAt: shown, closeAfterMs: 0, nextAvailableAt: shown + intervalMs};
}

// query(text, values) runs SQL; the record of the last prompt is keyed by login.
export async function claimInfoPulsePrompt(query, login, now = Date.now()) {
  const key = String(login || '').trim().toLowerCase();
  if (!key) return {show: false, closeAfterMs: 0, nextAvailableAt: 0};
  const {rows} = await query('SELECT shown_at FROM info_pulse_prompts WHERE login=$1', [key]);
  const decision = infoPulsePromptDecision(rows[0]?.shown_at, now);
  if (decision.claim)
    await query('INSERT INTO info_pulse_prompts(login,shown_at) VALUES($1,$2) ON CONFLICT (login) DO UPDATE SET shown_at=EXCLUDED.shown_at', [key, new Date(now)]);
  return {show: decision.show, closeAfterMs: decision.closeAfterMs, nextAvailableAt: decision.nextAvailableAt};
}
