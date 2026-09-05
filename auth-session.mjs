const DEFAULT_SESSION_MAX_AGE_DAYS = 30;

export function createSessionStore(pool, {maxAgeDays = DEFAULT_SESSION_MAX_AGE_DAYS} = {}) {
  const boundedMaxAgeDays = Math.max(1, Math.floor(Number(maxAgeDays) || DEFAULT_SESSION_MAX_AGE_DAYS));
  return {
    async create({token, role, name, login = "", userType = "", assignedRole = "", permissions = {}}) {
      // Expired tokens are already rejected by get(); prune them opportunistically
      // so the session table stays bounded without a deploy-wide logout.
      await pool.query(
        `DELETE FROM auth_sessions
         WHERE created_at <= NOW() - make_interval(days => $1::int)`,
        [boundedMaxAgeDays]
      ).catch(() => {});
      await pool.query(
        `INSERT INTO auth_sessions (token, role, employee_name, login_name, user_type, assigned_role, permissions)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (token) DO UPDATE
         SET role = EXCLUDED.role, employee_name = EXCLUDED.employee_name, login_name = EXCLUDED.login_name,
             user_type = EXCLUDED.user_type, assigned_role = EXCLUDED.assigned_role, permissions = EXCLUDED.permissions`,
        [token, role, name, login, userType, assignedRole, JSON.stringify(permissions)]
      );
    },

    async get(token) {
      if (!token) return null;
      const {rows} = await pool.query(
        `SELECT role, employee_name AS name, login_name AS login, user_type AS "userType",
                assigned_role AS "assignedRole", permissions, created_at
         FROM auth_sessions
         WHERE token = $1
           AND created_at > NOW() - make_interval(days => $2::int)`,
        [token, boundedMaxAgeDays]
      );
      return rows[0] || null;
    }
  };
}
