import express from 'express';
import {createNotificationFeed} from './notification-feed.mjs';
import {formatDisplayDateTime} from './date-time-format.mjs';
import pg from 'pg';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync,readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {createSessionStore} from './auth-session.mjs';
import {repairLegacySessionDefaults} from './auth-session-schema.mjs';
import {parseIndiaRequestDateTime} from './request-time.mjs';
import {REQUEST_TIMELINE_FIELDS,parseRequestTimelineTimestamp,requestExpectedCompletionValue,validateRequestTimelineChange,buildRequestTimelineChanges,requestTimelineEvents,requestTimelineDurations} from './request-timeline.mjs';
import {hashPassword,initializeUserCredentials,publicUserRecord,verifyPassword} from './password-auth.mjs';
import {generatePasswordResetOtp,PASSWORD_RESET_MAX_ATTEMPTS,PASSWORD_RESET_MAX_REQUESTS_PER_HOUR,PASSWORD_RESET_OTP_TTL_MINUTES,passwordResetValidationError,validPasswordResetOtp} from './password-reset.mjs';
import {equipmentIdentity} from './equipment-identity.mjs';
import {mergePrivilegeRecords} from './privilege-record.mjs';
import {loginRecordCandidates,normalizeUserAccessLabels,resolveMobileAccess,userLoginCandidates} from './mobile-access.mjs';
import {REQUEST_CLOSE_STATUSES,requestDateTimeValue,validMeterEvidenceDataUrl,validMeterReading,validMeterReadings,validRequestAudioDataUrl,validTripCardImageDataUrl} from './request-workflow.mjs';
import {accessAllows,managerRoleSelection,masterAccessAllows} from './admin-access.mjs';
import {JSON_BODY_CONTENT_TYPES} from './request-body-transport.mjs';
import {normalizeMobileNavigationVisibility} from './navigation-visibility.mjs';
import {TICKET_CATEGORIES,managerUserRole,ticketReference,validTicketMediaDataUrl} from './ticket-workflow.mjs';
import {oracleConfigured,oracleDriverLookup,oracleEquipmentMasterRecords,oracleEquipmentTransfers,oracleHealth} from './oracle-db.mjs';
import {transferSyncDate} from './transfer-sync-date.mjs';
import {applyLatestTransfer,equipmentMatchKeys,isAllowedOracleEquipment,latestTransferByEquipment,oracleEquipmentMasterRecord,transferMasterRecord} from './equipment-transfer-sync.mjs';
import {sendTicketRaisedEmail} from './ticket-email.mjs';
import {sendDirectorReportEmail} from './director-report-email.mjs';
import {auditLogExportDue,auditLogExportSlot,sendAuditLogExportEmail} from './audit-log-export.mjs';
import {applyHierarchyDeliveryRule,defaultHierarchyReportScheduleSettings,flowDesignationForUser,normalizeHierarchyReportScheduleSettings,reportsDueForDesignation,reportsForHierarchyEvent} from './hierarchy-report-flow.mjs';
import {hierarchyAccessAllowsReport} from './hierarchy-report-catalogue.mjs';
import {hierarchyRecipientReportScope} from './hierarchy-report-scope.mjs';
import {prepareTicketReportRows,ticketReportDue,ticketReportWindow,buildTicketReportTable,buildTicketWhatsAppReport} from './ticket-consolidated-report.mjs';
import {META_WORKFLOW_TEMPLATES,metaWhatsAppStatus,registerMetaWhatsAppPhone,sendMetaWhatsAppDocument,sendMetaWhatsAppTemplate,sendMetaWhatsAppText,submitMetaWhatsAppTemplates,metaWhatsAppTemplateStatuses,setWhatsAppDeliveryPolicyReader} from './meta-whatsapp.mjs';
import {normalizeWhatsAppReportSettings,whatsappPurposeEnabled,PURPOSE_OPTIONS} from './whatsapp-report-settings.mjs';
import {requestedReportTemplate,reportTemplateFallback} from './whatsapp-template-runtime.mjs';
import {hierarchyReportMessagePurpose} from './whatsapp-template-catalog.mjs';
import {registerWhatsAppReportSettingsApi,reportTemplateState} from './whatsapp-report-settings-api.mjs';
import {canonicalSiteName,assignedUserSiteName,userSessionLocationName} from './site-location.mjs';
import {dashboardFleetSnapshot} from './dashboard-fleet-snapshot.mjs';
import {managerReportScope,normalizeOperationalSiteFields,normalizeUserSiteFields,reportScopeIncludesSite} from './region-scope.mjs';
import {attachRequestOems,consolidatedReportDue,consolidatedReportWindow,prepareConsolidatedRows} from './consolidated-whatsapp-report.mjs';
import {buildFleetConsolidatedReportPdf,buildTicketConsolidatedReportPdf} from './consolidated-report-pdf.mjs';
import {buildTableExportPdf} from './table-export-pdf.mjs';
import {buildDirectorReportArchiveBuffer,buildDirectorReportTables,buildDirectorWhatsAppMessage,buildXlsxWorkbookBuffer,directorReportFilename,directorReportWindow,DIRECTOR_REPORT_TITLES} from './director-report-bundle.mjs';
import {ADMIN_LOCK_TICKET_CUTOFF,ADMIN_LOCK_POLICY_PAUSED,isLockableAdmin,isTrueSuperAdmin} from './admin-lock-policy.mjs';
import {activeRequestConflictMessage} from './request-conflict.mjs';
import {auditChangedFields,auditRouteDetails,auditSafeError,auditShouldRecord,auditSubmittedFields} from './audit-trail.mjs';
import {duplicateUsername} from './user-username.mjs';
import {canReadDashboardEquipment,currentDashboardUserCandidate,dashboardEquipmentScope,dashboardEquipmentScopeIsUsable,dashboardSessionFromProfile,scopeDashboardEquipmentRecords} from './dashboard-equipment-access.mjs';
import {infoPulseRequestScope,scopeInfoPulseRequests} from './info-pulse-scope.mjs';
import {isExcludedWorkflowWhatsAppRecipient,isWorkflowWhatsAppRecipient,workflowReminderSlot,workflowRequestLink,workflowWhatsAppRecipientLogins} from './whatsapp-workflow-policy.mjs';
import {DELAYED_REASON_DEFAULTS,delayedReasonRequired} from './delayed-reason.mjs';
// Keep globally excluded request owners out of every server-backed view and report.
import {requestsVisibleGlobally,requestsVisibleToSession} from './mis-request-visibility.mjs';
import {serverErrorHandler} from './server-error-response.mjs';

const {Pool}=pg;
const app=express();
// Azure Front Door / App Service terminate TLS and proxy to Node. Without this
// every visitor shares the proxy's address, so per-IP limits (password reset
// OTP requests) fired for the whole site instead of one user.
app.set('trust proxy',true);
const port=Number(process.env.PORT||3000);
const root=path.dirname(fileURLToPath(import.meta.url));
const repairTypeDefaults=['Breakdown','Accidental','Preventive','Aggregate Repair','Super Structure','WGM'];
const staticRoot=existsSync(path.join(root,'dist','index.html'))?path.join(root,'dist'):root;
const versionFile=path.join(staticRoot,'app-version.txt');
const currentAppVersion=existsSync(versionFile)
  ? readFileSync(versionFile,'utf8').trim()
  : createHash('sha256').update(readFileSync(path.join(staticRoot,'index.html'))).digest('hex').slice(0,16);
const deploymentShaFile=path.join(root,'DEPLOYMENT_SHA');
const deploymentShaCandidate=String(process.env.DEPLOYMENT_SHA||(
  existsSync(deploymentShaFile)?readFileSync(deploymentShaFile,'utf8'):''
)).trim().toLowerCase();
const deploymentSha=/^[0-9a-f]{40}$/.test(deploymentShaCandidate)?deploymentShaCandidate:'';
const connectionString=process.env.DATABASE_URL;
const scheduledJobsEnabled=String(process.env.DISABLE_SCHEDULED_JOBS||'').trim().toLowerCase()!=='true';
const driverSyncIntervalMs=2*60*1000;
const reportDateTime=(value)=>formatDisplayDateTime(value);
const reportFilename=(kind,scope,slot)=>`Nerve-Center-${kind}-${scope}-${slot}.pdf`.replace(/[^a-z0-9._-]+/gi,'-').replace(/-+/g,'-');
const publicBaseUrl=(req)=>String(process.env.PUBLIC_APP_URL||`${req?.protocol||'https'}://${req?.get?.('host')||'bdms.cmll.in'}`).replace(/\/+$/,'');
const WHATSAPP_SETTING_KEY='meta_whatsapp';
const WHATSAPP_REPORT_SETTING_KEY='whatsapp_report_settings';
const WHATSAPP_APPROVAL_SETTING_KEY='whatsapp_template_approvals';
const HIERARCHY_REPORT_SCHEDULE_SETTING_KEY='hierarchy_report_schedules';
const AUDIT_REASON_HEADER='x-audit-reason';
const AUDIT_DEVICE_ID_HEADER='x-bdms-device-id';

const pool=new Pool({
  connectionString:connectionString||undefined,
  ssl:{rejectUnauthorized:false},
  max:10,
  idleTimeoutMillis:30000,
  connectionTimeoutMillis:10000
});
// An idle pooled client that loses its connection (PostgreSQL restart, slot
// swap, network blip) emits 'error' on the pool. Without a listener Node
// treats that as an unhandled 'error' event and exits the whole process,
// which is what turned a momentary database hiccup into a site-wide outage.
pool.on('error',error=>console.error('PostgreSQL pool connection error (will reconnect on next query).',error));
process.on('unhandledRejection',(reason)=>console.error('Unhandled promise rejection (kept the server running).',reason));
const sessionStore=createSessionStore(pool);
let databaseReady=false;
let databaseError='Database initialization is pending.';

async function revokeAuthorizationSessions(client,loginValues=[]){
  const logins=[...new Set(loginValues.map(value=>String(value||'').trim().toLowerCase()).filter(Boolean))];
  if(!logins.length)return;
  await client.query('DELETE FROM auth_sessions WHERE lower(login_name)=ANY($1::text[])',[logins]);
  await client.query(`DELETE FROM password_change_sessions AS pending
    USING master_records AS users
    WHERE pending.master_record_id=users.id
      AND users.master_name='Users & employees'
      AND (lower(trim(COALESCE(users.record_data->>'login','')))=ANY($1::text[])
        OR lower(split_part(trim(COALESCE(users.record_data->>'employee','')),' ',1))=ANY($1::text[]))`,[logins]);
}

function maskedSecret(value){
  const text=String(value||'').trim();
  if(!text)return '';
  if(text.length<=10)return 'configured';
  return `${text.slice(0,6)}...${text.slice(-4)}`;
}

async function storedWhatsAppSettings(){
  const {rows}=await pool.query('SELECT setting_value FROM app_settings WHERE setting_key=$1',[WHATSAPP_SETTING_KEY]);
  return rows[0]?.setting_value||{};
}

async function storedHierarchyReportScheduleSettings(){
  const {rows}=await pool.query('SELECT setting_value FROM app_settings WHERE setting_key=$1',[HIERARCHY_REPORT_SCHEDULE_SETTING_KEY]);
  return rows.length?normalizeHierarchyReportScheduleSettings(rows[0].setting_value):defaultHierarchyReportScheduleSettings();
}

async function storedWhatsAppReportSettings(){
  const {rows}=await pool.query('SELECT setting_value FROM app_settings WHERE setting_key=$1',[WHATSAPP_REPORT_SETTING_KEY]);
  return normalizeWhatsAppReportSettings(rows[0]?.setting_value);
}
setWhatsAppDeliveryPolicyReader(storedWhatsAppReportSettings);

async function storedWhatsAppTemplateApprovals(){
  const {rows}=await pool.query('SELECT setting_value FROM app_settings WHERE setting_key=$1',[WHATSAPP_APPROVAL_SETTING_KEY]);
  return rows[0]?.setting_value||{};
}

async function metaWhatsAppRuntimeEnv(){
  try{
    const [settings,reportSettings,approvals]=await Promise.all([storedWhatsAppSettings(),storedWhatsAppReportSettings(),storedWhatsAppTemplateApprovals()]);
    return {
      ...process.env,
      WHATSAPP_PROVIDER:String(settings.provider||process.env.WHATSAPP_PROVIDER||'meta').trim(),
      FAST2SMS_WHATSAPP_API_KEY:String(settings.providerApiKey||process.env.FAST2SMS_WHATSAPP_API_KEY||'').trim(),
      META_WHATSAPP_PHONE_NUMBER_ID:String(settings.phoneNumberId||process.env.META_WHATSAPP_PHONE_NUMBER_ID||'').trim(),
      META_WHATSAPP_ACCESS_TOKEN:String(settings.accessToken||process.env.META_WHATSAPP_ACCESS_TOKEN||'').trim(),
      META_WHATSAPP_BUSINESS_ACCOUNT_ID:String(settings.businessAccountId||process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID||'').trim(),
      META_GRAPH_VERSION:String(settings.graphVersion||process.env.META_GRAPH_VERSION||'v25.0').trim(),
      META_WHATSAPP_DELIVERY_PAUSED:String(!reportSettings.enabled),
      WHATSAPP_REPORT_SETTINGS:reportSettings,WHATSAPP_TEMPLATE_APPROVALS:approvals,
    };
  }catch(error){
    console.warn('Could not load stored WhatsApp settings; delivery is paused until settings can be read:',error.message);
    // A database read failure must not bypass the saved global pause.
    return {...process.env,META_WHATSAPP_DELIVERY_PAUSED:'true'};
  }
}

const auditClean=(value,limit=500)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,limit);
const auditSessionId=(req)=>{
  const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'').trim();
  return token?createHash('sha256').update(token).digest('hex').slice(0,16):'';
};
const auditRole=(session={})=>auditClean(session.permissions?.adminLevel||session.assignedRole||session.userType||session.role||'Unauthenticated',100);
const auditTargetReference=(req)=>auditClean(req.params?.reference||req.params?.id||req.body?.reference||req.body?.username||'',160);
const auditIpAddress=(req)=>auditClean(String(req.headers?.['x-forwarded-for']||'').split(',')[0]||req.ip||req.socket?.remoteAddress,100);
const AUDIT_VISIBLE_SCOPE_SQL=`(
  event_type NOT IN ('Workflow','Workflow timeline') AND (
  event_type IN ('Security','Master data')
  OR action IN ('Edit request','Delete request')
  OR request_path IN ('/api/login','/api/logout')
  OR request_path LIKE '/api/password-reset%'
  OR request_path LIKE '/api/change-initial-password%'
  OR request_path LIKE '/api/masters/%'
  OR (request_path LIKE '/api/requests/%' AND request_path NOT LIKE '/api/requests/%/%' AND request_method IN ('PUT','PATCH','DELETE'))
))`;
const AUDIT_EVENT_PROJECTION=`id,event_type AS "eventType",outcome,actor_login AS "actorLogin",actor_name AS "actorName",
  actor_role AS "actorRole",module,action,target_type AS "targetType",target_reference AS "targetReference",reason,
  changed_fields AS "changedFields",ip_address AS "ipAddress",device_id AS "deviceId",user_agent AS "userAgent",session_id AS "sessionId",
  request_method AS "requestMethod",request_path AS "requestPath",status_code AS "statusCode",duration_ms AS "durationMs",
  error_code AS "errorCode",request_id AS "requestId",occurred_at AS "occurredAt"`;

async function appendAuditEvent(req,event={}){
  try{
    const route=auditRouteDetails(req.method,req.path);
    const session=req.session||{};
    const changes=event.changedFields||auditSubmittedFields(req.body);
    await pool.query(`INSERT INTO audit_events
      (event_type,outcome,actor_login,actor_name,actor_role,module,action,target_type,target_reference,reason,changed_fields,ip_address,device_id,user_agent,session_id,
       request_method,request_path,status_code,duration_ms,error_code,request_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,[
      auditClean(event.eventType||route.eventType,80),auditClean(event.outcome||'Success',30),
      auditClean(event.actorLogin||session.login||req.body?.username,120),auditClean(event.actorName||session.name,160),auditClean(event.actorRole||auditRole(session),100),
      auditClean(event.module||route.module,120),auditClean(event.action||route.action,160),auditClean(event.targetType||'',100),auditClean(event.targetReference||auditTargetReference(req),160),
      auditClean(event.reason||req.get?.(AUDIT_REASON_HEADER)||'',500),JSON.stringify(changes),auditIpAddress(req),auditClean(req.get?.(AUDIT_DEVICE_ID_HEADER),80),auditClean(req.get?.('user-agent'),500),auditSessionId(req),
      auditClean(req.method,12),auditClean(req.path,300),Number(event.statusCode||req.auditStatusCode||0)||null,Math.max(0,Number(event.durationMs||req.auditDurationMs||0))||0,
      auditClean(event.errorCode||req.auditErrorCode,80),auditClean(req.auditRequestId||req.get?.('x-request-id'),80),
    ]);
  }catch(error){console.error('Audit event could not be recorded:',error.message)}
}

async function publicWhatsAppSettings(){
  const settings=await storedWhatsAppSettings();
  const env=await metaWhatsAppRuntimeEnv();
  return {
    provider:String(env.WHATSAPP_PROVIDER||'meta'),
    phoneNumberId:String(env.META_WHATSAPP_PHONE_NUMBER_ID||''),
    businessAccountId:String(env.META_WHATSAPP_BUSINESS_ACCOUNT_ID||''),
    graphVersion:String(env.META_GRAPH_VERSION||'v25.0'),
    accessTokenConfigured:Boolean(env.META_WHATSAPP_ACCESS_TOKEN),
    accessTokenPreview:maskedSecret(env.META_WHATSAPP_ACCESS_TOKEN),
    providerApiKeyConfigured:Boolean(env.FAST2SMS_WHATSAPP_API_KEY),
    providerApiKeyPreview:maskedSecret(env.FAST2SMS_WHATSAPP_API_KEY),
    source:{
      phoneNumberId:settings.phoneNumberId?'database':(process.env.META_WHATSAPP_PHONE_NUMBER_ID?'environment':'missing'),
      accessToken:settings.accessToken?'database':(process.env.META_WHATSAPP_ACCESS_TOKEN?'environment':'missing'),
      businessAccountId:settings.businessAccountId?'database':(process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID?'environment':'missing'),
    },
  };
}

async function migrate(){
  await pool.query(`
    CREATE TABLE IF NOT EXISTS maintenance_requests (
      id BIGSERIAL PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      equipment_name TEXT NOT NULL DEFAULT '',
      equipment_group TEXT NOT NULL DEFAULT '',
      requester_login TEXT NOT NULL DEFAULT '',
      requester_role TEXT NOT NULL DEFAULT '',
      door_number TEXT NOT NULL,
      registration_number TEXT NOT NULL DEFAULT '',
      chassis_number TEXT NOT NULL DEFAULT '',
      driver_name TEXT NOT NULL DEFAULT '',
      driver_name_source TEXT NOT NULL DEFAULT '',
      driver_synced_at TIMESTAMPTZ,
      ideal_requested_at TIMESTAMPTZ,
      ideal_requested_by TEXT NOT NULL DEFAULT '',
      ideal_approved_at TIMESTAMPTZ,
      ideal_approved_by TEXT NOT NULL DEFAULT '',
      idle_reason TEXT NOT NULL DEFAULT '',
      complaint_audio TEXT NOT NULL DEFAULT '',
      superior_name TEXT NOT NULL DEFAULT '',
      site TEXT NOT NULL DEFAULT 'Not assigned',
      category TEXT NOT NULL DEFAULT 'Maintenance request',
      complaint TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      accepted_at TIMESTAMPTZ,
      accepted_by TEXT NOT NULL DEFAULT '',
      acceptance_required BOOLEAN NOT NULL DEFAULT FALSE,
      arrival_flagged_at TIMESTAMPTZ,
      arrival_flagged_by TEXT NOT NULL DEFAULT '',
      arrival_flag_remark TEXT NOT NULL DEFAULT '',
      mis_flagged_at TIMESTAMPTZ,
      mis_flagged_by TEXT NOT NULL DEFAULT '',
      mis_flag_remark TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Open',
      owner_name TEXT NOT NULL DEFAULT 'Normal User',
      closed_at TIMESTAMPTZ,
      closed_by TEXT NOT NULL DEFAULT '',
      maintenance_work TEXT NOT NULL DEFAULT '',
      maintenance_audio TEXT NOT NULL DEFAULT '',
      delayed_reason TEXT NOT NULL DEFAULT '',
      expected_completion_at TIMESTAMPTZ,
      verification_status TEXT NOT NULL DEFAULT 'Pending',
      verified_at TIMESTAMPTZ,
      verified_by TEXT NOT NULL DEFAULT '',
      first_trip_done BOOLEAN NOT NULL DEFAULT FALSE,
      first_trip_at TIMESTAMPTZ,
      first_trip_by TEXT NOT NULL DEFAULT '',
      first_trip_card_image TEXT NOT NULL DEFAULT '',
      meter_type TEXT NOT NULL DEFAULT '',
      opening_meter_reading TEXT NOT NULL DEFAULT '',
      opening_meter_file TEXT NOT NULL DEFAULT '',
      opening_meter_file_name TEXT NOT NULL DEFAULT '',
      closing_meter_reading TEXT NOT NULL DEFAULT '',
      closing_meter_file TEXT NOT NULL DEFAULT '',
      closing_meter_file_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS maintenance_requests_created_at_idx
      ON maintenance_requests (created_at DESC);
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS equipment_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS equipment_group TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS requester_login TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS requester_role TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS chassis_number TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS driver_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS driver_name_source TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS driver_synced_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS ideal_requested_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS ideal_requested_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS ideal_approved_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS ideal_approved_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS idle_reason TEXT NOT NULL DEFAULT '';
    UPDATE maintenance_requests SET status='Idle' WHERE status='Ideal';
    UPDATE maintenance_requests SET driver_name_source='Legacy'
      WHERE driver_name_source='' AND driver_name<>'';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS complaint_audio TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS superior_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS closed_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS maintenance_work TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS maintenance_audio TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS delayed_reason TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS expected_completion_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS accepted_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS acceptance_required BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS arrival_flagged_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS arrival_flagged_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS arrival_flag_remark TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS mis_flagged_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS mis_flagged_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS mis_flag_remark TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'Pending';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS verified_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS first_trip_done BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS first_trip_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS first_trip_by TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS first_trip_card_image TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS meter_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS opening_meter_reading TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS opening_meter_readings JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS closing_meter_readings JSONB NOT NULL DEFAULT '{}';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS opening_meter_file TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS opening_meter_file_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS closing_meter_reading TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS closing_meter_file TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS closing_meter_file_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS in_progress_at TIMESTAMPTZ;
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS in_progress_by TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS maintenance_requests_requester_login_idx
      ON maintenance_requests (requester_login, created_at DESC);
    CREATE TABLE IF NOT EXISTS maintenance_daily_remarks (
      id BIGSERIAL PRIMARY KEY,
      request_reference TEXT NOT NULL REFERENCES maintenance_requests(reference) ON DELETE CASCADE,
      remark TEXT NOT NULL,
      delay_reason TEXT NOT NULL,
      author_login TEXT NOT NULL,
      author_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS maintenance_daily_remarks_request_idx ON maintenance_daily_remarks (request_reference, created_at DESC);
    CREATE TABLE IF NOT EXISTS master_records (
      id BIGSERIAL PRIMARY KEY,
      master_name TEXT NOT NULL,
      record_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS master_records_master_name_idx
      ON master_records (master_name, created_at DESC);
    UPDATE maintenance_requests AS request
      SET requester_role=CASE
        WHEN lower(COALESCE(NULLIF(employee.record_data->>'userGroup',''),NULLIF(employee.record_data->>'mobileRole',''),NULLIF(employee.record_data->>'assignedRole',''),NULLIF(employee.record_data->>'department',''),'')) LIKE '%production%' THEN 'Production User'
        WHEN lower(COALESCE(NULLIF(employee.record_data->>'userGroup',''),NULLIF(employee.record_data->>'mobileRole',''),NULLIF(employee.record_data->>'assignedRole',''),NULLIF(employee.record_data->>'department',''),'')) LIKE '%maintenance%' THEN 'Maintenance User'
        WHEN lower(COALESCE(NULLIF(employee.record_data->>'userGroup',''),NULLIF(employee.record_data->>'mobileRole',''),NULLIF(employee.record_data->>'assignedRole',''),NULLIF(employee.record_data->>'department',''),'')) LIKE '%mis%' THEN 'MIS User'
        ELSE ''
      END
      FROM master_records AS employee
      WHERE employee.master_name='Users & employees'
        AND request.requester_role=''
        AND request.requester_login<>''
        AND lower(trim(request.requester_login))=lower(trim(COALESCE(employee.record_data->>'login','')));
    UPDATE maintenance_requests AS request
      SET equipment_group=COALESCE(NULLIF(equipment.record_data->>'group',''),NULLIF(equipment.record_data->>'equipmentGroup',''),'')
      FROM master_records AS equipment
      WHERE equipment.master_name='Equipment master'
        AND request.equipment_group=''
        AND COALESCE(NULLIF(equipment.record_data->>'group',''),NULLIF(equipment.record_data->>'equipmentGroup',''),'')<>''
        AND lower(trim(request.door_number))=ANY(ARRAY[
          lower(trim(COALESCE(equipment.record_data->>'door',''))),
          lower(trim(COALESCE(equipment.record_data->>'registration',''))),
          lower(trim(COALESCE(equipment.record_data->>'reg',''))),
          lower(trim(COALESCE(equipment.record_data->>'equipmentName',''))),
          lower(trim(COALESCE(equipment.record_data->>'itemName',''))),
          lower(trim(COALESCE(equipment.record_data->>'manufacturerSerialNo','')))
        ]);
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token UUID PRIMARY KEY,
      role TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      login_name TEXT NOT NULL DEFAULT '',
      user_type TEXT NOT NULL DEFAULT '',
      assigned_role TEXT NOT NULL DEFAULT '',
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS login_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS assigned_role TEXT NOT NULL DEFAULT '';
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS session_public_id TEXT NOT NULL DEFAULT gen_random_uuid()::text;
    ALTER TABLE auth_sessions ALTER COLUMN session_public_id SET DEFAULT gen_random_uuid()::text;
    UPDATE auth_sessions SET session_public_id=gen_random_uuid()::text WHERE session_public_id='';
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT NOT NULL DEFAULT '';
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';
    ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS auth_sessions_created_at_idx ON auth_sessions (created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS auth_sessions_public_id_idx ON auth_sessions (session_public_id);
    CREATE INDEX IF NOT EXISTS auth_sessions_last_seen_idx ON auth_sessions (last_seen_at DESC);
    CREATE TABLE IF NOT EXISTS audit_events (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL DEFAULT 'Activity',
      outcome TEXT NOT NULL DEFAULT 'Success',
      actor_login TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      actor_role TEXT NOT NULL DEFAULT '',
      module TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL DEFAULT '',
      target_type TEXT NOT NULL DEFAULT '',
      target_reference TEXT NOT NULL DEFAULT '',
      reason TEXT NOT NULL DEFAULT '',
      changed_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
      ip_address TEXT NOT NULL DEFAULT '',
      device_id TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT '',
      request_method TEXT NOT NULL DEFAULT '',
      request_path TEXT NOT NULL DEFAULT '',
      status_code INTEGER,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      error_code TEXT NOT NULL DEFAULT '',
      request_id TEXT NOT NULL DEFAULT '',
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS audit_events_occurred_at_idx ON audit_events (occurred_at DESC);
    ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS device_id TEXT NOT NULL DEFAULT '';
    ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS request_method TEXT NOT NULL DEFAULT '';
    ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS request_path TEXT NOT NULL DEFAULT '';
    ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS status_code INTEGER;
    ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS duration_ms INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS error_code TEXT NOT NULL DEFAULT '';
    ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS request_id TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_login, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS audit_events_module_idx ON audit_events (module, occurred_at DESC);
    CREATE INDEX IF NOT EXISTS audit_events_outcome_idx ON audit_events (outcome, occurred_at DESC);
    CREATE TABLE IF NOT EXISTS audit_log_export_runs (
      slot_key TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'Sending',
      attempts INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS audit_log_export_deliveries (
      slot_key TEXT NOT NULL REFERENCES audit_log_export_runs(slot_key) ON DELETE CASCADE,
      recipient_key TEXT NOT NULL,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Sending',
      attempts INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (slot_key,recipient_key,channel)
    );
    CREATE TABLE IF NOT EXISTS password_change_sessions (
      token UUID PRIMARY KEY,
      master_record_id BIGINT NOT NULL REFERENCES master_records(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      login_name TEXT NOT NULL DEFAULT '',
      user_type TEXT NOT NULL DEFAULT '',
      assigned_role TEXT NOT NULL DEFAULT '',
      permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE password_change_sessions ADD COLUMN IF NOT EXISTS login_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE password_change_sessions ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT '';
    ALTER TABLE password_change_sessions ADD COLUMN IF NOT EXISTS assigned_role TEXT NOT NULL DEFAULT '';
    ALTER TABLE password_change_sessions ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
    CREATE TABLE IF NOT EXISTS password_reset_sessions (
      token UUID PRIMARY KEY,
      master_record_id BIGINT NOT NULL REFERENCES master_records(id) ON DELETE CASCADE,
      otp_hash TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      requested_ip TEXT NOT NULL DEFAULT '',
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS password_reset_sessions_user_idx
      ON password_reset_sessions (master_record_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS password_reset_sessions_ip_idx
      ON password_reset_sessions (requested_ip, created_at DESC);
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS whatsapp_alert_history (
      id BIGSERIAL PRIMARY KEY,
      report_type TEXT NOT NULL,
      target_name TEXT NOT NULL,
      report_level TEXT NOT NULL DEFAULT '',
      recipient_name TEXT NOT NULL DEFAULT '',
      recipient_phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Prepared',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS whatsapp_alert_history_created_at_idx
      ON whatsapp_alert_history (created_at DESC);
    CREATE TABLE IF NOT EXISTS whatsapp_workflow_dispatches (
      id BIGSERIAL PRIMARY KEY,
      event_type TEXT NOT NULL,
      request_reference TEXT NOT NULL,
      recipient_login TEXT NOT NULL,
      slot_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Sending',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(event_type,request_reference,recipient_login,slot_key)
    );
    CREATE TABLE IF NOT EXISTS whatsapp_consolidated_report_runs (
      id BIGSERIAL PRIMARY KEY,
      slot_key TEXT NOT NULL,
      recipient_login TEXT NOT NULL,
      scope_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Sending',
      attempts INTEGER NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(slot_key,recipient_login,scope_key)
    );
    CREATE TABLE IF NOT EXISTS published_reports (
      id UUID PRIMARY KEY,
      short_code TEXT,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      file_data BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '14 days'
    );
    ALTER TABLE published_reports ADD COLUMN IF NOT EXISTS short_code TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS published_reports_short_code_idx
      ON published_reports (short_code) WHERE short_code IS NOT NULL;
    CREATE INDEX IF NOT EXISTS published_reports_expires_at_idx
      ON published_reports (expires_at);
    CREATE TABLE IF NOT EXISTS crm_tickets (
      id BIGSERIAL PRIMARY KEY,
      reference TEXT UNIQUE,
      creator_login TEXT NOT NULL,
      creator_name TEXT NOT NULL,
      creator_role TEXT NOT NULL DEFAULT '',
      site TEXT NOT NULL DEFAULT 'Not assigned',
      category TEXT NOT NULL DEFAULT 'General',
      priority TEXT NOT NULL DEFAULT 'Medium',
      message TEXT NOT NULL DEFAULT '',
      message_audio TEXT NOT NULL DEFAULT '',
      attachment_data TEXT NOT NULL DEFAULT '',
      attachment_name TEXT NOT NULL DEFAULT '',
      attachment_type TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Open',
      resolution_message TEXT NOT NULL DEFAULT '',
      resolution_audio TEXT NOT NULL DEFAULT '',
      resolution_attachment_data TEXT NOT NULL DEFAULT '',
      resolution_attachment_name TEXT NOT NULL DEFAULT '',
      resolution_attachment_type TEXT NOT NULL DEFAULT '',
      resolved_by TEXT NOT NULL DEFAULT '',
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE crm_tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'Medium';
    ALTER TABLE crm_tickets ADD COLUMN IF NOT EXISTS resolution_audio TEXT NOT NULL DEFAULT '';
    ALTER TABLE crm_tickets ADD COLUMN IF NOT EXISTS resolution_attachment_data TEXT NOT NULL DEFAULT '';
    ALTER TABLE crm_tickets ADD COLUMN IF NOT EXISTS resolution_attachment_name TEXT NOT NULL DEFAULT '';
    ALTER TABLE crm_tickets ADD COLUMN IF NOT EXISTS resolution_attachment_type TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS crm_tickets_creator_idx ON crm_tickets (creator_login, created_at DESC);
    CREATE INDEX IF NOT EXISTS crm_tickets_scope_idx ON crm_tickets (creator_role, site, created_at DESC);
    CREATE TABLE IF NOT EXISTS admin_lock_incidents (
      ticket_reference TEXT PRIMARY KEY REFERENCES crm_tickets(reference) ON DELETE CASCADE,
      ticket_created_at TIMESTAMPTZ NOT NULL,
      locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      unlocked_at TIMESTAMPTZ,
      unlocked_by TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS crm_notifications (
      id BIGSERIAL PRIMARY KEY,
      recipient_login TEXT NOT NULL,
      ticket_reference TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE crm_notifications ADD COLUMN IF NOT EXISTS notification_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS crm_notifications_key_idx ON crm_notifications (notification_key) WHERE notification_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS crm_notifications_recipient_idx ON crm_notifications (recipient_login, is_read, created_at DESC);
    CREATE OR REPLACE FUNCTION signal_crm_notification() RETURNS trigger LANGUAGE plpgsql AS $notification$
    BEGIN
      PERFORM pg_notify('bdms_notifications',NEW.recipient_login);
      RETURN NEW;
    END;
    $notification$;
    CREATE OR REPLACE TRIGGER crm_notification_inserted AFTER INSERT ON crm_notifications
      FOR EACH ROW EXECUTE FUNCTION signal_crm_notification();
  `);
  await repairLegacySessionDefaults(pool);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {rows}=await client.query("SELECT value FROM app_metadata WHERE key='ui_version' FOR UPDATE");
    if(rows[0]?.value!==currentAppVersion){
      // A UI deployment is a cache/version boundary, not a security event.
      // Keep active sessions valid; password changes still revoke only the
      // affected user's sessions in their dedicated routes below.
      await client.query(`INSERT INTO app_metadata (key,value,updated_at) VALUES ('ui_version',$1,NOW())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[currentAppVersion]);
    }
    const {rows:repairSeed}=await client.query("SELECT value FROM app_metadata WHERE key='repair_type_defaults_seeded' FOR UPDATE");
    if(!repairSeed.length){
      for(const repairType of repairTypeDefaults){
        await client.query(`INSERT INTO master_records (master_name,record_data)
          SELECT $1,$2::jsonb
          WHERE NOT EXISTS (
            SELECT 1 FROM master_records
            WHERE master_name=$1
              AND lower(trim(record_data->>'repairType'))=lower(trim($3))
          )`,['Repair type master',JSON.stringify({repairType}),repairType]);
      }
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('repair_type_defaults_seeded','true',NOW())
        ON CONFLICT (key) DO NOTHING`);
    }
    for(const delayedReason of DELAYED_REASON_DEFAULTS){
      await client.query(`INSERT INTO master_records (master_name,record_data)
        SELECT 'Delayed Reason',$1::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM master_records
          WHERE master_name='Delayed Reason'
            AND lower(trim(record_data->>'delayedReason'))=lower(trim($2))
        )`,[JSON.stringify({delayedReason}),delayedReason]);
    }
    // Privileged accounts must be provisioned explicitly by an authorized
    // administrator, never recreated with a known password during startup.
    // Existing accounts and credentials are not changed by this policy.
    // One-time rewrite of stored user site names ("sasti ob", "Sasti ob") to
    // the single display form ("Sasti OB"). Only known sites are rewritten;
    // unrecognised values are kept exactly as entered so no data is lost.
    const {rows:siteNamesNormalized}=await client.query("SELECT value FROM app_metadata WHERE key='user_site_names_normalized' FOR UPDATE");
    if(!siteNamesNormalized.length){
      const {rows:userRows}=await client.query("SELECT id,record_data FROM master_records WHERE master_name='Users & employees' FOR UPDATE");
      for(const row of userRows){
        const normalized=normalizeUserSiteFields(row.record_data);
        if(JSON.stringify(normalized)!==JSON.stringify(row.record_data))
          await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(normalized),row.id]);
      }
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('user_site_names_normalized','true',NOW())
        ON CONFLICT (key) DO NOTHING`);
    }
    // One-time rename of the stored MIS request submenu label
    // ("Verify closed requests" -> "MIS verification"). Every other field is
    // left untouched.
    const {rows:accessLabelsNormalized}=await client.query("SELECT value FROM app_metadata WHERE key='user_access_labels_normalized' FOR UPDATE");
    if(!accessLabelsNormalized.length){
      const {rows:userRows}=await client.query("SELECT id,record_data FROM master_records WHERE master_name='Users & employees' FOR UPDATE");
      for(const row of userRows){
        const normalized=normalizeUserAccessLabels(row.record_data);
        if(JSON.stringify(normalized)!==JSON.stringify(row.record_data))
          await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(normalized),row.id]);
      }
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('user_access_labels_normalized','true',NOW())
        ON CONFLICT (key) DO NOTHING`);
    }
    // Canonicalize stored operational locations without deleting or re-syncing
    // records. Legacy/raw "Majri" values use the configured "Majri OB" name.
    const {rows:operationalSitesNormalized}=await client.query("SELECT value FROM app_metadata WHERE key='operational_site_names_normalized_v2' FOR UPDATE");
    if(!operationalSitesNormalized.length){
      const {rows:masterRows}=await client.query('SELECT id,master_name,record_data FROM master_records FOR UPDATE');
      for(const row of masterRows){
        const normalized=row.master_name==='Users & employees'
          ? normalizeUserSiteFields(row.record_data)
          : normalizeOperationalSiteFields(row.record_data);
        if(JSON.stringify(normalized)!==JSON.stringify(row.record_data))
          await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(normalized),row.id]);
      }
      await client.query("UPDATE maintenance_requests SET site='Majri OB' WHERE lower(trim(site)) IN ('majri','majri ii','majri ob')");
      await client.query("UPDATE crm_tickets SET site='Majri OB' WHERE lower(trim(site)) IN ('majri','majri ii','majri ob')");
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('operational_site_names_normalized_v2','true',NOW())
        ON CONFLICT (key) DO NOTHING`);
    }
    await client.query('COMMIT');
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{client.release()}
}

// Large JSON payloads arrive as text/plain: the edge firewall rejects inspected
// bodies above 128 KB, see request-body-transport.mjs.
app.use((req,res,next)=>{
  if(!req.path.startsWith('/api/')||['/api/health','/api/app-version','/api/audit-events'].includes(req.path))return next();
  const startedAt=Date.now();
  req.auditRequestId=auditClean(req.get('x-request-id')||randomUUID(),80);
  const originalJson=res.json.bind(res);
  res.json=(body)=>{
    if(body?.error&&!req.auditResponseError)req.auditResponseError=auditClean(body.error,500);
    return originalJson(body);
  };
  res.on('finish',()=>{
    if(req.audit===false)return;
    const outcome=res.statusCode>=200&&res.statusCode<400?'Success':'Failed';
    if(!auditShouldRecord(req.method,req.path))return;
    req.auditStatusCode=res.statusCode;
    req.auditDurationMs=Date.now()-startedAt;
    void appendAuditEvent(req,{
      ...(req.audit||{}),
      outcome,
      reason:req.audit?.reason||req.get(AUDIT_REASON_HEADER)||req.auditResponseError||(outcome==='Failed'?`HTTP ${res.statusCode}`:''),
    });
  });
  next();
});

// Audit interception is registered first so malformed and oversized request
// bodies are also logged.
app.use(express.json({limit:'20mb',type:JSON_BODY_CONTENT_TYPES}));

app.get('/api/app-version',(_req,res)=>{
  res.set('Cache-Control','no-store, no-cache, must-revalidate');
  res.json({version:currentAppVersion,commit:deploymentSha});
});

app.post('/api/exports/pdf',requireSession,async(req,res,next)=>{
  try{
    const title=String(req.body?.title||'Nerve Center report').replace(/\s+/g,' ').trim().slice(0,2000)||'Nerve Center report';
    const requestedColumns=Array.isArray(req.body?.columns)?req.body.columns:[];
    const requestedRows=Array.isArray(req.body?.rows)?req.body.rows:[];
    if(!requestedColumns.length||requestedColumns.length>24)return res.status(400).json({error:'Select between 1 and 24 report columns.'});
    if(requestedRows.length>5000)return res.status(413).json({error:'This report has too many rows to export at once. Apply a filter and try again.'});
    const columns=requestedColumns.map((column,index)=>({label:String(column?.label||`Column ${index+1}`).replace(/\s+/g,' ').trim().slice(0,100)||`Column ${index+1}`}));
    const rows=[];
    let reportCharacters=0;
    for(const row of requestedRows){
      const cells=columns.map((_,index)=>Array.isArray(row)?String(row[index]??'').replace(/\s+/g,' ').trim():'—');
      // Preserve complete remarks (up to 2,000 characters) and longer work
      // descriptions. Oversized exports fail visibly instead of losing text.
      if(cells.some((cell)=>cell.length>10000))return res.status(413).json({error:'A report field exceeds the 10,000-character PDF limit. Export as Excel to preserve the complete text.'});
      reportCharacters+=cells.reduce((total,cell)=>total+cell.length,0);
      if(reportCharacters>1000000)return res.status(413).json({error:'This PDF report contains too much text. Apply a filter or export as Excel to preserve all details.'});
      rows.push(cells);
    }
    const highlights=(Array.isArray(req.body?.highlights)?req.body.highlights:[]).map(Number).filter((index)=>Number.isInteger(index)&&index>=0&&index<rows.length);
    const pdf=await buildTableExportPdf({title,columns,rows,highlights});
    res.set('Cache-Control','no-store');
    res.type('application/pdf');
    res.attachment(reportFilename('Report',title,new Date().toISOString().slice(0,10)));
    res.send(pdf);
  }catch(error){next(error)}
});

app.get('/api/reports/director/timing',requireSuper,(_req,res)=>{
  const window=directorReportWindow(new Date());
  res.json({level:'Director',schedule:'Daily 07:00:00 PM IST',nextSlotKey:window.slotKey,nextWindowEnd:window.end.toISOString(),reportCount:13});
});

app.get(['/reports/published/:id','/r/:id'],async(req,res,next)=>{
  try{
    const id=String(req.params.id||'').trim();
    if(!/^[a-z0-9-]{6,36}$/i.test(id))return res.status(404).send('Report not found');
    const {rows}=await pool.query(`SELECT filename,content_type,file_data FROM published_reports
      WHERE (id::text=$1 OR short_code=$1) AND expires_at>NOW()`,[id]);
    if(!rows.length)return res.status(404).send('Report expired or not found');
    res.set('Cache-Control','private, max-age=3600');
    res.set('Content-Type',rows[0].content_type);
    res.set('Content-Disposition',`inline; filename="${String(rows[0].filename).replace(/"/g,'')}"`);
    res.send(rows[0].file_data);
  }catch(error){next(error)}
});

function privilegeForUser(rows, identifiers){
  let privilege={};
  for(const row of rows){
    const record=row.record_data||{};
    const username=String(record.username||'').trim().toLowerCase();
    if(username&&identifiers.has(username))privilege=mergePrivilegeRecords(privilege,record);
  }
  return privilege;
}

function loginPayload({token,profile,employee,login}){
  return {
    token,
    role:profile.sessionRole,
    name:employee.employee,
    login,
    userType:profile.userType,
    assignedRole:profile.assignedRole,
    permissions:profile.permissions,
  };
}

async function auditAdminLockIncidents(client=pool){
  if(ADMIN_LOCK_POLICY_PAUSED)return;
  await client.query(`INSERT INTO admin_lock_incidents (ticket_reference,ticket_created_at)
    SELECT reference,created_at FROM crm_tickets
    WHERE created_at >= $1::timestamptz AND created_at <= NOW()-INTERVAL '72 hours'
      AND lower(status) NOT IN ('resolved','closed')
    ON CONFLICT (ticket_reference) DO NOTHING`,[ADMIN_LOCK_TICKET_CUTOFF]);
}

async function activeAdminLockIncidents(client=pool){
  if(ADMIN_LOCK_POLICY_PAUSED)return [];
  await auditAdminLockIncidents(client);
  const {rows}=await client.query(`SELECT ticket_reference AS "ticketReference",ticket_created_at AS "ticketCreatedAt",locked_at AS "lockedAt"
    FROM admin_lock_incidents WHERE unlocked_at IS NULL ORDER BY locked_at DESC`);
  return rows;
}

function requireTrueSuperAdmin(req,res,next){
  if(req.session?.role==='super'&&isTrueSuperAdmin(req.session.permissions))return next();
  return res.status(403).json({error:'Only a Super Admin can perform this action.'});
}

function requireWhatsAppAdministrator(req,res,next){
  if(req.session?.role==='super'&&req.session?.permissions?.adminLevel!=='Manager')return next();
  return res.status(403).json({error:'Only an Admin or Super Admin can change Meta WhatsApp settings.'});
}

function requireAdministrator(req,res,next){
  if(req.session?.role==='super'&&req.session?.permissions?.adminLevel!=='Manager')return next();
  return res.status(403).json({error:'Only an Admin or Super Admin can manage user sessions.'});
}

app.post('/api/logout',requireSession,async(req,res,next)=>{
  try{
    const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
    req.audit={eventType:'Security',module:'Authentication',action:'Logout',targetType:'User account',targetReference:req.session.login||req.session.name,changedFields:[]};
    await pool.query('DELETE FROM auth_sessions WHERE token=$1',[token]);
    res.status(204).end();
  }catch(error){next(error)}
});

app.post('/api/login',async(req,res,next)=>{
  try{
    const username=String(req.body?.username||'').trim().toLowerCase();
    const password=String(req.body?.password||'').trim();
    if(!username||!password)return res.status(400).json({error:'User name and password are required.'});
    const {rows:userRows}=await pool.query(`SELECT id,record_data FROM master_records WHERE master_name='Users & employees'`);
    // Filter by the submitted login before verifying any password hashes. A
    // scrypt verification is deliberately costly, so checking all employee
    // records here makes login scale linearly with the entire master and can
    // starve the single App Service worker.
    const loginRows=loginRecordCandidates(userRows,username);
    const candidates=loginRows.filter(row=>{
      const record=row.record_data;
      const passwordMatches=record.passwordHash
        ? verifyPassword(password,record.passwordHash)
        : String(record.phone||'').trim()===password;
      return passwordMatches&&userLoginCandidates(record).includes(username);
    });
    const exactLoginCandidates=candidates.filter(row=>String(row.record_data.login||'').trim().toLowerCase()===username);
    const matchingRows=exactLoginCandidates.length?exactLoginCandidates:candidates;
    if(!matchingRows.length)return res.status(401).json({error:'Invalid employee first name or password.'});
    if(matchingRows.length>1)return res.status(409).json({error:'More than one account uses this login. A Super User must assign a unique Login name in Users & employees.'});
    const employeeRow=matchingRows[0];
    const employee=employeeRow.record_data;
    const login=String(employee.login||userLoginCandidates(employee)[0]||username).trim();
    const identifiers=new Set([...userLoginCandidates(employee),login.toLowerCase(),username]);
    const {rows:privilegeRows}=await pool.query(`SELECT record_data FROM master_records WHERE master_name='Privilege'`);
    const profile=resolveMobileAccess({user:employee,privilege:privilegeForUser(privilegeRows,identifiers)});
    req.audit={
      actorLogin:login,
      actorName:employee.employee,
      actorRole:profile.permissions?.adminLevel||profile.assignedRole||profile.userType,
      eventType:'Security',
      module:'Authentication',
      action:profile.sessionRole==='super'?'Administrator login':'User login',
      targetType:'User account',
      targetReference:login,
      changedFields:[],
    };
    if(!profile.userType)return res.status(403).json({error:'This account does not have an application user type. Set it to Super User or Mobile User in Users & employees.'});
    if(profile.userType==='Mobile User'&&!profile.assignedRole)return res.status(403).json({error:'This Mobile User does not have an assigned User Group. Set Production User, Maintenance User, or MIS User in Users & employees.'});
    if(!ADMIN_LOCK_POLICY_PAUSED&&profile.sessionRole==='super'&&isLockableAdmin(profile.permissions)){
      const incidents=await activeAdminLockIncidents();
      if(incidents.length)return res.status(423).json({error:`This admin account is locked because CRM ticket ${incidents[0].ticketReference} has remained open for 72 hours. Contact a Super Admin.`});
    }
    if(employee.mustChangePassword===true){
      req.audit.reason='Initial password change required';
      const changeToken=randomUUID();
      await pool.query(`INSERT INTO password_change_sessions
        (token,master_record_id,role,employee_name,login_name,user_type,assigned_role,permissions)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[
          changeToken,employeeRow.id,profile.sessionRole,employee.employee,login,profile.userType,profile.assignedRole,JSON.stringify(profile.permissions)
        ]);
      return res.json({requiresPasswordChange:true,changeToken,name:employee.employee});
    }
    const token=randomUUID();
    await sessionStore.create({token,role:profile.sessionRole,name:employee.employee,login,userType:profile.userType,assignedRole:profile.assignedRole,permissions:profile.permissions});
    res.json(loginPayload({token,profile,employee,login}));
  }catch(error){next(error)}
});

const passwordResetRequestMessage='If the user name has a registered mobile number, a 6-digit OTP has been sent by WhatsApp.';
const passwordResetPhone=(record={})=>String(record.phone||record.phoneNo||record.phoneNumber||'').trim();
const passwordResetDeliveryError='The OTP could not be delivered to your registered WhatsApp number. Ask an administrator to check WhatsApp Integration > alert history.';
const passwordResetPausedError='WhatsApp OTP delivery is switched off in Report settings. Ask an administrator to turn on WhatsApp delivery and the "Password reset OTPs" switch.';
async function recordPasswordResetDelivery({username='',user={},phone='',status=''}){
  try{
    await pool.query(`INSERT INTO whatsapp_alert_history
      (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
      ['Password reset OTP',String(username||'').slice(0,120),'',String(user.employee||user.name||user.login||username||'').slice(0,120),String(phone||'').slice(0,40),String(status||'').slice(0,300)]);
  }catch(error){console.error('Could not record password reset OTP delivery:',error.message)}
}

app.post('/api/password-reset/request',async(req,res,next)=>{
  try{
    res.set('Cache-Control','no-store');
    const username=String(req.body?.username||'').trim().toLowerCase();
    req.audit={eventType:'Security',module:'Authentication',action:'Request password reset',actorLogin:username,targetType:'User account',targetReference:username,changedFields:[]};
    if(!username)return res.status(400).json({error:'Enter your user name.'});
    const fallbackToken=randomUUID();
    const {rows:userRows}=await pool.query(`SELECT id,record_data FROM master_records WHERE master_name='Users & employees'`);
    const loginRows=loginRecordCandidates(userRows,username);
    const exactRows=loginRows.filter(row=>String(row.record_data.login||'').trim().toLowerCase()===username);
    const candidates=exactRows.length?exactRows:loginRows;
    if(candidates.length!==1||!passwordResetPhone(candidates[0].record_data)){
      await recordPasswordResetDelivery({username,user:candidates[0]?.record_data||{},
        status:candidates.length===0?'Skipped - no user with this user name':candidates.length>1?`Skipped - ${candidates.length} users match this user name`:'Skipped - phone number missing'});
      return res.status(202).json({message:passwordResetRequestMessage,resetToken:fallbackToken});
    }

    const user=candidates[0],requestedIp=String(req.ip||req.socket?.remoteAddress||'').slice(0,100);
    const {rows:limits}=await pool.query(`SELECT
      COUNT(*) FILTER (WHERE master_record_id=$1 AND created_at>NOW()-INTERVAL '1 hour')::int AS account_requests,
      COUNT(*) FILTER (WHERE requested_ip=$2 AND requested_ip<>'' AND created_at>NOW()-INTERVAL '1 hour')::int AS ip_requests
      FROM password_reset_sessions`,[user.id,requestedIp]);
    if(Number(limits[0]?.account_requests||0)>=PASSWORD_RESET_MAX_REQUESTS_PER_HOUR||Number(limits[0]?.ip_requests||0)>=20){
      await recordPasswordResetDelivery({username,user:user.record_data,phone:passwordResetPhone(user.record_data),
        status:`Skipped - rate limit (${limits[0]?.account_requests||0} requests for this account, ${limits[0]?.ip_requests||0} from ${requestedIp||'unknown IP'} in the last hour)`});
      return res.status(202).json({message:passwordResetRequestMessage,resetToken:fallbackToken});
    }

    const resetToken=randomUUID(),otp=generatePasswordResetOtp();
    await pool.query('UPDATE password_reset_sessions SET used_at=NOW() WHERE master_record_id=$1 AND used_at IS NULL',[user.id]);
    await pool.query(`INSERT INTO password_reset_sessions
      (token,master_record_id,otp_hash,requested_ip,expires_at)
      VALUES ($1,$2,$3,$4,NOW()+($5::text||' minutes')::interval)`,[
        resetToken,user.id,hashPassword(otp),requestedIp,PASSWORD_RESET_OTP_TTL_MINUTES
      ]);
    const phone=passwordResetPhone(user.record_data);
    const whatsappEnv=await metaWhatsAppRuntimeEnv();
    let status='Sent',paused=false;
    try{
      await sendMetaWhatsAppTemplate({to:phone,templateKey:'passwordResetOtp',parameters:[otp]},{env:whatsappEnv});
    }catch(templateError){
      console.warn('Password reset OTP template unavailable; using WhatsApp text fallback:',templateError.message);
      try{
        if(templateError.code==='WHATSAPP_POLICY_PAUSED')throw templateError;
        await sendMetaWhatsAppText({to:phone,purpose:'passwordResetOtp',message:`Nerve Center password reset OTP: ${otp}. It expires in ${PASSWORD_RESET_OTP_TTL_MINUTES} minutes. Do not share this code.`},{env:whatsappEnv});
        // Meta accepts free-form text but only delivers it inside an open 24-hour
        // conversation, so flag it clearly instead of reporting a plain "Sent".
        status=`Sent as plain text (delivered only if the user messaged the business number in the last 24 hours). Template failed: ${templateError.message}`;
      }catch(deliveryError){
        await pool.query('UPDATE password_reset_sessions SET used_at=NOW() WHERE token=$1',[resetToken]);
        console.error('Password reset OTP delivery failed:',deliveryError.message);
        paused=deliveryError.code==='WHATSAPP_POLICY_PAUSED';
        status=paused?'Failed - paused by Report settings':`Failed - ${deliveryError.message} (template: ${templateError.message})`;
      }
    }
    await recordPasswordResetDelivery({username,user:user.record_data,phone,status});
    if(status.startsWith('Failed'))return res.status(paused?409:502).json({error:paused?passwordResetPausedError:passwordResetDeliveryError});
    res.status(202).json({message:passwordResetRequestMessage,resetToken});
  }catch(error){next(error)}
});

app.post('/api/password-reset/confirm',async(req,res,next)=>{
  const client=await pool.connect();
  try{
    res.set('Cache-Control','no-store');
    const resetToken=String(req.body?.resetToken||'').trim();
    const otp=String(req.body?.otp||'').trim();
    const password=String(req.body?.password||'');
    const confirmation=String(req.body?.confirmation||'');
    if(!resetToken||!validPasswordResetOtp(otp))return res.status(400).json({error:'Enter the valid 6-digit OTP sent to your mobile.'});
    if(password.length<8)return res.status(400).json({error:'The new password must contain at least 8 characters.'});
    if(password!==confirmation)return res.status(400).json({error:'The password confirmation does not match.'});
    await client.query('BEGIN');
    const {rows}=await client.query(`SELECT token,master_record_id,otp_hash,attempts FROM password_reset_sessions
      WHERE token=$1 AND used_at IS NULL AND expires_at>NOW() FOR UPDATE`,[resetToken]);
    const reset=rows[0];
    if(!reset){await client.query('ROLLBACK');return res.status(400).json({error:'This OTP is invalid or has expired. Request a new OTP.'})}
    if(Number(reset.attempts)>=PASSWORD_RESET_MAX_ATTEMPTS){
      await client.query('UPDATE password_reset_sessions SET used_at=NOW() WHERE token=$1',[resetToken]);
      await client.query('COMMIT');
      return res.status(429).json({error:'Too many incorrect OTP attempts. Request a new OTP.'});
    }
    const attempts=Number(reset.attempts)+1;
    if(!verifyPassword(otp,reset.otp_hash)){
      await client.query(`UPDATE password_reset_sessions SET attempts=$2,used_at=CASE WHEN $2>=$3 THEN NOW() ELSE used_at END WHERE token=$1`,[resetToken,attempts,PASSWORD_RESET_MAX_ATTEMPTS]);
      await client.query('COMMIT');
      return res.status(400).json({error:attempts>=PASSWORD_RESET_MAX_ATTEMPTS?'Too many incorrect OTP attempts. Request a new OTP.':'The OTP is incorrect.'});
    }
    const userResult=await client.query(`SELECT record_data FROM master_records
      WHERE id=$1 AND master_name='Users & employees' FOR UPDATE`,[reset.master_record_id]);
    const user=userResult.rows[0]?.record_data;
    if(!user){await client.query('ROLLBACK');return res.status(400).json({error:'This OTP is invalid or has expired. Request a new OTP.'})}
    req.audit={eventType:'Security',module:'Authentication',action:'Complete password reset',actorLogin:String(user.login||'').trim(),actorName:user.employee,targetType:'User account',targetReference:String(user.login||reset.master_record_id),changedFields:[{field:'password',before:'[protected]',after:'[protected]'}]};
    const validationError=passwordResetValidationError({password,confirmation,phone:passwordResetPhone(user)});
    if(validationError){await client.query('ROLLBACK');return res.status(400).json({error:validationError})}
    const updated={...user,passwordHash:hashPassword(password),mustChangePassword:false};
    await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(updated),reset.master_record_id]);
    await client.query('UPDATE password_reset_sessions SET used_at=NOW() WHERE master_record_id=$1 AND used_at IS NULL',[reset.master_record_id]);
    await client.query('DELETE FROM password_change_sessions WHERE master_record_id=$1',[reset.master_record_id]);
    const login=String(user.login||userLoginCandidates(user)[0]||'').trim().toLowerCase();
    if(login)await client.query('DELETE FROM auth_sessions WHERE lower(login_name)=$1',[login]);
    await client.query('COMMIT');
    res.json({message:'Password reset successfully. Sign in with your new password.'});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});

app.post('/api/change-initial-password',async(req,res,next)=>{
  try{
    const changeToken=String(req.body?.changeToken||'');
    const password=String(req.body?.password||'');
    const confirmation=String(req.body?.confirmation||'');
    if(password.length<8)return res.status(400).json({error:'The new password must contain at least 8 characters.'});
    if(password!==confirmation)return res.status(400).json({error:'The password confirmation does not match.'});
    const {rows}=await pool.query(`SELECT token,master_record_id,role,employee_name,login_name,user_type,assigned_role,permissions
      FROM password_change_sessions WHERE token=$1 AND created_at>NOW()-INTERVAL '30 minutes'`,[changeToken]);
    const reset=rows[0];
    if(!reset)return res.status(401).json({error:'This password-change session has expired. Please sign in again.'});
    const userResult=await pool.query(`SELECT record_data FROM master_records
      WHERE id=$1 AND master_name='Users & employees'`,[reset.master_record_id]);
    const user=userResult.rows[0]?.record_data;
    if(!user)return res.status(404).json({error:'The user account no longer exists.'});
    req.audit={eventType:'Security',module:'Authentication',action:'Change initial password',actorLogin:reset.login_name,actorName:reset.employee_name,actorRole:reset.permissions?.adminLevel||reset.assigned_role||reset.user_type,targetType:'User account',targetReference:reset.login_name,changedFields:[{field:'password',before:'[protected]',after:'[protected]'}]};
    if(password===String(user.phone||'').trim())return res.status(400).json({error:'Choose a password different from your registered phone number.'});
    const updated={...user,passwordHash:hashPassword(password),mustChangePassword:false};
    await pool.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(updated),reset.master_record_id]);
    await pool.query('DELETE FROM password_change_sessions WHERE master_record_id=$1',[reset.master_record_id]);
    const token=randomUUID();
    const profile={sessionRole:reset.role,userType:reset.user_type,assignedRole:reset.assigned_role,permissions:reset.permissions||{}};
    await sessionStore.create({token,role:profile.sessionRole,name:reset.employee_name,login:reset.login_name,userType:profile.userType,assignedRole:profile.assignedRole,permissions:profile.permissions});
    res.json(loginPayload({token,profile,employee:{employee:reset.employee_name},login:reset.login_name}));
  }catch(error){next(error)}
});

async function readSession(req){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  const session=await sessionStore.get(token);
  if(session)await sessionStore.touch(token,sessionActivityDetails(req)).catch(()=>{});
  return session;
}

function sessionActivityDetails(req){
  return {
    ipAddress:auditIpAddress(req),
    deviceId:auditClean(req.get?.(AUDIT_DEVICE_ID_HEADER),80),
    userAgent:auditClean(req.get?.('user-agent'),500),
  };
}

async function requireSession(req,res,next){
  try{
    const session=await readSession(req);
    if(!session)return res.status(401).json({error:'Your sign-in has expired. Please sign in again.'});
    req.session=session;
    next();
  }catch(error){next(error)}
}

function requirePermission(permission,{role}={}){
  return (req,res,next)=>{
    if(role&&((req.session?.role==='super'&&req.session?.permissions?.adminLevel==='Manager')||(req.session?.role!=='super'&&req.session?.assignedRole!==role)))return res.status(403).json({error:'Your assigned user role is not authorized for this action.'});
    if(req.session?.permissions?.[permission]===true)return next();
    return res.status(403).json({error:'Your Maintenance Head has not granted this permission.'});
  };
}

async function requireSuper(req,res,next){
  try{
    const session=await readSession(req);
    if(!session)return res.status(401).json({error:'Your sign-in has expired. Please sign in again.'});
    if(session.role!=='super')return res.status(403).json({error:'Only a Super User can perform this action.'});
    const requestedMaster=req.params?.master?decodeURIComponent(req.params.master):'';
    if(requestedMaster&&!masterAccessAllows(session.permissions,requestedMaster)&&!masterAccessAllows(session.permissions,requestedMaster,'mobileMasterAccess'))
      return res.status(403).json({error:'You do not have access to this master.'});
    if(req.path.startsWith('/api/whatsapp')&&!accessAllows(session.permissions?.tabAccess,'WhatsApp Integration')&&!accessAllows(session.permissions?.mobileTabAccess,'WhatsApp Integration'))
      return res.status(403).json({error:'You do not have access to WhatsApp Integration.'});
    req.session=session;
    next();
  }catch(error){next(error)}
}

app.post('/api/session-heartbeat',requireSession,(_req,res)=>res.status(204).end());

app.get('/api/user-sessions',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const currentToken=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
    const {rows}=await pool.query(`SELECT sessions.token,sessions.session_public_id AS "sessionId",sessions.employee_name AS "name",sessions.login_name AS "login",
      COALESCE(NULLIF(sessions.permissions->>'adminLevel',''),NULLIF(sessions.assigned_role,''),NULLIF(sessions.user_type,''),sessions.role) AS "roleLabel",
      sessions.user_type AS "userType",sessions.assigned_role AS "assignedRole",sessions.created_at AS "createdAt",sessions.last_seen_at AS "lastSeenAt",
      sessions.ip_address AS "ipAddress",sessions.device_id AS "deviceId",sessions.user_agent AS "userAgent",user_master.record_data AS "userRecord"
      FROM auth_sessions AS sessions
      LEFT JOIN LATERAL (
        SELECT users.record_data
        FROM master_records AS users
        WHERE users.master_name='Users & employees'
          AND ((sessions.login_name<>'' AND lower(trim(users.record_data->>'login'))=lower(trim(sessions.login_name)))
            OR (sessions.employee_name<>'' AND lower(trim(users.record_data->>'employee'))=lower(trim(sessions.employee_name))))
        ORDER BY CASE WHEN lower(trim(users.record_data->>'login'))=lower(trim(sessions.login_name)) THEN 0 ELSE 1 END,users.created_at DESC
        LIMIT 1
      ) AS user_master ON TRUE
      WHERE sessions.created_at>NOW()-INTERVAL '30 days'
      ORDER BY sessions.last_seen_at DESC,sessions.created_at DESC`);
    const now=Date.now();
    const sessions=rows.map(({token,userRecord,...row})=>({
      ...row,
      location:userSessionLocationName(userRecord||{},row.roleLabel),
      current:token===currentToken,
      online:now-new Date(row.lastSeenAt||row.createdAt).getTime()<=120000,
    }));
    res.set('Cache-Control','no-store');
    res.json({
      sessions,
      summary:{
        active:sessions.length,
        online:sessions.filter(session=>session.online).length,
        users:new Set(sessions.map(session=>String(session.login||session.name).toLowerCase()).filter(Boolean)).size,
        devices:new Set(sessions.map(session=>session.deviceId).filter(Boolean)).size,
      },
    });
  }catch(error){next(error)}
});

app.delete('/api/user-sessions/:sessionId',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const sessionId=String(req.params.sessionId||'').trim();
    const currentToken=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
    const target=await pool.query(`SELECT token,employee_name AS name,login_name AS login
      FROM auth_sessions WHERE session_public_id=$1`,[sessionId]);
    if(!target.rows.length)return res.status(404).json({error:'This session is no longer active.'});
    if(target.rows[0].token===currentToken)return res.status(400).json({error:'Your current session cannot be force closed from this page. Use Sign out instead.'});
    await pool.query('DELETE FROM auth_sessions WHERE session_public_id=$1',[sessionId]);
    req.audit={eventType:'Security',module:'User sessions',action:'Force close session',targetType:'User session',targetReference:target.rows[0].login||target.rows[0].name||sessionId,changedFields:[]};
    res.status(204).end();
  }catch(error){next(error)}
});

app.get('/api/audit-events',requireSuper,async(req,res,next)=>{
  try{
    const isAdministrator=req.session.permissions?.adminLevel!=='Manager';
    if(!isAdministrator&&!accessAllows(req.session.permissions?.tabAccess,'Audit Trail')&&!accessAllows(req.session.permissions?.mobileTabAccess,'Audit Trail'))
      return res.status(403).json({error:'You do not have access to the Audit Trail.'});
    const paged=String(req.query.paged||'').toLowerCase()==='true';
    const limit=Math.min(5000,Math.max(1,Number(req.query.limit)||1000));
    const beforeAt=String(req.query.beforeAt||'').trim();
    const beforeId=Number(req.query.beforeId)||0;
    const params=[];
    const conditions=[
      `occurred_at >= NOW()-INTERVAL '5 days'`,
      AUDIT_VISIBLE_SCOPE_SQL,
    ];
    if(paged&&beforeAt&&beforeId){
      params.push(beforeAt,beforeId);
      conditions.push(`(occurred_at,id)<($1::timestamptz,$2::bigint)`);
    }
    params.push(paged?limit+1:limit);
    const limitParameter=`$${params.length}`;
    const where=`WHERE ${conditions.join(' AND ')}`;
    const {rows}=await pool.query(`SELECT ${AUDIT_EVENT_PROJECTION}
      FROM audit_events ${where} ORDER BY occurred_at DESC,id DESC LIMIT ${limitParameter}`,params);
    res.set('Cache-Control','no-store');
    if(!paged)return res.json(rows);
    const hasMore=rows.length>limit;
    const events=rows.slice(0,limit);
    const last=events.at(-1);
    let summary=null;
    if(String(req.query.summary||'').toLowerCase()==='true'){
      const {rows:summaryRows}=await pool.query(`SELECT COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE outcome='Failed')::int AS failed,
        COUNT(DISTINCT NULLIF(actor_login,''))::int AS users,
        COUNT(DISTINCT NULLIF(device_id,''))::int AS devices FROM audit_events
        WHERE occurred_at >= NOW()-INTERVAL '5 days'
          AND ${AUDIT_VISIBLE_SCOPE_SQL}`);
      summary=summaryRows[0]||{total:0,failed:0,users:0,devices:0};
    }
    res.json({events,summary,range:{days:5},hasMore,nextCursor:hasMore&&last?{beforeAt:last.occurredAt,beforeId:last.id}:null});
  }catch(error){next(error)}
});

app.get('/api/navigation-settings',requireSuper,async(_req,res,next)=>{
  try{
    const {rows}=await pool.query("SELECT setting_value FROM app_settings WHERE setting_key='mobile_navigation'");
    res.json(normalizeMobileNavigationVisibility(rows[0]?.setting_value||{}));
  }catch(error){next(error)}
});

app.get('/api/admin-locks',requireSuper,requireTrueSuperAdmin,async(_req,res,next)=>{
  try{
    res.set('Cache-Control','no-store');
    if(ADMIN_LOCK_POLICY_PAUSED)return res.json({paused:true,locked:false,incidents:[],accounts:[]});
    const incidents=await activeAdminLockIncidents();
    const {rows}=await pool.query(`SELECT id,record_data FROM master_records WHERE master_name='Users & employees' ORDER BY created_at ASC`);
    const accounts=rows.map(row=>({id:row.id,...publicUserRecord(row.record_data)})).filter(row=>isLockableAdmin(row));
    res.json({paused:false,locked:incidents.length>0,incidents,accounts:incidents.length?accounts:[]});
  }catch(error){next(error)}
});

app.post('/api/admin-locks/unlock',requireSuper,requireTrueSuperAdmin,async(req,res,next)=>{
  try{
    if(ADMIN_LOCK_POLICY_PAUSED)return res.status(409).json({error:'Automatic ticket-based account locking is paused. Existing incidents are preserved and do not block login.'});
    await auditAdminLockIncidents();
    const result=await pool.query(`UPDATE admin_lock_incidents SET unlocked_at=NOW(),unlocked_by=$1 WHERE unlocked_at IS NULL`,[req.session.name||req.session.login||'Super Admin']);
    res.json({unlocked:result.rowCount});
  }catch(error){next(error)}
});

app.put('/api/navigation-settings',requireSuper,async(req,res,next)=>{
  try{
    const settings=normalizeMobileNavigationVisibility(req.body||{});
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ('mobile_navigation',$1::jsonb,NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`,[JSON.stringify(settings)]);
    res.json(settings);
  }catch(error){next(error)}
});

function canManageAllReportSchedules(session){
  return session?.role==='super'&&session?.permissions?.adminLevel!=='Manager';
}

async function readWhatsAppReportSettingsDetails(){
  const [{rows},approvals]=await Promise.all([
    pool.query('SELECT setting_value,updated_at FROM app_settings WHERE setting_key=$1',[WHATSAPP_REPORT_SETTING_KEY]),
    storedWhatsAppTemplateApprovals(),
  ]);
  const settings=normalizeWhatsAppReportSettings(rows[0]?.setting_value);
  return {settings,revision:rows[0]?new Date(rows[0].updated_at).toISOString():null,templateState:reportTemplateState(settings,approvals)};
}

registerWhatsAppReportSettingsApi(app,{
  requireSession,authorize:currentDashboardAuthorization,read:readWhatsAppReportSettingsDetails,
  save:async(settings,revision)=>{
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[WHATSAPP_REPORT_SETTING_KEY]);
      const {rows}=await client.query('SELECT updated_at FROM app_settings WHERE setting_key=$1',[WHATSAPP_REPORT_SETTING_KEY]);
      const currentRevision=rows[0]?new Date(rows[0].updated_at).toISOString():null;
      if(revision!==currentRevision)throw Object.assign(new Error('Report settings changed in another session. Reload before saving.'),{status:409});
      await client.query(`INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ($1,$2::jsonb,NOW())
        ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`,[WHATSAPP_REPORT_SETTING_KEY,JSON.stringify(settings)]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  },
  syncTemplates:async(action)=>{
    const [settings,previous,env]=await Promise.all([storedWhatsAppReportSettings(),storedWhatsAppTemplateApprovals(),metaWhatsAppRuntimeEnv()]);
    const candidates=new Map(PURPOSE_OPTIONS.map(({key})=>{const template=requestedReportTemplate(key,settings);return [template.name,template];}));
    const templates=Object.fromEntries(candidates);
    const statuses=action==='submit'?await submitMetaWhatsAppTemplates({env,templates}):await metaWhatsAppTemplateStatuses({env,templates});
    const checkedAt=new Date().toISOString();
    const approvals={...previous,...Object.fromEntries([...candidates.keys()].map(name=>[name,{status:'NOT_SUBMITTED',checkedAt}]))};
    for(const template of statuses)approvals[template.name]={status:template.status,checkedAt};
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ($1,$2::jsonb,NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`,[WHATSAPP_APPROVAL_SETTING_KEY,JSON.stringify(approvals)]);
  },
});

function reportsAssignedToDesignation(settings,designationKey){
  return [...new Set((settings.designations?.[designationKey]?.schedules||[]).flatMap((schedule)=>schedule.reports||[]))];
}

async function reportScheduleScope(session,settings){
  if(canManageAllReportSchedules(session))return {canManageAll:true,allowedDesignationKeys:Object.keys(settings.designations||{}),allowedReports:DIRECTOR_REPORT_TITLES};
  const user=await currentUserRecord(session);
  const resolved=resolveMobileAccess({user});
  const profile={...resolved,assignedRole:session?.assignedRole||resolved.assignedRole,permissions:{...resolved.permissions,...(session?.permissions||{})}};
  const designation=flowDesignationForUser(user,profile);
  if(!designation)return null;
  return {canManageAll:false,allowedDesignationKeys:[designation.key],allowedReports:reportsAssignedToDesignation(settings,designation.key),user};
}

function scopedReportScheduleSettings(settings,scope){
  if(scope.canManageAll)return settings;
  const key=scope.allowedDesignationKeys[0];
  return {designations:{[key]:settings.designations[key]}};
}

app.get('/api/report-schedule-settings',requireSession,async(req,res,next)=>{
  try{
    const [{rows},settings]=await Promise.all([
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees' ORDER BY created_at ASC`),
      storedHierarchyReportScheduleSettings(),
    ]);
    const scope=await reportScheduleScope(req.session,settings);
    if(!scope)return res.status(403).json({error:'No report designation is assigned to this profile.'});
    const recipients={};
    for(const row of rows){
      const user=row.record_data||{};
      const designation=flowDesignationForUser(user,resolveMobileAccess({user}));
      const login=String(user.login||user.employee||user.name||'').trim().toLowerCase();
      if(!designation||!login||!scope.allowedDesignationKeys.includes(designation.key))continue;
      (recipients[designation.key]??=[]).push({login,name:String(user.employee||user.name||user.login||login).trim(),hasPhone:Boolean(String(user.phone||user.phoneNo||user.phoneNumber||'').trim())});
    }
    res.json({settings:scopedReportScheduleSettings(settings,scope),recipients,canManageAll:scope.canManageAll,allowedDesignationKeys:scope.allowedDesignationKeys,allowedReports:scope.allowedReports});
  }catch(error){next(error)}
});

app.put('/api/report-schedule-settings',requireSession,async(req,res,next)=>{
  try{
    const current=await storedHierarchyReportScheduleSettings();
    const scope=await reportScheduleScope(req.session,current);
    if(!scope)return res.status(403).json({error:'No report designation is assigned to this profile.'});
    let settings;
    if(scope.canManageAll){
      settings=normalizeHierarchyReportScheduleSettings(req.body||{});
    }else{
      const designationKey=scope.allowedDesignationKeys[0];
      const existing=current.designations[designationKey];
      const submitted=req.body?.designations?.[designationKey];
      if(!submitted||typeof submitted!=='object')return res.status(400).json({error:'Your assigned report schedule was not provided.'});
      const allowedReports=new Set(scope.allowedReports);
      const schedules=(Array.isArray(submitted.schedules)?submitted.schedules:[]).map((schedule)=>({
        ...schedule,
        reports:(Array.isArray(schedule.reports)?schedule.reports:scope.allowedReports).filter((title)=>allowedReports.has(title)),
      }));
      settings=normalizeHierarchyReportScheduleSettings({designations:{...current.designations,[designationKey]:{
        ...submitted,
        allRecipients:existing.allRecipients,
        recipientLogins:existing.recipientLogins,
        schedules,
      }}});
    }
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ($1,$2::jsonb,NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`,[
      HIERARCHY_REPORT_SCHEDULE_SETTING_KEY,JSON.stringify(settings),
    ]);
    const savedScope=await reportScheduleScope(req.session,settings);
    res.json({settings:scopedReportScheduleSettings(settings,savedScope),canManageAll:savedScope.canManageAll,allowedDesignationKeys:savedScope.allowedDesignationKeys,allowedReports:savedScope.allowedReports});
  }catch(error){next(error)}
});

app.get('/api/whatsapp-alert-history',requireSuper,async(_req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT id,report_type AS "reportType",target_name AS "targetName",
      report_level AS "reportLevel",recipient_name AS "recipientName",recipient_phone AS "recipientPhone",
      status,created_at AS "createdAt" FROM whatsapp_alert_history ORDER BY created_at DESC LIMIT 1000`);
    res.json(rows);
  }catch(error){next(error)}
});

app.post('/api/whatsapp-alert-history',requireSuper,async(req,res,next)=>{
  try{
    const {reportType,targetName,reportLevel='',recipientName='',recipientPhone='',status='Prepared'}=req.body||{};
    if(!reportType||!targetName)return res.status(400).json({error:'Report type and target are required.'});
    const {rows}=await pool.query(`INSERT INTO whatsapp_alert_history
      (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id,report_type AS "reportType",target_name AS "targetName",report_level AS "reportLevel",
        recipient_name AS "recipientName",recipient_phone AS "recipientPhone",status,created_at AS "createdAt"`,
      [reportType,targetName,reportLevel,recipientName,recipientPhone,status]);
    res.status(201).json(rows[0]);
  }catch(error){next(error)}
});

app.get('/api/health',async(_req,res)=>{
  try{
    const result=await pool.query('SELECT NOW() AS database_time');
    databaseReady=true;
    databaseError='';
    res.json({status:'ok',database:'connected',databaseTime:result.rows[0].database_time,commit:deploymentSha,scheduledJobsEnabled,crmAdminLockPolicyPaused:ADMIN_LOCK_POLICY_PAUSED});
  }catch(error){
    databaseReady=false;
    databaseError=error instanceof Error?error.message:'Database connection failed.';
    res.status(503).json({status:'degraded',database:'disconnected',error:databaseError});
  }
});

async function passwordResetTemplateStatus(env){
  const templateName=META_WORKFLOW_TEMPLATES.passwordResetOtp.name;
  const reportSettings=env.WHATSAPP_REPORT_SETTINGS||normalizeWhatsAppReportSettings();
  if(env.META_WHATSAPP_DELIVERY_PAUSED==='true'||!whatsappPurposeEnabled(reportSettings,'passwordResetOtp'))
    return {name:templateName,status:'PAUSED',detail:'Switched off in Report settings. Turn on WhatsApp delivery and "Password reset OTPs".'};
  if(!env.META_WHATSAPP_BUSINESS_ACCOUNT_ID)return {name:templateName,status:'UNKNOWN',detail:'Add the WhatsApp Business Account ID to check template approval.'};
  try{
    const templates=await metaWhatsAppTemplateStatuses({env});
    const template=templates.find((item)=>item.name===templateName);
    return template?{name:templateName,status:String(template.status||'UNKNOWN'),detail:''}
      :{name:templateName,status:'MISSING',detail:'Template not found in Meta. Save the settings again to submit it.'};
  }catch(error){return {name:templateName,status:'UNKNOWN',detail:String(error?.message||'Template lookup failed.').slice(0,200)}}
}

app.get('/api/whatsapp/status',requireSuper,async(_req,res)=>{
  try{
    const env=await metaWhatsAppRuntimeEnv();
    res.json({...await metaWhatsAppStatus({env}),otpTemplate:await passwordResetTemplateStatus(env),settings:await publicWhatsAppSettings()});
  }
  catch(error){res.status(503).json({configured:true,connected:false,error:error instanceof Error?error.message:'Meta WhatsApp connection failed.'})}
});

app.get('/api/whatsapp/settings',requireSuper,requireWhatsAppAdministrator,async(_req,res,next)=>{
  try{res.json(await publicWhatsAppSettings())}
  catch(error){next(error)}
});

app.post('/api/whatsapp/register',requireSuper,requireWhatsAppAdministrator,async(req,res,next)=>{
  req.audit={eventType:'Integration',module:'WhatsApp Integration',action:'Register Meta WhatsApp number',targetType:'WhatsApp phone number',changedFields:[]};
  try{res.json(await registerMetaWhatsAppPhone({pin:req.body?.pin},{env:await metaWhatsAppRuntimeEnv()}))}
  catch(error){next(error)}
});

app.put('/api/whatsapp/settings',requireSuper,requireWhatsAppAdministrator,async(req,res,next)=>{
  try{
    const current=await storedWhatsAppSettings();
    const nextSettings={...current};
    if(Object.prototype.hasOwnProperty.call(req.body||{},'provider'))nextSettings.provider=String(req.body.provider||'meta').trim().toLowerCase()==='fast2sms'?'fast2sms':'meta';
    if(Object.prototype.hasOwnProperty.call(req.body||{},'providerApiKey'))nextSettings.providerApiKey=String(req.body.providerApiKey||'').trim();
    if(Object.prototype.hasOwnProperty.call(req.body||{},'phoneNumberId'))nextSettings.phoneNumberId=String(req.body.phoneNumberId||'').replace(/\D/g,'').trim();
    if(Object.prototype.hasOwnProperty.call(req.body||{},'accessToken'))nextSettings.accessToken=String(req.body.accessToken||'').trim();
    if(Object.prototype.hasOwnProperty.call(req.body||{},'businessAccountId'))nextSettings.businessAccountId=String(req.body.businessAccountId||'').replace(/\D/g,'').trim();
    if(Object.prototype.hasOwnProperty.call(req.body||{},'graphVersion'))nextSettings.graphVersion=String(req.body.graphVersion||'v25.0').trim()||'v25.0';
    if(!nextSettings.phoneNumberId)return res.status(400).json({error:'Meta WhatsApp phone number ID is required.'});
    if(nextSettings.provider==='fast2sms'&&!nextSettings.providerApiKey)return res.status(400).json({error:'Fast2SMS WhatsApp API key is required.'});
    if(nextSettings.provider!=='fast2sms'&&!nextSettings.accessToken)return res.status(400).json({error:'Meta WhatsApp access token is required.'});
    const candidateEnv={
      ...process.env,
      WHATSAPP_PROVIDER:nextSettings.provider||'meta',
      FAST2SMS_WHATSAPP_API_KEY:nextSettings.providerApiKey||'',
      META_WHATSAPP_PHONE_NUMBER_ID:nextSettings.phoneNumberId,
      META_WHATSAPP_ACCESS_TOKEN:nextSettings.accessToken,
      META_WHATSAPP_BUSINESS_ACCOUNT_ID:nextSettings.businessAccountId||'',
      META_GRAPH_VERSION:nextSettings.graphVersion,
    };
    await metaWhatsAppStatus({env:candidateEnv});
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ($1,$2::jsonb,NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`,[
      WHATSAPP_SETTING_KEY,JSON.stringify(nextSettings),
    ]);
    let templateSync;
    try{
      const templates=await submitMetaWhatsAppTemplates({env:candidateEnv});
      templateSync={ok:true,total:templates.length,approved:templates.filter((template)=>template.status==='APPROVED').length,pending:templates.filter((template)=>template.status!=='APPROVED').length};
    }catch(error){
      templateSync={ok:false,error:String(error?.message||'Meta template synchronization failed.').slice(0,300)};
    }
    res.json({...await publicWhatsAppSettings(),templateSync});
  }catch(error){next(error)}
});

app.post('/api/whatsapp/send',requireSuper,async(req,res,next)=>{
  const {reportType,targetName,reportLevel='',recipientName='',recipientPhone='',message=''}=req.body||{};
  if(!reportType||!targetName||!recipientPhone||!message)
    return res.status(400).json({error:'Report type, target, recipient phone, and message are required.'});
  try{
    const result=await sendMetaWhatsAppTemplate({
      to:recipientPhone,
      templateKey:'consolidatedRequestReport',purpose:'manualReports',
      parameters:[message],
    },{env:await metaWhatsAppRuntimeEnv()});
    const {rows}=await pool.query(`INSERT INTO whatsapp_alert_history
      (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id,report_type AS "reportType",target_name AS "targetName",report_level AS "reportLevel",
        recipient_name AS "recipientName",recipient_phone AS "recipientPhone",status,created_at AS "createdAt"`,
      [reportType,targetName,reportLevel,recipientName,result.recipient,'Sent']);
    res.status(201).json({...rows[0],messageId:result.messageId});
  }catch(error){
    try{await pool.query(`INSERT INTO whatsapp_alert_history
      (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
      [reportType,targetName,reportLevel,recipientName,recipientPhone,'Failed'])}catch(historyError){console.error('Could not record failed WhatsApp delivery.',historyError)}
    const status=Number(error?.status)>=400&&Number(error?.status)<500?400:502;
    res.status(status).json({error:error instanceof Error?error.message:'WhatsApp delivery failed.'});
  }
});

app.get('/api/oracle/health',requireSuper,async(_req,res)=>{
  if(!oracleConfigured)return res.status(503).json({configured:false,connected:false,error:'Oracle database settings are not configured.'});
  try{
    res.json(await oracleHealth());
  }catch(error){
    res.status(503).json({configured:true,connected:false,error:error instanceof Error?error.message:'Oracle connection failed.'});
  }
});

app.get('/api/oracle/driver',requireSession,async(req,res)=>{
  const date=String(req.query.date||'').trim();
  const time=String(req.query.time||'').trim();
  const location=String(req.query.location||'').trim();
  const equipmentNo=String(req.query.equipmentNo||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)||!location||!equipmentNo)
    return res.status(400).json({error:'Date, time, location and equipment number are required.'});
  if(location.length>150||equipmentNo.length>200)return res.status(400).json({error:'Oracle lookup values are too long.'});
  if(!oracleConfigured)return res.status(503).json({error:'Oracle driver lookup is not configured.'});
  try{
    res.json(await oracleDriverLookup({date,time,location,equipmentNo}));
  }catch(error){
    console.error('Oracle driver lookup failed.',error);
    res.status(503).json({error:'Driver/operator lookup is temporarily unavailable.'});
  }
});

let equipmentTransferSyncPromise;
let equipmentMasterSyncPromise;
async function syncOracleEquipmentMaster(){
  if(equipmentMasterSyncPromise)return equipmentMasterSyncPromise;
  equipmentMasterSyncPromise=(async()=>{
    const oracleSourceRecords=await oracleEquipmentMasterRecords();
    const oracleRecords=oracleSourceRecords.filter(isAllowedOracleEquipment);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('oracle-equipment-master-sync'))");
      const existingResult=await client.query(`SELECT id,record_data FROM master_records
        WHERE master_name='Equipment master' FOR UPDATE`);
      const byKey=new Map();
      for(const row of existingResult.rows){
        for(const key of equipmentMatchKeys(row.record_data))if(!byKey.has(key))byKey.set(key,row);
      }
      const updates=[],inserts=[],retainedIds=[];
      for(const equipment of oracleRecords){
        const match=equipmentMatchKeys(equipment).map(key=>byKey.get(key)).find(Boolean);
        const record=oracleEquipmentMasterRecord(equipment,match?.record_data||{});
        if(match){
          updates.push({id:match.id,...record});
          retainedIds.push(match.id);
          for(const key of equipmentMatchKeys(record))byKey.set(key,{id:match.id,record_data:record});
        }else{
          inserts.push(record);
        }
      }
      await client.query(`DELETE FROM master_records
        WHERE master_name='Equipment master'
          AND record_data->>'oracleSource'='EQUIPMENT'
          AND NOT (id=ANY($1::bigint[]))`,[retainedIds]);
      if(updates.length){
        await client.query(`UPDATE master_records AS target
          SET record_data=incoming.value-'id'
          FROM jsonb_array_elements($1::jsonb) AS incoming(value)
          WHERE target.id=(incoming.value->>'id')::bigint
            AND target.master_name='Equipment master'`,[JSON.stringify(updates)]);
      }
      if(inserts.length){
        await client.query(`INSERT INTO master_records (master_name,record_data)
          SELECT 'Equipment master',value FROM jsonb_array_elements($1::jsonb) AS value`,[JSON.stringify(inserts)]);
      }
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('oracle_equipment_master_sync',$1,NOW())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[
        JSON.stringify({sourceRecords:oracleSourceRecords.length,oracleRecords:oracleRecords.length,updated:updates.length,inserted:inserts.length})
      ]);
      await client.query('COMMIT');
      return {equipmentImported:oracleRecords.length,equipmentUpdated:updates.length,equipmentInserted:inserts.length};
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{client.release()}
  })().finally(()=>{equipmentMasterSyncPromise=undefined});
  return equipmentMasterSyncPromise;
}

app.post('/api/oracle/equipment/sync',requireSuper,async(_req,res)=>{
  if(!oracleConfigured)return res.status(503).json({error:'Oracle equipment sync is not configured.'});
  try{
    const equipment=await syncOracleEquipmentMaster();
    const transfers=await syncOracleEquipmentTransfers();
    res.json({...equipment,...transfers});
  }catch(error){
    console.error('Oracle equipment sync failed.',error);
    res.status(503).json({error:'Equipment Master could not be synchronized from Oracle.'});
  }
});

async function syncOracleEquipmentTransfers(fromDate=null){
  if(equipmentTransferSyncPromise)throw Object.assign(new Error('A transfer sync is already running. Please retry after it finishes.'),{status:409});
  equipmentTransferSyncPromise=(async()=>{
    const transfers=await oracleEquipmentTransfers(fromDate);
    const transferRecords=transfers.map(transferMasterRecord);
    const latest=latestTransferByEquipment(transfers);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtext('oracle-equipment-transfer-sync'))");
      await client.query(`DELETE FROM master_records
        WHERE master_name='Vehicle transfers' AND record_data->>'oracleSource'='EQUIPMENTTRANSFER'
          AND ($1::text IS NULL OR record_data->>'transferDate'>=$1)`,[fromDate]);
      if(transferRecords.length){
        await client.query(`INSERT INTO master_records (master_name,record_data)
          SELECT 'Vehicle transfers',value FROM jsonb_array_elements($1::jsonb) AS value`,[JSON.stringify(transferRecords)]);
      }
      const equipmentRows=await client.query(`SELECT id,record_data FROM master_records
        WHERE master_name='Equipment master' FOR UPDATE`);
      const changed=[];
      for(const row of equipmentRows.rows){
        const updated=applyLatestTransfer(row.record_data,latest);
        if(updated!==row.record_data&&JSON.stringify(updated)!==JSON.stringify(row.record_data))changed.push({id:row.id,...updated});
      }
      if(changed.length){
        await client.query(`UPDATE master_records AS target
          SET record_data=incoming.value-'id'
          FROM jsonb_array_elements($1::jsonb) AS incoming(value)
          WHERE target.id=(incoming.value->>'id')::bigint
            AND target.master_name='Equipment master'`,[JSON.stringify(changed)]);
      }
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('oracle_equipment_transfer_sync',$1,NOW())
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[JSON.stringify({transfers:transferRecords.length,equipmentUpdated:changed.length})]);
      await client.query('COMMIT');
      return {transfersImported:transferRecords.length,equipmentUpdated:changed.length,fromDate};
    }catch(error){
      await client.query('ROLLBACK');
      throw error;
    }finally{client.release()}
  })().finally(()=>{equipmentTransferSyncPromise=undefined});
  return equipmentTransferSyncPromise;
}

app.post('/api/oracle/equipment-transfers/sync',requireSuper,async(req,res)=>{
  let fromDate;
  try{fromDate=transferSyncDate(req.body?.fromDate)}catch(error){return res.status(400).json({error:error.message})}
  if(!oracleConfigured)return res.status(503).json({error:'Oracle equipment-transfer sync is not configured.'});
  try{
    res.json(await syncOracleEquipmentTransfers(fromDate));
  }catch(error){
    console.error('Oracle equipment-transfer sync failed.',error);
    res.status(error.status===409?409:503).json({error:error.status===409?error.message:'Equipment transfers could not be synchronized from Oracle.'});
  }
});

// Return the signed-in employee's current master location without exposing
// the Users & employees master to mobile users. This is intentionally read
// live so a location update in the master is reflected on the next form open
// (or page refresh) without putting sensitive account data in the session.
app.get('/api/me/profile',requireSession,async(req,res,next)=>{
  try{
    const login=String(req.session.login||'').trim().toLowerCase();
    const name=String(req.session.name||'').trim().toLowerCase();
    const {rows}=await pool.query(`SELECT record_data
      FROM master_records
      WHERE master_name='Users & employees'
        AND (
          ($1 <> '' AND lower(trim(record_data->>'login'))=$1)
          OR ($2 <> '' AND lower(trim(record_data->>'employee'))=$2)
        )
      ORDER BY CASE WHEN lower(trim(record_data->>'login'))=$1 THEN 0 ELSE 1 END, created_at DESC
      LIMIT 1`,[login,name]);
    const record=rows[0]?.record_data||{};
    const location=assignedUserSiteName(record);
    const designation=flowDesignationForUser(record,resolveMobileAccess({user:record}));
    res.json({location,managerRegion:record.managerRegion||record.region||'',managerSites:record.managerSites||'',designationKey:designation?.key||''});
  }catch(error){next(error)}
});

async function currentUserRecord(session,client=pool){
  const login=String(session?.login||'').trim().toLowerCase();
  const name=String(session?.name||'').trim().toLowerCase();
  const {rows}=await client.query(`SELECT record_data FROM master_records
    WHERE master_name='Users & employees' AND (
      ($1 <> '' AND lower(trim(record_data->>'login'))=$1) OR
      ($2 <> '' AND lower(trim(record_data->>'employee'))=$2)
    ) ORDER BY CASE WHEN lower(trim(record_data->>'login'))=$1 THEN 0 ELSE 1 END,created_at DESC LIMIT 1`,[login,name]);
  return rows[0]?.record_data||{};
}

async function currentDashboardAuthorization(session,client=pool){
  const [{rows:userRows},{rows:privilegeRows}]=await Promise.all([
    client.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`),
    client.query(`SELECT record_data FROM master_records WHERE master_name='Privilege'`),
  ]);
  const user=currentDashboardUserCandidate(userRows,session);
  if(!user)return null;
  const identifiers=new Set([
    ...userLoginCandidates(user),
    String(session?.login||'').trim().toLowerCase(),
  ].filter(Boolean));
  const profile=resolveMobileAccess({user,privilege:privilegeForUser(privilegeRows,identifiers)});
  return {user,session:dashboardSessionFromProfile(profile)};
}

function ticketProjection(){
  return `reference,creator_login AS "creatorLogin",creator_name AS "creatorName",creator_role AS "creatorRole",site,category,priority,
    message,message_audio AS "messageAudio",attachment_data AS "attachmentData",attachment_name AS "attachmentName",
    attachment_type AS "attachmentType",status,resolution_message AS "resolutionMessage",resolution_audio AS "resolutionAudio",
    resolution_attachment_data AS "resolutionAttachmentData",resolution_attachment_name AS "resolutionAttachmentName",
    resolution_attachment_type AS "resolutionAttachmentType",resolved_by AS "resolvedBy",
    to_char(resolved_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "resolvedAt",
    to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "createdAt"`;
}

function isTicketAdmin(session){return session?.role==='super'&&session?.permissions?.adminLevel!=='Manager'}
const userManagesSite=(user,site)=>reportScopeIncludesSite(managerReportScope(user),site);

async function sendWhatsAppNotifications(client,recipients,reference,message,workflowTemplate,{workflowType='',site='',purpose=''}={}){
  const logins=[...new Set(recipients.map((value)=>String(value||'').trim().toLowerCase()).filter(Boolean))];
  if(!logins.length)return [];
  const reportSettings=await storedWhatsAppReportSettings();
  const messagePurpose=purpose||workflowTemplate?.templateKey||'';
  if(!whatsappPurposeEnabled(reportSettings,messagePurpose))return logins.map(login=>({login,status:'Skipped - paused by Report settings'}));
  const {rows}=await client.query(`SELECT record_data FROM master_records
    WHERE master_name='Users & employees' AND lower(trim(record_data->>'login'))=ANY($1::text[])`,[logins]);
  const contacts=new Map();
  const usersByLogin=new Map();
  const requestTemplate=String(workflowTemplate?.templateKey||'').startsWith('request');
  const workflowExcludedLogins=new Set(workflowType?rows.map(({record_data})=>record_data||{}).filter((user)=>isExcludedWorkflowWhatsAppRecipient(user,resolveMobileAccess({user}),reportSettings,workflowType)).map((user)=>String(user.login||'').trim().toLowerCase()).filter(Boolean):[]);
  // Workflows use explicit role choices, including duplicate-login exclusions.
  // Legacy request calls without a workflow still exclude Super Admin traffic.
  const superAdminLogins=new Set(rows.map(({record_data})=>record_data||{}).filter(isTrueSuperAdmin).map((user)=>String(user.login||'').trim().toLowerCase()).filter(Boolean));
  for(const row of rows){
    const user=row.record_data||{};
    const login=String(user.login||'').trim().toLowerCase();
    if(workflowExcludedLogins.has(login))continue;
    if(workflowType&&!isWorkflowWhatsAppRecipient(user,workflowType,site,reportSettings))continue;
    if(requestTemplate&&!workflowType&&superAdminLogins.has(login))continue;
    const phone=String(user.phone||user.phoneNo||user.phoneNumber||'').trim();
    if(login&&!usersByLogin.has(login))usersByLogin.set(login,user);
    if(login&&phone&&!contacts.has(login))contacts.set(login,{name:String(user.employee||user.name||user.login||login),phone});
  }
  const eligibleLogins=workflowType?[...usersByLogin.keys()]:requestTemplate?logins.filter((login)=>!superAdminLogins.has(login)):logins;
  const missingPhone=eligibleLogins.filter((login)=>!contacts.has(login));
  const missingResults=await Promise.all(missingPhone.map(async(login)=>{const user=usersByLogin.get(login)||{};const status='Skipped - phone number missing';await pool.query(`INSERT INTO whatsapp_alert_history
    (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
    ['System notification',String(reference||''),'',String(user.employee||user.name||user.login||login),'',status]);return {login,status};}));
  const deliveryResults=await Promise.all([...contacts.entries()].map(async([login,contact])=>{
    let status='Sent';
    try{
      const whatsappEnv=await metaWhatsAppRuntimeEnv();
      if(workflowTemplate)try{await sendMetaWhatsAppTemplate({to:contact.phone,...workflowTemplate,purpose:messagePurpose},{env:whatsappEnv})}
      catch(templateError){
        if(templateError.code==='WHATSAPP_POLICY_PAUSED')throw templateError;
        const fallback=reportTemplateFallback(messagePurpose,workflowTemplate.parameters,whatsappEnv.WHATSAPP_REPORT_SETTINGS,whatsappEnv.WHATSAPP_TEMPLATE_APPROVALS,`Nerve Center notification\n${message}`);
        await sendMetaWhatsAppText({to:contact.phone,message:fallback,purpose:messagePurpose},{env:whatsappEnv});
      }
      else await sendMetaWhatsAppText({to:contact.phone,message:`Nerve Center notification\n${message}`,purpose:messagePurpose},{env:whatsappEnv});
    }
    catch(error){status=`${error.code==='WHATSAPP_POLICY_PAUSED'?'Skipped':'Failed'} - ${String(error?.message||'Meta delivery error').slice(0,160)}`;console.error(`WhatsApp notification failed for ${login}:`,error.message)}
    await pool.query(`INSERT INTO whatsapp_alert_history
      (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
      ['System notification',String(reference||''),'',contact.name,contact.phone,status]);
    return {login,status};
  }));
  return [...missingResults,...deliveryResults];
}

async function addTicketNotifications(client,recipients,reference,message,workflowTemplate,{whatsapp=true,whatsappRecipients=null,workflowType='',site=''}={}){
  const logins=[...new Set(recipients.map((value)=>String(value||'').trim().toLowerCase()).filter(Boolean))];
  for(const login of logins){
    await client.query(`INSERT INTO crm_notifications (recipient_login,ticket_reference,message) VALUES ($1,$2,$3)`,[login,reference,message]);
  }
  if(whatsapp)await sendWhatsAppNotifications(client,whatsappRecipients??logins,reference,message,workflowTemplate,{workflowType,site});
}

async function addTicketNotificationsBestEffort(client,recipients,reference,message,workflowTemplate,options){
  try{
    await addTicketNotifications(client,recipients,reference,message,workflowTemplate,options);
  }catch(error){
    console.error(`Request ${reference} was updated, but its follow-up notifications could not be saved.`,error);
  }
}

let consolidatedReportRunning=false;
async function sendScheduledConsolidatedWhatsAppReports(now=new Date()){
  if(!databaseReady||consolidatedReportRunning)return {skipped:true};
  return {skipped:true,reason:'Fleet consolidated schedule is handled by the hierarchy report flow'};
  if(!consolidatedReportDue(now))return {skipped:true,reason:'outside scheduled report window'};
  consolidatedReportRunning=true;
  try{
    const window=consolidatedReportWindow(now);
    const [{rows:requestRows},{rows:equipmentRows},{rows:userRows}]=await Promise.all([
      pool.query(`SELECT reference,equipment_name AS equipment,door_number AS door,chassis_number AS chassis,site,status,idle_reason AS "idleReason",
        owner_name AS "user",closed_by AS "closedBy",started_at AS "startedAt",closed_at AS "closedAt"
        FROM maintenance_requests
        WHERE (started_at >= $1 AND started_at < $2 AND status <> 'Closed')
           OR (closed_at >= $1 AND closed_at < $2)`,[window.start,window.end]),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Equipment master'`),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`),
    ]);
    const enriched=prepareConsolidatedRows(attachRequestOems(requestRows,equipmentRows.map(({record_data})=>record_data||{})),window.end);
    const openRequests=enriched.filter((request)=>request.status!=='Closed'&&!request.closedAt);
    const closedRequests=enriched.filter((request)=>Boolean(request.closedAt));
    let sent=0,failed=0,skipped=0;
    for(const row of userRows){
      const user=row.record_data||{};
      const profile=resolveMobileAccess({user});
      if(profile.sessionRole!=='super')continue;
      const isAdmin=profile.permissions.adminLevel==='Admin';
      const isManager=profile.permissions.adminLevel==='Manager';
      if(!isAdmin&&!isManager)continue;
      const login=String(user.login||'').trim().toLowerCase();
      const phone=String(user.phone||user.phoneNo||user.phoneNumber||'').trim();
      if(!login)continue;
      let scope=managerReportScope(user);
      if(isAdmin&&scope.sites!==null&&!scope.sites.length)scope={key:'ALL',label:'All regions',sites:null};
      if(scope.sites!==null&&!scope.sites.length){skipped++;continue}
      const scopedOpen=openRequests.filter((request)=>reportScopeIncludesSite(scope,request.site));
      const scopedClosed=closedRequests.filter((request)=>reportScopeIncludesSite(scope,request.site));
      const claim=await pool.query(`INSERT INTO whatsapp_consolidated_report_runs
        (slot_key,recipient_login,scope_key,status,attempts,updated_at) VALUES ($1,$2,$3,'Sending',1,NOW())
        ON CONFLICT (slot_key,recipient_login,scope_key) DO UPDATE
          SET status='Sending',attempts=whatsapp_consolidated_report_runs.attempts+1,updated_at=NOW()
          WHERE whatsapp_consolidated_report_runs.status LIKE 'Failed%' AND whatsapp_consolidated_report_runs.attempts<3
        RETURNING id`,[window.slotKey,login,scope.key]);
      if(!claim.rowCount){skipped++;continue}
      const recipientName=String(user.employee||user.name||user.login||login);
      let status='Sent';
      try{
        if(!phone)throw new Error('Phone number missing');
        const summary=`SCOPE: ${scope.label}\nWINDOW: ${reportDateTime(window.start)} - ${reportDateTime(window.end)}\nOFF ROAD / OPEN: ${scopedOpen.length}\nON ROAD / CLOSED: ${scopedClosed.length}\nThe complete report is attached as a PDF.`;
        const whatsappEnv=await metaWhatsAppRuntimeEnv();
        try{await sendMetaWhatsAppTemplate({to:phone,templateKey:'consolidatedRequestReport',parameters:[summary]},{env:whatsappEnv})}
        catch(templateError){console.warn('Consolidated WhatsApp notification template unavailable; attempting PDF delivery:',templateError.message)}
        const pdf=await buildFleetConsolidatedReportPdf({scopeLabel:scope.label,start:window.start,end:window.end,openRequests:scopedOpen,closedRequests:scopedClosed});
        await sendMetaWhatsAppDocument({to:phone,buffer:pdf,filename:reportFilename('Fleet',scope.key,window.slotKey),caption:`Nerve Center fleet report • ${scope.label} • ${reportDateTime(window.end)}. Open the attached PDF for complete details.`},{env:whatsappEnv});
        sent++;
      }catch(error){
        status=`Failed - ${String(error?.message||'Meta delivery error').slice(0,160)}`;
        failed++;
        console.error(`Consolidated WhatsApp report failed for ${login}:`,error.message);
      }
      await Promise.all([
        pool.query(`UPDATE whatsapp_consolidated_report_runs SET status=$1,updated_at=NOW() WHERE id=$2`,[status,claim.rows[0].id]),
        pool.query(`INSERT INTO whatsapp_alert_history
          (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
          ['Consolidated request report',scope.label,window.slotKey,recipientName,phone,status]),
      ]);
    }
    return {slotKey:window.slotKey,sent,failed,skipped,open:openRequests.length,closed:closedRequests.length};
  }finally{consolidatedReportRunning=false}
}

async function publishCrmReportFiles({scopeLabel,start,end,openTickets=[],closedTickets=[],slotKey,scopeKey,baseUrl=publicBaseUrl()}){
  const data={scopeLabel,start,end,openTickets,closedTickets};
  const pdf=await buildTicketConsolidatedReportPdf(data);
  const table=buildTicketReportTable(data);
  const xlsx=buildXlsxWorkbookBuffer(table.title,table.columns,table.rows);
  const pdfFilename=reportFilename('CRM',scopeKey,slotKey);
  const xlsxFilename=pdfFilename.replace(/\.pdf$/i,'.xlsx');
  const pdfCode=randomUUID().replace(/-/g,'').slice(0,10),xlsxCode=randomUUID().replace(/-/g,'').slice(0,10);
  await pool.query(`DELETE FROM published_reports WHERE expires_at<=NOW()`);
  await pool.query(`INSERT INTO published_reports (id,short_code,filename,content_type,file_data,expires_at) VALUES
    ($1,$2,$3,'application/pdf',$4,NOW()+INTERVAL '14 days'),
    ($5,$6,$7,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',$8,NOW()+INTERVAL '14 days')`,
    [randomUUID(),pdfCode,pdfFilename,pdf,randomUUID(),xlsxCode,xlsxFilename,xlsx]);
  const pdfUrl=`${baseUrl}/r/${pdfCode}`,xlsxUrl=`${baseUrl}/r/${xlsxCode}`;
  return {pdf,pdfFilename,pdfUrl,xlsxUrl,message:buildTicketWhatsAppReport({...data,pdfUrl,xlsxUrl})};
}

let consolidatedTicketReportRunning=false;
async function sendScheduledConsolidatedTicketReports(now=new Date()){
  if(!databaseReady||consolidatedTicketReportRunning)return {skipped:true};
  const reportSettings=await storedWhatsAppReportSettings();
  if(!whatsappPurposeEnabled(reportSettings,'consolidatedTicketReport',now))return {skipped:true,reason:'paused by Report settings'};
  if(!ticketReportDue(now,20,reportSettings.crm))return {skipped:true,reason:'outside scheduled CRM report window'};
  consolidatedTicketReportRunning=true;
  try{
    const window=ticketReportWindow(now,reportSettings.crm);
    const [{rows:ticketRows},{rows:userRows}]=await Promise.all([
      pool.query(`SELECT reference,site,creator_name AS "user",message AS remarks,status,
        created_at AS "openedAt",resolved_at AS "resolvedAt"
        FROM crm_tickets
        WHERE (created_at >= $1 AND created_at < $2 AND status <> 'Resolved')
           OR (resolved_at >= $1 AND resolved_at < $2)`,[window.start,window.end]),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`),
    ]);
    const tickets=prepareTicketReportRows(ticketRows,window.end);
    const openTickets=tickets.filter((ticket)=>ticket.status!=='Resolved'&&!ticket.resolvedAt);
    const closedTickets=tickets.filter((ticket)=>Boolean(ticket.resolvedAt));
    let sent=0,failed=0,skipped=0;
    for(const row of userRows){
      const user=row.record_data||{};
      const profile=resolveMobileAccess({user});
      if(profile.sessionRole!=='super')continue;
      const isAdmin=profile.permissions.adminLevel==='Admin';
      const isSuperAdmin=profile.permissions.adminLevel==='Super Admin';
      if(!reportSettings.crm.recipientRoles.includes(profile.permissions.adminLevel))continue;
      const login=String(user.login||'').trim().toLowerCase();
      const phone=String(user.phone||user.phoneNo||user.phoneNumber||'').trim();
      if(!login)continue;
      let scope=managerReportScope(user);
      if((isAdmin||isSuperAdmin)&&scope.sites!==null&&!scope.sites.length)scope={key:'ALL',label:'All regions',sites:null};
      if(scope.sites!==null&&!scope.sites.length){skipped++;continue}
      const scopedOpen=openTickets.filter((ticket)=>reportScopeIncludesSite(scope,ticket.site));
      const scopedClosed=closedTickets.filter((ticket)=>reportScopeIncludesSite(scope,ticket.site));
      if(!reportSettings.crm.sendEmpty&&!scopedOpen.length&&!scopedClosed.length){skipped++;continue;}
      const claim=await pool.query(`INSERT INTO whatsapp_consolidated_report_runs
        (slot_key,recipient_login,scope_key,status,attempts,updated_at) VALUES ($1,$2,$3,'Sending',1,NOW())
        ON CONFLICT (slot_key,recipient_login,scope_key) DO UPDATE
          SET status='Sending',attempts=whatsapp_consolidated_report_runs.attempts+1,updated_at=NOW()
          WHERE whatsapp_consolidated_report_runs.status LIKE 'Failed%' AND whatsapp_consolidated_report_runs.attempts<3
        RETURNING id`,[window.slotKey,login,`CRM-${scope.key}`]);
      if(!claim.rowCount){skipped++;continue}
      const recipientName=String(user.employee||user.name||user.login||login);
      let status='Sent';
      try{
        if(!phone)throw new Error('Phone number missing');
        const bundle=await publishCrmReportFiles({scopeLabel:scope.label,start:window.start,end:window.end,openTickets:scopedOpen,closedTickets:scopedClosed,slotKey:window.slotKey,scopeKey:scope.key});
        const whatsappEnv=await metaWhatsAppRuntimeEnv();
        try{await sendMetaWhatsAppTemplate({to:phone,templateKey:'consolidatedTicketReport',parameters:[bundle.message]},{env:whatsappEnv})}
        catch(templateError){
          if(templateError.code==='WHATSAPP_POLICY_PAUSED')throw templateError;
          console.warn('CRM linked template unavailable; attempting PDF delivery:',templateError.message);
          await sendMetaWhatsAppDocument({to:phone,buffer:bundle.pdf,purpose:'consolidatedTicketReport',filename:bundle.pdfFilename,caption:`CRM consolidated report • ${scope.label}. PDF: ${bundle.pdfUrl} Excel: ${bundle.xlsxUrl}. Links expire in 14 days.`},{env:whatsappEnv});
        }
        sent++;
      }catch(error){
        status=`Failed - ${String(error?.message||'Meta delivery error').slice(0,160)}`;
        failed++;
        console.error(`Consolidated CRM WhatsApp report failed for ${login}:`,error.message);
      }
      await Promise.all([
        pool.query(`UPDATE whatsapp_consolidated_report_runs SET status=$1,updated_at=NOW() WHERE id=$2`,[status,claim.rows[0].id]),
        pool.query(`INSERT INTO whatsapp_alert_history
          (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
          ['Consolidated CRM ticket report',scope.label,window.slotKey,recipientName,phone,status]),
      ]);
    }
    return {slotKey:window.slotKey,sent,failed,skipped,open:openTickets.length,closed:closedTickets.length};
  }finally{consolidatedTicketReportRunning=false}
}

async function directorReportSourceData(){
  const [{rows:requestRows},{rows:equipmentRows},{rows:transferRows}]=await Promise.all([
    pool.query(`SELECT ${requestProjection} FROM maintenance_requests ORDER BY created_at DESC`),
    pool.query(`SELECT id,record_data FROM master_records WHERE master_name='Equipment master' ORDER BY created_at ASC`),
    pool.query(`SELECT id,record_data FROM master_records WHERE master_name='Vehicle transfers' ORDER BY created_at ASC`),
  ]);
  return {
    requests:await attachDailyRemarks(requestsVisibleGlobally(requestRows)),
    equipmentRecords:equipmentRows.map(({id,record_data})=>({id,...record_data})),
    transferRecords:transferRows.map(({id,record_data})=>({id,...record_data})),
  };
}

function splitHierarchyValues(value){
  return String(value||'').split(/\s*\|\s*/).map((item)=>item.trim()).filter(Boolean);
}

function sourceDataForSites(sourceData,siteAccess=''){
  const sites=splitHierarchyValues(siteAccess).map(canonicalSiteName).filter(Boolean);
  if(!sites.length)return sourceData;
  const includesSite=(value)=>sites.includes(canonicalSiteName(value));
  return {
    requests:sourceData.requests.filter((request)=>includesSite(request.site||request.reportSite)),
    equipmentRecords:sourceData.equipmentRecords.filter((record)=>includesSite(record.currentLocation||record.location||record.site)),
    transferRecords:sourceData.transferRecords.filter((record)=>includesSite(record.destination||record.currentLocation||record.location||record.source)),
  };
}

function hierarchyRuleForDesignation(records=[],designation={}){
  const wanted=String(designation.label||'').trim().toLowerCase();
  return records.map((row)=>row.record_data||row)
    .find((record)=>String(record.designation||'').trim().toLowerCase()===wanted);
}

async function publishDirectorReportFiles({baseUrl,slotKey,now=new Date(),reportTitles=null,heading="Director's Daily Report",scheduleLabel='Daily 07:00:00 PM IST',siteAccess='',eventRequest=null}){
  const selectedTitles=reportTitles?new Set(reportTitles):null;
  const sourceData=sourceDataForSites(await directorReportSourceData(),siteAccess);
  if(eventRequest)sourceData.requests=sourceDataForSites({requests:[eventRequest],equipmentRecords:[],transferRecords:[]},siteAccess).requests;
  const tables=buildDirectorReportTables(sourceData).filter((table)=>!selectedTitles||selectedTitles.has(table.title));
  await pool.query(`DELETE FROM published_reports WHERE expires_at<=NOW()`);
  const links=[];
  const files=[];
  const shortReportCode=()=>randomUUID().replace(/-/g,'').slice(0,10);
  for(const table of tables){
    const pdf=await buildTableExportPdf({title:table.pdfTitle||table.title,columns:table.columns.map((column)=>({label:column.label})),rows:table.rows});
    const xlsx=buildXlsxWorkbookBuffer(table.title,table.columns,table.rows);
    const pdfId=randomUUID(),xlsxId=randomUUID();
    const pdfCode=shortReportCode(),xlsxCode=shortReportCode();
    const pdfFilename=directorReportFilename(table.title,'pdf',slotKey);
    const xlsxFilename=directorReportFilename(table.title,'xlsx',slotKey);
    await pool.query(`INSERT INTO published_reports (id,short_code,filename,content_type,file_data,expires_at) VALUES
      ($1,$2,$3,'application/pdf',$4,NOW()+INTERVAL '14 days'),
      ($5,$6,$7,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',$8,NOW()+INTERVAL '14 days')`,
      [pdfId,pdfCode,pdfFilename,pdf,xlsxId,xlsxCode,xlsxFilename,xlsx]);
    links.push({
      title:table.title,department:table.department,rowCount:table.rows.length,
      pdfUrl:`${baseUrl}/r/${pdfCode}`,
      xlsxUrl:`${baseUrl}/r/${xlsxCode}`,
    });
    files.push(
      {filename:pdfFilename,contentType:'application/pdf',content:pdf},
      {filename:xlsxFilename,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',content:xlsx},
    );
  }
  return {slotKey,generatedAt:now,links,files,message:buildDirectorWhatsAppMessage({generatedAt:now,links,heading,scheduleLabel})};
}

async function publishDirectorReportArchive({baseUrl,slotKey,files=[]}){
  if(!files.length)return null;
  const archive=buildDirectorReportArchiveBuffer(files);
  const archiveId=randomUUID(),archiveCode=randomUUID().replace(/-/g,'').slice(0,10);
  const filename=`nerve-center-director-reports-${slotKey}.zip`;
  await pool.query(`INSERT INTO published_reports (id,short_code,filename,content_type,file_data,expires_at)
    VALUES ($1,$2,$3,'application/zip',$4,NOW()+INTERVAL '14 days')`,
    [archiveId,archiveCode,filename,archive]);
  return {filename,url:`${baseUrl}/r/${archiveCode}`,size:archive.length};
}

async function sendDirectorReportBundle({recipientPhone,recipientName='Director',baseUrl=publicBaseUrl(),now=new Date(),manual=false}={}){
  if(!databaseReady)return {skipped:true,reason:'database is not ready'};
  const window=directorReportWindow(now);
  const phone=String(recipientPhone||'').trim();
  if(!phone)return {skipped:true,reason:'phone number missing'};
  const recipientKey=manual?`manual:${phone}`:`director:${phone}`;
  const claim=await pool.query(`INSERT INTO whatsapp_consolidated_report_runs
    (slot_key,recipient_login,scope_key,status,attempts,updated_at) VALUES ($1,$2,'DIRECTOR','Sending',1,NOW())
    ON CONFLICT (slot_key,recipient_login,scope_key) DO UPDATE
      SET status='Sending',attempts=whatsapp_consolidated_report_runs.attempts+1,updated_at=NOW()
      WHERE $3::boolean OR (whatsapp_consolidated_report_runs.status LIKE 'Failed%' AND whatsapp_consolidated_report_runs.attempts<3)
    RETURNING id`,[window.slotKey,recipientKey,manual]);
  if(!claim.rowCount)return {skipped:true,reason:'already sent for this Director slot',slotKey:window.slotKey};
  let status='Sent',bundle=null;
  try{
    bundle=await publishDirectorReportFiles({baseUrl,slotKey:window.slotKey,now});
    await sendMetaWhatsAppTemplate({
      to:phone,
      templateKey:'consolidatedRequestReport',purpose:manual?'manualReports':'consolidatedRequestReport',
      parameters:[bundle.message],
    },{env:await metaWhatsAppRuntimeEnv()});
  }catch(error){
    status=`Failed - ${String(error?.message||'Director WhatsApp delivery error').slice(0,160)}`;
    console.error(`Director WhatsApp report failed for ${phone}:`,error.message);
  }
  await Promise.all([
    pool.query(`UPDATE whatsapp_consolidated_report_runs SET status=$1,updated_at=NOW() WHERE id=$2`,[status,claim.rows[0].id]),
    pool.query(`INSERT INTO whatsapp_alert_history
      (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
      ['Director linked report bundle','All departments',window.slotKey,recipientName,phone,status]),
  ]);
  return {slotKey:window.slotKey,status,reportCount:bundle?.links?.length||0,links:bundle?.links||[],message:bundle?.message||''};
}

async function sendScheduledDirectorReportBundles(now=new Date()){
  return {skipped:true,reason:'Director schedule is handled by the hierarchy report flow'};
}

let hierarchyReportRunning=false;
async function sendScheduledHierarchyReportBundles(now=new Date(),event=null){
  if(!databaseReady||(!event&&hierarchyReportRunning))return {skipped:true};
  if(!whatsappPurposeEnabled(await storedWhatsAppReportSettings(),'consolidatedRequestReport',now))return {skipped:true,reason:'paused by Report settings'};
  if(!event)hierarchyReportRunning=true;
  try{
    const [{rows:userRows},{rows:hierarchyRows},scheduleSettings]=await Promise.all([
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees' ORDER BY created_at ASC`),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Hierarchy master' ORDER BY created_at ASC`),
      storedHierarchyReportScheduleSettings(),
    ]);
    const eventRecipients=event?new Set(await requestStakeholderLogins(pool,{site:event.request.site,requesterLogin:event.request.requesterLogin})):null;
    let sent=0,failed=0,skipped=0;
    for(const row of userRows){
      const user=row.record_data||{};
      const profile=resolveMobileAccess({user});
      const designation=flowDesignationForUser(user,profile);
      if(!designation)continue;
      const designationSettings=scheduleSettings.designations[designation.key];
      const login=String(user.login||user.employee||user.name||'').trim().toLowerCase();
      if(eventRecipients&&!eventRecipients.has(login)){skipped++;continue}
      if(!designationSettings?.allRecipients&&!designationSettings?.recipientLogins?.includes(login)){skipped++;continue}
      const hierarchyRule=hierarchyRuleForDesignation(hierarchyRows,designation);
      const effectiveScheduleSettings=hierarchyRule?applyHierarchyDeliveryRule(scheduleSettings,designation.key,hierarchyRule):scheduleSettings;
      const dueGroups=event?reportsForHierarchyEvent(designation.key,event,effectiveScheduleSettings):reportsDueForDesignation(designation.key,now,20,effectiveScheduleSettings);
      if(!dueGroups.length)continue;
      const recipientScope=hierarchyRecipientReportScope(user,profile,hierarchyRule?.siteAccess);
      if(Array.isArray(recipientScope.sites)&&!recipientScope.sites.length){skipped++;continue}
      if(event&&!reportScopeIncludesSite(recipientScope,event.request.site)){skipped++;continue}
      // Hierarchy ticks use the Reports-menu catalogue; older scheduled titles map onto their catalogue equivalent.
      const reportTitles=[...new Set(dueGroups.flatMap((group)=>group.reports))].filter((title)=>!hierarchyRule||hierarchyAccessAllowsReport(hierarchyRule.reportAccess,title));
      if(!reportTitles.length){skipped++;continue}
      const scheduleLabel=[...new Set(dueGroups.map((group)=>group.scheduleLabel))].join(' + ');
      const slotKey=dueGroups.map((group)=>group.slotKey).sort().join('+');
      const scheduleKey=dueGroups.map((group)=>group.scheduleKey).sort().join('+');
      const phone=String(user.phone||user.phoneNo||user.phoneNumber||'').trim();
      const recipientName=String(user.employee||user.name||user.login||designation.label);
      if(!phone){skipped++;continue}
      const claim=await pool.query(`INSERT INTO whatsapp_consolidated_report_runs
        (slot_key,recipient_login,scope_key,status,attempts,updated_at) VALUES ($1,$2,$3,'Sending',1,NOW())
        ON CONFLICT (slot_key,recipient_login,scope_key) DO UPDATE
          SET status='Sending',attempts=whatsapp_consolidated_report_runs.attempts+1,updated_at=NOW()
          WHERE whatsapp_consolidated_report_runs.status LIKE 'Failed%' AND whatsapp_consolidated_report_runs.attempts<3
        RETURNING id`,[slotKey,login||`hierarchy:${phone}`,`HIERARCHY-${designation.key}-${scheduleKey}`]);
      if(!claim.rowCount){skipped++;continue}
      let status='Sent',bundle=null;
      try{
        bundle=await publishDirectorReportFiles({
          baseUrl:publicBaseUrl(),
          slotKey,
          now,
          reportTitles,
          siteAccess:recipientScope.sites===null?'':recipientScope.sites.join(' | '),
          heading:`${designation.label} ${event?'Event':'Consolidated'} Report`,
          scheduleLabel,
          eventRequest:event?.request||null,
        });
        const env=await metaWhatsAppRuntimeEnv();
        const messagePurpose=hierarchyReportMessagePurpose(reportTitles);
        try{await sendMetaWhatsAppTemplate({to:phone,templateKey:'consolidatedRequestReport',purpose:messagePurpose,parameters:[bundle.message.replace(/\s+/g,' ').trim()]},{env})}
        catch(templateError){
          if(event&&templateError.code!=='WHATSAPP_POLICY_PAUSED')await sendMetaWhatsAppText({to:phone,message:reportTemplateFallback(messagePurpose,[bundle.message],env.WHATSAPP_REPORT_SETTINGS,env.WHATSAPP_TEMPLATE_APPROVALS,bundle.message),purpose:messagePurpose},{env});
          else throw templateError;
        }
        sent++;
      }catch(error){
        status=`Failed - ${String(error?.message||'Hierarchy WhatsApp delivery error').slice(0,160)}`;
        failed++;
        console.error(`Hierarchy WhatsApp report failed for ${recipientName}:`,error.message);
      }
      await Promise.all([
        pool.query(`UPDATE whatsapp_consolidated_report_runs SET status=$1,updated_at=NOW() WHERE id=$2`,[status,claim.rows[0].id]),
        pool.query(`INSERT INTO whatsapp_alert_history
          (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
          ['Hierarchy linked report bundle',designation.label,slotKey,recipientName,phone,status]),
      ]);
    }
    return {sent,failed,skipped};
  }finally{if(!event)hierarchyReportRunning=false}
}

async function sendRequestEventReports(type,request){
  try{return await sendScheduledHierarchyReportBundles(new Date(),{type,request})}
  catch(error){console.error(`Request ${request.ref} saved, but event report delivery failed.`,error.message);return {failed:true}}
}

app.post('/api/reports/director/send-test',requireSuper,async(req,res,next)=>{
  try{
    const recipientPhone=String(req.body?.recipientPhone||'').trim();
    const recipientName=String(req.body?.recipientName||'Director test recipient').trim()||'Director test recipient';
    const now=req.body?.now?new Date(req.body.now):new Date();
    const result=await sendDirectorReportBundle({recipientPhone,recipientName,baseUrl:publicBaseUrl(req),now,manual:true});
    const status=String(result.status||'');
    if(status.startsWith('Failed'))return res.status(502).json(result);
    res.json(result);
  }catch(error){next(error)}
});

app.post('/api/reports/director/send-email-test',requireSuper,async(req,res,next)=>{
  try{
    const recipientEmail=String(req.body?.recipientEmail||'').trim();
    const now=req.body?.now?new Date(req.body.now):new Date();
    const window=directorReportWindow(now);
    const bundle=await publishDirectorReportFiles({baseUrl:publicBaseUrl(req),slotKey:window.slotKey,now});
    const archive=await publishDirectorReportArchive({baseUrl:publicBaseUrl(req),slotKey:window.slotKey,files:bundle.files});
    const result=await sendDirectorReportEmail({to:recipientEmail,bundle:{...bundle,archiveUrl:archive?.url},attachZip:req.body?.attachZip===true});
    if(!result.sent)return res.status(502).json({slotKey:window.slotKey,status:'Failed',reason:result.reason});
    res.json({slotKey:window.slotKey,status:'Sent',reportCount:bundle.links.length,accepted:result.accepted,attachmentCount:result.attachmentCount,archiveUrl:archive?.url,archiveSize:archive?.size});
  }catch(error){next(error)}
});

async function ticketSuperRecipients(client,{creatorRole,site}){
  const {rows}=await client.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
  const adminLogins=[];
  const managerLogins=[];
  for(const row of rows){
    const user=row.record_data||{};
    const login=String(user.login||'').trim().toLowerCase();
    if(!login)continue;
    const profile=resolveMobileAccess({user});
    if(profile.sessionRole!=='super')continue;
    if(profile.permissions.adminLevel==='Admin')adminLogins.push(login);
    else if(profile.permissions.managerRoles.some((role)=>managerUserRole(role)===creatorRole)){
      if(userManagesSite(user,site))managerLogins.push(login);
    }
  }
  return {adminLogins,managerLogins};
}

function requestNotificationTime(value){
  return formatDisplayDateTime(value);
}

async function requestStakeholderLogins(client,{site,requesterLogin}){
  const {rows}=await client.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
  const recipients=[String(requesterLogin||'').trim().toLowerCase()];
  const requestSite=canonicalSiteName(site);
  for(const row of rows){
    const user=row.record_data||{};
    const login=String(user.login||'').trim().toLowerCase();
    if(!login)continue;
    const profile=resolveMobileAccess({user});
    const userSite=canonicalSiteName(user.site||user.location||user.currentLocation);
    const siteMatches=Boolean(requestSite)&&userSite===requestSite;
    if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Admin')recipients.push(login);
    if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'&&userManagesSite(user,site))recipients.push(login);
    if(profile.sessionRole==='normal'&&siteMatches&&['Production User','Maintenance User','MIS User'].includes(profile.assignedRole))recipients.push(login);
  }
  return [...new Set(recipients.filter(Boolean))];
}

app.get('/api/tickets',requireSession,async(req,res,next)=>{
  try{
    const category=TICKET_CATEGORIES.includes(String(req.query.category||''))?String(req.query.category):'';
    const values=[];
    const conditions=[];
    let managerScope=null;
    if(req.session.role!=='super'){
      values.push(String(req.session.login||'').trim().toLowerCase());
      conditions.push(`lower(creator_login)=$${values.length}`);
    }else if(req.session.permissions?.adminLevel==='Manager'){
      const user=await currentUserRecord(req.session);
      values.push(managerRoleSelection(req.session.permissions?.managerRoles?.length?req.session.permissions.managerRoles:req.session.permissions?.managerRole).map(managerUserRole));
      conditions.push(`creator_role=ANY($${values.length}::text[])`);
      managerScope=managerReportScope(user);
    }
    if(category){values.push(category);conditions.push(`category=$${values.length}`)}
    const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
    const {rows}=await pool.query(`SELECT ${ticketProjection()} FROM crm_tickets ${where} ORDER BY created_at DESC`,values);
    res.json(managerScope?rows.filter((ticket)=>reportScopeIncludesSite(managerScope,ticket.site)):rows);
  }catch(error){next(error)}
});

app.post('/api/tickets',requireSession,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const managerRoles=managerRoleSelection(req.session.permissions?.managerRoles?.length?req.session.permissions.managerRoles:req.session.permissions?.managerRole);
    const creatorRole=req.session.role==='super'
      ? req.session.permissions?.adminLevel==='Manager'&&managerRoles.length
        ? managerUserRole(managerRoles[0])
        : 'Admin'
      : String(req.session.assignedRole||'User');
    const roleCategory=String(creatorRole).replace(/ User$/,'');
    const category=TICKET_CATEGORIES.includes(roleCategory)?roleCategory:'General';
    const priority=['Low','Medium','High'].includes(String(req.body?.priority||''))?String(req.body.priority):'';
    const message=String(req.body?.message||'').trim();
    const messageAudio=String(req.body?.messageAudio||'');
    const attachmentData=String(req.body?.attachmentData||'');
    const attachmentName=String(req.body?.attachmentName||'').slice(0,255);
    const attachmentType=String(req.body?.attachmentType||'').slice(0,100);
    if(!priority)return res.status(400).json({error:'Select a ticket priority.'});
    if(!message&&!messageAudio)return res.status(400).json({error:'Write a message or record an audio message.'});
    if(!validTicketMediaDataUrl(messageAudio,{kind:'audio'}))return res.status(400).json({error:'Ticket audio must be a supported recording up to 3 MB.'});
    if(!validTicketMediaDataUrl(attachmentData))return res.status(400).json({error:'Upload a supported image or video up to 10 MB.'});
    const user=await currentUserRecord(req.session,client);
    const site=String(user.site||user.location||user.currentLocation||'Not assigned').trim()||'Not assigned';
    await client.query('BEGIN');
    const inserted=await client.query(`INSERT INTO crm_tickets
      (creator_login,creator_name,creator_role,site,category,priority,message,message_audio,attachment_data,attachment_name,attachment_type)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,created_at`,[
      String(req.session.login||'').trim().toLowerCase(),String(req.session.name||'User'),creatorRole,site,category,priority,message,messageAudio,attachmentData,attachmentName,attachmentType
    ]);
    const reference=ticketReference({site,date:new Date(inserted.rows[0].created_at),number:inserted.rows[0].id});
    const {rows}=await client.query(`UPDATE crm_tickets SET reference=$1 WHERE id=$2 RETURNING ${ticketProjection()}`,[reference,inserted.rows[0].id]);
    const recipients=await ticketSuperRecipients(client,{creatorRole,site});
    const creatorLogin=String(req.session.login||'').trim().toLowerCase();
    await addTicketNotifications(client,[...recipients.adminLogins,...recipients.managerLogins],reference,`${req.session.name||'A user'} (@${creatorLogin}) created ticket ${reference}.`,
      {templateKey:'ticketCreated',parameters:[reference,req.session.name||creatorLogin,site]},{whatsapp:true});
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
    sendTicketRaisedEmail(rows[0]).catch((error)=>console.error(`Ticket email failed for ${reference}:`,error.message));
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});

app.patch('/api/tickets/resolve',requireSession,async(req,res,next)=>{
  if(!isTicketAdmin(req.session))return res.status(403).json({error:'Only an Admin can resolve tickets.'});
  const client=await pool.connect();
  try{
    const resolution=String(req.body?.resolutionMessage||'').trim();
    const resolutionAudio=String(req.body?.resolutionAudio||'');
    const resolutionAttachmentData=String(req.body?.resolutionAttachmentData||'');
    const resolutionAttachmentName=String(req.body?.resolutionAttachmentName||'').slice(0,255);
    const resolutionAttachmentType=String(req.body?.resolutionAttachmentType||'').slice(0,100);
    const reference=String(req.body?.reference||'').trim();
    if(!reference)return res.status(400).json({error:'Ticket reference is required.'});
    if(!resolution&&!resolutionAudio)return res.status(400).json({error:'Write a resolution message or record resolution audio.'});
    if(!validTicketMediaDataUrl(resolutionAudio,{kind:'audio'}))return res.status(400).json({error:'Resolution audio must be a supported recording up to 3 MB.'});
    if(!validTicketMediaDataUrl(resolutionAttachmentData))return res.status(400).json({error:'Upload a supported resolution image or video up to 10 MB.'});
    await client.query('BEGIN');
    const result=await client.query(`UPDATE crm_tickets SET status='Resolved',resolution_message=$1,resolution_audio=$2,
      resolution_attachment_data=$3,resolution_attachment_name=$4,resolution_attachment_type=$5,resolved_by=$6,resolved_at=NOW()
      WHERE reference=$7 AND status<>'Resolved' RETURNING ${ticketProjection()}`,[resolution,resolutionAudio,resolutionAttachmentData,
      resolutionAttachmentName,resolutionAttachmentType,String(req.session.name||'Admin'),reference]);
    if(!result.rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Open ticket not found.'})}
    const ticket=result.rows[0];
    const recipients=await ticketSuperRecipients(client,{creatorRole:ticket.creatorRole,site:ticket.site});
    await addTicketNotifications(client,[ticket.creatorLogin,...recipients.managerLogins],ticket.reference,`Ticket ${ticket.reference} was resolved by ${req.session.name||'Admin'}.`,
      {templateKey:'ticketResolved',parameters:[ticket.reference,req.session.name||'Admin']},{whatsapp:true});
    await client.query('COMMIT');
    res.json(ticket);
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});

async function createMaintenanceReminderNotifications(){
  const clock=await pool.query(`SELECT to_char(NOW() AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS day,
    EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Asia/Kolkata')::int AS hour`);
  const {day,hour}=clock.rows[0];
  const slot=hour>=18?'18':hour>=9?'09':'';
  if(!slot)return;
  const {rows:requests}=await pool.query(`SELECT reference,site FROM maintenance_requests WHERE status<>'Closed' AND started_at<=NOW()-INTERVAL '1 day'`);
  if(!requests.length)return;
  const {rows:users}=await pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
  for(const request of requests){
    const recipients=[];
    for(const row of users){
      const user=row.record_data||{};
      const login=String(user.login||'').trim().toLowerCase();
      if(!login)continue;
      const profile=resolveMobileAccess({user});
      const userSite=canonicalSiteName(user.site||user.location||user.currentLocation);
      const siteMatches=!userSite||userSite===canonicalSiteName(request.site);
      if(profile.assignedRole==='Maintenance User'&&siteMatches)recipients.push(login);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Admin')recipients.push(login);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'&&profile.permissions.managerRoles.includes('Maintenance Manager')&&userManagesSite(user,request.site))recipients.push(login);
    }
    const newRecipients=[];
    const message=`${slot}:00 reminder: add today’s maintenance update and delay reason for ${request.reference}.`;
    for(const login of [...new Set(recipients)]){
      const key=`maintenance-reminder:${day}:${slot}:${request.reference}:${login}`;
      const inserted=await pool.query(`INSERT INTO crm_notifications (recipient_login,ticket_reference,message,notification_key)
        VALUES ($1,$2,$3,$4) ON CONFLICT (notification_key) WHERE notification_key IS NOT NULL DO NOTHING RETURNING id`,[login,request.reference,message,key]);
      if(inserted.rowCount)newRecipients.push(login);
    }
    // Maintenance reminders remain available in-app. WhatsApp request traffic is
    // delivered only through the scheduled consolidated report.
  }
}

const waitForNotification=createNotificationFeed(pool);
app.get('/api/notifications',requireSession,async(req,res,next)=>{
  let subscription;
  res.set('Cache-Control','private, no-store');
  res.vary('Authorization');
  try{
    await createMaintenanceReminderNotifications().catch((error)=>{
      console.error('Maintenance reminder notification generation failed.',error);
    });
    const login=String(req.session.login||'').trim().toLowerCase();
    // Subscribe before reading: an insert between the read and wait cannot be lost.
    if(req.query.wait==='1')subscription=await waitForNotification(login,res);
    const read=async()=>{
      const {rows}=await pool.query(`SELECT n.id,n.ticket_reference AS "ticketReference",n.message,n.is_read AS "isRead",
        COALESCE(NULLIF(r.site,''),t.site,'') AS site,COALESCE(r.door_number,'') AS door,COALESCE(t.category,'') AS "ticketCategory",
        to_char(n.created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "createdAt"
        FROM crm_notifications n
        LEFT JOIN maintenance_requests r ON r.reference=n.ticket_reference
        LEFT JOIN crm_tickets t ON t.reference=n.ticket_reference
        WHERE n.recipient_login=$1 ORDER BY n.created_at DESC,n.id DESC LIMIT 50`,[login]);
      return rows;
    };
    let rows=await read();
    if(subscription&&rows.map((row)=>String(row.id)).join(',')===String(req.query.known||'')){
      await subscription.promise;
      if(res.destroyed)return;
      rows=await read();
    }
    if(!res.destroyed)res.json(rows);
  }catch(error){if(!res.destroyed)next(error)}
  finally{subscription?.close()}
});

app.get('/api/notifications/:id/target',requireSession,async(req,res,next)=>{
  res.set('Cache-Control','private, no-store, no-cache, must-revalidate');
  res.vary('Authorization');
  const unavailable=()=>res.status(404).json({error:'Notification target is not available.'});
  try{
    const rawId=String(req.params.id||'').trim();
    if(!/^[1-9]\d*$/.test(rawId))return unavailable();
    let notificationId;
    try{notificationId=BigInt(rawId)}catch{return unavailable()}
    if(notificationId>9223372036854775807n)return unavailable();

    const login=String(req.session.login||'').trim().toLowerCase();
    const {rows:notifications}=await pool.query(`SELECT ticket_reference AS reference
      FROM crm_notifications WHERE id=$1 AND recipient_login=$2 LIMIT 1`,[notificationId.toString(),login]);
    const reference=String(notifications[0]?.reference||'').trim();
    if(!reference)return unavailable();

    const [ticketResult,requestResult]=await Promise.all([
      pool.query(`SELECT ${ticketProjection()} FROM crm_tickets WHERE reference=$1`,[reference]),
      pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]),
    ]);
    if(ticketResult.rows.length&&requestResult.rows.length)return unavailable();

    if(ticketResult.rows.length){
      const ticket=ticketResult.rows[0];
      let visible=req.session.role==='super'&&req.session.permissions?.adminLevel!=='Manager';
      if(req.session.role!=='super')visible=String(ticket.creatorLogin||'').trim().toLowerCase()===login;
      else if(req.session.permissions?.adminLevel==='Manager'){
        const manager=await currentUserRecord(req.session);
        const creatorRoles=managerRoleSelection(req.session.permissions?.managerRoles?.length
          ?req.session.permissions.managerRoles:req.session.permissions?.managerRole).map(managerUserRole);
        visible=creatorRoles.includes(ticket.creatorRole)&&userManagesSite(manager,ticket.site);
      }
      if(!visible)return unavailable();
      return res.json({kind:'ticket',reference,record:ticket});
    }

    if(requestResult.rows.length){
      const authorization=await currentDashboardAuthorization(req.session);
      if(!authorization)return unavailable();
      const operationalRole=authorization.session.role==='normal'
        &&['Production User','Maintenance User','MIS User'].includes(authorization.session.assignedRole);
      if(authorization.session.role!=='super'&&!operationalRole&&authorization.session.permissions?.readRequests!==true)
        return unavailable();
      const scope=infoPulseRequestScope(authorization.session,authorization.user);
      const ownsProductionRequest=authorization.session.role==='normal'
        &&authorization.session.assignedRole==='Production User'
        &&String(requestResult.rows[0]?.requesterLogin||'').trim().toLowerCase()===login;
      const visibleRows=ownsProductionRequest?requestResult.rows:scopeInfoPulseRequests(requestResult.rows,scope);
      if(visibleRows.length!==1)return unavailable();
      const [record]=await attachDailyRemarks(visibleRows);
      if(!record)return unavailable();
      return res.json({kind:'request',reference,record});
    }

    return unavailable();
  }catch(error){next(error)}
});

app.patch('/api/notifications/read',requireSession,async(req,res,next)=>{
  try{
    const login=String(req.session.login||'').trim().toLowerCase();
    await pool.query('UPDATE crm_notifications SET is_read=TRUE WHERE recipient_login=$1',[login]);
    res.json({ok:true});
  }catch(error){next(error)}
});

const requestProjection=`reference AS ref, equipment_name AS equipment, equipment_group AS "equipmentGroup", door_number AS door,
  to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "createdAt",
  to_char(in_progress_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "inProgressAt", in_progress_by AS "inProgressBy",
  registration_number AS reg, chassis_number AS chassis, driver_name AS "driverName", driver_name_source AS "driverNameSource", superior_name AS superior, site, category, complaint, complaint_audio AS "complaintAudio",
  to_char(started_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS start,
  to_char(accepted_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "acceptedAt", accepted_by AS "acceptedBy", acceptance_required AS "acceptanceRequired",
  to_char(arrival_flagged_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "arrivalFlaggedAt", arrival_flagged_by AS "arrivalFlaggedBy", arrival_flag_remark AS "arrivalFlagRemark",
  to_char(mis_flagged_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "misFlaggedAt", mis_flagged_by AS "misFlaggedBy", mis_flag_remark AS "misFlagRemark",
  CASE WHEN closed_at IS NULL THEN '—' ELSE CONCAT(FLOOR(EXTRACT(EPOCH FROM (closed_at-started_at))/86400)::int,'d ',FLOOR(MOD(EXTRACT(EPOCH FROM (closed_at-started_at)),86400)/3600)::int,'h ',FLOOR(MOD(EXTRACT(EPOCH FROM (closed_at-started_at)),3600)/60)::int,'m') END AS hours,
  status, idle_reason AS "idleReason", owner_name AS owner, requester_login AS "requesterLogin", requester_role AS "requesterRole",
  to_char(ideal_requested_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "idealRequestedAt",
  ideal_requested_by AS "idealRequestedBy",to_char(ideal_approved_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "idealApprovedAt",ideal_approved_by AS "idealApprovedBy",
  to_char(closed_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "closedAt",
  closed_by AS "closedBy", maintenance_work AS "maintenanceWork", maintenance_audio AS "maintenanceAudio", delayed_reason AS "delayedReason", to_char(expected_completion_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "expectedCompletionAt", verification_status AS "verificationStatus",
  to_char(verified_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "verifiedAt",
  verified_by AS "verifiedBy", first_trip_done AS "firstTripDone",
  to_char(first_trip_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "firstTripAt",
  first_trip_by AS "firstTripBy", (first_trip_card_image <> '') AS "firstTripCardUploaded",
  meter_type AS "meterType", opening_meter_reading AS "openingMeterReading",
  opening_meter_readings AS "openingMeterReadings", closing_meter_readings AS "closingMeterReadings",
  (opening_meter_file <> '') AS "openingMeterFileUploaded", opening_meter_file_name AS "openingMeterFileName",
  closing_meter_reading AS "closingMeterReading", (closing_meter_file <> '') AS "closingMeterFileUploaded",
  closing_meter_file_name AS "closingMeterFileName"`;

function requestEquipmentNotificationDetails(request={}){
  return [
    String(request.equipment||'').trim(),
    String(request.door||'').trim()?`Door: ${String(request.door).trim()}`:'',
    String(request.chassis||'').trim()?`Chassis: ${String(request.chassis).trim()}`:'',
  ].filter(Boolean).join(' | ')||'Not available';
}

let requestDriverSyncRunning=false;
async function syncTemporaryRequestDrivers(){
  if(!oracleConfigured||!databaseReady||requestDriverSyncRunning)return {skipped:true};
  requestDriverSyncRunning=true;
  let updated=0;
  try{
    const {rows}=await pool.query(`SELECT reference,door_number,equipment_name,site,
      to_char(started_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD') AS lookup_date,
      to_char(started_at AT TIME ZONE 'Asia/Kolkata','HH24:MI:SS') AS lookup_time
      FROM maintenance_requests
      WHERE lower(driver_name_source) IN ('demo','manual')
      ORDER BY created_at ASC LIMIT 500`);
    for(const row of rows){
      try{
        const result=await oracleDriverLookup({
          date:row.lookup_date,
          time:row.lookup_time,
          location:row.site,
          equipmentNo:row.door_number||row.equipment_name
        });
        const actualName=String(result?.driverName||'').trim();
        if(!result?.found||!actualName)continue;
        const source=`Oracle${result.source?` - ${result.source}`:''}`.slice(0,200);
        const response=await pool.query(`UPDATE maintenance_requests SET driver_name=$1,driver_name_source=$2,driver_synced_at=NOW()
          WHERE reference=$3 AND lower(driver_name_source) IN ('demo','manual')`,[actualName,source,row.reference]);
        updated+=response.rowCount;
      }catch(error){console.error(`Oracle driver sync failed for ${row.reference}.`,error)}
    }
    return {checked:rows.length,updated};
  }finally{requestDriverSyncRunning=false}
}

async function attachDailyRemarks(rows,client=pool){
  if(!rows.length)return rows;
  const refs=rows.map((row)=>row.ref);
  const {rows:remarks}=await client.query(`SELECT request_reference AS "requestReference",remark,delay_reason AS "delayReason",
    author_login AS "authorLogin",author_name AS "authorName",to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "createdAt"
    FROM maintenance_daily_remarks WHERE request_reference=ANY($1::text[]) ORDER BY created_at DESC`,[refs]);
  const grouped=new Map();
  for(const remark of remarks){const list=grouped.get(remark.requestReference)||[];list.push(remark);grouped.set(remark.requestReference,list)}
  return rows.map((row)=>({...row,dailyRemarks:grouped.get(row.ref)||[]}));
}

async function requestWorkflowWhatsAppLogins(client,{eventType,site}){
  const {rows}=await client.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
  return workflowWhatsAppRecipientLogins(rows,{eventType,site,settings:await storedWhatsAppReportSettings()});
}

let workflowReminderRunning=false;
async function sendScheduledWorkflowWhatsAppReminders(now=new Date()){
  if(!databaseReady||workflowReminderRunning)return {skipped:true};
  const reportSettings=await storedWhatsAppReportSettings();
  if(!whatsappPurposeEnabled(reportSettings,'offRoadEscalation',now)&&!whatsappPurposeEnabled(reportSettings,'idleReminder',now))return {skipped:true};
  workflowReminderRunning=true;
  let sent=0,failed=0,skipped=0;
  try{
    const {rows}=await pool.query(`SELECT reference AS ref,equipment_name AS equipment,equipment_group AS "equipmentGroup",door_number AS door,
      site,category,owner_name AS owner,idle_reason AS "idleReason",status,started_at AS "startedAtRaw",
      expected_completion_at AS "expectedCompletionAtRaw",ideal_requested_at AS "idleAtRaw"
      FROM maintenance_requests WHERE verified_at IS NULL AND (
        (status NOT IN ('Closed','Idle','Ideal') AND started_at<=$1::timestamptz-($2::int*INTERVAL '1 hour')) OR
        (status IN ('Idle','Ideal') AND ideal_requested_at IS NOT NULL AND ideal_requested_at<=$1::timestamptz-($3::int*INTERVAL '1 hour'))
      )`,[now,reportSettings.reminders.offRoad.hours,reportSettings.reminders.idle.hours]);
    for(const request of rows){
      const idle=['Idle','Ideal'].includes(request.status);
      const eventType=idle?'idle':'opened';
      const eventTime=new Date(idle?request.idleAtRaw:request.startedAtRaw);
      const purpose=idle?'idleReminder':'offRoadEscalation';
      if(!whatsappPurposeEnabled(reportSettings,purpose,now))continue;
      const slotKey=workflowReminderSlot(eventType,eventTime,now,reportSettings);
      if(!slotKey)continue;
      const recipients=await requestWorkflowWhatsAppLogins(pool,{eventType,site:request.site});
      const equipmentDetails=requestEquipmentNotificationDetails(request);
      const workflowTemplate=idle
        ? {templateKey:'requestIdle',parameters:[equipmentDetails,request.site,requestNotificationTime(eventTime),request.idleReason||'Not recorded',request.ref,'Project Manager or Production Manager must approve Make On Road',workflowRequestLink(request.ref,publicBaseUrl())]}
        : {templateKey:'requestOpened',parameters:[request.ref,request.site,request.equipmentGroup||request.equipment||'Not available',request.door||'Not available',request.category||'Breakdown',request.owner||'Production User',requestNotificationTime(eventTime),request.expectedCompletionAtRaw?requestNotificationTime(request.expectedCompletionAtRaw):'Not set',workflowRequestLink(request.ref,publicBaseUrl())]};
      for(const login of recipients){
        const claim=await pool.query(`INSERT INTO whatsapp_workflow_dispatches (event_type,request_reference,recipient_login,slot_key)
          VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id`,[idle?'idle_repeat':'offroad_escalation',request.ref,login,slotKey]);
        if(!claim.rows.length){skipped+=1;continue}
        const results=await sendWhatsAppNotifications(pool,[login],request.ref,`${idle?'Idle reminder':'Off Road escalation'} for ${request.ref}.`,workflowTemplate,{workflowType:eventType,site:request.site,purpose});
        const status=results[0]?.status||'Skipped';
        if(status==='Sent')sent+=1;else failed+=1;
        await pool.query(`UPDATE whatsapp_workflow_dispatches SET status=$1,updated_at=NOW() WHERE id=$2`,[status,claim.rows[0].id]);
      }
    }
    return {sent,failed,skipped};
  }finally{workflowReminderRunning=false}
}

app.get('/api/info-pulse',requireSession,async(req,res,next)=>{
  try{
    const authorization=await currentDashboardAuthorization(req.session);
    if(!authorization)
      return res.status(401).json({error:'This user account no longer exists. Please sign in again.'});
    const operationalRole=authorization.session.role==='normal'&&['Production User','Maintenance User','MIS User'].includes(authorization.session.assignedRole);
    if(authorization.session.role!=='super'&&!operationalRole&&authorization.session.permissions?.readRequests!==true)
      return res.status(403).json({error:'Your assigned role is not authorized to view Info Pulse.'});
    const scope=infoPulseRequestScope(authorization.session,authorization.user);
    const {rows}=await pool.query(`SELECT ${requestProjection} FROM maintenance_requests ORDER BY created_at DESC`);
    const visibleRows=requestsVisibleToSession(scopeInfoPulseRequests(rows,scope),authorization.session);
    res.set('Cache-Control','no-store');
    res.json({requests:await attachDailyRemarks(visibleRows),scope});
  }catch(error){next(error)}
});

app.get('/api/requests',requireSession,async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  try{
    const operationalRole=req.session.role==='normal'&&['Production User','Maintenance User','MIS User'].includes(req.session.assignedRole);
    if(req.session.role!=='super'&&!operationalRole&&req.session.permissions?.readRequests!==true)
      return res.status(403).json({error:'Your assigned role is not authorized to view maintenance requests.'});
    const requesterLogin=String(req.session.login||'').trim().toLowerCase();
    const dashboardScope=req.query.scope==='dashboard';
    let query=req.session.role==='normal'&&req.session.assignedRole==='Production User'&&!dashboardScope
      ? {text:`SELECT ${requestProjection} FROM maintenance_requests WHERE requester_login=$1 ORDER BY created_at DESC`,values:[requesterLogin]}
      : {text:`SELECT ${requestProjection} FROM maintenance_requests ORDER BY created_at DESC`,values:[]};
    let scopedSite=null,scopedManagerSites=null;
    if(req.session.role==='normal'&&(dashboardScope||req.session.assignedRole==='MIS User'||req.session.assignedRole==='Maintenance User')){
      const operationalUser=await currentUserRecord(req.session);
      scopedSite=assignedUserSiteName(operationalUser);
    }
    if(req.session.role==='super'&&req.session.permissions?.adminLevel==='Manager'){
      const manager=await currentUserRecord(req.session);
      scopedManagerSites=managerReportScope({...manager,site:assignedUserSiteName(manager)}).sites;
    }
    const {rows}=await pool.query(query);
    const siteVisibleRows=scopedManagerSites!==null
      ? rows.filter((row)=>reportScopeIncludesSite({sites:scopedManagerSites},row.site))
      : scopedSite===null
      ? rows
      : scopedSite
        ? rows.filter((row)=>canonicalSiteName(row.site)===canonicalSiteName(scopedSite))
        : [];
    const visibleRows=requestsVisibleToSession(siteVisibleRows,req.session);
    res.json(await attachDailyRemarks(visibleRows));
  }catch(error){next(error)}
});

const requestTimelineProjection=`id AS "timelineRequestId",started_at AS start,accepted_at AS "acceptedAt",closed_at AS "closedAt",first_trip_at AS "firstTripAt",verified_at AS "verifiedAt",expected_completion_at AS "expectedCompletionAt",ideal_requested_at AS "idealRequestedAt",ideal_approved_at AS "idealApprovedAt",in_progress_at AS "inProgressAt",NOW() AS "timelineRecordedAt"`;
async function recordRequestTimeline(client,req,reference,before,{events,sources={},reason='',requireCorrectionReason=[]}={}){
  const {rows}=await client.query(`SELECT ${requestTimelineProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
  const after=rows[0];
  if(!after)throw Object.assign(new Error('Request changed before its timeline could be recorded.'),{status:409});
  const changes=buildRequestTimelineChanges(before,after,{events,sources,reason,requireCorrectionReason,now:after.timelineRecordedAt,actorLogin:req.session.login,actorName:req.session.name}).map(change=>({...change,requestId:String(after.timelineRequestId)}));
  if(!changes.length)return;
  await client.query(`INSERT INTO audit_events (event_type,outcome,actor_login,actor_name,actor_role,module,action,target_type,target_reference,reason,changed_fields,occurred_at)
    VALUES ('Workflow timeline','Success',$1,$2,$3,'Maintenance Requests','Record workflow timestamps','Maintenance request',$4,$5,$6::jsonb,$7)`,
    [String(req.session.login||''),String(req.session.name||''),String(req.session.permissions?.adminLevel||req.session.assignedRole||req.session.role||''),reference,String(reason||'').trim(),JSON.stringify(changes),after.timelineRecordedAt]);
}

async function withRequestTimelineTransaction(req,reference,write){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {rows}=await client.query(`SELECT site,status,${requestTimelineProjection} FROM maintenance_requests WHERE reference=$1 FOR UPDATE`,[reference]);
    if(!rows.length)throw Object.assign(new Error('This request no longer exists.'),{status:409});
    const result=await write(client,rows[0]);
    if(result.timelineEvents)await recordRequestTimeline(client,req,reference,rows[0],{events:result.timelineEvents,sources:result.timelineSources,reason:result.timelineReason,requireCorrectionReason:result.timelineRequireReason});
    await client.query('COMMIT');
    return result;
  }catch(error){await client.query('ROLLBACK');throw error}
  finally{client.release()}
}

app.get('/api/requests/:reference/timeline',requireSession,async(req,res,next)=>{
  try{
    const authorization=await currentDashboardAuthorization(req.session);
    if(!authorization)return res.status(401).json({error:'This user account no longer exists. Please sign in again.'});
    const {session,user}=authorization;
    const operational=session.role==='normal'&&['Production User','Maintenance User','MIS User'].includes(session.assignedRole);
    if(session.role!=='super'&&!operational&&session.permissions?.readRequests!==true)return res.status(403).json({error:'Your assigned role cannot view request timelines.'});
    const reference=String(req.params.reference||'').trim();
    const {rows}=await pool.query(`SELECT ${requestProjection},${requestTimelineProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
    const request=rows[0];
    if(!request)return res.status(404).json({error:'Request not found.'});
    if(session.role==='super'&&session.permissions?.adminLevel==='Manager'&&!reportScopeIncludesSite(managerReportScope(user),request.site))return res.status(403).json({error:'This request belongs to a different location.'});
    if(session.role==='normal'){
      const assignedSite=canonicalSiteName(user.site||user.location||user.currentLocation);
      if(!assignedSite||assignedSite!==canonicalSiteName(request.site))return res.status(403).json({error:'This request belongs to a different location.'});
      if(session.assignedRole==='Production User'&&String(request.requesterLogin||'').trim().toLowerCase()!==String(user.login||req.session.login||'').trim().toLowerCase())return res.status(403).json({error:'Only your own request timelines are available.'});
    }
    const {rows:records}=await pool.query(`SELECT changed_fields FROM audit_events WHERE event_type='Workflow timeline' AND action='Record workflow timestamps' AND outcome='Success' AND target_type='Maintenance request' AND target_reference=$1 AND changed_fields @> $2::jsonb ORDER BY occurred_at ASC,id ASC`,[reference,JSON.stringify([{requestId:String(request.timelineRequestId)}])]);
    const history=records.flatMap(row=>Array.isArray(row.changed_fields)?row.changed_fields:[]).filter(item=>item?.requestId===String(request.timelineRequestId)&&REQUEST_TIMELINE_FIELDS.includes(item?.event)).map(item=>({event:item.event,oldValue:parseRequestTimelineTimestamp(item.oldValue)?.toISOString()??null,newValue:parseRequestTimelineTimestamp(item.newValue)?.toISOString()??null,source:['system','user'].includes(item.source)?item.source:'unknown',recordedAt:parseRequestTimelineTimestamp(item.recordedAt)?.toISOString()??null,actorLogin:String(item.actorLogin||''),actorName:String(item.actorName||''),reason:String(item.reason||''),correction:item.correction===true}));
    res.set('Cache-Control','no-store');
    const {timelineRequestId,timelineRecordedAt,...visibleRequest}=request;
    const [requestWithRemarks]=await attachDailyRemarks([visibleRequest]);
    res.json({reference,request:requestWithRemarks,events:requestTimelineEvents(request,history),history,durations:requestTimelineDurations(request)});
  }catch(error){next(error)}
});

const arrivalDelaySql=`((acceptance_required=TRUE AND accepted_at IS NULL AND started_at<=NOW()-INTERVAL '1 hour')
  OR (accepted_at IS NOT NULL AND accepted_at>started_at+INTERVAL '1 hour'))`;
const arrivalFlagReadySql=`(NOT ${arrivalDelaySql} OR (arrival_flagged_at IS NOT NULL AND length(btrim(arrival_flag_remark,E' \\t\\n\\r'))>0))`;
const arrivalRedFlagError=()=>Object.assign(new Error('Raise a red flag and save the arrival delay reason before continuing with this request.'),{status:409,code:'ARRIVAL_RED_FLAG_REQUIRED'});
function requireArrivalFlagPermission(req,res,next){
  return requirePermission(req.session?.permissions?.editRequests===true?'editRequests':'closeRequests',{role:'Maintenance User'})(req,res,next);
}
function maintenanceWriteFailure(error,res,next){
  if(error.status)return res.status(error.status).json({error:error.message,...(error.code?{code:error.code}:{})});
  return next(error);
}
async function withMaintenanceArrivalGuard(req,reference,write){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    // Lock the request through every related write. NOW() is shared with the
    // acceptance update, so its timestamp and the one-hour check cannot diverge.
    const {rows}=await client.query(`SELECT site,${arrivalFlagReadySql} AS arrival_flag_ready,acceptance_required AS "acceptanceRequired",${requestTimelineProjection}
      FROM maintenance_requests WHERE reference=$1 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL FOR UPDATE`,[reference]);
    if(!rows.length)throw Object.assign(new Error('Only active, unverified requests can be updated.'),{status:409});
    if(req.session.role==='normal'){
      const user=await currentUserRecord(req.session,client);
      const assignedSite=canonicalSiteName(user.site||user.location||user.currentLocation);
      if(!assignedSite||assignedSite!==canonicalSiteName(rows[0].site))throw Object.assign(new Error('This vehicle is outside your assigned maintenance location.'),{status:403});
    }
    if(!rows[0].arrival_flag_ready)throw arrivalRedFlagError();
    const result=await write(client,rows[0]);
    if(result.timelineEvents)await recordRequestTimeline(client,req,reference,rows[0],{events:result.timelineEvents,sources:result.timelineSources,reason:result.timelineReason,requireCorrectionReason:result.timelineRequireReason});
    await client.query('COMMIT');
    return result;
  }catch(error){await client.query('ROLLBACK');throw error}
  finally{client.release()}
}

app.post('/api/requests/:reference/daily-remarks',requireSession,requirePermission('closeRequests',{role:'Maintenance User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const remark=String(req.body?.remark||'').trim();
    const delayReason=String(req.body?.delayReason||'').trim();
    if(!remark||!delayReason)return res.status(400).json({error:'Enter today’s update and the reason for delay.'});
    const authorLogin=String(req.session.login||'').trim().toLowerCase();
    const authorName=req.session.name||'Maintenance User';
    const {eligible,updatedToday}=await withMaintenanceArrivalGuard(req,reference,async(client)=>{
      const eligible=await client.query(`SELECT reference,site,requester_login FROM maintenance_requests WHERE reference=$1 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql}`,[reference]);
      if(!eligible.rows.length)throw arrivalRedFlagError();
      const existingToday=await client.query(`SELECT id FROM maintenance_daily_remarks WHERE request_reference=$1
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=(NOW() AT TIME ZONE 'Asia/Kolkata')::date LIMIT 1`,[reference]);
      const updatedToday=existingToday.rows.length>0;
      if(updatedToday){
        await client.query(`UPDATE maintenance_daily_remarks SET remark=$1,delay_reason=$2,author_login=$3,author_name=$4 WHERE id=$5`,
          [remark,delayReason,authorLogin,authorName,existingToday.rows[0].id]);
      }else{
        await client.query(`INSERT INTO maintenance_daily_remarks (request_reference,remark,delay_reason,author_login,author_name) VALUES ($1,$2,$3,$4,$5)`,
          [reference,remark,delayReason,authorLogin,authorName]);
      }
      return {eligible,updatedToday};
    });
    try{
    const {rows:userRows}=await pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
    const recipients=[String(eligible.rows[0].requester_login||'').trim().toLowerCase()];
    for(const row of userRows){const user=row.record_data||{};const login=String(user.login||'').trim().toLowerCase();if(!login)continue;
      const profile=resolveMobileAccess({user});const userSite=canonicalSiteName(user.site||user.location||user.currentLocation);const siteMatches=!userSite||userSite===canonicalSiteName(eligible.rows[0].site);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Admin')recipients.push(login);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'&&profile.permissions.managerRoles.some((role)=>['Maintenance Manager','Production Manager'].includes(role))&&userManagesSite(user,eligible.rows[0].site))recipients.push(login);
    }
    await addTicketNotificationsBestEffort(pool,recipients,reference,`${authorName} ${updatedToday?'updated today’s':'added a'} daily maintenance update for ${reference}.`,
      {templateKey:'dailyUpdate',parameters:[authorName,reference]},{whatsapp:true});
    }catch(error){
      console.error(`Request ${reference} daily update was saved, but its notification recipients could not be resolved.`,error);
    }
    const {rows}=await pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
    res.status(updatedToday?200:201).json((await attachDailyRemarks(rows))[0]);
  }catch(error){maintenanceWriteFailure(error,res,next)}
});

app.patch('/api/requests/:reference/arrival-flag',requireSession,requireArrivalFlagPermission,async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const remark=typeof req.body?.remark==='string'?req.body.remark.trim():'';
    if(!remark||remark.length>2000)return res.status(400).json({error:'Enter a remark explaining the vehicle arrival delay (1 to 2,000 characters).'});
    const {rows:currentRows}=await pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
    const current=currentRows[0];
    if(!current)return res.status(404).json({error:'This maintenance request no longer exists.'});
    if(req.session.role==='normal'){
      const user=await currentUserRecord(req.session);
      const assignedSite=canonicalSiteName(user.site||user.location||user.currentLocation);
      if(!assignedSite||assignedSite!==canonicalSiteName(current.site))
        return res.status(403).json({error:'This vehicle is outside your assigned maintenance location.'});
    }
    if(current.arrivalFlaggedAt&&String(current.arrivalFlagRemark||'').trim())return res.json((await attachDailyRemarks(currentRows))[0]);
    const {rows}=await pool.query(`UPDATE maintenance_requests
      SET arrival_flagged_at=COALESCE(arrival_flagged_at,NOW()),arrival_flagged_by=CASE WHEN arrival_flagged_at IS NULL THEN $1 ELSE arrival_flagged_by END,arrival_flag_remark=$2
      WHERE reference=$3 AND ${arrivalDelaySql}
        AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL
        AND length(btrim(arrival_flag_remark,E' \\t\\n\\r'))=0 AND site=$4
      RETURNING ${requestProjection}`,[req.session.name||'Maintenance User',remark,reference,current.site]);
    if(!rows.length)return res.status(409).json({error:'A red flag can be raised only for an active, unverified request whose vehicle is overdue or arrived more than one hour late.'});
    req.audit={eventType:'Workflow',module:'Maintenance Requests',action:current.arrivalFlaggedAt?'Complete arrival red flag reason':'Red flag vehicle arrival',targetType:'Maintenance request',targetReference:reference,reason:remark,changedFields:[{field:'arrivalFlaggedAt',before:current.arrivalFlaggedAt||'',after:rows[0].arrivalFlaggedAt},{field:'arrivalFlaggedBy',before:current.arrivalFlaggedBy||'',after:rows[0].arrivalFlaggedBy},{field:'arrivalFlagRemark',before:current.arrivalFlagRemark||'',after:rows[0].arrivalFlagRemark}]};
    res.json((await attachDailyRemarks(rows))[0]);
  }catch(error){next(error)}
});

async function activeRequestConflict({door='',chassis=''}={},client=pool){
  const normalizedDoor=String(door||'').trim();
  const normalizedChassis=String(chassis||'').trim();
  if(!normalizedDoor&&!normalizedChassis)return null;
  const {rows}=await client.query(`SELECT reference AS ref,door_number AS door,chassis_number AS chassis,status
    FROM maintenance_requests
    WHERE status<>'Closed' AND (
      ($1<>'' AND lower(trim(door_number))=lower(trim($1))) OR
      ($2<>'' AND lower(trim(chassis_number))=lower(trim($2)))
    ) ORDER BY created_at DESC LIMIT 1`,[normalizedDoor,normalizedChassis]);
  return rows[0]||null;
}

async function createRequestWithVehicleLock({door='',chassis=''},write){
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    // Match the existing case-insensitive door OR chassis conflict policy.
    // Stable ordering prevents overlapping vehicle identities from deadlocking.
    const keys=[['door',door],['chassis',chassis]]
      .map(([field,value])=>[field,String(value||'').trim().toLowerCase()])
      .filter(([,value])=>value).map(([field,value])=>`bdms-request:${field}:${value}`).sort();
    for(const key of keys)await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
    const duplicate=await activeRequestConflict({door,chassis},client);
    if(duplicate)throw Object.assign(new Error(activeRequestConflictMessage(duplicate,door)),{status:409,duplicate:true,existingReference:duplicate.ref});
    const result=await write(client);
    await client.query('COMMIT');
    return result;
  }catch(error){await client.query('ROLLBACK');throw error}
  finally{client.release()}
}

app.get('/api/requests/conflict',requireSession,requirePermission('createRequests'),async(req,res,next)=>{
  try{
    const door=String(req.query.door||'').trim(),chassis=String(req.query.chassis||'').trim();
    if(!door&&!chassis)return res.status(400).json({error:'Select a door number before checking active requests.'});
    const conflict=await activeRequestConflict({door,chassis});
    if(!conflict)return res.json({duplicate:false});
    res.json({duplicate:true,existingReference:conflict.ref,status:conflict.status,door:conflict.door,message:activeRequestConflictMessage(conflict,door)});
  }catch(error){next(error)}
});

app.post('/api/requests',requireSession,requirePermission('createRequests'),async(req,res,next)=>{
  try{
    const {ref,equipment='',equipmentGroup='',door,reg='',chassis='',driverName='',driverNameSource='',site='Not assigned',category='Maintenance request',complaint,complaintAudio='',start,meterType=''}=req.body||{};
    const normalizedMeterType=String(meterType).trim().toUpperCase();
    if(!ref||!door||!complaint)return res.status(400).json({error:'Reference, door number and complaint are required.'});
    if(!String(chassis).trim())return res.status(400).json({error:'Chassis number is required. Contact the admin team to update the chassis number in Equipment Master.'});
    if(!validRequestAudioDataUrl(complaintAudio))return res.status(400).json({error:'Complaint audio must be a supported recording up to 3 MB.'});
    if(!['KMR','HMR'].includes(normalizedMeterType))return res.status(400).json({error:'Choose a valid KMR/HMR meter type.'});
    const requester=await currentUserRecord(req.session);
    if(req.session.role==='normal'){
      const assignedSite=canonicalSiteName(requester.site||requester.location||requester.currentLocation);
      if(!assignedSite||assignedSite!==canonicalSiteName(site))return res.status(403).json({error:'Create maintenance requests only for your assigned location.'});
    }
    const startedAt=String(start||'').trim()?parseRequestTimelineTimestamp(start):new Date();
    validateRequestTimelineChange({}, {start:startedAt||String(start)}, {userEntered:['start']});
    const superior=String(requester.superior||'').trim().slice(0,200);
    const storedDriverName=String(driverName).trim().slice(0,200);
    const storedDriverSource=storedDriverName?(String(driverNameSource).trim().slice(0,200)||'Manual'):'';
    const {rows}=await createRequestWithVehicleLock({door,chassis},async(client)=>{
    const result=await client.query(`INSERT INTO maintenance_requests
      (reference,equipment_name,equipment_group,door_number,registration_number,chassis_number,driver_name,driver_name_source,superior_name,site,category,complaint,complaint_audio,started_at,acceptance_required,status,owner_name,requester_login,requester_role,meter_type,opening_meter_reading,opening_meter_file,opening_meter_file_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE,'Open',$15,$16,$17,$18,$19,$20,$21)
      RETURNING ${requestProjection}`,
      [ref,equipment,String(equipmentGroup).trim().slice(0,200),door,reg,chassis,storedDriverName,storedDriverSource,String(superior).trim().slice(0,200),site,category,complaint,complaintAudio,startedAt,req.session.name||'Mobile User',String(req.session.login||'').trim().toLowerCase(),String(req.session.assignedRole||'').trim(),normalizedMeterType,'','','']);
    await recordRequestTimeline(client,req,ref,{}, {events:['start'],sources:{start:String(start||'').trim()?'user':'system'}});
    return result;
    });
    // Acknowledge the committed request before reports or external delivery.
    // Polling can already see it while those follow-up operations are running.
    res.status(201).json(rows[0]);
    setImmediate(async()=>{
      try{
        await sendRequestEventReports('opened',rows[0]);
        const recipients=await requestStakeholderLogins(pool,{site:rows[0].site,requesterLogin:rows[0].requesterLogin});
        const whatsappRecipients=await requestWorkflowWhatsAppLogins(pool,{eventType:'opened',site:rows[0].site});
        const equipmentDetails=requestEquipmentNotificationDetails(rows[0]);
        const openedAt=requestNotificationTime(startedAt);
        const openedBy=req.session.name||'Production User';
        await addTicketNotificationsBestEffort(pool,recipients,rows[0].ref,`Request ${rows[0].ref} opened for ${equipmentDetails}. Breakdown: ${rows[0].category}. Date & time: ${openedAt}. Location: ${rows[0].site}. User: ${openedBy}.`,
          {templateKey:'requestOpened',parameters:[rows[0].ref,rows[0].site,rows[0].equipmentGroup||rows[0].equipment||'Not available',rows[0].door||'Not available',rows[0].category,openedBy,openedAt,rows[0].expectedCompletionAt||'Not set',workflowRequestLink(rows[0].ref,publicBaseUrl())]},
          {whatsapp:true,whatsappRecipients,workflowType:'opened',site:rows[0].site});
      }catch(error){console.error(`Request ${rows[0].ref} saved, but opening notifications could not be completed.`,error.message)}
    });
  }catch(error){
    if(error.duplicate)return res.status(409).json({duplicate:true,existingReference:error.existingReference,error:error.message});
    if(error.code==='23505'&&error.constraint==='maintenance_requests_reference_key')return res.status(409).json({code:'REQUEST_REFERENCE_CONFLICT',error:'This request reference already exists. Refresh the request form and try again.'});
    maintenanceWriteFailure(error,res,next);
  }
});

app.patch('/api/requests/:reference',requireSession,requirePermission('editRequests',{role:'Maintenance User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const {category='Maintenance request',complaint,expectedCompletionAt,meterType='',openingMeterReading='',openingMeterFile='',openingMeterFileName=''}=req.body||{};
    const normalizedMeterType=String(meterType).trim().toUpperCase();
    const normalizedOpeningMeterReading=String(openingMeterReading).trim();
    const openingMeterReadings=req.body?.openingMeterReadings ?? {};
    if(!validMeterReadings(openingMeterReadings))return res.status(400).json({error:'Enter valid opening HMR and KMR readings.'});
    if(!reference||!complaint)return res.status(400).json({error:'The complaint is required.'});
    if(!String(expectedCompletionAt||'').trim())return res.status(400).json({error:'Enter the expected time for completion.'});
    if(!['KMR','HMR'].includes(normalizedMeterType))return res.status(400).json({error:'Choose a valid KMR/HMR meter type.'});
    // Opening meter data is optional; validate it only when supplied.
    if(normalizedOpeningMeterReading&&!validMeterReading(normalizedOpeningMeterReading))return res.status(400).json({error:`Enter a valid opening ${normalizedMeterType} reading.`});
    if(openingMeterFile&&!validMeterEvidenceDataUrl(openingMeterFile))return res.status(400).json({error:`Upload a JPEG, PNG, WebP, or PDF trip card up to 5 MB.`});
    const {rows}=await withMaintenanceArrivalGuard(req,reference,async(client,before)=>{
    const expectedAt=requestExpectedCompletionValue(before.expectedCompletionAt,expectedCompletionAt);
    const accepting=before.acceptanceRequired&&!before.acceptedAt;
    validateRequestTimelineChange(before,{expectedCompletionAt:expectedAt||expectedCompletionAt,...(accepting?{acceptedAt:before.timelineRecordedAt}:{})},{now:before.timelineRecordedAt,userEntered:['expectedCompletionAt']});
    buildRequestTimelineChanges(before,{...before,expectedCompletionAt:expectedAt},{events:['expectedCompletionAt'],reason:req.body?.correctionReason,requireCorrectionReason:['expectedCompletionAt']});
    const result=await client.query(`UPDATE maintenance_requests SET category=$1,complaint=$2,
      accepted_at=CASE WHEN acceptance_required THEN COALESCE(accepted_at,NOW()) ELSE accepted_at END,accepted_by=CASE WHEN acceptance_required AND accepted_at IS NULL THEN $8 ELSE accepted_by END,expected_completion_at=$3::timestamptz,meter_type=$4,
      opening_meter_reading=$5,opening_meter_file=CASE WHEN $6<>'' THEN $6 ELSE opening_meter_file END,opening_meter_file_name=CASE WHEN $6<>'' THEN $7 ELSE opening_meter_file_name END,
      opening_meter_readings=opening_meter_readings || $10::jsonb
      WHERE reference=$9 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql}
      RETURNING ${requestProjection}`,[category,complaint,expectedAt,normalizedMeterType,normalizedOpeningMeterReading,openingMeterFile,String(openingMeterFileName).trim().slice(0,255),req.session.name||'Maintenance User',reference,JSON.stringify({...openingMeterReadings,[normalizedMeterType]:normalizedOpeningMeterReading})]);
    if(!result.rows.length)throw arrivalRedFlagError();
    return {...result,timelineEvents:[...(accepting?['acceptedAt']:[]),'expectedCompletionAt'],timelineSources:{acceptedAt:'system',expectedCompletionAt:'user'},timelineReason:req.body?.correctionReason||'',timelineRequireReason:['expectedCompletionAt']};
    });
    res.json(rows[0]);
  }catch(error){maintenanceWriteFailure(error,res,next)}
});

app.patch('/api/requests/:reference/close',requireSession,requirePermission('closeRequests',{role:'Maintenance User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const closingDate=String(req.body?.closingDate||'');
    const closingTime=String(req.body?.closingTime||'');
    const maintenanceWork=String(req.body?.maintenanceWork||'').trim();
    const maintenanceAudio=String(req.body?.maintenanceAudio||'');
    const status=String(req.body?.status||'Closed').trim();
    const ideal=req.body?.ideal===true||String(req.body?.ideal||'').toLowerCase()==='true';
    const idleReason=String(req.body?.idleReason||'').trim();
    const delayedReason=String(req.body?.delayedReason||'').trim().slice(0,160);
    const meterType=String(req.body?.meterType||'').trim().toUpperCase();
    const openingMeterReading=String(req.body?.openingMeterReading||'').trim();
    const openingMeterFile=String(req.body?.openingMeterFile||'');
    const openingMeterFileName=String(req.body?.openingMeterFileName||'').trim().slice(0,255);
    const openingMeterReadings=req.body?.openingMeterReadings ?? {};
    const closingMeterReadings=req.body?.closingMeterReadings ?? {};
    const closingMeterReading=String(req.body?.closingMeterReading||'').trim();
    const closingMeterFile=String(req.body?.closingMeterFile||'');
    const closingMeterFileName=String(req.body?.closingMeterFileName||'').trim().slice(0,255);
    const closedAt=parseRequestTimelineTimestamp(`${closingDate}T${closingTime}`);
    if(!closedAt)return res.status(400).json({error:'Enter a valid closing date and time in HH:MM:SS format.'});
    if(!maintenanceWork)return res.status(400).json({error:'Describe the maintenance work completed.'});
    if(ideal&&!['No driver','No work'].includes(idleReason))return res.status(400).json({error:'Choose an Idle reason: No driver or No work.'});
    if(!validRequestAudioDataUrl(maintenanceAudio))return res.status(400).json({error:'Maintenance audio must be a supported recording up to 3 MB.'});
    if(!ideal&&!REQUEST_CLOSE_STATUSES.includes(status))return res.status(400).json({error:'Choose a valid maintenance status.'});
    const {rows:existingRows}=await pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
    if(!existingRows.length)return res.status(409).json({error:'This request no longer exists.'});
    if(req.session.role==='normal'){
      const user=await currentUserRecord(req.session);
      const assignedSite=canonicalSiteName(user.site||user.location||user.currentLocation);
      if(!assignedSite||assignedSite!==canonicalSiteName(existingRows[0].site))return res.status(403).json({error:'This vehicle is outside your assigned maintenance location.'});
    }
    if(!ideal&&status==='Closed'&&existingRows[0].status==='Closed'&&!existingRows[0].verifiedAt)return res.json(existingRows[0]);
    const {rows,delayedClosure}=await withMaintenanceArrivalGuard(req,reference,async(client,before)=>{
    if(!ideal&&status==='Closed'){
      validateRequestTimelineChange(before,{closedAt},{now:before.timelineRecordedAt,userEntered:['closedAt']});
      buildRequestTimelineChanges(before,{...before,closedAt},{events:['closedAt'],reason:req.body?.correctionReason,requireCorrectionReason:['closedAt']});
    }
    const {rows:meterRows}=await client.query(`SELECT meter_type,opening_meter_reading,opening_meter_file,expected_completion_at FROM maintenance_requests WHERE reference=$1 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql}`,[reference]);
    if(!meterRows.length)throw arrivalRedFlagError();
    const delayedClosure=!ideal&&status==='Closed'&&delayedReasonRequired(meterRows[0].expected_completion_at,closedAt);
    if(delayedClosure&&!delayedReason)throw Object.assign(new Error('Select a delayed reason because this request is being closed at least 4 hours after ETC.'),{status:400});
    if(openingMeterReading&&!validMeterReading(openingMeterReading))throw Object.assign(new Error(`Enter a valid opening ${meterType||meterRows[0].meter_type||'KMR/HMR'} reading.`),{status:400});
    if(openingMeterFile&&!validMeterEvidenceDataUrl(openingMeterFile))throw Object.assign(new Error(`Upload an opening ${meterType||meterRows[0].meter_type||'KMR/HMR'} JPEG, PNG, WebP, or PDF up to 5 MB.`),{status:400});
    if(!validMeterReadings(openingMeterReadings)||!validMeterReadings(closingMeterReadings))throw Object.assign(new Error('Enter valid HMR and KMR readings.'),{status:400});
    if(closingMeterReading&&!validMeterReading(closingMeterReading))throw Object.assign(new Error('Enter a valid closing HMR/KMR reading.'),{status:400});
    if(closingMeterFile&&!validMeterEvidenceDataUrl(closingMeterFile))throw Object.assign(new Error('Upload a JPEG, PNG, WebP, or PDF trip card up to 5 MB.'),{status:400});
    if(openingMeterReading||openingMeterFile||closingMeterReading||closingMeterFile||Object.keys(openingMeterReadings).length||Object.keys(closingMeterReadings).length){
      const effectiveMeterType=['KMR','HMR'].includes(meterType)?meterType:String(meterRows[0].meter_type||'').trim().toUpperCase();
      if(!['KMR','HMR'].includes(effectiveMeterType))throw Object.assign(new Error('Choose a valid KMR/HMR meter type.'),{status:400});
      await client.query(`UPDATE maintenance_requests SET meter_type=CASE WHEN meter_type='' THEN $1 ELSE meter_type END,
        opening_meter_reading=CASE WHEN $2<>'' THEN $2 ELSE opening_meter_reading END,
        opening_meter_file=CASE WHEN $3<>'' THEN $3 ELSE opening_meter_file END,
        opening_meter_file_name=CASE WHEN $3<>'' THEN $4 ELSE opening_meter_file_name END,
        opening_meter_readings=opening_meter_readings || $6::jsonb,
        closing_meter_readings=closing_meter_readings || $7::jsonb,
        closing_meter_reading=CASE WHEN $8<>'' THEN $8 ELSE closing_meter_reading END,
        closing_meter_file=CASE WHEN $9<>'' THEN $9 ELSE closing_meter_file END,
        closing_meter_file_name=CASE WHEN $9<>'' THEN $10 ELSE closing_meter_file_name END
        WHERE reference=$5 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql}`,[effectiveMeterType,openingMeterReading,openingMeterFile,openingMeterFileName,reference,
          JSON.stringify(Object.fromEntries(Object.entries({...openingMeterReadings,...(openingMeterReading?{[effectiveMeterType]:openingMeterReading}:{})}).filter(([,value])=>value!==''))),
          JSON.stringify(Object.fromEntries(Object.entries({...closingMeterReadings,...(closingMeterReading?{[effectiveMeterType]:closingMeterReading}:{})}).filter(([,value])=>value!==''))),
          closingMeterReading,closingMeterFile,closingMeterFileName]);
    }
    const {rows}=ideal
      ? await client.query(`UPDATE maintenance_requests SET closed_at=NULL,closed_by='',maintenance_work=$1,maintenance_audio=$2,delayed_reason='',status='Idle',idle_reason=$3,
          ideal_requested_at=NOW(),ideal_requested_by=$4,ideal_approved_at=NULL,ideal_approved_by=''
          WHERE reference=$5 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql} RETURNING ${requestProjection}`,
          [maintenanceWork,maintenanceAudio,idleReason,req.session.name||'Maintenance User',reference])
      : status==='Closed'
        ? await client.query(`UPDATE maintenance_requests SET closed_at=$1,closed_by=$2,maintenance_work=$3,maintenance_audio=$4,delayed_reason=$5,status='Closed'
            WHERE reference=$6 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql} RETURNING ${requestProjection}`,
            [closedAt,req.session.name||'Maintenance User',maintenanceWork,maintenanceAudio,delayedClosure?delayedReason:'',reference])
        : await client.query(`UPDATE maintenance_requests SET closed_at=NULL,closed_by='',maintenance_work=$1,maintenance_audio=$2,delayed_reason='',status=$3,
            in_progress_at=CASE WHEN status<>'In progress' AND $3='In progress' THEN COALESCE(in_progress_at,NOW()) ELSE in_progress_at END,
            in_progress_by=CASE WHEN status<>'In progress' AND $3='In progress' AND in_progress_at IS NULL THEN $5 ELSE in_progress_by END
            WHERE reference=$4 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql} RETURNING ${requestProjection}`,
            [maintenanceWork,maintenanceAudio,status,reference,req.session.name||req.session.login||'Maintenance User']);
    if(!rows.length)throw arrivalRedFlagError();
    if(delayedClosure){
      await client.query(`INSERT INTO master_records (master_name,record_data)
        SELECT 'Delayed Reason',$1::jsonb
        WHERE NOT EXISTS (
          SELECT 1 FROM master_records
          WHERE master_name='Delayed Reason'
            AND lower(trim(record_data->>'delayedReason'))=lower(trim($2))
        )`,[JSON.stringify({delayedReason}),delayedReason]);
    }
    const timelineEvents=ideal?['idealRequestedAt','idealApprovedAt']:status==='Closed'?['closedAt']:['inProgressAt'];
    return {rows,delayedClosure,timelineEvents,timelineSources:{closedAt:'user',idealRequestedAt:'system',idealApprovedAt:'system',inProgressAt:'system'},timelineReason:!ideal&&status==='Closed'?req.body?.correctionReason||'':'',timelineRequireReason:!ideal&&status==='Closed'?['closedAt']:[]};
    });
    if(ideal){
      try{
      const {rows:userRows}=await pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
      const whatsappRecipients=workflowWhatsAppRecipientLogins(userRows,{eventType:'idle',site:rows[0].site,settings:await storedWhatsAppReportSettings()});
      const equipmentDetails=requestEquipmentNotificationDetails(rows[0]);
      const idleAt=requestNotificationTime(new Date());
      await addTicketNotificationsBestEffort(pool,whatsappRecipients,rows[0].ref,`Request ${rows[0].ref} was marked Idle (${rows[0].idleReason}) by ${req.session.name||'Maintenance User'}. Project Manager or Production Manager approval is required to Make On Road.`,
        {templateKey:'requestIdle',parameters:[equipmentDetails,rows[0].site,idleAt,rows[0].idleReason,rows[0].ref,'Project Manager or Production Manager must approve Make On Road',workflowRequestLink(rows[0].ref,publicBaseUrl())]},
        {whatsapp:true,whatsappRecipients,workflowType:'idle',site:rows[0].site});
      }catch(error){
        console.error(`Request ${rows[0].ref} was marked Idle, but its notification recipients could not be resolved.`,error);
      }
    }else if(status==='Closed'){
      await sendRequestEventReports('closed',rows[0]);
      try{
        const recipients=await requestStakeholderLogins(pool,{site:rows[0].site,requesterLogin:rows[0].requesterLogin});
        const whatsappRecipients=await requestWorkflowWhatsAppLogins(pool,{eventType:'closed',site:rows[0].site});
        const equipmentDetails=requestEquipmentNotificationDetails(rows[0]);
        const closedAtLabel=requestNotificationTime(closedAt);
        const closedBy=req.session.name||'Maintenance User';
        await addTicketNotificationsBestEffort(pool,recipients,rows[0].ref,`Request ${rows[0].ref} closed for ${equipmentDetails}. Breakdown: ${rows[0].category}. Closing date & time: ${closedAtLabel}. Maintenance work: ${rows[0].maintenanceWork}. Closed by: ${closedBy}.`,
          {templateKey:'requestClosed',parameters:[rows[0].ref,equipmentDetails,rows[0].site,closedBy,closedAtLabel,rows[0].hours||'Not available',workflowRequestLink(rows[0].ref,publicBaseUrl())]},
          {whatsapp:true,whatsappRecipients,workflowType:'closed',site:rows[0].site});
      }catch(error){
        console.error(`Request ${rows[0].ref} was closed, but its notification recipients could not be resolved.`,error);
      }
    }
    res.json(rows[0]);
  }catch(error){maintenanceWriteFailure(error,res,next)}
});

app.patch('/api/requests/:reference/ideal-onroad',requireSession,async(req,res,next)=>{
  try{
    const manager=await currentUserRecord(req.session);
    const designation=flowDesignationForUser(manager,{permissions:req.session.permissions,assignedRole:req.session.assignedRole});
    const canApproveIdle=req.session.role==='super'&&(designation?.key==='projectManager'||req.session.permissions?.adminLevel==='Manager');
    if(!canApproveIdle)return res.status(403).json({error:'Only an assigned manager can approve an Idle request.'});
    const reference=String(req.params.reference||'').trim();
    const eligible=await pool.query(`SELECT site FROM maintenance_requests WHERE reference=$1 AND status IN ('Idle','Ideal') AND verified_at IS NULL`,[reference]);
    if(!eligible.rows.length||!userManagesSite(manager,eligible.rows[0].site))return res.status(409).json({error:'This Idle request is no longer awaiting your approval or is outside your assigned sites.'});
    const {rows}=await withRequestTimelineTransaction(req,reference,async(client,before)=>{
    if(!['Idle','Ideal'].includes(before.status)||before.verifiedAt||before.site!==eligible.rows[0].site)throw Object.assign(new Error('This Idle request is no longer awaiting your approval.'),{status:409});
    validateRequestTimelineChange(before,{closedAt:before.timelineRecordedAt},{now:before.timelineRecordedAt});
    const result=await client.query(`UPDATE maintenance_requests SET status='Closed',closed_at=NOW(),closed_by=$1,
      ideal_approved_at=NOW(),ideal_approved_by=$1 WHERE reference=$2 AND status IN ('Idle','Ideal') AND verified_at IS NULL AND site=$3
      RETURNING ${requestProjection}`,[req.session.name||'Project / Production Manager',reference,eligible.rows[0].site]);
    if(!result.rows.length)throw Object.assign(new Error('This Idle request is no longer awaiting your approval.'),{status:409});
    return {...result,timelineEvents:['closedAt','idealApprovedAt'],timelineSources:{closedAt:'system',idealApprovedAt:'system'}};
    });
    if(!rows.length)return res.status(409).json({error:'This Idle request is no longer awaiting your approval.'});
    await sendRequestEventReports('closed',rows[0]);
    try{
    const recipients=await requestStakeholderLogins(pool,{site:rows[0].site,requesterLogin:rows[0].requesterLogin});
    const whatsappRecipients=await requestWorkflowWhatsAppLogins(pool,{eventType:'closed',site:rows[0].site});
    const approvedAt=requestNotificationTime(new Date());
    const equipmentDetails=requestEquipmentNotificationDetails(rows[0]);
    await addTicketNotificationsBestEffort(pool,recipients,rows[0].ref,`Request ${rows[0].ref} was approved on road and closed at ${approvedAt} by ${req.session.name||'Project / Production Manager'}. It is now awaiting MIS verification.`,
      {templateKey:'requestClosed',parameters:[rows[0].ref,equipmentDetails,rows[0].site,req.session.name||'Project / Production Manager',approvedAt,rows[0].hours||'Not available',workflowRequestLink(rows[0].ref,publicBaseUrl())]},
      {whatsapp:true,whatsappRecipients,workflowType:'closed',site:rows[0].site});
    }catch(error){
      console.error(`Request ${rows[0].ref} was approved on road, but its notification recipients could not be resolved.`,error);
    }
    res.json(rows[0]);
  }catch(error){maintenanceWriteFailure(error,res,next)}
});

app.patch('/api/requests/:reference/idle-cancel',requireSession,async(req,res,next)=>{
  try{
    if(req.session.role!=='super'||req.session.permissions?.adminLevel!=='Manager'||!managerRoleSelection(req.session.permissions?.managerRoles?.length?req.session.permissions.managerRoles:req.session.permissions?.managerRole).includes('Maintenance Manager'))
      return res.status(403).json({error:'Only the assigned Maintenance Manager can cancel an Idle request.'});
    const manager=await currentUserRecord(req.session);
    const reference=String(req.params.reference||'').trim();
    const eligible=await pool.query(`SELECT site FROM maintenance_requests WHERE reference=$1 AND status IN ('Idle','Ideal') AND verified_at IS NULL`,[reference]);
    if(!eligible.rows.length||!userManagesSite(manager,eligible.rows[0].site))return res.status(409).json({error:'This Idle request is no longer awaiting your decision or is outside your assigned sites.'});
    const {rows}=await withRequestTimelineTransaction(req,reference,async(client,before)=>{
    if(!['Idle','Ideal'].includes(before.status)||before.verifiedAt||before.site!==eligible.rows[0].site)throw Object.assign(new Error('This Idle request is no longer awaiting your decision.'),{status:409});
    const result=await client.query(`UPDATE maintenance_requests SET status='In progress',idle_reason='',closed_at=NULL,closed_by='',
      ideal_requested_at=NULL,ideal_requested_by='',ideal_approved_at=NULL,ideal_approved_by='',
      in_progress_at=COALESCE(in_progress_at,NOW()),in_progress_by=CASE WHEN in_progress_at IS NULL THEN $2 ELSE in_progress_by END
      WHERE reference=$1 AND status IN ('Idle','Ideal') AND verified_at IS NULL AND site=$3
      RETURNING ${requestProjection}`,[reference,req.session.name||req.session.login||'Maintenance Manager',eligible.rows[0].site]);
    if(!result.rows.length)throw Object.assign(new Error('This Idle request is no longer awaiting your decision.'),{status:409});
    return {...result,timelineEvents:['closedAt','idealRequestedAt','idealApprovedAt','inProgressAt'],timelineSources:{closedAt:'system',idealRequestedAt:'system',idealApprovedAt:'system',inProgressAt:'system'},timelineReason:'Idle status cancelled by Maintenance Manager.'};
    });
    if(!rows.length)return res.status(409).json({error:'This Idle request is no longer awaiting your decision.'});
    try{
    const recipients=await requestStakeholderLogins(pool,{site:rows[0].site,requesterLogin:rows[0].requesterLogin});
    await addTicketNotificationsBestEffort(pool,recipients,rows[0].ref,`Idle status for request ${rows[0].ref} was cancelled by ${req.session.name||'Maintenance Manager'}. The request has returned to active maintenance.`,null,{whatsapp:false});
    }catch(error){
      console.error(`Request ${rows[0].ref} Idle status was cancelled, but its notification recipients could not be resolved.`,error);
    }
    res.json(rows[0]);
  }catch(error){maintenanceWriteFailure(error,res,next)}
});

app.delete('/api/requests/:reference',requireSession,requirePermission('deleteRequests',{role:'Maintenance User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const result=await pool.query(`DELETE FROM maintenance_requests WHERE reference=$1 AND verified_at IS NULL AND status NOT IN ('Idle','Ideal')`,[reference]);
    if(!result.rowCount)return res.status(409).json({error:'Verified or Idle requests cannot be deleted, or the request no longer exists.'});
    res.status(204).end();
  }catch(error){next(error)}
});

app.patch('/api/requests/:reference/mis-flag',requireSession,requirePermission('verifyRequests',{role:'MIS User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const remark=typeof req.body?.remark==='string'?req.body.remark.trim():'';
    if(!remark||remark.length>2000)return res.status(400).json({error:'Enter a remark describing the issue (1 to 2,000 characters).'});
    const misUser=await currentUserRecord(req.session);
    const misSite=canonicalSiteName(misUser.site||misUser.location||misUser.currentLocation);
    if(!misSite)return res.status(403).json({error:'A location must be assigned before this MIS user can raise a red flag.'});
    const {rows:existingRows}=await pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
    const existing=existingRows[0];
    if(!existing)return res.status(404).json({error:'This request no longer exists.'});
    if(canonicalSiteName(existing.site)!==misSite)return res.status(403).json({error:'This request belongs to a different location.'});
    if(existing.misFlaggedAt)return res.status(409).json({error:'An MIS red flag has already been saved for this request. Its original remark is retained in the MIS Red Flag Report.'});
    if(existing.status!=='Closed'||existing.verifiedAt)return res.status(409).json({error:'Only closed requests awaiting MIS verification can be red flagged.'});
    const {rows}=await pool.query(`UPDATE maintenance_requests
      SET mis_flagged_at=NOW(),mis_flagged_by=$1,mis_flag_remark=$2
      WHERE reference=$3 AND status='Closed' AND verified_at IS NULL AND mis_flagged_at IS NULL
        AND site=$4
      RETURNING ${requestProjection}`,[req.session.name||req.session.login||'MIS User',remark,reference,existing.site]);
    if(!rows.length)return res.status(409).json({error:'This request was already flagged, verified, or changed. Refresh to see its latest details.'});
    req.audit={eventType:'Workflow',module:'Maintenance Requests',action:'Raise MIS red flag',targetType:'Maintenance request',targetReference:reference,reason:remark,changedFields:[{field:'misFlaggedAt',before:'',after:rows[0].misFlaggedAt},{field:'misFlaggedBy',before:'',after:rows[0].misFlaggedBy},{field:'misFlagRemark',before:'',after:rows[0].misFlagRemark}]};
    res.json((await attachDailyRemarks(rows))[0]);
  }catch(error){next(error)}
});

app.patch('/api/requests/:reference/verify',requireSession,requirePermission('verifyRequests',{role:'MIS User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const firstTripDone=req.body?.firstTripDone===true||String(req.body?.firstTripDone||'').toLowerCase()==='true';
    const firstTripAt=firstTripDone?parseRequestTimelineTimestamp(`${req.body?.firstTripDate}T${req.body?.firstTripTime}`):null;
    const firstTripCardImage=String(req.body?.firstTripCardImage||'');
    const closingMeterReading=String(req.body?.closingMeterReading||'').trim();
    const closingMeterReadings=req.body?.closingMeterReadings ?? {};
    if(!validMeterReadings(closingMeterReadings)||Object.values(closingMeterReadings).some((reading)=>!validMeterReading(reading)))return res.status(400).json({error:'Enter valid closing HMR and KMR readings.'});
    if(firstTripDone&&!firstTripAt)return res.status(400).json({error:'Enter a valid first-trip date and time in HH:MM:SS format.'});
    if(!validTripCardImageDataUrl(firstTripCardImage))return res.status(400).json({error:'Upload a JPEG, PNG, or WebP trip-card image up to 5 MB.'});
    if(!validMeterReading(closingMeterReading))return res.status(400).json({error:'Enter a valid closing KMR/HMR reading.'});
    const misUser=await currentUserRecord(req.session);
    const misSite=String(misUser.site||misUser.location||'').trim();
    if(!misSite)return res.status(403).json({error:'A location must be assigned before this MIS user can verify requests.'});
    const {rows:existingRows}=await pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
    if(!existingRows.length)return res.status(409).json({error:'This request no longer exists.'});
    const existing=existingRows[0];
    if(canonicalSiteName(existing.site)!==canonicalSiteName(misSite))return res.status(403).json({error:'This request belongs to a different location.'});
    if(existing.status!=='Closed')return res.status(409).json({error:'Only closed requests can be verified.'});
    // Mobile browsers can retry a slow image upload after the first request has
    // already committed. Return the saved row so that retry is idempotent.
    if(existing.verifiedAt)return res.json(existing);
    const {rows,idempotent}=await withRequestTimelineTransaction(req,reference,async(client,before)=>{
    if(before.site!==existing.site||before.status!=='Closed')throw Object.assign(new Error('This request could not be verified because its status changed. Refresh and try again.'),{status:409});
    if(before.verifiedAt)return {...await client.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]),idempotent:true};
    validateRequestTimelineChange(before,{firstTripAt,verifiedAt:before.timelineRecordedAt},{now:before.timelineRecordedAt,userEntered:['firstTripAt']});
    buildRequestTimelineChanges(before,{...before,firstTripAt},{events:['firstTripAt'],reason:req.body?.correctionReason,requireCorrectionReason:['firstTripAt']});
    const primaryMeterType=['HMR','KMR'].includes(before.meterType)?before.meterType:'HMR';
    const result=await client.query(`UPDATE maintenance_requests SET verification_status='Verified',verified_at=NOW(),verified_by=$1,
      first_trip_done=$2,first_trip_at=$3,first_trip_by=$4,first_trip_card_image=$5,closing_meter_reading=$6,closing_meter_readings=closing_meter_readings || $9::jsonb WHERE reference=$7 AND status='Closed' AND verified_at IS NULL AND site=$8
      RETURNING ${requestProjection}`,[req.session.name||'MIS User',firstTripDone,firstTripAt,firstTripDone?(req.session.name||'MIS User'):'',firstTripCardImage,closingMeterReading,reference,existing.site,JSON.stringify({...closingMeterReadings,[primaryMeterType]:closingMeterReading})]);
    if(!result.rows.length)throw Object.assign(new Error('This request could not be verified because its status changed. Refresh and try again.'),{status:409});
    return {...result,timelineEvents:['firstTripAt','verifiedAt'],timelineSources:{firstTripAt:'user',verifiedAt:'system'},timelineReason:req.body?.correctionReason||'',timelineRequireReason:['firstTripAt']};
    });
    if(idempotent)return res.json(rows[0]);
    if(!rows.length){
      const {rows:retryRows}=await pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
      if(retryRows[0]?.verifiedAt&&canonicalSiteName(retryRows[0].site)===canonicalSiteName(misSite))return res.json(retryRows[0]);
      return res.status(409).json({error:'This request could not be verified because its status changed. Refresh and try again.'});
    }
    res.json(rows[0]);
    void sendRequestEventReports('verified',rows[0]);
    void (async()=>{
      try{
        const recipients=await requestStakeholderLogins(pool,{site:rows[0].site,requesterLogin:rows[0].requesterLogin});
        const whatsappRecipients=await requestWorkflowWhatsAppLogins(pool,{eventType:'verified',site:rows[0].site});
        const equipmentDetails=requestEquipmentNotificationDetails(rows[0]);
        const verifiedAt=requestNotificationTime(`${rows[0].verifiedAt.replace(' ','T')}+05:30`);
        const verifiedBy=req.session.name||'MIS User';
        const closingMeter=`${rows[0].meterType||'KMR/HMR'} ${rows[0].closingMeterReading||closingMeterReading}`;
        await addTicketNotificationsBestEffort(pool,recipients,rows[0].ref,`Request ${rows[0].ref} was verified by ${req.session.name||'MIS User'}${firstTripDone?' and its first trip was completed':' with its first trip still pending'}.`,
          {templateKey:'requestVerified',parameters:[rows[0].ref,equipmentDetails,rows[0].site,verifiedBy,verifiedAt,closingMeter,workflowRequestLink(rows[0].ref,publicBaseUrl())]},
          {whatsapp:true,whatsappRecipients,workflowType:'verified',site:rows[0].site});
      }catch(error){
        console.error(`Request ${rows[0].ref} was verified, but its notification recipients could not be resolved.`,error);
      }
    })();
  }catch(error){maintenanceWriteFailure(error,res,next)}
});

app.get('/api/requests/:reference/trip-card',requireSession,requirePermission('verifyRequests',{role:'MIS User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const misUser=await currentUserRecord(req.session);
    const misSite=String(misUser.site||misUser.location||'').trim();
    if(!misSite)return res.status(403).json({error:'A location must be assigned before this MIS user can view trip cards.'});
    const {rows}=await pool.query(`SELECT site,first_trip_card_image AS image FROM maintenance_requests
      WHERE reference=$1 AND status='Closed' AND verified_at IS NOT NULL`,[reference]);
    if(!rows.length)return res.status(404).json({error:'Verified closed request not found.'});
    if(canonicalSiteName(rows[0].site)!==canonicalSiteName(misSite))return res.status(403).json({error:'This request belongs to a different location.'});
    if(!validTripCardImageDataUrl(rows[0].image))return res.status(404).json({error:'Trip-card image is not available.'});
    res.json({image:rows[0].image});
  }catch(error){next(error)}
});

app.get('/api/requests/:reference/meter-file',requireSession,async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const stage=req.query.stage==='closing'?'closing':'opening';
    const {rows}=await pool.query(`SELECT requester_login,site,
      CASE WHEN $2='closing' THEN closing_meter_file ELSE opening_meter_file END AS file,
      CASE WHEN $2='closing' THEN closing_meter_file_name ELSE opening_meter_file_name END AS name
      FROM maintenance_requests WHERE reference=$1`,[reference,stage]);
    if(!rows.length)return res.status(404).json({error:'Maintenance request not found.'});
    const row=rows[0];
    let allowed=req.session.role==='super'||req.session.permissions?.readRequests===true;
    if(req.session.role==='normal'&&req.session.assignedRole==='Maintenance User')allowed=true;
    if(req.session.role==='normal'&&req.session.assignedRole==='Production User')allowed=String(row.requester_login||'').trim().toLowerCase()===String(req.session.login||'').trim().toLowerCase();
    if(req.session.role==='normal'&&req.session.assignedRole==='MIS User'){
      const user=await currentUserRecord(req.session);
      allowed=Boolean(user.site||user.location)&&canonicalSiteName(row.site)===canonicalSiteName(user.site||user.location);
    }
    if(!allowed)return res.status(403).json({error:'You are not authorized to view this meter file.'});
    if(!validMeterEvidenceDataUrl(row.file))return res.status(404).json({error:`${stage==='closing'?'Closing':'Opening'} meter file is not available.`});
    res.json({file:row.file,name:row.name||`${stage}-meter-evidence`});
  }catch(error){next(error)}
});

app.get('/api/reference/repair-types',requireSession,async(req,res,next)=>{
  try{
    const {rows}=await pool.query(`
      SELECT id, record_data->>'repairType' AS repair_type
      FROM master_records
      WHERE master_name=$1
      ORDER BY created_at ASC
    `,['Repair type master']);
    res.json(rows.map((row)=>({id:row.id,repairType:String(row.repair_type||'').trim()})).filter((row)=>row.repairType));
  }catch(error){next(error)}
});

app.get('/api/dashboard/equipment',(req,res,next)=>{
  res.set('Cache-Control','private, no-store, no-cache, must-revalidate');
  res.vary('Authorization');
  next();
},requireSession,async(req,res,next)=>{
  try{
    const authorization=await currentDashboardAuthorization(req.session);
    if(!authorization)
      return res.status(401).json({error:'This user account no longer exists. Please sign in again.'});
    if(!canReadDashboardEquipment(authorization.session))
      return res.status(403).json({error:'Your assigned role is not authorized to view dashboard fleet data.'});
    const scope=dashboardEquipmentScope(authorization.session,authorization.user);
    if(!dashboardEquipmentScopeIsUsable(scope))
      return res.status(409).json({error:'No dashboard site or region is assigned to this account. Contact an administrator.'});
    const {rows}=await pool.query(`SELECT id,record_data FROM master_records
      WHERE master_name='Equipment master' ORDER BY created_at ASC`);
    const records=rows.map(({id,record_data})=>({
      id,
      ...(record_data&&typeof record_data==='object'&&!Array.isArray(record_data)?record_data:{}),
    }));
    const {rows:activeFleetRequests}=await pool.query(`SELECT equipment_name AS equipment, equipment_group AS "equipmentGroup",
      door_number AS door, registration_number AS reg, chassis_number AS chassis, site, status, owner_name AS owner,
      to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "createdAt"
      FROM maintenance_requests WHERE lower(trim(status)) <> 'closed'`);
    const fleetSnapshot=dashboardFleetSnapshot(records,activeFleetRequests);
    res.json({
      records:scopeDashboardEquipmentRecords(fleetSnapshot,authorization.session,authorization.user,scope),
      scope,
    });
  }catch(error){next(error)}
});

app.get('/api/reports/master-data',requireSession,async(req,res,next)=>{
  try{
    res.set('Cache-Control','private, no-store');
    res.vary('Authorization');
    const authorization=await currentDashboardAuthorization(req.session);
    if(!authorization)return res.status(401).json({error:'This user account no longer exists. Please sign in again.'});
    const {session,user}=authorization;
    const allowed=session.role==='normal'
      ? ['Production User','Maintenance User','MIS User'].includes(session.assignedRole)
      : session.role==='super'&&(accessAllows(session.permissions?.tabAccess,'Reports')||accessAllows(session.permissions?.mobileTabAccess,'Reports'));
    if(!allowed)return res.status(403).json({error:'Your assigned role is not authorized to view reports.'});
    const scope=dashboardEquipmentScope(session,user);
    if(!dashboardEquipmentScopeIsUsable(scope))return res.status(409).json({error:'No report site is assigned to this account. Contact an administrator.'});
    const {rows}=await pool.query(`SELECT id,master_name,record_data FROM master_records WHERE master_name IN ('Equipment master','Vehicle transfers') ORDER BY created_at ASC`);
    const equipment=rows.filter(row=>row.master_name==='Equipment master').map(row=>({id:row.id,...row.record_data}));
    const transfers=rows.filter(row=>row.master_name==='Vehicle transfers').map(row=>({id:row.id,...row.record_data}));
    const transferRecords=transfers.filter(row=>!scope.restrictToScope||[row.source,row.destination].some(site=>reportScopeIncludesSite({sites:scope.allowedSites},site)));
    res.json({equipmentRecords:scopeDashboardEquipmentRecords(equipment,session,user,scope),transferRecords});
  }catch(error){next(error)}
});

app.get('/api/masters',requireSession,async(req,res,next)=>{
  try{
    const superCanView=(master)=>req.session.role==='super'&&(masterAccessAllows(req.session.permissions,master)||masterAccessAllows(req.session.permissions,master,'mobileMasterAccess'));
    const canViewEquipment=superCanView('Equipment master')||req.session.permissions?.viewEquipment===true;
    const canViewRepairTypes=superCanView('Repair type master')||req.session.permissions?.viewRepairTypes===true;
    const canViewDelayedReasons=superCanView('Delayed Reason')||req.session.permissions?.closeRequests===true;
    if(!canViewEquipment&&!canViewRepairTypes&&!canViewDelayedReasons)
      return res.status(403).json({error:'Your assigned role is not authorized to view master records.'});
    const managerRecord=(req.session.role==='super'&&req.session.permissions?.adminLevel==='Manager')||req.session.role==='normal'?await currentUserRecord(req.session):null;
    const managerScope=managerRecord?managerReportScope(managerRecord):null;
    const {rows}=await pool.query('SELECT id, master_name, record_data FROM master_records ORDER BY created_at ASC');
    const grouped={},privilegesByUsername=new Map();
    for(const row of rows){
      if(req.session.role==='super'){
        if(!masterAccessAllows(req.session.permissions,row.master_name)&&!masterAccessAllows(req.session.permissions,row.master_name,'mobileMasterAccess'))continue;
      }else{
        if(row.master_name==='Equipment master'&&!canViewEquipment)continue;
        if(row.master_name==='Repair type master'&&!canViewRepairTypes)continue;
        if(row.master_name==='Delayed Reason'&&!canViewDelayedReasons)continue;
        if(!['Equipment master','Repair type master','Delayed Reason'].includes(row.master_name))continue;
      }
      const record=row.master_name==='Users & employees'?publicUserRecord(row.record_data):row.record_data;
      if(managerRecord&&row.master_name==='Equipment master'){
        const equipmentSite=canonicalSiteName(record.currentLocation||record.site||record.location||'');
        if(!reportScopeIncludesSite(managerScope,equipmentSite))continue;
      }
      if(row.master_name==='Privilege'){
        const username=String(record.username||'').trim().toLowerCase();
        const existing=username&&privilegesByUsername.get(username);
        if(existing){
          Object.assign(existing,mergePrivilegeRecords(existing,record));
          continue;
        }
        const privilege={id:row.id,...record};
        if(username)privilegesByUsername.set(username,privilege);
        (grouped[row.master_name]??=[]).push(privilege);
        continue;
      }
      (grouped[row.master_name]??=[]).push({id:row.id,...record});
    }
    res.json(grouped);
  }catch(error){next(error)}
});

app.post('/api/masters/:master',requireSuper,async(req,res,next)=>{
  try{
    const master=decodeURIComponent(req.params.master);
    const records=Array.isArray(req.body)?req.body:[req.body];
    if(!master||!records.length||records.some(record=>!record||typeof record!=='object'||Array.isArray(record)))
      return res.status(400).json({error:'A master name and one or more records are required.'});
    if(master==='Users & employees'&&records.some(record=>isTrueSuperAdmin(record))&&!isTrueSuperAdmin(req.session.permissions))
      return res.status(403).json({error:'Only a Super Admin can create another Super Admin account.'});
    let prepared;
    try{
      prepared=records.map((record,index)=>{
        try{
          if(master!=='Users & employees')return normalizeOperationalSiteFields(record);
          record.login=String(record.login||'').trim().toUpperCase();
          record.employee=String(record.employee||'').trim().toUpperCase();
          return initializeUserCredentials(normalizeUserSiteFields(normalizeUserAccessLabels(record)));
        }
        catch(error){throw new Error(`CSV row ${index+2}: ${error.message}`)}
      });
    }catch(error){return res.status(400).json({error:error.message})}
    let rows;
    if(master==='Users & employees'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query('LOCK TABLE master_records IN SHARE ROW EXCLUSIVE MODE');
        const existing=await client.query(
          `SELECT record_data FROM master_records WHERE master_name='Users & employees'`
        );
        const conflict=duplicateUsername(existing.rows.map(row=>row.record_data),prepared);
        if(conflict){
          await client.query('ROLLBACK');
          return res.status(409).json({error:'This username already exists.'});
        }
        ({rows}=await client.query(`INSERT INTO master_records (master_name,record_data)
          SELECT $1,value FROM jsonb_array_elements($2::jsonb) AS value
          RETURNING id,record_data`,[master,JSON.stringify(prepared)]));
        const affectedLogins=[...new Set(prepared.flatMap(record=>userLoginCandidates(record)).filter(Boolean))];
        await revokeAuthorizationSessions(client,affectedLogins);
        await client.query('COMMIT');
      }catch(error){
        await client.query('ROLLBACK').catch(()=>{});
        throw error;
      }finally{client.release()}
    }else if(master==='Equipment master'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const existing=await client.query(
          'SELECT id,record_data FROM master_records WHERE master_name=$1 FOR UPDATE',
          [master]
        );
        const byIdentity=new Map(
          existing.rows.map(row=>[equipmentIdentity(row.record_data),row]).filter(([identity])=>identity)
        );
        rows=[];
        for(const record of prepared){
          const identity=equipmentIdentity(record);
          const match=identity&&byIdentity.get(identity);
          if(match){
            const updated=await client.query(
              'UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 RETURNING id,record_data',
              [JSON.stringify(record),match.id]
            );
            rows.push(updated.rows[0]);
            byIdentity.set(identity,updated.rows[0]);
          }else{
            const inserted=await client.query(
              'INSERT INTO master_records (master_name,record_data) VALUES ($1,$2::jsonb) RETURNING id,record_data',
              [master,JSON.stringify(record)]
            );
            rows.push(inserted.rows[0]);
            if(identity)byIdentity.set(identity,inserted.rows[0]);
          }
        }
        await client.query('COMMIT');
      }catch(error){
        await client.query('ROLLBACK');
        throw error;
      }finally{client.release()}
    }else if(master==='Privilege'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        await client.query('LOCK TABLE master_records IN SHARE ROW EXCLUSIVE MODE');
        const existing=await client.query(
          'SELECT id,record_data FROM master_records WHERE master_name=$1',
          [master]
        );
        const byUsername=new Map(existing.rows.map(row=>[
          String(row.record_data.username||'').trim().toLowerCase(),row
        ]).filter(([username])=>username));
        rows=[];
        for(const record of prepared){
          const username=String(record.username||'').trim().toLowerCase();
          const match=username&&byUsername.get(username);
          if(match){
            const matchingIds=[...new Set([
              match.id,
              ...existing.rows
                .filter(row=>String(row.record_data.username||'').trim().toLowerCase()===username)
                .map(row=>row.id)
            ])];
            const updated=await client.query(
              'UPDATE master_records SET record_data=$1::jsonb WHERE master_name=$2 AND id=ANY($3::bigint[]) RETURNING id,record_data',
              [JSON.stringify(record),master,matchingIds]
            );
            const saved=updated.rows.find(row=>Number(row.id)===Number(match.id))||updated.rows[0];
            rows.push(saved);
            byUsername.set(username,saved);
          }else{
            const inserted=await client.query(
              'INSERT INTO master_records (master_name,record_data) VALUES ($1,$2::jsonb) RETURNING id,record_data',
              [master,JSON.stringify(record)]
            );
            rows.push(inserted.rows[0]);
            if(username)byUsername.set(username,inserted.rows[0]);
          }
        }
        const affectedLogins=[...new Set(prepared.map(record=>String(record.username||'').trim().toLowerCase()).filter(Boolean))];
        await revokeAuthorizationSessions(client,affectedLogins);
        await client.query('COMMIT');
      }catch(error){
        await client.query('ROLLBACK');
        throw error;
      }finally{client.release()}
    }else{
      ({rows}=await pool.query(`INSERT INTO master_records (master_name,record_data)
        SELECT $1,value FROM jsonb_array_elements($2::jsonb) AS value
        RETURNING id,record_data`,[master,JSON.stringify(prepared)]));
    }
    const saved=rows.map(row=>({id:row.id,...(master==='Users & employees'?publicUserRecord(row.record_data):row.record_data)}));
    req.audit={eventType:'Master data',module:master,action:records.length>1?'Import records':'Create record',targetType:master,targetReference:records.length>1?`${saved.length} records`:String(saved[0]?.id||''),reason:`${saved.length} record${saved.length===1?'':'s'} saved`,changedFields:[]};
    res.status(201).json(saved);
  }catch(error){next(error)}
});

app.post('/api/masters/:master/:id/password',requireSuper,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const master=decodeURIComponent(req.params.master);
    const id=Number(req.params.id);
    if(master!=='Users & employees'||!Number.isInteger(id)||id<=0)
      return res.status(400).json({error:'A valid employee account is required.'});
    const password=String(req.body?.password||'');
    const confirmation=String(req.body?.confirmation||'');
    const requireChange=req.body?.requireChange!==false;
    await client.query('BEGIN');
    const {rows}=await client.query(`SELECT record_data FROM master_records
      WHERE id=$1 AND master_name='Users & employees' FOR UPDATE`,[id]);
    const user=rows[0]?.record_data;
    if(!user){await client.query('ROLLBACK');return res.status(404).json({error:'Employee account not found.'})}
    if(isTrueSuperAdmin(user)&&!isTrueSuperAdmin(req.session.permissions)){
      await client.query('ROLLBACK');
      return res.status(403).json({error:'Only a Super Admin can change a Super Admin password.'});
    }
    const validationError=passwordResetValidationError({password,confirmation,phone:passwordResetPhone(user)});
    if(validationError){await client.query('ROLLBACK');return res.status(400).json({error:validationError})}
    const login=String(user.login||userLoginCandidates(user)[0]||'').trim();
    const updated={...user,passwordHash:hashPassword(password),mustChangePassword:requireChange};
    await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(updated),id]);
    await client.query('UPDATE password_reset_sessions SET used_at=NOW() WHERE master_record_id=$1 AND used_at IS NULL',[id]);
    await client.query('DELETE FROM password_change_sessions WHERE master_record_id=$1',[id]);
    if(login)await client.query('DELETE FROM auth_sessions WHERE lower(login_name)=lower($1)',[login]);
    await client.query('COMMIT');
    req.audit={
      eventType:'Security',module:'Users & employees',action:'Administrator password change',targetType:'User account',
      targetReference:login||String(id),reason:requireChange?'Temporary password set; change required at next login':'Password changed by administrator',
      changedFields:[{field:'password',before:'[protected]',after:'[protected]'},{field:'mustChangePassword',before:String(Boolean(user.mustChangePassword)),after:String(requireChange)}],
    };
    res.json({message:requireChange?'Temporary password saved. The employee must change it at next login.':'Password changed successfully.'});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});

app.put('/api/masters/:master/:id',requireSuper,async(req,res,next)=>{
  try{
    const master=decodeURIComponent(req.params.master);
    const id=Number(req.params.id);
    const record=req.body;
    if(!master||!Number.isInteger(id)||id<=0||!record||typeof record!=='object'||Array.isArray(record))
      return res.status(400).json({error:'A valid master record is required.'});
    const existingSnapshot=await pool.query('SELECT record_data FROM master_records WHERE id=$1 AND master_name=$2',[id,master]);
    if(!existingSnapshot.rows.length)return res.status(404).json({error:'Master record not found.'});
    const previousRecord=existingSnapshot.rows[0].record_data;
    let storedRecord=normalizeOperationalSiteFields(record);
    if(master==='Users & employees'){
      if((isTrueSuperAdmin(record)||isTrueSuperAdmin(previousRecord))&&!isTrueSuperAdmin(req.session.permissions))
        return res.status(403).json({error:'Only a Super Admin can manage Super Admin accounts.'});
      storedRecord={...normalizeUserSiteFields(normalizeUserAccessLabels(record)),
        login:String(record.login||'').trim().toUpperCase(),
        employee:String(record.employee||'').trim().toUpperCase(),
        passwordHash:previousRecord.passwordHash,
        mustChangePassword:previousRecord.mustChangePassword,
      };
    }
    if(master==='Privilege'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const existing=await client.query(
          'SELECT id,record_data FROM master_records WHERE master_name=$1 FOR UPDATE',
          [master]
        );
        const target=existing.rows.find(row=>Number(row.id)===id);
        if(!target){
          await client.query('ROLLBACK');
          return res.status(404).json({error:'Master record not found.'});
        }
        const currentUsername=String(target.record_data.username||'').trim().toLowerCase();
        const requestedUsername=String(record.username||'').trim().toLowerCase();
        if(!currentUsername||requestedUsername!==currentUsername){
          await client.query('ROLLBACK');
          return res.status(400).json({error:'Privilege usernames cannot be changed. Select the correct user instead.'});
        }
        const matchingIds=existing.rows
          .filter(row=>{
            if(Number(row.id)===id)return true;
            const username=String(row.record_data.username||'').trim().toLowerCase();
            return Boolean(username&&username===currentUsername);
          })
          .map(row=>row.id);
        const updated=await client.query(
          'UPDATE master_records SET record_data=$1::jsonb WHERE master_name=$2 AND id=ANY($3::bigint[]) RETURNING id,record_data',
          [JSON.stringify(storedRecord),master,matchingIds]
        );
        await revokeAuthorizationSessions(client,[currentUsername]);
        await client.query('COMMIT');
        const saved=updated.rows.find(row=>Number(row.id)===id)||updated.rows[0];
        req.audit={eventType:'Master data',module:master,action:'Edit record',targetType:master,targetReference:currentUsername||String(id),changedFields:auditChangedFields(previousRecord,storedRecord)};
        return res.json({id:saved.id,...saved.record_data});
      }catch(error){
        await client.query('ROLLBACK');
        throw error;
      }finally{client.release()}
    }
    if(master==='Users & employees'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const {rows}=await client.query(
          'UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name=$3 RETURNING id,record_data',
          [JSON.stringify(storedRecord),id,master]
        );
        if(!rows.length){await client.query('ROLLBACK');return res.status(404).json({error:'Master record not found.'})}
        const affectedLogins=[...new Set([...userLoginCandidates(previousRecord),...userLoginCandidates(storedRecord)].filter(Boolean))];
        await client.query('DELETE FROM password_change_sessions WHERE master_record_id=$1',[id]);
        await revokeAuthorizationSessions(client,affectedLogins);
        await client.query('COMMIT');
        req.audit={eventType:'Master data',module:master,action:'Edit record',targetType:master,targetReference:String(storedRecord.login||storedRecord.employee||id),changedFields:auditChangedFields(previousRecord,storedRecord)};
        return res.json({id:rows[0].id,...publicUserRecord(rows[0].record_data)});
      }catch(error){
        await client.query('ROLLBACK').catch(()=>{});
        throw error;
      }finally{client.release()}
    }
    const {rows}=await pool.query(
      'UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name=$3 RETURNING id,record_data',
      [JSON.stringify(storedRecord),id,master]
    );
    if(!rows.length)return res.status(404).json({error:'Master record not found.'});
    req.audit={eventType:'Master data',module:master,action:'Edit record',targetType:master,targetReference:String(storedRecord.login||storedRecord.employee||storedRecord.door||storedRecord.repairType||id),changedFields:auditChangedFields(previousRecord,storedRecord)};
    res.json({id:rows[0].id,...(master==='Users & employees'?publicUserRecord(rows[0].record_data):rows[0].record_data)});
  }catch(error){next(error)}
});

app.delete('/api/masters/:master/all',requireSuper,async(req,res,next)=>{
  try{
    const master=decodeURIComponent(req.params.master);
    if(!master)return res.status(400).json({error:'A master name is required.'});
    if(master==='Users & employees')return res.status(403).json({error:'User accounts cannot be deleted in bulk.'});
    if(master==='Breakdown master'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const manual=await client.query('DELETE FROM master_records WHERE master_name=$1',[master]);
        const requests=await client.query('DELETE FROM maintenance_requests');
        await client.query('COMMIT');
        req.audit={eventType:'Master data',module:master,action:'Delete all records',targetType:master,targetReference:`${manual.rowCount+requests.rowCount} records`,changedFields:[]};
        return res.json({deleted:manual.rowCount+requests.rowCount});
      }catch(error){await client.query('ROLLBACK');throw error}
      finally{client.release()}
    }
    if(master==='Privilege'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const existing=await client.query("SELECT lower(record_data->>'username') AS login FROM master_records WHERE master_name=$1 FOR UPDATE",[master]);
        const affectedLogins=[...new Set(existing.rows.map(row=>String(row.login||'').trim()).filter(Boolean))];
        const result=await client.query('DELETE FROM master_records WHERE master_name=$1',[master]);
        await revokeAuthorizationSessions(client,affectedLogins);
        await client.query('COMMIT');
        req.audit={eventType:'Master data',module:master,action:'Delete all records',targetType:master,targetReference:`${result.rowCount} records`,changedFields:[]};
        return res.json({deleted:result.rowCount});
      }catch(error){
        await client.query('ROLLBACK').catch(()=>{});
        throw error;
      }finally{client.release()}
    }
    const result=await pool.query('DELETE FROM master_records WHERE master_name=$1',[master]);
    req.audit={eventType:'Master data',module:master,action:'Delete all records',targetType:master,targetReference:`${result.rowCount} records`,changedFields:[]};
    res.json({deleted:result.rowCount});
  }catch(error){next(error)}
});

app.delete('/api/masters/:master/:id',requireSuper,async(req,res,next)=>{
  try{
    const master=decodeURIComponent(req.params.master);
    const id=Number(req.params.id);
    if(!master||!Number.isInteger(id)||id<=0)return res.status(400).json({error:'A valid master record is required.'});
    const existingRecordResult=await pool.query('SELECT record_data FROM master_records WHERE id=$1 AND master_name=$2',[id,master]);
    const deletedRecord=existingRecordResult.rows[0]?.record_data;
    if(!deletedRecord)return res.status(404).json({error:'Master record not found.'});
    if(master==='Users & employees'){
      if(isTrueSuperAdmin(deletedRecord)&&!isTrueSuperAdmin(req.session.permissions))return res.status(403).json({error:'Only a Super Admin can delete Super Admin accounts.'});
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const result=await client.query('DELETE FROM master_records WHERE id=$1 AND master_name=$2',[id,master]);
        if(!result.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Master record not found.'})}
        const affectedLogins=[...new Set(userLoginCandidates(deletedRecord).filter(Boolean))];
        await revokeAuthorizationSessions(client,affectedLogins);
        await client.query('COMMIT');
        req.audit={eventType:'Master data',module:master,action:'Delete record',targetType:master,targetReference:String(deletedRecord.login||deletedRecord.employee||id),changedFields:[]};
        return res.status(204).end();
      }catch(error){
        await client.query('ROLLBACK').catch(()=>{});
        throw error;
      }finally{client.release()}
    }
    if(master==='Privilege'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const existing=await client.query(
          'SELECT id,record_data FROM master_records WHERE master_name=$1 FOR UPDATE',
          [master]
        );
        const target=existing.rows.find(row=>Number(row.id)===id);
        if(!target){
          await client.query('ROLLBACK');
          return res.status(404).json({error:'Master record not found.'});
        }
        const targetUsername=String(target.record_data.username||'').trim().toLowerCase();
        const matchingIds=existing.rows
          .filter(row=>Number(row.id)===id||(
            targetUsername&&String(row.record_data.username||'').trim().toLowerCase()===targetUsername
          ))
          .map(row=>row.id);
        await client.query(
          'DELETE FROM master_records WHERE master_name=$1 AND id=ANY($2::bigint[])',
          [master,matchingIds]
        );
        await revokeAuthorizationSessions(client,[targetUsername]);
        await client.query('COMMIT');
        req.audit={eventType:'Master data',module:master,action:'Delete record',targetType:master,targetReference:targetUsername||String(id),changedFields:[]};
        return res.status(204).end();
      }catch(error){
        await client.query('ROLLBACK');
        throw error;
      }finally{client.release()}
    }
    const result=await pool.query('DELETE FROM master_records WHERE id=$1 AND master_name=$2',[id,master]);
    if(!result.rowCount)return res.status(404).json({error:'Master record not found.'});
    req.audit={eventType:'Master data',module:master,action:'Delete record',targetType:master,targetReference:String(deletedRecord.login||deletedRecord.employee||deletedRecord.door||deletedRecord.repairType||id),changedFields:[]};
    res.status(204).end();
  }catch(error){next(error)}
});

const AUDIT_EXPORT_COLUMNS=[
  {label:'Date & time',key:'occurredAt'},
  {label:'Event',key:'eventType'},
  {label:'User',key:'actorName'},
  {label:'Login',key:'actorLogin'},
  {label:'Role',key:'actorRole'},
  {label:'Module',key:'module'},
  {label:'Action',key:'action'},
  {label:'Target type',key:'targetType'},
  {label:'Target / record',key:'targetReference'},
  {label:'Outcome',key:'outcome'},
  {label:'HTTP status',key:'statusCode'},
  {label:'Reason / details',key:'reason'},
  {label:'Changes',key:'changedFields'},
  {label:'IP address',key:'ipAddress'},
  {label:'Device ID',key:'deviceId'},
  {label:'Session ID',key:'sessionId'},
];

function auditExportCell(event,key){
  if(key==='occurredAt')return formatDisplayDateTime(event.occurredAt);
  if(key==='changedFields')return Array.isArray(event.changedFields)&&event.changedFields.length?JSON.stringify(event.changedFields):'';
  return event[key]??'';
}

async function pruneAuditEvents(){
  if(!databaseReady)return {skipped:true};
  const result=await pool.query(`DELETE FROM audit_events WHERE occurred_at<NOW()-INTERVAL '5 days'`);
  return {deleted:result.rowCount||0};
}

let auditLogExportRunning=false;
async function sendScheduledAuditLogExports(now=new Date()){
  if(!databaseReady||auditLogExportRunning)return {skipped:true};
  const slotKey=auditLogExportSlot(now);
  const {rows:currentRows}=await pool.query(`SELECT status,attempts,updated_at FROM audit_log_export_runs WHERE slot_key=$1`,[slotKey]);
  const current=currentRows[0];
  if(current?.status?.startsWith('Sent'))return {skipped:true,reason:'already sent',slotKey};
  if(current?.status==='Sending'&&Date.now()-new Date(current.updated_at).getTime()<10*60*1000)return {skipped:true,reason:'already running',slotKey};
  if(Number(current?.attempts||0)>=3)return {skipped:true,reason:'retry limit reached',slotKey};
  if(!current){
    const {rows:lastRows}=await pool.query(`SELECT updated_at FROM audit_log_export_runs WHERE status LIKE 'Sent%' ORDER BY updated_at DESC LIMIT 1`);
    if(!auditLogExportDue(now,lastRows[0]?.updated_at))return {skipped:true,reason:'outside five-day schedule'};
  }
  const claim=await pool.query(`INSERT INTO audit_log_export_runs (slot_key,status,attempts,updated_at)
    VALUES ($1,'Sending',1,NOW())
    ON CONFLICT (slot_key) DO UPDATE SET status='Sending',attempts=audit_log_export_runs.attempts+1,updated_at=NOW()
      WHERE audit_log_export_runs.status LIKE 'Failed%' OR (audit_log_export_runs.status='Sending' AND audit_log_export_runs.updated_at<NOW()-INTERVAL '10 minutes')
    RETURNING attempts`,[slotKey]);
  if(!claim.rowCount)return {skipped:true,reason:'already claimed',slotKey};
  auditLogExportRunning=true;
  let status='Failed - export did not complete';
  try{
    const [{rows:eventRows},{rows:userRows}]=await Promise.all([
      pool.query(`SELECT ${AUDIT_EVENT_PROJECTION} FROM audit_events WHERE occurred_at>=NOW()-INTERVAL '5 days' AND ${AUDIT_VISIBLE_SCOPE_SQL} ORDER BY occurred_at DESC,id DESC LIMIT 5000`),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`),
    ]);
    const recipients=userRows.map(({record_data})=>record_data||{}).map((user)=>({user,profile:resolveMobileAccess({user})}))
      .filter(({profile})=>profile.sessionRole==='super'&&['Admin','Super Admin'].includes(profile.permissions?.adminLevel))
      .map(({user})=>({
        login:String(user.login||'').trim().toLowerCase(),
        name:String(user.employee||user.name||user.login||'Administrator').trim(),
        email:String(user.email||user.mail||user.emailId||'').trim(),
        phone:String(user.phone||user.phoneNo||user.phoneNumber||'').trim(),
      }));
    if(!recipients.length)throw new Error('No Admin or Super Admin recipients are configured.');
    const workbook=buildXlsxWorkbookBuffer('Nerve Center Audit Trail',AUDIT_EXPORT_COLUMNS,eventRows.map((event)=>AUDIT_EXPORT_COLUMNS.map(({key})=>auditExportCell(event,key))));
    const shortCode=randomUUID().replace(/-/g,'').slice(0,16);
    const filename=`BDMS-Audit-Trail-${slotKey}.xlsx`;
    await pool.query(`DELETE FROM published_reports WHERE expires_at<=NOW()`);
    await pool.query(`INSERT INTO published_reports (id,short_code,filename,content_type,file_data,expires_at)
      VALUES ($1,$2,$3,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',$4,NOW()+INTERVAL '30 days')`,
      [randomUUID(),shortCode,filename,workbook]);
    const url=`${publicBaseUrl()}/r/${shortCode}`;
    const whatsappEnv=await metaWhatsAppRuntimeEnv();
    let emailSent=0,whatsappSent=0,deliveryFailures=0;
    const deliveredEmails=new Set(),deliveredPhones=new Set();
    for(const recipient of recipients){
      if(recipient.email&&!deliveredEmails.has(recipient.email.toLowerCase())){
        const emailKey=recipient.email.toLowerCase();
        deliveredEmails.add(emailKey);
        const delivery=await pool.query(`INSERT INTO audit_log_export_deliveries (slot_key,recipient_key,channel,status,attempts,updated_at)
          VALUES ($1,$2,'Email','Sending',1,NOW())
          ON CONFLICT (slot_key,recipient_key,channel) DO UPDATE SET status='Sending',attempts=audit_log_export_deliveries.attempts+1,updated_at=NOW()
            WHERE audit_log_export_deliveries.status LIKE 'Failed%' AND audit_log_export_deliveries.attempts<3
          RETURNING attempts`,[slotKey,emailKey]);
        if(delivery.rowCount){
          let deliveryStatus='Sent';
          try{
            const result=await sendAuditLogExportEmail({to:recipient.email,url,generatedAt:now,rowCount:eventRows.length});
            if(result.sent)emailSent++;else throw new Error(result.reason||'Email was not sent.');
          }catch(error){deliveryFailures++;deliveryStatus=`Failed - ${String(error?.message||'Email delivery error').slice(0,160)}`;console.error(`Audit Trail email failed for ${recipient.login||recipient.email}:`,error.message)}
          await pool.query(`UPDATE audit_log_export_deliveries SET status=$1,updated_at=NOW() WHERE slot_key=$2 AND recipient_key=$3 AND channel='Email'`,[deliveryStatus,slotKey,emailKey]);
        }
      }
      const normalizedPhone=recipient.phone.replace(/\D/g,'');
      if(normalizedPhone&&!deliveredPhones.has(normalizedPhone)){
        deliveredPhones.add(normalizedPhone);
        const delivery=await pool.query(`INSERT INTO audit_log_export_deliveries (slot_key,recipient_key,channel,status,attempts,updated_at)
          VALUES ($1,$2,'WhatsApp','Sending',1,NOW())
          ON CONFLICT (slot_key,recipient_key,channel) DO UPDATE SET status='Sending',attempts=audit_log_export_deliveries.attempts+1,updated_at=NOW()
            WHERE audit_log_export_deliveries.status LIKE 'Failed%' AND audit_log_export_deliveries.attempts<3
          RETURNING attempts`,[slotKey,normalizedPhone]);
        if(delivery.rowCount){
          let deliveryStatus='Sent';
          try{
            await sendMetaWhatsAppTemplate({
              to:recipient.phone,templateKey:'consolidatedRequestReport',purpose:'consolidatedRequestReport',
              parameters:[`Nerve Center Audit Trail export. Latest five days: ${eventRows.length.toLocaleString('en-IN')} records. Excel: ${url}. Link expires in 30 days.`],
            },{env:whatsappEnv});
            whatsappSent++;
          }catch(error){deliveryFailures++;deliveryStatus=`Failed - ${String(error?.message||'WhatsApp delivery error').slice(0,160)}`;console.error(`Audit Trail WhatsApp failed for ${recipient.login||recipient.phone}:`,error.message)}
          await Promise.all([
            pool.query(`UPDATE audit_log_export_deliveries SET status=$1,updated_at=NOW() WHERE slot_key=$2 AND recipient_key=$3 AND channel='WhatsApp'`,[deliveryStatus,slotKey,normalizedPhone]),
            pool.query(`INSERT INTO whatsapp_alert_history
              (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
              ['Audit Trail export','Latest five days',slotKey,recipient.name,recipient.phone,deliveryStatus]),
          ]);
        }
      }
    }
    const {rows:deliveryRows}=await pool.query(`SELECT
      COUNT(*) FILTER (WHERE status='Sent')::int AS sent,
      COUNT(*) FILTER (WHERE status LIKE 'Failed%')::int AS failed
      FROM audit_log_export_deliveries WHERE slot_key=$1`,[slotKey]);
    if(!Number(deliveryRows[0]?.sent))throw new Error('No configured Admin email or WhatsApp recipient could be reached.');
    deliveryFailures=Number(deliveryRows[0]?.failed||deliveryFailures);
    status=deliveryFailures?`Failed - ${deliveryFailures} delivery channel(s) failed`:`Sent - email ${emailSent}, WhatsApp ${whatsappSent}`;
    await pool.query(`UPDATE audit_log_export_runs SET status=$1,updated_at=NOW() WHERE slot_key=$2`,[status,slotKey]);
    return {slotKey,status,rowCount:eventRows.length,url,emailSent,whatsappSent,deliveryFailures};
  }catch(error){
    status=`Failed - ${String(error?.message||'Audit Trail export error').slice(0,180)}`;
    await pool.query(`UPDATE audit_log_export_runs SET status=$1,updated_at=NOW() WHERE slot_key=$2`,[status,slotKey]).catch(()=>{});
    throw error;
  }finally{auditLogExportRunning=false}
}

app.use(express.static(staticRoot));
app.get(/^(?!\/api).*/,(_req,res)=>res.sendFile(path.join(staticRoot,'index.html')));
app.use((error,req,res,next)=>{
  const auditedError=auditSafeError(error);
  req.auditErrorCode=auditedError.code;
  req.auditResponseError=`${auditedError.code}: ${auditedError.message}`;
  req.audit={...(req.audit||{}),eventType:req.audit?.eventType||'Error'};
  next(error);
});
// Transient database failures become a 503 with Retry-After so the UI retries
// silently; route errors that carry a status keep it; anything else is a 500
// with a message that tells the user what to do next.
app.use(serverErrorHandler());

app.listen(port,()=>console.log(`Nerve Center listening on port ${port}`));

async function initializeDatabase(){
  try{
    await migrate();
    databaseReady=true;
    databaseError='';
    const retention=await pruneAuditEvents();
    if(retention.deleted)console.log(`Audit Trail retention removed ${retention.deleted} records older than five days.`);
    console.log('Database initialization completed.');
    if(scheduledJobsEnabled){
      if(oracleConfigured)void syncTemporaryRequestDrivers()
        .then(result=>console.log('Oracle request-driver sync completed.',result))
        .catch(error=>console.error('Oracle request-driver startup sync failed.',error));
      void sendScheduledConsolidatedWhatsAppReports()
        .then(result=>console.log('Scheduled consolidated WhatsApp report check completed.',result))
        .catch(error=>console.error('Scheduled consolidated WhatsApp report check failed.',error));
      void sendScheduledConsolidatedTicketReports()
        .then(result=>console.log('Scheduled consolidated CRM WhatsApp report check completed.',result))
        .catch(error=>console.error('Scheduled consolidated CRM WhatsApp report check failed.',error));
      void sendScheduledDirectorReportBundles()
        .then(result=>console.log('Scheduled Director WhatsApp report check completed.',result))
        .catch(error=>console.error('Scheduled Director WhatsApp report check failed.',error));
      void sendScheduledHierarchyReportBundles()
        .then(result=>console.log('Scheduled hierarchy WhatsApp report check completed.',result))
        .catch(error=>console.error('Scheduled hierarchy WhatsApp report check failed.',error));
      void sendScheduledWorkflowWhatsAppReminders()
        .then(result=>console.log('Scheduled workflow WhatsApp reminder check completed.',result))
        .catch(error=>console.error('Scheduled workflow WhatsApp reminder check failed.',error));
      void sendScheduledAuditLogExports()
        .then(result=>console.log('Scheduled Audit Trail export check completed.',result))
        .catch(error=>console.error('Scheduled Audit Trail export check failed.',error));
      void auditAdminLockIncidents().catch(error=>console.error('CRM admin-lock audit failed.',error));
      void metaWhatsAppRuntimeEnv().then((whatsappEnv)=>{
        if(whatsappEnv.META_WHATSAPP_BUSINESS_ACCOUNT_ID)return submitMetaWhatsAppTemplates({env:whatsappEnv})
          .then(result=>console.log('Meta WhatsApp template synchronization completed.',result))
          .catch(error=>console.error('Meta WhatsApp template synchronization failed.',error));
        return null;
      }).catch(error=>console.error('Meta WhatsApp template configuration check failed.',error));
    }else{
      console.log('Scheduled background jobs are disabled for this deployment slot.');
    }
  }catch(error){
    databaseReady=false;
    databaseError=error instanceof Error?error.message:'Database initialization failed.';
    console.error('Database initialization failed; retrying in 30 seconds.',error);
    setTimeout(initializeDatabase,30000);
  }
}

void initializeDatabase();
if(scheduledJobsEnabled){
  const requestDriverSyncTimer=setInterval(()=>{
    void syncTemporaryRequestDrivers()
      .then(result=>console.log('Scheduled Oracle request-driver sync completed.',result))
      .catch(error=>console.error('Scheduled Oracle request-driver sync failed.',error));
  },driverSyncIntervalMs);
  requestDriverSyncTimer.unref?.();
  const consolidatedWhatsAppTimer=setInterval(()=>{
    void sendScheduledConsolidatedWhatsAppReports()
      .then(result=>{if(!result?.skipped)console.log('Scheduled consolidated WhatsApp report check completed.',result)})
      .catch(error=>console.error('Scheduled consolidated WhatsApp report check failed.',error));
  },60*1000);
  consolidatedWhatsAppTimer.unref?.();
  const consolidatedTicketWhatsAppTimer=setInterval(()=>{
    void sendScheduledConsolidatedTicketReports()
      .then(result=>{if(!result?.skipped)console.log('Scheduled consolidated CRM WhatsApp report check completed.',result)})
      .catch(error=>console.error('Scheduled consolidated CRM WhatsApp report check failed.',error));
  },60*1000);
  consolidatedTicketWhatsAppTimer.unref?.();
  const directorWhatsAppTimer=setInterval(()=>{
    void sendScheduledDirectorReportBundles()
      .then(result=>{if(!result?.skipped)console.log('Scheduled Director WhatsApp report check completed.',result)})
      .catch(error=>console.error('Scheduled Director WhatsApp report check failed.',error));
  },60*1000);
  directorWhatsAppTimer.unref?.();
  const hierarchyWhatsAppTimer=setInterval(()=>{
    void sendScheduledHierarchyReportBundles()
      .then(result=>{if(!result?.skipped)console.log('Scheduled hierarchy WhatsApp report check completed.',result)})
      .catch(error=>console.error('Scheduled hierarchy WhatsApp report check failed.',error));
  },60*1000);
  hierarchyWhatsAppTimer.unref?.();
  const workflowReminderTimer=setInterval(()=>{
    void sendScheduledWorkflowWhatsAppReminders()
      .then(result=>{if(!result?.skipped)console.log('Scheduled workflow WhatsApp reminder check completed.',result)})
      .catch(error=>console.error('Scheduled workflow WhatsApp reminder check failed.',error));
  },60*1000);
  workflowReminderTimer.unref?.();
  const auditLogExportTimer=setInterval(()=>{
    void sendScheduledAuditLogExports()
      .then(result=>{if(!result?.skipped)console.log('Scheduled Audit Trail export completed.',result)})
      .catch(error=>console.error('Scheduled Audit Trail export failed.',error));
  },60*1000);
  auditLogExportTimer.unref?.();
  const adminLockAuditTimer=setInterval(()=>void auditAdminLockIncidents().catch(error=>console.error('Scheduled CRM admin-lock audit failed.',error)),60*1000);
  adminLockAuditTimer.unref?.();
}
const auditRetentionTimer=setInterval(()=>{
  if(databaseReady)void pruneAuditEvents().catch(error=>console.error('Audit Trail retention cleanup failed.',error));
},60*60*1000);
auditRetentionTimer.unref?.();
