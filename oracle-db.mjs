import {companyCode,companyScopedSql,COMPANY_LIST_SQL} from './iboss-company-scope.mjs';
import {accountPageQuery,accountPageResult,ACCOUNT_PAGE_SIZE} from './iboss-account-pages.mjs';
import {DASHBOARD_QUERIES,buildDashboard,dashboardMetric,DASHBOARD_PAGE_SIZE} from './iboss-dashboard.mjs';
import {dashboardCache} from './iboss-dashboard-cache.mjs';
import oracledb from "oracledb";
import {accountView,accountRecord,mergeChain,mergeStatements,buildMergedReport,buildTrail} from './iboss-accounts.mjs';
import {STOCK_STATEMENT_SQL, stockStatementRow} from './stock-statement.mjs';
import {PURCHASE_ORDER_SQL,purchaseOrderRange,purchaseOrderRow} from './purchase-order-report.mjs';
import {GRN_REGISTER_SQL,grnRegisterRow} from './grn-register.mjs';
import {RECONCILIATION_PO_SQL,RECONCILIATION_GRN_SQL,buildPoGrnReconciliation} from './po-grn-reconciliation.mjs';
import { transferSyncDate } from "./transfer-sync-date.mjs";

const user = String(process.env.ORACLE_DB_USER || "").trim();
const password = String(process.env.ORACLE_DB_PASSWORD || "");
const connectString = String(process.env.ORACLE_DB_CONNECT_STRING || "").trim();

const cachedDashboard=dashboardCache();
export async function oracleAccountsDashboard(from,to,section='all',company=''){
  purchaseOrderRange(from,to);companyCode(company);
  if(!['all','core','receivable','tax'].includes(section))throw new Error('Invalid dashboard section.');
  return cachedDashboard(JSON.stringify([from,to,section,company]),()=>loadAccountsDashboard(from,to,section,company));
}
async function loadAccountsDashboard(from,to,section,company){
  const values={...purchaseOrderRange(from,to),company_code:company},pool=await oraclePool(),connection=await pool.getConnection();
  try{
    connection.callTimeout=60000;await connection.execute('SET TRANSACTION READ ONLY');
    const groups={};
    for(const [key,definition] of Object.entries(DASHBOARD_QUERIES)){
      const sql=companyScopedSql(definition.sql,company);
      if(section==='core'&&['receivable','tax'].includes(key))continue;
      if(['receivable','tax'].includes(section)&&key!==section)continue;
      const binds=Object.fromEntries([...new Set([...sql.matchAll(/:(\w+)/g)].map(match=>match[1]))].map(name=>[name,values[name]]));
      const result=await connection.execute(sql,binds,{outFormat:oracledb.OUT_FORMAT_OBJECT,maxRows:50001,fetchArraySize:2000});
      if(result.rows.length>50000)throw new Error('Dashboard source exceeds the supported grouping limit.');
      groups[key]=result.rows;
    }
    const companies=section==='core'||section==='all'?(await connection.execute(COMPANY_LIST_SQL,{},{outFormat:oracledb.OUT_FORMAT_OBJECT})).rows:[];
    return {...buildDashboard(groups,{from,to}),company,companies};
  }finally{await connection.close();}
}

export async function oracleAccountsCount(view,from,to,search='',company='') {
 const query=accountPageQuery(view,from,to,0,search),sql=companyScopedSql(query.countSql,company),binds={...query.countBinds};
 if(sql.includes(':company_code'))binds.company_code=company;
 return oracleReportCount(sql,binds);
}
export async function oracleDashboardCount(key,input) {
 const query=dashboardMetric(key,input);return oracleReportCount(query.countSql,query.countBinds);
}
async function oracleReportCount(sql,binds) {
 const pool=await oraclePool(),connection=await pool.getConnection();
 try{connection.callTimeout=60000;const result=await connection.execute(sql,binds,{outFormat:oracledb.OUT_FORMAT_OBJECT,maxRows:1});return {totalCount:Number(result.rows[0].TOTAL_COUNT)};}
 finally{await connection.close();}
}

export async function oracleAccountsDashboardMetric(key,input){
  const request=dashboardMetric(key,input),pool=await oraclePool(),connection=await pool.getConnection();
  try{
    connection.callTimeout=60000;
    const result=await connection.execute(request.sql,request.binds,{outFormat:oracledb.OUT_FORMAT_OBJECT,maxRows:DASHBOARD_PAGE_SIZE+1});
    return {view:request.view,columns:request.columns,from:request.from,to:request.to,page:request.page,rows:result.rows.slice(0,DASHBOARD_PAGE_SIZE).map(accountRecord),hasMore:result.rows.length>DASHBOARD_PAGE_SIZE};
  }finally{await connection.close();}
}

export const oracleConfigured = Boolean(user && password && connectString);

let poolPromise;
let stockStatementCache;
let stockStatementPending;

export async function oracleAccounts(view,from,to,page=0,search='',company='') {
  const query=accountPageQuery(view,from,to,page,search);query.sql=companyScopedSql(query.sql,company);if(query.sql.includes(':company_code'))query.binds.company_code=company;
  const pool=await oraclePool();const connection=await pool.getConnection();
  try {
    connection.callTimeout=60000;
    const result=await connection.execute(query.sql,query.binds,{outFormat:oracledb.OUT_FORMAT_OBJECT,fetchArraySize:ACCOUNT_PAGE_SIZE+1,maxRows:ACCOUNT_PAGE_SIZE+1});
    return accountPageResult(result.rows,query.page);
  } finally {await connection.close();}
}

async function runMergeStatements(statements,company='') {
  const pool=await oraclePool();const connection=await pool.getConnection();
  try {
    connection.callTimeout=90000;
    await connection.execute('SET TRANSACTION READ ONLY');
    const rowsByStep={};
    for(const statement of statements){
      statement.sql=companyScopedSql(statement.sql,company);if(statement.sql.includes(':company_code'))statement.binds.company_code=company;
      const result=await connection.execute(statement.sql,statement.binds,{outFormat:oracledb.OUT_FORMAT_OBJECT,fetchArraySize:5000,maxRows:50001});
      if(result.rows.length>50000){const error=new Error('More than 50,000 records match one of the selected reports. Choose a shorter date range.');error.code='REPORT_TOO_LARGE';throw error;}
      rowsByStep[statement.step]=result.rows;
    }
    return rowsByStep;
  } finally {await connection.close();}
}

export async function oracleReportMerge(chain,steps,from,to,company='') {
  const rowsByStep=await runMergeStatements(mergeStatements(chain,steps,{from,to}),company);
  return {...buildMergedReport(chain,steps,rowsByStep),checkedAt:new Date().toISOString()};
}

export async function oracleReportMergeTrail(chain,anchorKey,from,to,company='') {
  const steps=mergeChain(chain).steps.map(step=>step.key);
  const rowsByStep=await runMergeStatements(mergeStatements(chain,steps,{from,to,anchorKey}),company);
  return {steps:buildTrail(chain,rowsByStep),checkedAt:new Date().toISOString()};
}

export async function oraclePoGrnReconciliation(from,to) {
  const binds=purchaseOrderRange(from,to);
  const pool=await oraclePool();const connection=await pool.getConnection();
  try {
    connection.callTimeout=60000;
    await connection.execute('SET TRANSACTION READ ONLY');
    const options={outFormat:oracledb.OUT_FORMAT_OBJECT,fetchArraySize:1000,maxRows:50001};
    const orders=await connection.execute(RECONCILIATION_PO_SQL,binds,options);
    if(orders.rows.length>50000){const error=new Error('More than 50,000 PO lines match this range. Choose a shorter date range.');error.code='REPORT_TOO_LARGE';throw error;}
    const receipts=await connection.execute(RECONCILIATION_GRN_SQL,binds,options);
    if(receipts.rows.length>50000){const error=new Error('More than 50,000 GRN lines match this range. Choose a shorter date range.');error.code='REPORT_TOO_LARGE';throw error;}
    return {...buildPoGrnReconciliation(orders.rows,receipts.rows,{from,to}),checkedAt:new Date().toISOString()};
  } finally {await connection.close();}
}

export async function oracleGrnRegister(from,to) {
  const binds=purchaseOrderRange(from,to);
  const pool=await oraclePool();
  const connection=await pool.getConnection();
  try {
    connection.callTimeout=60000;
    const result=await connection.execute(GRN_REGISTER_SQL,binds,{outFormat:oracledb.OUT_FORMAT_OBJECT,fetchArraySize:1000,maxRows:50001});
    if(result.rows.length>50000){const error=new Error('More than 50,000 GRN items match this range. Choose a shorter date range.');error.code='REPORT_TOO_LARGE';throw error;}
    return {rows:result.rows.map(grnRegisterRow),checkedAt:new Date().toISOString()};
  } finally {await connection.close();}
}

export async function oraclePurchaseOrderReport(from,to) {
  const binds=purchaseOrderRange(from,to);
  const pool=await oraclePool();
  const connection=await pool.getConnection();
  try {
    connection.callTimeout=60000;
    const result=await connection.execute(PURCHASE_ORDER_SQL,binds,{outFormat:oracledb.OUT_FORMAT_OBJECT,fetchArraySize:1000,maxRows:50001});
    if(result.rows.length>50000){const error=new Error('More than 50,000 order items match this range. Choose a shorter date range.');error.code='REPORT_TOO_LARGE';throw error;}
    return {rows:result.rows.map(purchaseOrderRow),checkedAt:new Date().toISOString()};
  } finally {await connection.close();}
}

export async function oracleStockStatement() {
  if(stockStatementCache && Date.now() < stockStatementCache.expiresAt) return stockStatementCache.data;
  if(stockStatementPending) return stockStatementPending;
  stockStatementPending=(async()=>{
    const pool = await oraclePool();
    const connection = await pool.getConnection();
    try {
      connection.callTimeout = 60000;
      const result = await connection.execute(STOCK_STATEMENT_SQL, {}, {outFormat:oracledb.OUT_FORMAT_OBJECT,fetchArraySize:1000});
      const data={rows:result.rows.map(stockStatementRow),checkedAt:new Date().toISOString()};
      stockStatementCache={data,expiresAt:Date.now()+60000};
      return data;
    } finally { await connection.close(); }
  })();
  try { return await stockStatementPending; }
  finally { stockStatementPending=undefined; }
}

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

let fleetDriversCache;
let fleetDriversPromise;
export async function oracleLatestFleetDrivers({refresh=false} = {}) {
  if (!refresh && fleetDriversCache && Date.now() < fleetDriversCache.expiresAt) return fleetDriversCache.rows;
  if (fleetDriversPromise) return fleetDriversPromise;
  fleetDriversPromise = (async () => {
    const pool = await oraclePool();
    const connection = await pool.getConnection();
    try {
      connection.callTimeout = 15000;
      const result = await connection.execute(
        `SELECT ranked.equipment_tno, equipment.equipmentid, equipment.equipmentname,
                equipment.equipmentno, ranked.vehicle_no, ranked.driver_name,
                TO_CHAR(ranked.log_date, 'YYYY-MM-DD HH24:MI:SS') AS driver_at
         FROM (
           SELECT candidates.*, ROW_NUMBER() OVER (
             PARTITION BY equipment_tno, CASE WHEN equipment_tno IS NULL THEN vehicle_no END
             ORDER BY log_date DESC, log_tno DESC, source_type
           ) AS result_rank
           FROM (
             SELECT log.equipmenttno AS equipment_tno, CAST(NULL AS VARCHAR2(200)) AS vehicle_no,
                    emp.employeename AS driver_name, log.equipmentlogbookdate AS log_date,
                    log.tno AS log_tno, 'Equipment' AS source_type
             FROM cmpl.equipmentlogbook log
             JOIN cmpl.employee emp ON emp.employeecode = log.operatorcode
             WHERE TRIM(emp.employeename) IS NOT NULL AND log.equipmentlogbookdate <= SYSDATE
             UNION ALL
             SELECT log.equipmenttno, log.vehicleno, emp.employeename, log.vehiclelogbookdate,
                    log.tno, 'Vehicle'
             FROM cmpl.vehiclelogbook log
             JOIN cmpl.employee emp ON emp.employeecode = log.operatorcode
             WHERE TRIM(emp.employeename) IS NOT NULL AND log.vehiclelogbookdate <= SYSDATE
             UNION ALL
             SELECT transfer.equipmenttno, CAST(NULL AS VARCHAR2(200)), emp.employeename,
                    transfer.equipmenttransferdate, transfer.tno, 'Transfer'
             FROM cmpl.equipmenttransfer transfer
             JOIN cmpl.employee emp ON emp.employeecode = transfer.drivercode
             WHERE TRIM(emp.employeename) IS NOT NULL AND transfer.equipmenttransferdate <= SYSDATE
           ) candidates
         ) ranked
         LEFT JOIN cmpl.equipment equipment ON equipment.tno = ranked.equipment_tno
         WHERE ranked.result_rank = 1`, [],
        {outFormat: oracledb.OUT_FORMAT_OBJECT, maxRows: 100000},
      );
      const rows = (result.rows || []).map(row => ({
        oracleEquipmentTno: String(row.EQUIPMENT_TNO ?? ''),
        equipmentId: String(row.EQUIPMENTID ?? ''), equipmentName: String(row.EQUIPMENTNAME ?? ''),
        oracleEquipmentNo: String(row.EQUIPMENTNO ?? ''), vehicleNo: String(row.VEHICLE_NO ?? ''),
        driverName: String(row.DRIVER_NAME ?? ''), driverAt: String(row.DRIVER_AT ?? ''),
      }));
      fleetDriversCache = {rows, expiresAt: Date.now() + 5 * 60 * 1000};
      return rows;
    } finally {
      await connection.close();
    }
  })();
  try { return await fleetDriversPromise; }
  finally { fleetDriversPromise = null; }
}

export async function oracleEquipmentTransfers(fromDate = null) {
  fromDate = transferSyncDate(fromDate);
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
       WHERE (:from_date IS NULL OR transfer.equipmenttransferdate >= TO_DATE(:from_date, 'YYYY-MM-DD'))
       ORDER BY transfer.equipmenttransferdate ASC, transfer.tno ASC`,
      { from_date: fromDate },
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
              COALESCE(NULLIF(NULLIF(TRIM(equipment.manufacturermodelno), '-'), '—'),
                       NULLIF(NULLIF(TRIM(equipment.manufacturemodelcode), '-'), '—')) AS model_name,
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
