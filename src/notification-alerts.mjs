// IDs, rather than unread state or timestamps, distinguish new events. The first
// successful response is always a silent baseline (including an empty inbox).
export function createNotificationTracker() {
  let initialized = false;
  const seen = new Set();
  return (items) => {
    if (!Array.isArray(items)) return [];
    const fresh = [];
    for (const item of [...items].reverse()) {
      const id = String(item?.id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (initialized) fresh.push(item);
    }
    initialized = true;
    return fresh;
  };
}

// Browsers require a user gesture before audio. Unlock silently; never queue
// old sounds to replay after a later click. A blocked sound cannot block a toast.
export function createNotificationSound(win = window) {
  let context;
  let disposed = false;
  const unlock = () => {
    if (disposed) return;
    try {
      const Audio = win.AudioContext || win.webkitAudioContext;
      if (!Audio) return;
      context ||= new Audio();
      if (context.state === 'suspended') void context.resume().catch(() => {});
    } catch {}
  };
  win.addEventListener('pointerdown', unlock);
  win.addEventListener('keydown', unlock);
  return {
    play() {
      if (disposed || context?.state !== 'running') return;
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, start);
        oscillator.frequency.setValueAtTime(1174, start + .12);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.12, start + .02);
        gain.gain.exponentialRampToValueAtTime(.001, start + .4);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.start(start); oscillator.stop(start + .42);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      } catch {}
    },
    close() {
      disposed = true;
      win.removeEventListener('pointerdown', unlock);
      win.removeEventListener('keydown', unlock);
      void context?.close().catch(() => {});
    },
  };
}
