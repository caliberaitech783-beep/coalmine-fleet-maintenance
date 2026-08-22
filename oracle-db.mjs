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

export async function oracleEquipmentTransfers() {
  const pool = await oraclePool();
  const connection = await pool.getConnection();
  try {
    const result = await connection.execute(
      `SELECT transfer.tno AS oracle_tno,
              transfer.equipmenttransferno AS transfer_no,
              TO_CHAR(transfer.equipmenttransferdate, 'YYYY-MM-DD') AS transfer_date,
              transfer.locationcode AS from_location,
              transfer.tolocationcode AS to_location,
              transfer.equipmenttno AS equipment_tno,
              equipment.equipmentid AS equipment_id,
              equipment.equipmentname AS equipment_name,
              equipment.equipmentno AS equipment_no,
              equipment.manufacturermodelno AS model_no,
              equipment.manufacturerserialno AS manufacturer_serial_no,
              transfer.chasisno AS chassis_no,
              transfer.dieselquantity AS diesel_qty,
              transfer.kmr AS kmr,
              transfer.hmr AS hmr,
              transfer.drivercode AS driver_code,
              employee.employeename AS driver_name
       FROM cmpl.equipmenttransfer transfer
       LEFT JOIN cmpl.equipment equipment ON equipment.tno = transfer.equipmenttno
       LEFT JOIN cmpl.employee employee ON employee.employeecode = transfer.drivercode
       ORDER BY transfer.equipmenttransferdate ASC, transfer.tno ASC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 100000 },
    );
    return (result.rows || []).map((row) => ({
      oracleTno: String(row.ORACLE_TNO ?? ""),
      transferNo: String(row.TRANSFER_NO ?? ""),
      transferDate: String(row.TRANSFER_DATE ?? ""),
      source: String(row.FROM_LOCATION ?? ""),
      destination: String(row.TO_LOCATION ?? ""),
      equipmentTno: String(row.EQUIPMENT_TNO ?? ""),
      equipmentId: String(row.EQUIPMENT_ID ?? ""),
      equipmentName: String(row.EQUIPMENT_NAME ?? ""),
      equipmentNo: String(row.EQUIPMENT_NO ?? ""),
      modelNo: String(row.MODEL_NO ?? ""),
      manufacturerSerialNo: String(row.MANUFACTURER_SERIAL_NO ?? ""),
      chassisNo: String(row.CHASSIS_NO ?? ""),
      dieselQty: String(row.DIESEL_QTY ?? ""),
      kmr: String(row.KMR ?? ""),
      hmr: String(row.HMR ?? ""),
      driverCode: String(row.DRIVER_CODE ?? ""),
      driver: String(row.DRIVER_NAME ?? ""),
    }));
  } finally {
    await connection.close();
  }
}

export async function oracleEquipmentMasterRecords() {
  const pool = await oraclePool();
  const connection = await pool.getConnection();
  try {
    const result = await connection.execute(
      `SELECT equipment.tno AS oracle_tno,
              equipment.equipmentno AS oracle_equipment_no,
              equipment.equipmentid AS equipment_id,
              equipment.equipmentname AS equipment_name,
              NVL((SELECT MAX(location.locationname) FROM cmpl.location location
                   WHERE location.locationcode = equipment.locationcode), equipment.locationcode) AS current_location,
              NVL((SELECT MAX(category.equipmentcategoryname) FROM cmpl.equipmentcategory category
                   WHERE category.equipmentcategorycode = equipment.equipmentcategorycode), equipment.equipmentcategorycode) AS category_name,
              NVL((SELECT MAX(equipment_group.equipmentgroupname) FROM cmpl.equipmentgroup equipment_group
                   WHERE equipment_group.equipmentgroupcode = equipment.equipmentgroupcode), equipment.equipmentgroupcode) AS group_name,
              NVL((SELECT MAX(item.itemname) FROM cmpl.item item
                   WHERE item.itemcode = equipment.itemcode), equipment.itemcode) AS item_name,
              NVL((SELECT MAX(specification.itemspecificationname) FROM cmpl.itemspecification specification
                   WHERE specification.itemspecificationcode = equipment.itemspecificationcode), equipment.itemspecificationcode) AS item_specification,
              TO_CHAR(equipment.equipmentacquisitiondate, 'YYYY-MM-DD') AS acquisition_date,
              NVL(equipment.manufacturername, NVL(equipment.manufacturemakecode, equipment.manufacturermakecode)) AS make_name,
              NVL(equipment.manufacturermodelno, equipment.manufacturemodelcode) AS model_name,
              equipment.manufacturerserialno AS manufacturer_serial_no,
              equipment.engineno AS engine_no,
              equipment.chasisno AS chassis_no,
              equipment.registrationno AS registration_no,
              equipment.vrnno AS vrn_no,
              equipment.assetno AS asset_no,
              equipment.doctypecode AS document_status
       FROM cmpl.equipment equipment
       WHERE UPPER(TRIM(equipment.equipmenttypecode)) = 'ASSET'
         AND UPPER(TRIM(equipment.equipmentcategorycode)) IN ('VEHICLE', 'EQUIPMENT')
       ORDER BY equipment.tno ASC`,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 100000 },
    );
    return (result.rows || []).map((row) => ({
      oracleEquipmentTno: String(row.ORACLE_TNO ?? ""),
      oracleEquipmentNo: String(row.ORACLE_EQUIPMENT_NO ?? ""),
      equipmentId: String(row.EQUIPMENT_ID ?? ""),
      equipmentName: String(row.EQUIPMENT_NAME ?? ""),
      currentLocation: String(row.CURRENT_LOCATION ?? ""),
      category: String(row.CATEGORY_NAME ?? ""),
      group: String(row.GROUP_NAME ?? ""),
      itemName: String(row.ITEM_NAME ?? ""),
      itemSpecification: String(row.ITEM_SPECIFICATION ?? ""),
      acquisitionDate: String(row.ACQUISITION_DATE ?? ""),
      make: String(row.MAKE_NAME ?? ""),
      model: String(row.MODEL_NAME ?? ""),
      manufacturerSerialNo: String(row.MANUFACTURER_SERIAL_NO ?? ""),
      engineNo: String(row.ENGINE_NO ?? ""),
      chassisNo: String(row.CHASSIS_NO ?? ""),
      registrationNo: String(row.REGISTRATION_NO ?? ""),
      vrnNo: String(row.VRN_NO ?? ""),
      asset: String(row.ASSET_NO ?? ""),
      documentStatus: String(row.DOCUMENT_STATUS ?? ""),
    }));
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
