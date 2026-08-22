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

export async function oracleDriverLookup({ date, time, location, equipmentNo }) {
  const pool = await oraclePool();
  const connection = await pool.getConnection();
  try {
    const result = await connection.execute(
      `SELECT driver_name, operator_code, source_type
       FROM (
         SELECT employee_name AS driver_name, operator_code, source_type,
                ROW_NUMBER() OVER (
                  ORDER BY time_match DESC, time_distance ASC, logbook_tno DESC
                ) AS result_rank
         FROM (
           SELECT emp.employeename AS employee_name,
                  log.operatorcode AS operator_code,
                  'Equipment logbook' AS source_type,
                  log.tno AS logbook_tno,
                  CASE WHEN requested_at BETWEEN NVL(detail_start, log.equipmentlogbookdate)
                                                AND NVL(detail_end, NVL(detail_start, log.equipmentlogbookdate))
                       THEN 1 ELSE 0 END AS time_match,
                  ABS(requested_at - NVL(detail_start, log.equipmentlogbookdate)) AS time_distance
           FROM cmpl.equipmentlogbook log
           JOIN cmpl.equipment equipment ON equipment.tno = log.equipmenttno
           JOIN cmpl.location site ON site.locationcode = log.locationcode
           LEFT JOIN cmpl.employee emp ON emp.employeecode = log.operatorcode
           LEFT JOIN (
             SELECT tno, MIN(starttime) AS detail_start, MAX(endtime) AS detail_end
             FROM cmpl.equipmentlogbookdetail GROUP BY tno
           ) detail ON detail.tno = log.tno
           CROSS JOIN (
             SELECT TO_DATE(:request_date || ' ' || :request_time, 'YYYY-MM-DD HH24:MI:SS') requested_at
             FROM dual
           ) requested
           WHERE TRUNC(log.equipmentlogbookdate) = TO_DATE(:request_date, 'YYYY-MM-DD')
             AND REGEXP_REPLACE(UPPER(site.locationname), '[^A-Z0-9]', '') = :location_key
             AND :equipment_key IN (
               REGEXP_REPLACE(UPPER(equipment.equipmentid), '[^A-Z0-9]', ''),
               REGEXP_REPLACE(UPPER(equipment.equipmentname), '[^A-Z0-9]', ''),
               REGEXP_REPLACE(UPPER(equipment.equipmentno), '[^A-Z0-9]', '')
             )
           UNION ALL
           SELECT emp.employeename AS employee_name,
                  log.operatorcode AS operator_code,
                  'Vehicle logbook' AS source_type,
                  log.tno AS logbook_tno,
                  CASE WHEN requested_at BETWEEN NVL(detail_start, log.vehiclelogbookdate)
                                                AND NVL(detail_end, NVL(detail_start, log.vehiclelogbookdate))
                       THEN 1 ELSE 0 END AS time_match,
                  ABS(requested_at - NVL(detail_start, log.vehiclelogbookdate)) AS time_distance
           FROM cmpl.vehiclelogbook log
           LEFT JOIN cmpl.equipment equipment ON equipment.tno = log.equipmenttno
           JOIN cmpl.location site ON site.locationcode = log.locationcode
           LEFT JOIN cmpl.employee emp ON emp.employeecode = log.operatorcode
           LEFT JOIN (
             SELECT tno, MIN(loadingtime) AS detail_start, MAX(unloadingtime) AS detail_end
             FROM cmpl.vehiclelogbookdetail GROUP BY tno
           ) detail ON detail.tno = log.tno
           CROSS JOIN (
             SELECT TO_DATE(:request_date || ' ' || :request_time, 'YYYY-MM-DD HH24:MI:SS') requested_at
             FROM dual
           ) requested
           WHERE TRUNC(log.vehiclelogbookdate) = TO_DATE(:request_date, 'YYYY-MM-DD')
             AND REGEXP_REPLACE(UPPER(site.locationname), '[^A-Z0-9]', '') = :location_key
             AND :equipment_key IN (
               REGEXP_REPLACE(UPPER(NVL(equipment.equipmentid, '')), '[^A-Z0-9]', ''),
               REGEXP_REPLACE(UPPER(NVL(equipment.equipmentname, '')), '[^A-Z0-9]', ''),
               REGEXP_REPLACE(UPPER(NVL(equipment.equipmentno, '')), '[^A-Z0-9]', ''),
               REGEXP_REPLACE(UPPER(NVL(log.vehicleno, '')), '[^A-Z0-9]', '')
             )
         ) candidates
         WHERE employee_name IS NOT NULL
       ) ranked
       WHERE result_rank = 1`,
      {
        request_date: date,
        request_time: time,
        location_key: String(location).toUpperCase().replace(/[^A-Z0-9]/g, ""),
        equipment_key: String(equipmentNo).toUpperCase().replace(/[^A-Z0-9]/g, ""),
      },
      { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 1 },
    );
    const row = result.rows?.[0];
    return row
      ? { found: true, driverName: row.DRIVER_NAME || "", operatorCode: row.OPERATOR_CODE || "", source: row.SOURCE_TYPE || "" }
      : { found: false, driverName: "", operatorCode: "", source: "" };
  } finally {
    await connection.close();
  }
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
