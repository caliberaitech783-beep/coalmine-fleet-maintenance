// One PostgreSQL listener per application instance. NOTIFY is delivered only
// after commit, so a toast cannot precede the saved request or its notification.
export function createNotificationFeed(pool, { timeoutMs = 25000 } = {}) {
  const subscribers = new Map();
  let connection = null;
  let connecting = null;
  const ensure = () => {
    if (connection) return Promise.resolve();
    if (connecting) return connecting;
    connecting = (async () => {
      const client = await pool.connect();
      let released = false;
      const release = () => { if (!released) { released = true; client.release(true); } };
      const failed = () => {
        if (connection === client) connection = null;
        release();
        for (const callbacks of subscribers.values()) for (const callback of callbacks) callback();
      };
      client.on('error', failed);
      client.on('end', failed);
      client.on('notification', ({ channel, payload }) => {
        if (channel !== 'bdms_notifications') return;
        for (const callback of subscribers.get(payload) || []) callback();
      });
      try { await client.query('LISTEN bdms_notifications'); connection = client; }
      catch (error) { release(); throw error; }
    })().finally(() => { connecting = null; });
    return connecting;
  };
  return async function subscribe(login, response) {
    let listening = true;
    try { await ensure(); } catch { listening = false; }
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    const callbacks = subscribers.get(login) || new Set();
    subscribers.set(login, callbacks);
    const wake = () => resolve();
    callbacks.add(wake);
    const timer = setTimeout(wake, listening ? timeoutMs : 5000);
    response.on('close', wake);
    if (response.destroyed) wake();
    return {
      promise,
      close() {
        clearTimeout(timer);
        response.off('close', wake);
        callbacks.delete(wake);
        if (!callbacks.size) subscribers.delete(login);
      },
    };
  };
}
