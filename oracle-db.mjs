import oracledb from "oracledb";

const user = String(process.env.ORACLE_DB_USER || "").trim();
const password = String(process.env.ORACLE_DB_PASSWORD || "");
const connectString = String(process.env.ORACLE_DB_CONNECT_STRING || "").trim();

export const oracleConfigured = Boolean(user && password && connectString);

let poolPromise;

async function oraclePool() {
  if (!oracleConfigured) throw new Error("Oracle database settings are not configured.");
  if (!poolPromise) {
    poolPromise = oracledb.createPool({
      user,
      password,
      connectString,
      poolMin: 0,
      poolMax: 4,
      poolIncrement: 1,
      poolTimeout: 60,
      queueTimeout: 5000,
    }).catch((error) => {
      poolPromise = undefined;
      throw error;
    });
  }
  return poolPromise;
}

export async function oracleHealth() {
  const pool = await oraclePool();
  const connection = await pool.getConnection();
  try {
    const result = await connection.execute(
      "SELECT SYS_CONTEXT('USERENV','SESSION_USER') AS session_user, SYS_CONTEXT('USERENV','DB_NAME') AS database_name, SYSTIMESTAMP AS server_time FROM dual",
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const row = result.rows?.[0] || {};
    return {
      configured: true,
      connected: true,
      sessionUser: row.SESSION_USER || "",
      databaseName: row.DATABASE_NAME || "",
      serverTime: row.SERVER_TIME || null,
      access: "read-only",
    };
  } finally {
    await connection.close();
  }
}

