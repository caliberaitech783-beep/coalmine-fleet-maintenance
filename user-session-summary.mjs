// Count accounts by canonical login, never by employee display name.
// Several devices, tabs or application sessions may belong to the same account.
export function summarizeUserSessions(sessions = []) {
  const users = new Set();
  const onlineUsers = new Set();
  const devices = new Set();
  let online = 0;
  for (const session of sessions) {
    const login = String(session.login || '').trim().toLowerCase();
    const device = String(session.deviceId || '').trim();
    if (login) users.add(login);
    if (device) devices.add(device);
    if (session.online === true) {
      online++;
      // A missing login is not evidence of a distinct user account.
      if (login) onlineUsers.add(login);
    }
  }
  return {
    unexpired: sessions.length,
    active: sessions.length, // Compatibility for already-open older clients.
    online, // Session count retained for existing API consumers.
    onlineUsers: onlineUsers.size,
    users: users.size,
    devices: devices.size,
  };
}
