export function createSessionStore(pool) {
  return {
    async create({token, role, name, login = "", userType = "", assignedRole = "", permissions = {}}) {
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
         WHERE token = $1`,
        [token]
      );
      return rows[0] || null;
    }
  };
}
