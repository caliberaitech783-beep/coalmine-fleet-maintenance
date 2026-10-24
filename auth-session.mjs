const DEFAULT_SESSION_MAX_AGE_DAYS = 7;
const validSessionToken = token => typeof token === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);

export function createSessionStore(pool, {
  maxAgeDays = DEFAULT_SESSION_MAX_AGE_DAYS,
  cleanup = null,
} = {}) {
  const boundedMaxAgeDays = Math.max(1, Math.floor(Number(maxAgeDays) || DEFAULT_SESSION_MAX_AGE_DAYS));
  return {
    // Call only after password verification. Re-entering the same account in
    // another tab of this browser must not invalidate its already-open tabs.
    async createForVerifiedDevice(session, details = {}) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const login = String(session.login || '').trim().toLowerCase();
        const application = session.permissions?.application || 'BDMS';
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`login:${application}:${login}`]);
        let token = session.token;
        if (login && details.deviceId) {
          const {rows} = await client.query(`SELECT s.token FROM auth_sessions s
            JOIN user_current_sessions c ON c.session_id=s.session_public_id
            WHERE c.login=$1 AND c.application=$2 AND s.device_id=$3
              AND s.created_at>NOW()-make_interval(days=>$4::int)
              AND s.role=$5 AND s.user_type=$6 AND s.assigned_role=$7 AND s.permissions=$8::jsonb`,
            [login, application, details.deviceId, boundedMaxAgeDays, session.role,
              session.userType || '', session.assignedRole || '', JSON.stringify(session.permissions || {})]);
          if (rows[0]) token = rows[0].token;
        }
        const transactionStore = createSessionStore(client, {maxAgeDays: boundedMaxAgeDays});
        await transactionStore.create({...session, token});
        await transactionStore.touch(token, details);
        await client.query('COMMIT');
        return token;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async create({token, role, name, login = "", userType = "", assignedRole = "", permissions = {}}) {
      // Physical cleanup requires the backup-gated retention job.
      await pool.query(
        `INSERT INTO auth_sessions (token, role, employee_name, login_name, user_type, assigned_role, permissions)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (token) DO UPDATE
         SET role = EXCLUDED.role, employee_name = EXCLUDED.employee_name, login_name = EXCLUDED.login_name,
             user_type = EXCLUDED.user_type, assigned_role = EXCLUDED.assigned_role, permissions = EXCLUDED.permissions,
             last_seen_at = NOW()`,
        [token, role, name, login, userType, assignedRole, JSON.stringify(permissions)]
      );
    },

    async get(token) {
      if (!validSessionToken(token)) return null;
      const {rows} = await pool.query(
        `SELECT role, employee_name AS name, login_name AS login, user_type AS "userType",
                assigned_role AS "assignedRole", permissions, created_at,
                session_public_id AS "sessionId"
         FROM auth_sessions
         WHERE token = $1
           AND EXISTS(SELECT 1 FROM user_current_sessions current_login WHERE current_login.session_id=auth_sessions.session_public_id)
           AND created_at > NOW() - make_interval(days => $2::int)`,
        [token, boundedMaxAgeDays]
      );
      // Tender tracking credentials never authorize a BDMS application request.
      if(['Tender','MIS','HR'].includes(rows[0]?.permissions?.application))return null;
      return rows[0] || null;
    },

    async touch(token, {ipAddress = "", deviceId = "", userAgent = ""} = {}) {
      if (!validSessionToken(token)) return;
      await pool.query(
        `UPDATE auth_sessions
         SET last_seen_at = NOW(), ip_address = $2, device_id = $3, user_agent = $4
         WHERE token = $1
           AND (last_seen_at <= NOW() - INTERVAL '30 seconds'
             OR ip_address IS DISTINCT FROM $2
             OR device_id IS DISTINCT FROM $3
             OR user_agent IS DISTINCT FROM $4)`,
        [token, ipAddress, deviceId, userAgent]
      );
    },

    async pruneExpired() {
      if (!cleanup) return 0;
      const result = await cleanup();
      return Number(result?.removed?.auth_sessions || 0);
    },
  };
}
