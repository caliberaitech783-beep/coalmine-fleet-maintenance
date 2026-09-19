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

/** Shared AudioContext, or null when audio is unavailable or no user gesture has happened yet. */
function audioContext(context) {
  if (typeof navigator !== "undefined" && navigator.userActivation && navigator.userActivation.hasBeenActive === false) return null;
  const Context = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
  const audio = context || sharedContext || (Context ? (sharedContext = new Context()) : null);
  if (!audio) return null;
  if (audio.state === "suspended" && typeof audio.resume === "function") void audio.resume();
  return audio;
}

/**
 * Plays the temple bell. Returns false when audio is unavailable or the browser
 * has not yet seen a user gesture (autoplay policy); never throws.
 */
export function playTempleBell({ context, level = TEMPLE_BELL_LEVEL } = {}) {
  try {
    const audio = audioContext(context);
    if (!audio) return false;
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

// ---------------------------------------------------------------- selectable sounds

export const NOTIFICATION_SOUNDS = Object.freeze([
  { id: "temple", label: "Temple bell", hint: "Deep bronze bell that rings for a few seconds" },
  { id: "chime", label: "Soft chime", hint: "Two gentle rising notes" },
  { id: "dingdong", label: "Ding-dong", hint: "Doorbell style, two tones" },
  { id: "beep", label: "Digital beep", hint: "Two short electronic beeps" },
  { id: "silent", label: "Silent", hint: "No sound, the bell still rings on screen" },
]);
export const DEFAULT_NOTIFICATION_SOUND = "temple";
export const NOTIFICATION_SOUND_KEY = "bdms:notification-sound";

export function normalizeNotificationSound(id) {
  return NOTIFICATION_SOUNDS.some((sound) => sound.id === id) ? id : DEFAULT_NOTIFICATION_SOUND;
}

/** The sound chosen on this device (per browser), defaulting to the temple bell. */
export function loadNotificationSound(storage = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    return normalizeNotificationSound(storage?.getItem(NOTIFICATION_SOUND_KEY));
  } catch {
    return DEFAULT_NOTIFICATION_SOUND;
  }
}

export function saveNotificationSound(id, storage = typeof localStorage !== "undefined" ? localStorage : null) {
  const sound = normalizeNotificationSound(id);
  try { storage?.setItem(NOTIFICATION_SOUND_KEY, sound); } catch { /* private mode: keep it for this session only */ }
  return sound;
}

/** Notes of the simple sounds: frequency (Hz), start offset and duration (s), oscillator type, peak gain. */
export function toneScript(id) {
  switch (normalizeNotificationSound(id)) {
    case "chime": return [
      { frequency: 880, start: 0, duration: 0.7, type: "sine", gain: 0.18 },
      { frequency: 1174.7, start: 0.12, duration: 0.7, type: "sine", gain: 0.18 },
    ];
    case "dingdong": return [
      { frequency: 659.3, start: 0, duration: 0.55, type: "triangle", gain: 0.22 },
      { frequency: 523.3, start: 0.35, duration: 0.8, type: "triangle", gain: 0.22 },
    ];
    case "beep": return [
      { frequency: 1000, start: 0, duration: 0.12, type: "square", gain: 0.08 },
      { frequency: 1000, start: 0.2, duration: 0.12, type: "square", gain: 0.08 },
    ];
    default: return [];
  }
}

function playToneScript(script, { context } = {}) {
  try {
    const audio = audioContext(context);
    if (!audio || !script.length) return false;
    const now = audio.currentTime;
    for (const note of script) {
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = note.type;
      oscillator.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0, now + note.start);
      gain.gain.linearRampToValueAtTime(note.gain, now + note.start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(now + note.start);
      oscillator.stop(now + note.start + note.duration + 0.05);
    }
    return true;
  } catch {
    return false;
  }
}

/** Plays the chosen sound; "silent" plays nothing. Never throws. */
export function playNotificationSound(id, options = {}) {
  const sound = normalizeNotificationSound(id);
  if (sound === "silent") return false;
  if (sound === "temple") return playTempleBell(options);
  return playToneScript(toneScript(sound), options);
}
