export function createSessionStore(pool) {
  return {
    async create({token, role, name}) {
      await pool.query(
        `INSERT INTO auth_sessions (token, role, employee_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (token) DO UPDATE
         SET role = EXCLUDED.role, employee_name = EXCLUDED.employee_name`,
        [token, role, name]
      );
    },

    async get(token) {
      if (!token) return null;
      const {rows} = await pool.query(
        `SELECT role, employee_name AS name, created_at
         FROM auth_sessions
         WHERE token = $1`,
        [token]
      );
      return rows[0] || null;
    }
  };
}
