import {randomUUID} from "node:crypto";

const DEFAULT_SESSION_MAX_AGE_DAYS = 30;

export function createSessionStore(pool, {maxAgeDays = DEFAULT_SESSION_MAX_AGE_DAYS} = {}) {
  const boundedMaxAgeDays = Math.max(1, Math.floor(Number(maxAgeDays) || DEFAULT_SESSION_MAX_AGE_DAYS));
  return {
    async create({token, role, name, login = "", userType = "", assignedRole = "", permissions = {}, ipAddress = "", deviceId = "", userAgent = ""}) {
      // Expired tokens are already rejected by get(); prune them opportunistically
      // so the session table stays bounded without a deploy-wide logout.
      await pool.query(
        `DELETE FROM auth_sessions
         WHERE created_at <= NOW() - make_interval(days => $1::int)`,
        [boundedMaxAgeDays]
      ).catch(() => {});
      const sessionId = randomUUID();
      await pool.query(
        `INSERT INTO auth_sessions (token, session_public_id, role, employee_name, login_name, user_type, assigned_role, permissions, ip_address, device_id, user_agent, last_seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, NOW())
         ON CONFLICT (token) DO UPDATE
         SET role = EXCLUDED.role, employee_name = EXCLUDED.employee_name, login_name = EXCLUDED.login_name,
             user_type = EXCLUDED.user_type, assigned_role = EXCLUDED.assigned_role, permissions = EXCLUDED.permissions,
             ip_address = EXCLUDED.ip_address, device_id = EXCLUDED.device_id, user_agent = EXCLUDED.user_agent,
             last_seen_at = NOW()`,
        [token, sessionId, role, name, login, userType, assignedRole, JSON.stringify(permissions), ipAddress, deviceId, userAgent]
      );
      return sessionId;
    },

    async get(token) {
      if (!token) return null;
      const {rows} = await pool.query(
        `SELECT session_public_id AS "sessionId", role, employee_name AS name, login_name AS login, user_type AS "userType",
                assigned_role AS "assignedRole", permissions, created_at, last_seen_at AS "lastSeenAt",
                ip_address AS "ipAddress", device_id AS "deviceId", user_agent AS "userAgent"
         FROM auth_sessions
         WHERE token = $1
           AND created_at > NOW() - make_interval(days => $2::int)`,
        [token, boundedMaxAgeDays]
      );
      return rows[0] || null;
    },

    async touch(token, {ipAddress = "", deviceId = "", userAgent = ""} = {}) {
      if (!token) return;
      await pool.query(
        `UPDATE auth_sessions SET last_seen_at=NOW(),
          ip_address=CASE WHEN $2<>'' THEN $2 ELSE ip_address END,
          device_id=CASE WHEN $3<>'' THEN $3 ELSE device_id END,
          user_agent=CASE WHEN $4<>'' THEN $4 ELSE user_agent END
         WHERE token=$1 AND last_seen_at<NOW()-INTERVAL '1 minute'`,
        [token, ipAddress, deviceId, userAgent]
      );
    },

    async revoke(sessionId) {
      const {rows} = await pool.query(
        `DELETE FROM auth_sessions WHERE session_public_id=$1
         RETURNING session_public_id AS "sessionId", login_name AS login, employee_name AS name, role, user_type AS "userType", assigned_role AS "assignedRole", ip_address AS "ipAddress", device_id AS "deviceId", user_agent AS "userAgent", created_at AS "createdAt", last_seen_at AS "lastSeenAt"`,
        [sessionId]
      );
      return rows[0] || null;
    },
  };
}
