// Temple-bell chime played when new notifications arrive. Pure scheduling
// helpers are exported so the sound design can be unit tested without audio.

/** Partials of a bronze temple bell (ghanta): ratio to the strike tone, level, decay in seconds. */
export const TEMPLE_BELL_PARTIALS = Object.freeze([
  { ratio: 1, gain: 1, decay: 3.4 },
  { ratio: 2.01, gain: 0.62, decay: 2.8 },
  { ratio: 2.42, gain: 0.44, decay: 2.3 },
  { ratio: 3.02, gain: 0.34, decay: 1.9 },
  { ratio: 4.51, gain: 0.2, decay: 1.3 },
  { ratio: 5.63, gain: 0.12, decay: 0.9 },
]);
export const TEMPLE_BELL_STRIKE_HZ = 528;
export const TEMPLE_BELL_LEVEL = 0.22;

/** The oscillators a strike needs: frequency, peak gain and decay, plus a slow beat on the fundamental. */
export function templeBellVoices(strikeHz = TEMPLE_BELL_STRIKE_HZ) {
  const voices = TEMPLE_BELL_PARTIALS.map((partial) => ({ frequency: strikeHz * partial.ratio, gain: partial.gain, decay: partial.decay }));
  voices.push({ frequency: strikeHz + 1.5, gain: 0.5, decay: 3.4 });
  return voices;
}

/** Ring only when the unread count grows after the first reading (never on page load). */
export function shouldChime(previousUnread, unread) {
  return Number.isFinite(previousUnread) && Number.isFinite(unread) && unread > previousUnread;
}

let sharedContext = null;

/**
 * Plays the temple bell. Returns false when audio is unavailable or the browser
 * has not yet seen a user gesture (autoplay policy); never throws.
 */
export function playTempleBell({ context, level = TEMPLE_BELL_LEVEL } = {}) {
  try {
    if (typeof navigator !== "undefined" && navigator.userActivation && navigator.userActivation.hasBeenActive === false) return false;
    const Context = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
    const audio = context || sharedContext || (Context ? (sharedContext = new Context()) : null);
    if (!audio) return false;
    if (audio.state === "suspended" && typeof audio.resume === "function") void audio.resume();
    const now = audio.currentTime;
    const master = audio.createGain();
    master.gain.value = level;
    master.connect(audio.destination);
    for (const voice of templeBellVoices()) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = voice.frequency;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(voice.gain, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + voice.decay);
      oscillator.connect(gain).connect(master);
      oscillator.start(now);
      oscillator.stop(now + voice.decay + 0.05);
    }
    // Short metallic strike transient.
    const strike = audio.createOscillator();
    const strikeGain = audio.createGain();
    strike.type = "triangle";
    strike.frequency.value = TEMPLE_BELL_STRIKE_HZ * 7.3;
    strikeGain.gain.setValueAtTime(0.35, now);
    strikeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    strike.connect(strikeGain).connect(master);
    strike.start(now);
    strike.stop(now + 0.08);
    return true;
  } catch {
    return false;
  }
}
