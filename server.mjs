import express from 'express';
import compression from 'compression';
import {createNotificationFeed} from './notification-feed.mjs';
import {formatDisplayDate,formatDisplayDateTime} from './date-time-format.mjs';
import pg from 'pg';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReadStream,createWriteStream,existsSync,promises as fs,readFileSync} from 'node:fs';
import os from 'node:os';
import {Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash,randomUUID} from 'node:crypto';
import {createSessionStore} from './auth-session.mjs';
import {repairLegacySessionDefaults} from './auth-session-schema.mjs';
import {initializeLoginHistory,registerLoginHistoryRoutes} from './user-login-history.mjs';
import {parseIndiaRequestDateTime} from './request-time.mjs';
import {REQUEST_TIMELINE_FIELDS,parseRequestTimelineTimestamp,requestExpectedCompletionValue,validateRequestTimelineChange,buildRequestTimelineChanges,requestTimelineEvents,requestTimelineDurations} from './request-timeline.mjs';
import {hashPassword,initializeUserCredentials,publicUserRecord,verifyPassword} from './password-auth.mjs';
import {generatePasswordResetOtp,PASSWORD_RESET_MAX_ATTEMPTS,PASSWORD_RESET_MAX_REQUESTS_PER_HOUR,PASSWORD_RESET_OTP_TTL_MINUTES,passwordResetValidationError,validPasswordResetOtp} from './password-reset.mjs';
import {equipmentIdentity} from './equipment-identity.mjs';
import {mergePrivilegeRecords} from './privilege-record.mjs';
import {generalUserCanAccessMenu,loginRecordCandidates,normalizeUserAccessLabels,resolveMobileAccess,userLoginCandidates} from './mobile-access.mjs';
import {REQUEST_CLOSE_STATUSES,requestDateTimeValue,validMeterEvidenceDataUrl,validMeterReading,validMeterReadings,validRequestAudioDataUrl,validTripCardImageDataUrl} from './request-workflow.mjs';
import {validComplaintMedia} from './complaint-media.mjs';
import {accessAllows,managerRoleSelection,masterAccessAllows} from './admin-access.mjs';
import {JSON_BODY_CONTENT_TYPES} from './request-body-transport.mjs';
import {normalizeMobileNavigationVisibility} from './navigation-visibility.mjs';
import {TICKET_CATEGORIES,managerUserRole,ticketReference,validTicketMediaDataUrl} from './ticket-workflow.mjs';
import {oracleConfigured,oracleDriverLookup,oracleEquipmentMasterRecords,oracleEquipmentTransfers,oracleHealth} from './oracle-db.mjs';
import {transferSyncDate} from './transfer-sync-date.mjs';
import {applyLatestTransfer,equipmentMatchKeys,isAllowedOracleEquipment,latestTransferByEquipment,oracleEquipmentMasterRecord,transferMasterRecord} from './equipment-transfer-sync.mjs';
import {sendTicketRaisedEmail} from './ticket-email.mjs';
import {MAX_TRANSLATION_CHARS,normalizeLanguage,translationCacheKey,translatorFromEnvironment} from './text-translation.mjs';
import {ANNOUNCEMENT_ACTIVE_DAYS,announcementReaderKey,announcementValidationError,normalizeAnnouncement} from './announcement.mjs';
import {normalizeSavedReportName,savedReportUserKey,savedReportValidationError,serializeTableView} from './src/saved-reports.mjs';
import {sendDirectorReportEmail} from './director-report-email.mjs';
import {auditLogExportDue,auditLogExportSlot,sendAuditLogExportEmail} from './audit-log-export.mjs';
import {buildUserActivitySummary,totalUserWorkedMinutes} from './user-activity-report.mjs';
import {applyHierarchyDeliveryRule,applyUserReportScheduleOverride,defaultHierarchyReportScheduleSettings,flowDesignationForUser,HIERARCHY_REPORT_DESIGNATIONS,normalizeHierarchyReportScheduleSettings,normalizeUserReportSchedule,reportsAssignedToDesignation,reportsDueForDesignation,reportsForHierarchyEvent,userReportScheduleValidationError} from './hierarchy-report-flow.mjs';
import {hierarchyAccessAllowsReport} from './hierarchy-report-catalogue.mjs';
import {hierarchyRecipientReportScope} from './hierarchy-report-scope.mjs';
import {prepareTicketReportRows,ticketReportWindow,buildTicketReportTable,buildTicketWhatsAppReport} from './ticket-consolidated-report.mjs';
import {scheduledReportWindowsDue} from './report-delivery-window.mjs';
import {siteReportMessageContext,recipientReportMessage} from './whatsapp-message-format.mjs';
import {META_WORKFLOW_TEMPLATES,metaWhatsAppStatus,registerMetaWhatsAppPhone,sendMetaWhatsAppDocument,sendMetaWhatsAppTemplate,sendMetaWhatsAppText,submitMetaWhatsAppTemplates,metaWhatsAppTemplateStatuses,setWhatsAppDeliveryPolicyReader} from './meta-whatsapp.mjs';
import {normalizeWhatsAppReportSettings,whatsappPurposeEnabled,PURPOSE_OPTIONS} from './whatsapp-report-settings.mjs';
import {requestedReportTemplate,reportTemplateFallback} from './whatsapp-template-runtime.mjs';
import {hierarchyReportMessagePurpose} from './whatsapp-template-catalog.mjs';
import {registerWhatsAppReportSettingsApi,reportTemplateState} from './whatsapp-report-settings-api.mjs';
import {canonicalSiteName,assignedUserSiteName,userSessionLocationName} from './site-location.mjs';
import {normalizeSessionMessage,sessionMessagePayloadValidationError} from './session-message.mjs';
import {BACKUP_FORMAT,backupFileName,exportDatabase,readBackupRecords,restoreDatabase} from './database-backup.mjs';
import {BACKUP_SETTING_KEY,DEFAULT_BACKUP_SETTINGS,indiaBackupSlot,normalizeBackupSettings,scheduledBackupDue} from './backup-settings.mjs';
import {dashboardFleetSnapshot} from './dashboard-fleet-snapshot.mjs';
import {REGION_DATA,displaySiteName,displaySiteSelection,managerReportScope,normalizeOperationalSiteFields,normalizeUserSiteFields,reportScopeIncludesSite,userSiteScope,userSiteSelection} from './region-scope.mjs';
import {attachRequestOems,consolidatedReportDue,consolidatedReportWindow,prepareConsolidatedRows} from './consolidated-whatsapp-report.mjs';
import {buildFleetConsolidatedReportPdf,buildTicketConsolidatedReportPdf} from './consolidated-report-pdf.mjs';
import {buildTableExportPdf,buildTableBundlePdf} from './table-export-pdf.mjs';
import {buildDirectorReportArchiveBuffer,buildDirectorReportTables,buildDirectorWhatsAppMessage,buildXlsxWorkbookBuffer,buildXlsxReportBundleBuffer,directorReportFilename,directorReportWindow,DIRECTOR_REPORT_TITLES} from './director-report-bundle.mjs';
import {buildSiteFleetReportTables,buildSiteReportMessage,reportSites,siteReportFilename,timestampInReportWindow} from './site-consolidated-report.mjs';
import {ADMIN_LOCK_TICKET_CUTOFF,ADMIN_LOCK_POLICY_PAUSED,isLockableAdmin,isTrueSuperAdmin} from './admin-lock-policy.mjs';
import {activeRequestConflictMessage,isActiveMaintenanceRequest} from './request-conflict.mjs';
import {auditChangedFields,auditDateRange,auditIndiaDateKey,auditRouteDetails,auditSafeError,auditShouldRecord,auditSubmittedFields} from './audit-trail.mjs';
import {duplicateUsername} from './user-username.mjs';
import {canReadDashboardEquipment,currentDashboardUserCandidate,dashboardEquipmentScope,dashboardEquipmentScopeIsUsable,dashboardSessionFromProfile,scopeDashboardEquipmentRecords} from './dashboard-equipment-access.mjs';
import {infoPulseRequestScope,scopeInfoPulseRequests} from './info-pulse-scope.mjs';
import {claimInfoPulsePrompt,infoPulsePromptKey} from './info-pulse-prompt.mjs';
import {isExcludedWorkflowWhatsAppRecipient,isWorkflowWhatsAppRecipient,isWhatsAppAllAlertRecipient,isWhatsAppReportsOnlyRecipient,whatsAppRecipientRole,workflowReminderSlot,workflowRequestLink,workflowWhatsAppRecipientLogins} from './whatsapp-workflow-policy.mjs';
import {DELAYED_REASON_DEFAULTS,delayedReasonRequired} from './delayed-reason.mjs';
// Keep globally excluded request owners out of every server-backed view and report.
import {requestsVisibleGlobally,requestsVisibleToSession} from './mis-request-visibility.mjs';
import {serverErrorHandler} from './server-error-response.mjs';
import {VEHICLE_TRANSFER_STATUS,applyAcceptedVehicleTransfer,transferMatchesEquipment,vehicleTransferAuditDetails,vehicleTransferStatus,vehicleTransferValidationError} from './vehicle-transfer-workflow.mjs';
import {legacyEtcRepairPlan,legacyEtcRepairReason} from './legacy-etc-repair.mjs';
import {SHIFT_MASTER_DEFAULTS,normalizeShiftRecord,shiftIdentity} from './shift-master.mjs';
import {REQUEST_CORRECTION_STATUS,REQUEST_CORRECTION_TYPES,normalizeRequestCorrectionChanges,requestCorrectionChangedFields,requestCorrectionFields,requestCorrectionSnapshot,requestCorrectionTimelineFields,requestCorrectionType,requestCorrectionTypesForRole,requestCorrectionValidationError} from './request-correction-policy.mjs';
import {jsonEntityTag,requestEtagMatches} from './response-etag.mjs';

const {Pool}=pg;
const app=express();
// Azure Front Door / App Service terminate TLS and proxy to Node. Without this
// every visitor shares the proxy's address, so per-IP limits (password reset
// OTP requests) fired for the whole site instead of one user.
app.set('trust proxy',true);
app.use(compression({threshold:1024}));
const port=Number(process.env.PORT||3000);
const root=path.dirname(fileURLToPath(import.meta.url));
const backupStorageRoot=path.resolve(process.env.BACKUP_STORAGE_ROOT||(
  process.platform==='win32'?path.join(root,'backups'):'/home/data/bdms-backups'
));
const backupImportRoot=path.join(os.tmpdir(),'bdms-backup-imports');
const pendingBackupImports=new Map();
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

function sendPrivateJson(req,res,namespace,payload){
  const body=JSON.stringify(payload);
  const etag=jsonEntityTag(namespace,body);
  res.set('Cache-Control','private, no-store');
  res.set('ETag',etag);
  res.set('X-Payload-Bytes',String(Buffer.byteLength(body)));
  res.vary('Authorization');
  if(requestEtagMatches(req.get('If-None-Match'),etag))return res.status(304).end();
  return res.type('application/json').send(body);
}

function sendDataUrlMedia(res,data,{name='attachment',fallbackType='application/octet-stream'}={}){
  const match=String(data||'').match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match)return res.status(404).json({error:'This media is not available.'});
  const type=String(match[1]||fallbackType).trim().toLowerCase();
  const safeName=String(name||'attachment').replace(/[^a-z0-9._ ()-]+/gi,'_').slice(0,180)||'attachment';
  const body=Buffer.from(match[2],'base64');
  res.set('Cache-Control','private, no-store');
  res.set('Content-Disposition',`inline; filename="${safeName.replaceAll('"','')}"`);
  res.set('X-Content-Type-Options','nosniff');
  res.vary('Authorization');
  return res.type(type).send(body);
}
const connectionString=process.env.DATABASE_URL;
const databaseSsl=String(process.env.DATABASE_SSL||'').trim().toLowerCase()==='false'?false:{rejectUnauthorized:false};
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
  ssl:databaseSsl,
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

// Personal report schedules are stored one row per user, keyed by the same login the
// hierarchy sender uses, so a user's customisation never rewrites the shared role default.
const USER_REPORT_SCHEDULE_SETTING_PREFIX='hierarchy_report_schedule:user:';
function reportRecipientLogin(user={}){return String(user.login||user.employee||user.name||'').trim().toLowerCase()}
function userReportScheduleSettingKey(login){return `${USER_REPORT_SCHEDULE_SETTING_PREFIX}${String(login||'').trim().toLowerCase()}`}
async function storedUserReportSchedule(login){
  if(!String(login||'').trim())return null;
  const {rows}=await pool.query('SELECT setting_value,updated_at FROM app_settings WHERE setting_key=$1',[userReportScheduleSettingKey(login)]);
  return rows.length?{...rows[0].setting_value,updatedAt:new Date(rows[0].updated_at).toISOString()}:null;
}
async function storedUserReportScheduleOverrides(){
  const {rows}=await pool.query('SELECT setting_key,setting_value FROM app_settings WHERE setting_key LIKE $1',[`${USER_REPORT_SCHEDULE_SETTING_PREFIX}%`]);
  return new Map(rows.map((row)=>[row.setting_key.slice(USER_REPORT_SCHEDULE_SETTING_PREFIX.length),row.setting_value]));
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

async function syncStandardWhatsAppTemplates({submit=false}={}){
  const env=await metaWhatsAppRuntimeEnv();
  if(!env.META_WHATSAPP_BUSINESS_ACCOUNT_ID)return;
  const statuses=submit?await submitMetaWhatsAppTemplates({env}):await metaWhatsAppTemplateStatuses({env});
  const checkedAt=new Date().toISOString();
  const approvals=Object.fromEntries(statuses.map(({name,status})=>[name,{status,checkedAt}]));
  await pool.query(`INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ($1,$2::jsonb,NOW())
    ON CONFLICT (setting_key) DO UPDATE SET setting_value=app_settings.setting_value || EXCLUDED.setting_value,updated_at=NOW()`,
    [WHATSAPP_APPROVAL_SETTING_KEY,JSON.stringify(approvals)]);
  return statuses;
}

const auditClean=(value,limit=500)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,limit);
const auditSessionId=(req)=>{
  if(req.auditSessionId)return auditClean(req.auditSessionId,80);
  if(req.auditSessionToken)return createHash('sha256').update(String(req.auditSessionToken)).digest('hex').slice(0,16);
  const token=String(req.headers?.authorization||'').replace(/^Bearer\s+/i,'').trim();
  return token?createHash('sha256').update(token).digest('hex').slice(0,16):'';
};
const auditRole=(session={})=>auditClean(session.permissions?.adminLevel||session.assignedRole||session.userType||session.role||'Unauthenticated',100);
const auditTargetReference=(req)=>auditClean(req.params?.reference||req.params?.id||req.body?.reference||req.body?.username||'',160);
const auditIpAddress=(req)=>auditClean(String(req.headers?.['x-forwarded-for']||'').split(',')[0]||req.ip||req.socket?.remoteAddress,100);
const AUDIT_VISIBLE_SCOPE_SQL=`TRUE`;
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

async function appendScheduledBackupAudit(event={}){
  const request={
    method:'SYSTEM',path:'/system/backups/scheduled',headers:{},body:{},params:{},
    session:{login:'system',name:'Automatic schedule',assignedRole:'System'},socket:{},get:()=>'',
  };
  await appendAuditEvent(request,{
    eventType:'Administration',module:'Backup',action:'Create scheduled backup',
    targetType:'Database backup',actorLogin:'system',actorName:'Automatic schedule',actorRole:'System',
    changedFields:[],...event,
  });
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
      ADD COLUMN IF NOT EXISTS complaint_language TEXT NOT NULL DEFAULT '';
    ALTER TABLE maintenance_requests
      ADD COLUMN IF NOT EXISTS maintenance_work_language TEXT NOT NULL DEFAULT '';
    CREATE TABLE IF NOT EXISTS text_translations (
      cache_key TEXT PRIMARY KEY,
      source_language TEXT NOT NULL,
      target_language TEXT NOT NULL,
      source_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
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
      ADD COLUMN IF NOT EXISTS complaint_media JSONB NOT NULL DEFAULT '[]'::jsonb;
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
    CREATE TABLE IF NOT EXISTS request_corrections (
      id BIGSERIAL PRIMARY KEY,
      request_reference TEXT NOT NULL REFERENCES maintenance_requests(reference) ON DELETE RESTRICT,
      site TEXT NOT NULL,
      correction_type TEXT NOT NULL,
      original_values JSONB NOT NULL DEFAULT '{}'::jsonb,
      proposed_changes JSONB NOT NULL DEFAULT '{}'::jsonb,
      reason TEXT NOT NULL,
      evidence_data TEXT NOT NULL,
      evidence_name TEXT NOT NULL,
      evidence_type TEXT NOT NULL DEFAULT 'image/jpeg',
      status TEXT NOT NULL DEFAULT 'Pending PM approval',
      requested_by_login TEXT NOT NULL,
      requested_by_name TEXT NOT NULL,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_by_login TEXT NOT NULL DEFAULT '',
      reviewed_by_name TEXT NOT NULL DEFAULT '',
      reviewed_at TIMESTAMPTZ,
      review_remark TEXT NOT NULL DEFAULT '',
      applied_by_login TEXT NOT NULL DEFAULT '',
      applied_by_name TEXT NOT NULL DEFAULT '',
      applied_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS request_corrections_request_idx ON request_corrections (request_reference,requested_at DESC);
    CREATE INDEX IF NOT EXISTS request_corrections_status_idx ON request_corrections (status,site,requested_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS request_corrections_open_idx ON request_corrections (request_reference,correction_type)
      WHERE status IN ('Pending PM approval','Approved');
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
    CREATE TABLE IF NOT EXISTS user_session_activity (
      session_id TEXT PRIMARY KEY,
      actor_login TEXT NOT NULL DEFAULT '',
      actor_name TEXT NOT NULL DEFAULT '',
      actor_role TEXT NOT NULL DEFAULT '',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active_seconds BIGINT NOT NULL DEFAULT 0,
      ip_address TEXT NOT NULL DEFAULT '',
      device_id TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS user_session_activity_login_idx ON user_session_activity (actor_login,last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS user_session_activity_seen_idx ON user_session_activity (last_seen_at DESC);
    CREATE TABLE IF NOT EXISTS info_pulse_prompts (
      login TEXT PRIMARY KEY,
      shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS session_messages (
      id BIGSERIAL PRIMARY KEY,
      target_session_public_id TEXT NOT NULL,
      target_login TEXT NOT NULL DEFAULT '',
      target_name TEXT NOT NULL DEFAULT '',
      sender_login TEXT NOT NULL DEFAULT '',
      sender_name TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      dismissed_at TIMESTAMPTZ
    );
    ALTER TABLE session_messages ADD COLUMN IF NOT EXISTS audio_data TEXT NOT NULL DEFAULT '';
    CREATE INDEX IF NOT EXISTS session_messages_target_idx ON session_messages (target_session_public_id, dismissed_at, created_at);
    CREATE INDEX IF NOT EXISTS session_messages_created_idx ON session_messages (created_at DESC);
    CREATE TABLE IF NOT EXISTS announcements (
      id BIGSERIAL PRIMARY KEY,
      message TEXT NOT NULL,
      sender_login TEXT NOT NULL DEFAULT '',
      sender_name TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      withdrawn_at TIMESTAMPTZ,
      withdrawn_by TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS announcement_acknowledgements (
      announcement_id BIGINT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      reader_key TEXT NOT NULL,
      reader_name TEXT NOT NULL DEFAULT '',
      acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (announcement_id, reader_key)
    );
    CREATE INDEX IF NOT EXISTS announcements_active_idx ON announcements (withdrawn_at, created_at DESC);
    CREATE TABLE IF NOT EXISTS saved_table_reports (
      id BIGSERIAL PRIMARY KEY,
      user_key TEXT NOT NULL,
      report_key TEXT NOT NULL,
      name TEXT NOT NULL,
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_key, report_key, name)
    );
    CREATE TABLE IF NOT EXISTS remote_assistance_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      target_session_public_id TEXT NOT NULL,
      target_login TEXT NOT NULL DEFAULT '',
      target_name TEXT NOT NULL DEFAULT '',
      requester_login TEXT NOT NULL DEFAULT '',
      requester_name TEXT NOT NULL DEFAULT '',
      access_level TEXT NOT NULL DEFAULT 'control',
      reason TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 15,
      status TEXT NOT NULL DEFAULT 'Pending',
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      responded_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS remote_assistance_target_idx ON remote_assistance_sessions (target_session_public_id, requested_at DESC);
    CREATE INDEX IF NOT EXISTS remote_assistance_requester_idx ON remote_assistance_sessions (requester_login, requested_at DESC);
    CREATE TABLE IF NOT EXISTS remote_assistance_event_batches (
      id BIGSERIAL PRIMARY KEY,
      assistance_id UUID NOT NULL REFERENCES remote_assistance_sessions(id) ON DELETE CASCADE,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS remote_assistance_events_idx ON remote_assistance_event_batches (assistance_id, id);
    CREATE TABLE IF NOT EXISTS remote_assistance_commands (
      id BIGSERIAL PRIMARY KEY,
      assistance_id UUID NOT NULL REFERENCES remote_assistance_sessions(id) ON DELETE CASCADE,
      command_type TEXT NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS remote_assistance_commands_idx ON remote_assistance_commands (assistance_id, id);
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
      audit_report_short_code TEXT NOT NULL DEFAULT '',
      user_activity_report_short_code TEXT NOT NULL DEFAULT '',
      exported_event_count INTEGER NOT NULL DEFAULT 0,
      purged_event_count INTEGER NOT NULL DEFAULT 0,
      mail_confirmed_at TIMESTAMPTZ,
      purged_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE audit_log_export_runs ADD COLUMN IF NOT EXISTS audit_report_short_code TEXT NOT NULL DEFAULT '';
    ALTER TABLE audit_log_export_runs ADD COLUMN IF NOT EXISTS user_activity_report_short_code TEXT NOT NULL DEFAULT '';
    ALTER TABLE audit_log_export_runs ADD COLUMN IF NOT EXISTS exported_event_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE audit_log_export_runs ADD COLUMN IF NOT EXISTS purged_event_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE audit_log_export_runs ADD COLUMN IF NOT EXISTS mail_confirmed_at TIMESTAMPTZ;
    ALTER TABLE audit_log_export_runs ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;
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
    CREATE TABLE IF NOT EXISTS backup_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      file_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Running',
      trigger_type TEXT NOT NULL DEFAULT 'Manual',
      schedule_slot TEXT,
      storage_path TEXT NOT NULL DEFAULT '',
      size_bytes BIGINT NOT NULL DEFAULT 0,
      checksum TEXT NOT NULL DEFAULT '',
      table_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by_login TEXT NOT NULL DEFAULT '',
      created_by_name TEXT NOT NULL DEFAULT '',
      error_message TEXT NOT NULL DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 1,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS backup_runs_started_at_idx ON backup_runs (started_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS backup_runs_schedule_slot_idx
      ON backup_runs (schedule_slot) WHERE schedule_slot IS NOT NULL;
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
  await initializeLoginHistory(pool);
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
    const {rows:shiftSeed}=await client.query("SELECT value FROM app_metadata WHERE key='shift_master_defaults_seeded_v1' FOR UPDATE");
    if(!shiftSeed.length){
      for(const defaultRecord of SHIFT_MASTER_DEFAULTS){
        const record=normalizeOperationalSiteFields(normalizeShiftRecord(defaultRecord));
        await client.query(`INSERT INTO master_records (master_name,record_data) VALUES ('Shift Master',$1::jsonb)`,[JSON.stringify(record)]);
      }
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('shift_master_defaults_seeded_v1','true',NOW())
        ON CONFLICT (key) DO NOTHING`);
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
    // Remove the legacy standalone "Sasti" location from every persisted
    // operational source. This uses a new marker because earlier deployments
    // only rewrote Majri in request and CRM tables.
    const {rows:sastiSitesNormalized}=await client.query("SELECT value FROM app_metadata WHERE key='sasti_site_name_normalized_v1' FOR UPDATE");
    if(!sastiSitesNormalized.length){
      const {rows:masterRows}=await client.query('SELECT id,master_name,record_data FROM master_records FOR UPDATE');
      for(const row of masterRows){
        const normalized=row.master_name==='Users & employees'
          ? normalizeUserSiteFields(row.record_data)
          : normalizeOperationalSiteFields(row.record_data);
        if(JSON.stringify(normalized)!==JSON.stringify(row.record_data))
          await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(normalized),row.id]);
      }
      await client.query("UPDATE maintenance_requests SET site='Sasti OB' WHERE regexp_replace(lower(trim(site)),'[^a-z0-9]+','','g') IN ('sasti','sastiii','sastiob')");
      await client.query("UPDATE crm_tickets SET site='Sasti OB' WHERE regexp_replace(lower(trim(site)),'[^a-z0-9]+','','g') IN ('sasti','sastiii','sastiob')");
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('sasti_site_name_normalized_v1','true',NOW())
        ON CONFLICT (key) DO NOTHING`);
    }
    // "Jayant OB 2nd" was merged into "Jayant OB" (NCL now has three sites).
    // One-time rewrite of every stored location so old records, users, region
    // rows, hierarchy site ticks, requests and CRM tickets all sit under
    // "Jayant OB". Unrecognised values are kept exactly as entered.
    const {rows:jayantSitesMerged}=await client.query("SELECT value FROM app_metadata WHERE key='jayant_ob_sites_merged_v1' FOR UPDATE");
    if(!jayantSitesMerged.length){
      const {rows:masterRows}=await client.query('SELECT id,master_name,record_data FROM master_records FOR UPDATE');
      for(const row of masterRows){
        const normalized=row.master_name==='Users & employees'
          ? normalizeUserSiteFields(row.record_data)
          : normalizeOperationalSiteFields(row.record_data);
        for(const key of ['sites','siteAccess']){
          if(typeof normalized[key]==='string'&&normalized[key].trim())normalized[key]=displaySiteSelection(normalized[key]).join(' | ');
        }
        if(JSON.stringify(normalized)!==JSON.stringify(row.record_data))
          await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify(normalized),row.id]);
      }
      for(const table of ['maintenance_requests','crm_tickets','request_corrections'])
        await client.query(`UPDATE ${table} SET site='Jayant OB' WHERE regexp_replace(lower(trim(site)),'[^a-z0-9]+','','g') IN ('jayantob2nd','jayant2nd','jayantob2','jayantii','jayantobii')`);
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('jayant_ob_sites_merged_v1','true',NOW())
        ON CONFLICT (key) DO NOTHING`);
    }
    // Repair the legacy ETC values that were saved before the future-only
    // selector and server guard existed. Exact AM/PM inversions retain the
    // intended clock time. Every other impossible value moves to the first
    // full minute after the breakdown, which is the approved deterministic
    // fallback. Each correction is recorded in the request timeline.
    const {rows:legacyEtcRepairMarker}=await client.query("SELECT value FROM app_metadata WHERE key='legacy_etc_backdates_repaired_v1' FOR UPDATE");
    if(!legacyEtcRepairMarker.length){
      const {rows:invalidEtcRows}=await client.query(`SELECT id,reference,started_at,expected_completion_at
        FROM maintenance_requests
        WHERE expected_completion_at IS NOT NULL AND expected_completion_at<=started_at
        ORDER BY id ASC FOR UPDATE`);
      const repairCounts={corrected:0,amPmInversion:0,firstValidMinute:0};
      for(const row of invalidEtcRows){
        const plan=legacyEtcRepairPlan(row.started_at,row.expected_completion_at);
        if(!plan)continue;
        const result=await client.query(`UPDATE maintenance_requests SET expected_completion_at=$1
          WHERE id=$2 AND started_at=$3 AND expected_completion_at=$4 RETURNING id`,
          [plan.after,row.id,row.started_at,row.expected_completion_at]);
        if(!result.rowCount)continue;
        const reason=legacyEtcRepairReason(plan.strategy);
        const changes=buildRequestTimelineChanges(
          {expectedCompletionAt:plan.before},
          {expectedCompletionAt:plan.after},
          {events:['expectedCompletionAt'],sources:{expectedCompletionAt:'system'},now:new Date(),actorLogin:'system',actorName:'System migration',reason,requireCorrectionReason:['expectedCompletionAt']},
        ).map(change=>({...change,requestId:String(row.id),repairStrategy:plan.strategy}));
        await client.query(`INSERT INTO audit_events (event_type,outcome,actor_login,actor_name,actor_role,module,action,target_type,target_reference,reason,changed_fields)
          VALUES ('Workflow timeline','Success','system','System migration','System','Maintenance Requests','Record workflow timestamps','Maintenance request',$1,$2,$3::jsonb)`,
          [row.reference,reason,JSON.stringify(changes)]);
        repairCounts.corrected+=1;
        if(plan.strategy==='am-pm-inversion')repairCounts.amPmInversion+=1;
        else repairCounts.firstValidMinute+=1;
      }
      await client.query(`INSERT INTO app_metadata (key,value,updated_at)
        VALUES ('legacy_etc_backdates_repaired_v1',$1,NOW())
        ON CONFLICT (key) DO NOTHING`,[JSON.stringify(repairCounts)]);
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
    if(!auditShouldRecord(req.method,req.path,{statusCode:res.statusCode}))return;
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

// Audit Trail housekeeping for Admin and Super Admin: permanently delete the
// entries recorded more than N days ago (N >= 1, so today's activity always
// stays). /api/audit-events is outside the automatic audit middleware, so the
// purge itself is written to the Audit Trail here with the count removed.
const AUDIT_PURGE_MAX_DAYS=3650;
// The deletion window for the housekeeping routes: either `olderThanDays`
// (1..3650) or `upToDate` (YYYY-MM-DD, an India calendar day, deleted
// inclusively). Today can never be chosen, so the current day always stays.
function housekeepingCutoff(source={},noun='records'){
  const upToDate=String(source.upToDate||'').trim();
  if(upToDate){
    const start=Date.parse(`${upToDate}T00:00:00+05:30`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(upToDate)||Number.isNaN(start))return {error:'Select a valid date (YYYY-MM-DD).'};
    if(upToDate>=auditIndiaDateKey())return {error:`Select a date before today. Today's ${noun} are never deleted.`};
    const cutoff=new Date(start+86400000);
    return {cutoff,label:`Up to ${formatDisplayDate(new Date(start))}`,fields:[{field:'Up to date (inclusive)',before:'',after:upToDate}],window:{upToDate}};
  }
  const days=Number(source.olderThanDays);
  if(!Number.isInteger(days)||days<1||days>AUDIT_PURGE_MAX_DAYS)return {error:`Enter how many days of ${noun} to keep (1 to ${AUDIT_PURGE_MAX_DAYS}), or a date to delete up to.`};
  return {cutoff:new Date(Date.now()-days*86400000),label:`Older than ${days} day${days===1?'':'s'}`,fields:[{field:'Older than (days)',before:'',after:String(days)}],window:{olderThanDays:days}};
}
app.delete('/api/audit-events',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const {error,cutoff,label,fields,window}=housekeepingCutoff({...(req.body||{}),...req.query},'Audit Trail');
    if(error)return res.status(400).json({error});
    const {rowCount}=await pool.query('DELETE FROM audit_events WHERE occurred_at<$1',[cutoff.toISOString()]);
    const deleted=Number(rowCount||0);
    await appendAuditEvent(req,{
      eventType:'Administration',module:'Audit Trail',action:'Delete old audit logs',targetType:'Audit Trail',
      targetReference:label,
      reason:`Deleted ${deleted} audit entr${deleted===1?'y':'ies'} recorded before ${formatDisplayDateTime(cutoff)}`,
      changedFields:[...fields,{field:'Entries deleted',before:'',after:String(deleted)}],
      statusCode:200,
    });
    res.set('Cache-Control','no-store');
    res.json({deleted,...window,cutoff:cutoff.toISOString()});
  }catch(error){next(error)}
});

// User activity housekeeping: delete login history and session activity rows
// whose last activity is more than N days old (N >= 1). Live sessions keep a
// recent last_seen_at, so they are never touched. The automatic audit
// middleware records this call; req.audit adds the counts removed.
app.delete('/api/user-login-history',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const {error,cutoff,label,fields,window}=housekeepingCutoff({...(req.body||{}),...req.query},'user activity');
    if(error)return res.status(400).json({error});
    const client=await pool.connect();
    let deletedHistory=0,deletedActivity=0;
    try{
      await client.query('BEGIN');
      const history=await client.query('DELETE FROM user_login_history WHERE last_seen_at<$1',[cutoff.toISOString()]);
      const activity=await client.query('DELETE FROM user_session_activity WHERE last_seen_at<$1',[cutoff.toISOString()]);
      deletedHistory=Number(history.rowCount||0);deletedActivity=Number(activity.rowCount||0);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
    finally{client.release()}
    req.audit={eventType:'Administration',module:'User activity',action:'Delete old user activity',targetType:'User activity',
      targetReference:label,
      reason:`Deleted ${deletedHistory} login history and ${deletedActivity} session activity record(s) last active before ${formatDisplayDateTime(cutoff)}`,
      changedFields:[...fields,{field:'Login history deleted',before:'',after:String(deletedHistory)},{field:'Session activity deleted',before:'',after:String(deletedActivity)}]};
    res.set('Cache-Control','no-store');
    res.json({deleted:deletedHistory+deletedActivity,deletedLoginHistory:deletedHistory,deletedSessionActivity:deletedActivity,...window,cutoff:cutoff.toISOString()});
  }catch(error){next(error)}
});

// Automatic log clean-up. Once per India calendar day (and at the first check
// after a deploy) the job keeps only the configured number of days of Audit
// Trail entries and, when enabled, of user activity. 0 turns a part off.
// Defaults: Audit Trail 5 days, user activity off.
const LOG_RETENTION_SETTING_KEY='log_retention';
const LOG_RETENTION_DEFAULTS=Object.freeze({auditDays:5,activityDays:0});
const retentionDays=(value)=>{const days=Number(value);return Number.isInteger(days)&&days>=0&&days<=AUDIT_PURGE_MAX_DAYS?days:null;};
async function storedLogRetention(){
  const {rows}=await pool.query('SELECT setting_value,updated_at FROM app_settings WHERE setting_key=$1',[LOG_RETENTION_SETTING_KEY]);
  const stored=rows[0]?.setting_value||{};
  const {rows:last}=await pool.query("SELECT value,updated_at FROM app_metadata WHERE key='log_retention_last_run'");
  return {
    auditDays:retentionDays(stored.auditDays)??LOG_RETENTION_DEFAULTS.auditDays,
    activityDays:retentionDays(stored.activityDays)??LOG_RETENTION_DEFAULTS.activityDays,
    updatedAt:rows[0]?.updated_at||null,updatedBy:String(stored.updatedBy||''),
    lastRunDate:last[0]?.value||'',lastRunAt:last[0]?.updated_at||null,maxDays:AUDIT_PURGE_MAX_DAYS,
  };
}
let logRetentionRunning=false;
async function runLogRetention(now=new Date()){
  if(logRetentionRunning)return {skipped:true,reason:'already running'};
  logRetentionRunning=true;
  try{
    const retention=await storedLogRetention();
    if(!retention.auditDays&&!retention.activityDays)return {skipped:true,reason:'automatic clean-up is off'};
    const todayKey=auditIndiaDateKey(now);
    if(retention.lastRunDate===todayKey)return {skipped:true,reason:'already ran today'};
    const result={date:todayKey,auditDays:retention.auditDays,activityDays:retention.activityDays,auditDeleted:0,loginHistoryDeleted:0,sessionActivityDeleted:0};
    if(retention.auditDays){
      const cutoff=new Date(now.getTime()-retention.auditDays*86400000).toISOString();
      const {rowCount}=await pool.query('DELETE FROM audit_events WHERE occurred_at<$1',[cutoff]);
      result.auditDeleted=Number(rowCount||0);
    }
    if(retention.activityDays){
      const cutoff=new Date(now.getTime()-retention.activityDays*86400000).toISOString();
      const history=await pool.query('DELETE FROM user_login_history WHERE last_seen_at<$1',[cutoff]);
      const activity=await pool.query('DELETE FROM user_session_activity WHERE last_seen_at<$1',[cutoff]);
      result.loginHistoryDeleted=Number(history.rowCount||0);result.sessionActivityDeleted=Number(activity.rowCount||0);
    }
    await pool.query(`INSERT INTO app_metadata (key,value,updated_at) VALUES ('log_retention_last_run',$1,NOW())
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value,updated_at=NOW()`,[todayKey]);
    return result;
  }finally{logRetentionRunning=false}
}
app.get('/api/log-retention',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{res.set('Cache-Control','no-store');res.json(await storedLogRetention());}catch(error){next(error)}
});
app.put('/api/log-retention',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const auditDays=retentionDays(req.body?.auditDays),activityDays=retentionDays(req.body?.activityDays);
    if(auditDays==null||activityDays==null)return res.status(400).json({error:`Enter whole numbers of days from 0 (off) to ${AUDIT_PURGE_MAX_DAYS}.`});
    const before=await storedLogRetention();
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ($1,$2::jsonb,NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`,
      [LOG_RETENTION_SETTING_KEY,JSON.stringify({auditDays,activityDays,updatedBy:String(req.session?.login||'')})]);
    // A changed setting applies at the next check today, not tomorrow.
    await pool.query("DELETE FROM app_metadata WHERE key='log_retention_last_run'");
    req.audit={eventType:'Configuration',module:'Audit Trail',action:'Update automatic log clean-up',targetType:'Log retention',
      targetReference:`Audit Trail ${auditDays?`${auditDays} days`:'off'} · user activity ${activityDays?`${activityDays} days`:'off'}`,
      changedFields:[{field:'Audit Trail days kept',before:String(before.auditDays),after:String(auditDays)},{field:'User activity days kept',before:String(before.activityDays),after:String(activityDays)}]};
    res.set('Cache-Control','no-store');
    res.json(await storedLogRetention());
  }catch(error){next(error)}
});

// The preferred language chosen at sign-in is remembered on the user record so
// speech input and complaint translation follow it on every device.
app.post('/api/preferred-language',requireSession,async(req,res,next)=>{
  try{
    const language=normalizeLanguage(req.body?.preferredLanguage);
    const secondary=normalizeLanguage(req.body?.secondaryLanguage);
    if(!language)return res.status(400).json({error:'Choose a supported language as Language 1.'});
    if(secondary&&secondary===language)return res.status(400).json({error:'Language 2 must differ from Language 1.'});
    const login=String(req.session.login||'').trim().toLowerCase();
    const name=String(req.session.name||'').trim().toLowerCase();
    const {rows}=await pool.query(`SELECT id,record_data FROM master_records
      WHERE master_name='Users & employees' AND (
        ($1 <> '' AND lower(trim(record_data->>'login'))=$1) OR
        ($2 <> '' AND lower(trim(record_data->>'employee'))=$2)
      ) ORDER BY CASE WHEN lower(trim(record_data->>'login'))=$1 THEN 0 ELSE 1 END,created_at DESC LIMIT 1`,[login,name]);
    const row=rows[0];
    if(row&&(normalizeLanguage(row.record_data?.preferredLanguage)!==language||normalizeLanguage(row.record_data?.secondaryLanguage)!==secondary)){
      await pool.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2',[JSON.stringify({...row.record_data,preferredLanguage:language,secondaryLanguage:secondary}),row.id]);
    }
    res.json({preferredLanguage:language,secondaryLanguage:secondary,saved:Boolean(row)});
  }catch(error){next(error)}
});

// Written complaints are translated into the reader's preferred language; the
// original text and audio stay untouched. Results are cached per text/language.
const translatorPromise=translatorFromEnvironment();
app.post('/api/translate',requireSession,async(req,res,next)=>{
  try{
    const text=String(req.body?.text||'').trim();
    const from=normalizeLanguage(req.body?.from),to=normalizeLanguage(req.body?.to);
    if(!text)return res.status(400).json({error:'Text to translate is required.'});
    if(text.length>MAX_TRANSLATION_CHARS)return res.status(400).json({error:`Text longer than ${MAX_TRANSLATION_CHARS} characters cannot be translated.`});
    if(!from||!to)return res.status(400).json({error:'Choose supported source and target languages.'});
    if(from===to)return res.json({text,from,to,translated:false,configured:true});
    const translator=await translatorPromise;
    if(!translator.configured)return res.json({text,from,to,translated:false,configured:false});
    const cacheKey=translationCacheKey(text,from,to);
    const cached=await pool.query('SELECT translated_text FROM text_translations WHERE cache_key=$1',[cacheKey]);
    if(cached.rows.length)return res.json({text:cached.rows[0].translated_text,from,to,translated:true,configured:true,cached:true});
    const result=await translator.translate({text,from,to});
    if(result.translated)await pool.query(`INSERT INTO text_translations (cache_key,source_language,target_language,source_text,translated_text)
      VALUES ($1,$2,$3,$4,$5) ON CONFLICT (cache_key) DO NOTHING`,[cacheKey,from,to,text,result.text]);
    res.json({text:result.text,from,to,translated:result.translated,configured:true,cached:false});
  }catch(error){
    if(error?.status&&error.status<500)return res.status(error.status).json({error:error.message});
    console.error('Translation failed:',error.message);
    res.status(502).json({error:'The translation service is unavailable right now. The original text is shown instead.'});
  }
});

app.post('/api/user-activity',requireSession,async(req,res,next)=>{
  try{
    const moduleName=auditClean(req.body?.module||'Application',120);
    const action=auditClean(req.body?.action||'Use application',160);
    const targetReference=auditClean(req.body?.targetReference||'',160);
    const reason=auditClean(req.body?.reason||'',500);
    await appendAuditEvent(req,{eventType:'Activity',module:moduleName,action,targetType:'Application view',targetReference,reason,changedFields:[]});
    req.audit=false;
    res.status(204).end();
  }catch(error){next(error)}
});

app.post('/api/exports/pdf',requireSession,async(req,res,next)=>{
  try{
    const title=String(req.body?.title||'Nerve Center report').replace(/\s+/g,' ').trim().slice(0,2000)||'Nerve Center report';
    const requestedColumns=Array.isArray(req.body?.columns)?req.body.columns:[];
    const requestedRows=Array.isArray(req.body?.rows)?req.body.rows:[];
    // Shared tables already send their Sr. No. column; it does not count against the data-column limit.
    const dataColumnCount=requestedColumns.length-(String(requestedColumns[0]?.label??'').trim()==='Sr. No.'?1:0);
    if(dataColumnCount<1||dataColumnCount>24)return res.status(400).json({error:'Select between 1 and 24 report columns.'});
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
    preferredLanguage:normalizeLanguage(employee.preferredLanguage)||'en',
    secondaryLanguage:normalizeLanguage(employee.secondaryLanguage)||'',
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
  const adminLevel=String(req.session?.permissions?.adminLevel||'').trim().toLowerCase();
  if(req.session?.role==='super'&&['admin','super admin'].includes(adminLevel))return next();
  return res.status(403).json({error:'Only an Admin or Super Admin can use this administration feature.'});
}

const REMOTE_ASSISTANCE_LIVE_STATUSES=['Pending','Approved','Active'];
const REMOTE_ASSISTANCE_DURATIONS=new Set([5,10,15]);

function validRemoteAssistanceId(value){
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''));
}

async function expireRemoteAssistanceSessions(){
  const {rows}=await pool.query(`UPDATE remote_assistance_sessions
    SET status='Expired',ended_at=COALESCE(ended_at,NOW())
    WHERE status=ANY($1::text[]) AND expires_at<=NOW()
    RETURNING id`,[REMOTE_ASSISTANCE_LIVE_STATUSES]);
  if(rows.length){
    const ids=rows.map(row=>row.id);
    await Promise.all([
      pool.query('DELETE FROM remote_assistance_event_batches WHERE assistance_id=ANY($1::uuid[])',[ids]),
      pool.query('DELETE FROM remote_assistance_commands WHERE assistance_id=ANY($1::uuid[])',[ids]),
    ]);
  }
  return rows.length;
}

function remoteAssistancePayload(row){
  if(!row)return null;
  return {
    id:row.id,
    status:row.status,
    accessLevel:row.accessLevel,
    reason:row.reason,
    durationMinutes:Number(row.durationMinutes||15),
    requesterLogin:row.requesterLogin,
    requesterName:row.requesterName,
    targetLogin:row.targetLogin,
    targetName:row.targetName,
    requestedAt:row.requestedAt,
    respondedAt:row.respondedAt,
    startedAt:row.startedAt,
    expiresAt:row.expiresAt,
  };
}

function backupFolder(settings=DEFAULT_BACKUP_SETTINGS){
  const folder=path.resolve(backupStorageRoot,normalizeBackupSettings(settings).storageFolder);
  const rootPrefix=`${backupStorageRoot}${path.sep}`;
  if(folder!==backupStorageRoot&&!folder.startsWith(rootPrefix))throw Object.assign(new Error('The backup folder must stay inside protected backup storage.'),{status:400});
  return folder;
}

async function readBackupSettings(){
  const {rows}=await pool.query('SELECT setting_value,updated_at FROM app_settings WHERE setting_key=$1',[BACKUP_SETTING_KEY]);
  return {
    settings:normalizeBackupSettings(rows[0]?.setting_value||DEFAULT_BACKUP_SETTINGS),
    updatedAt:rows[0]?.updated_at||null,
  };
}

async function sha256File(filePath){
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(filePath))hash.update(chunk);
  return hash.digest('hex');
}

async function inspectBackupFile(filePath){
  let header=null;
  let footer=null;
  let currentTable='';
  const actualCounts={};
  for await(const record of readBackupRecords(filePath)){
    if(record.type==='header'){
      if(header)throw new Error('The backup contains more than one header.');
      if(record.format!==BACKUP_FORMAT)throw new Error('This is not a supported BDMS backup file.');
      header=record;
    }else if(record.type==='table'){
      if(!header)throw new Error('The backup file does not begin with a valid header.');
      currentTable=String(record.name||'');
      if(!currentTable)throw new Error('A backup table has no name.');
      actualCounts[currentTable]=0;
    }else if(record.type==='row'){
      if(!currentTable)throw new Error('A backup row appears outside a table.');
      actualCounts[currentTable]=(actualCounts[currentTable]||0)+1;
    }else if(record.type==='table-end'){
      if(String(record.name||'')!==currentTable)throw new Error('A backup table is incomplete.');
      if(Number(record.rowCount)!==actualCounts[currentTable])throw new Error(`Row count mismatch for ${currentTable}.`);
      currentTable='';
    }else if(record.type==='footer')footer=record;
  }
  if(!header)throw new Error('The backup file has no valid header.');
  if(currentTable||!footer)throw new Error('The backup file is incomplete and cannot be restored.');
  for(const [table,count] of Object.entries(footer.tables||{})){
    if(Number(count)!==Number(actualCounts[table]||0))throw new Error(`Footer row count mismatch for ${table}.`);
  }
  return {
    format:header.format,
    version:Number(header.version||1),
    createdAt:header.createdAt||null,
    serverVersion:header.serverVersion||'',
    tables:actualCounts,
    tableCount:Object.keys(actualCounts).length,
    totalRows:Object.values(actualCounts).reduce((total,count)=>total+Number(count||0),0),
  };
}

async function prunePendingBackupImports(now=Date.now()){
  for(const [token,pending] of pendingBackupImports){
    if(pending.expiresAt>=now)continue;
    pendingBackupImports.delete(token);
    await fs.rm(pending.filePath,{force:true}).catch(()=>{});
  }
}

async function createStoredBackup({triggerType='Manual',actor={},scheduleSlot=null,folderOverride='',fileNameOverride=''}={}){
  const {settings}=await readBackupSettings();
  const destination=folderOverride?path.resolve(folderOverride):backupFolder(settings);
  const rootPrefix=`${backupStorageRoot}${path.sep}`;
  if(destination!==backupStorageRoot&&!destination.startsWith(rootPrefix))throw Object.assign(new Error('The backup destination is outside protected backup storage.'),{status:400});
  await fs.mkdir(destination,{recursive:true});
  const fileName=fileNameOverride||backupFileName(new Date(),{prefix:'BDMS-Full-Backup'});
  const filePath=path.join(destination,fileName);
  const insert=await pool.query(`INSERT INTO backup_runs
    (file_name,status,trigger_type,schedule_slot,storage_path,created_by_login,created_by_name,expires_at)
    VALUES ($1,'Running',$2,$3,$4,$5,$6,NOW()+($7::text||' days')::interval)
    ON CONFLICT (schedule_slot) WHERE schedule_slot IS NOT NULL DO UPDATE SET
      file_name=EXCLUDED.file_name,status='Running',storage_path=EXCLUDED.storage_path,
      created_by_login=EXCLUDED.created_by_login,created_by_name=EXCLUDED.created_by_name,
      expires_at=EXCLUDED.expires_at,attempts=backup_runs.attempts+1,error_message='',started_at=NOW(),completed_at=NULL
    WHERE backup_runs.status='Failed'
    RETURNING id`,[
      fileName,triggerType,scheduleSlot,filePath,String(actor.login||''),String(actor.name||triggerType),String(settings.retentionDays)
    ]);
  if(!insert.rowCount)return {skipped:true,reason:'This scheduled backup has already completed.'};
  const id=insert.rows[0].id;
  const client=await pool.connect();
  let locked=false;
  try{
    const {rows:locks}=await client.query("SELECT pg_try_advisory_lock(hashtext('bdms_backup_operation')) AS locked");
    locked=Boolean(locks[0]?.locked);
    if(!locked)throw Object.assign(new Error('Another backup or restore is already running. Try again after it completes.'),{status:409});
    const result=await exportDatabase({client,output:filePath});
    const stat=await fs.stat(filePath);
    const checksum=await sha256File(filePath);
    await pool.query(`UPDATE backup_runs SET status='Completed',size_bytes=$1,checksum=$2,table_counts=$3::jsonb,completed_at=NOW(),error_message=''
      WHERE id=$4`,[stat.size,checksum,JSON.stringify(result.tables),id]);
    return {id,fileName,filePath,sizeBytes:stat.size,checksum,tableCounts:result.tables,status:'Completed'};
  }catch(error){
    await fs.rm(filePath,{force:true}).catch(()=>{});
    await pool.query(`UPDATE backup_runs SET status='Failed',error_message=$1,completed_at=NOW() WHERE id=$2`,[String(error?.message||'Backup failed').slice(0,500),id]).catch(()=>{});
    throw error;
  }finally{
    if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('bdms_backup_operation'))").catch(()=>{});
    client.release();
  }
}

async function pruneStoredBackups(){
  const {settings}=await readBackupSettings();
  const {rows}=await pool.query(`SELECT id,storage_path FROM backup_runs
    WHERE storage_path<>'' AND trigger_type<>'Manual export' AND status='Completed'
    ORDER BY completed_at DESC NULLS LAST,started_at DESC`);
  const expired=rows.slice(settings.maxBackups);
  const rootPrefix=`${backupStorageRoot}${path.sep}`;
  for(const row of expired){
    const target=path.resolve(row.storage_path);
    if(target.startsWith(rootPrefix))await fs.rm(target,{force:true}).catch(()=>{});
    await pool.query("UPDATE backup_runs SET status='Expired',storage_path='' WHERE id=$1",[row.id]);
  }
  const {rows:dated}=await pool.query(`SELECT id,storage_path FROM backup_runs
    WHERE storage_path<>'' AND expires_at<NOW()`);
  for(const row of dated){
    const target=path.resolve(row.storage_path);
    if(target.startsWith(rootPrefix))await fs.rm(target,{force:true}).catch(()=>{});
    await pool.query("UPDATE backup_runs SET status='Expired',storage_path='' WHERE id=$1",[row.id]);
  }
}

let scheduledBackupRunning=false;
async function runScheduledBackup(now=new Date()){
  if(scheduledBackupRunning||!databaseReady)return {skipped:true,reason:'Backup service is busy.'};
  const {settings}=await readBackupSettings();
  if(!scheduledBackupDue(settings,now))return {skipped:true,reason:'No backup is due.'};
  scheduledBackupRunning=true;
  try{
    const slot=indiaBackupSlot(now);
    const result=await createStoredBackup({triggerType:'Scheduled',scheduleSlot:slot.slotKey,actor:{name:'Automatic schedule'}});
    await pruneStoredBackups();
    if(!result.skipped)await appendScheduledBackupAudit({targetReference:result.fileName,reason:`Completed ${result.sizeBytes} bytes; SHA-256 ${result.checksum}`});
    return result;
  }catch(error){
    const safe=auditSafeError(error);
    await appendScheduledBackupAudit({outcome:'Failed',reason:safe.message,errorCode:safe.code});
    throw error;
  }finally{scheduledBackupRunning=false}
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
    const password=String(req.body?.password||'');
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
    if(profile.userType==='Mobile User'&&!profile.assignedRole)return res.status(403).json({error:'This Mobile User does not have an assigned User Group. Set Production User, Maintenance User, MIS User, or General User in Users & employees.'});
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
    req.auditSessionToken=token;
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
    req.auditSessionToken=token;
    res.json(loginPayload({token,profile,employee:{employee:reset.employee_name,preferredLanguage:updated.preferredLanguage,secondaryLanguage:updated.secondaryLanguage},login:reset.login_name}));
  }catch(error){next(error)}
});

async function readSession(req){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  return sessionStore.get(token);
}

function sessionActivityDetails(req){
  return {
    ipAddress:auditIpAddress(req),
    deviceId:auditClean(req.get?.(AUDIT_DEVICE_ID_HEADER),80),
    userAgent:auditClean(req.get?.('user-agent'),500),
  };
}

async function touchUserSessionActivity(req,session={}){
  const sessionId=auditClean(session.sessionId,80);
  if(!sessionId)return;
  const details=sessionActivityDetails(req);
  await pool.query(`INSERT INTO user_session_activity
    (session_id,actor_login,actor_name,actor_role,started_at,last_seen_at,active_seconds,ip_address,device_id,user_agent)
    VALUES ($1,$2,$3,$4,COALESCE($5::timestamptz,NOW()),NOW(),0,$6,$7,$8)
    ON CONFLICT (session_id) DO UPDATE SET
      actor_login=EXCLUDED.actor_login,actor_name=EXCLUDED.actor_name,actor_role=EXCLUDED.actor_role,
      active_seconds=user_session_activity.active_seconds+LEAST(900,GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (NOW()-user_session_activity.last_seen_at)))))::bigint,
      last_seen_at=NOW(),ip_address=EXCLUDED.ip_address,device_id=EXCLUDED.device_id,user_agent=EXCLUDED.user_agent
    WHERE user_session_activity.last_seen_at<=NOW()-INTERVAL '5 seconds'`,[
      sessionId,auditClean(session.login,120),auditClean(session.name,160),auditRole(session),session.created_at||session.createdAt||null,
      details.ipAddress,details.deviceId,details.userAgent,
    ]);
}

async function requireSession(req,res,next){
  try{
    const session=await readSession(req);
    if(!session)return res.status(401).json({error:'Your sign-in has expired. Please sign in again.'});
    req.session=session;
    req.auditSessionId=session.sessionId;
    if(typeof touchUserSessionActivity==='function')void touchUserSessionActivity(req,session).catch(error=>console.error('User session activity could not be recorded:',error.message));
    if(session.assignedRole==='General User'){
      const menu=req.path.startsWith('/api/tickets')?'Tickets'
        :req.path.startsWith('/api/report')?'Reports'
        :req.path==='/api/requests'&&req.method==='GET'
          ?req.query.scope==='dashboard'?'Dashboard':req.query.scope==='reports'?'Reports':'Requests'
        :req.path.startsWith('/api/requests/')||req.path==='/api/oracle/driver'?'Requests':null;
      if(menu&&!generalUserCanAccessMenu(session,menu))return res.status(403).json({error:`You do not have access to ${menu}.`});
    }
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
    req.auditSessionId=session.sessionId;
    if(typeof touchUserSessionActivity==='function')void touchUserSessionActivity(req,session).catch(error=>console.error('User session activity could not be recorded:',error.message));
    next();
  }catch(error){next(error)}
}

app.post('/api/session-heartbeat',requireSession,async(req,res,next)=>{
  try{
    const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
    await sessionStore.touch(token,sessionActivityDetails(req));
    res.status(204).end();
  }catch(error){next(error)}
});

app.get('/api/session-messages',requireSession,async(req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT id,message,audio_data AS "audioData",sender_name AS "senderName",sender_login AS "senderLogin",created_at AS "createdAt"
      FROM session_messages
      WHERE target_session_public_id=$1 AND dismissed_at IS NULL
      ORDER BY created_at ASC,id ASC`,[req.session.sessionId]);
    res.set('Cache-Control','no-store');
    res.json({messages:rows});
  }catch(error){next(error)}
});

app.patch('/api/session-messages/:messageId/dismiss',requireSession,async(req,res,next)=>{
  try{
    const messageId=Number(req.params.messageId);
    if(!Number.isSafeInteger(messageId)||messageId<1)return res.status(400).json({error:'Invalid session message.'});
    const result=await pool.query(`UPDATE session_messages SET dismissed_at=NOW()
      WHERE id=$1 AND target_session_public_id=$2 AND dismissed_at IS NULL RETURNING id`,[messageId,req.session.sessionId]);
    if(!result.rowCount)return res.status(404).json({error:'This message is no longer active.'});
    req.audit={eventType:'Security',module:'User sessions',action:'Close session message',targetType:'Session message',targetReference:String(messageId),changedFields:[]};
    res.status(204).end();
  }catch(error){next(error)}
});

// Announcements: an Admin or Super Admin broadcasts a short text to every user.
// Each user sees it as a blocking popup until they close it; closing is stored
// per user (login), so it does not come back on another device.
app.get('/api/announcements/pending',requireSession,async(req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT a.id,a.message,a.sender_name AS "senderName",a.sender_login AS "senderLogin",a.created_at AS "createdAt"
      FROM announcements a
      WHERE a.withdrawn_at IS NULL AND a.created_at>NOW()-make_interval(days => $2::int)
        AND NOT EXISTS (SELECT 1 FROM announcement_acknowledgements k WHERE k.announcement_id=a.id AND k.reader_key=$1)
      ORDER BY a.created_at ASC,a.id ASC`,[announcementReaderKey(req.session),ANNOUNCEMENT_ACTIVE_DAYS]);
    req.audit=false;
    res.set('Cache-Control','no-store');
    res.json({announcements:rows});
  }catch(error){next(error)}
});

app.patch('/api/announcements/:announcementId/acknowledge',requireSession,async(req,res,next)=>{
  try{
    const announcementId=Number(req.params.announcementId);
    if(!Number.isSafeInteger(announcementId)||announcementId<1)return res.status(400).json({error:'Invalid announcement.'});
    const active=await pool.query('SELECT id FROM announcements WHERE id=$1 AND withdrawn_at IS NULL',[announcementId]);
    if(!active.rowCount)return res.status(404).json({error:'This announcement is no longer active.'});
    await pool.query(`INSERT INTO announcement_acknowledgements (announcement_id,reader_key,reader_name)
      VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,[announcementId,announcementReaderKey(req.session),String(req.session.name||'')]);
    req.audit={eventType:'Security',module:'Announcements',action:'Close announcement',targetType:'Announcement',targetReference:String(announcementId),changedFields:[]};
    res.status(204).end();
  }catch(error){next(error)}
});

app.get('/api/announcements',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const {rows}=await pool.query(`SELECT a.id,a.message,a.sender_name AS "senderName",a.sender_login AS "senderLogin",a.created_at AS "createdAt",
      a.withdrawn_at AS "withdrawnAt",a.withdrawn_by AS "withdrawnBy",
      (SELECT COUNT(*)::int FROM announcement_acknowledgements k WHERE k.announcement_id=a.id) AS "acknowledgedCount"
      FROM announcements a ORDER BY a.created_at DESC,a.id DESC LIMIT 20`);
    req.audit=false;
    res.set('Cache-Control','no-store');
    res.json({announcements:rows});
  }catch(error){next(error)}
});

app.post('/api/announcements',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const message=normalizeAnnouncement(req.body?.message);
    const validationError=announcementValidationError(message);
    if(validationError)return res.status(400).json({error:validationError});
    const {rows}=await pool.query(`INSERT INTO announcements (message,sender_login,sender_name) VALUES ($1,$2,$3)
      RETURNING id,created_at AS "createdAt"`,[message,String(req.session.login||''),String(req.session.name||'')]);
    req.audit={eventType:'Security',module:'Announcements',action:'Send announcement',targetType:'Announcement',targetReference:String(rows[0].id),reason:`Announcement to all users (${message.length} characters)`,changedFields:[]};
    res.status(201).json({id:rows[0].id,createdAt:rows[0].createdAt});
  }catch(error){next(error)}
});

app.patch('/api/announcements/:announcementId/withdraw',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const announcementId=Number(req.params.announcementId);
    if(!Number.isSafeInteger(announcementId)||announcementId<1)return res.status(400).json({error:'Invalid announcement.'});
    const result=await pool.query(`UPDATE announcements SET withdrawn_at=NOW(),withdrawn_by=$2
      WHERE id=$1 AND withdrawn_at IS NULL RETURNING id`,[announcementId,String(req.session.name||req.session.login||'')]);
    if(!result.rowCount)return res.status(404).json({error:'This announcement is already withdrawn.'});
    req.audit={eventType:'Security',module:'Announcements',action:'Withdraw announcement',targetType:'Announcement',targetReference:String(announcementId),changedFields:[]};
    res.status(204).end();
  }catch(error){next(error)}
});

// Saved table reports: a user's named views (columns, filters, sort, date range)
// of any Actions table, kept per user so they follow the user to every device.
app.get('/api/saved-reports',requireSession,async(req,res,next)=>{
  try{
    const key=String(req.query.key||'').trim().slice(0,400);
    if(!key)return res.status(400).json({error:'A table key is required.'});
    const {rows}=await pool.query(`SELECT id,name,state,created_at AS "createdAt",updated_at AS "updatedAt"
      FROM saved_table_reports WHERE user_key=$1 AND report_key=$2 ORDER BY lower(name) ASC`,[savedReportUserKey(req.session),key]);
    req.audit=false;
    res.set('Cache-Control','no-store');
    res.json({reports:rows});
  }catch(error){next(error)}
});

app.post('/api/saved-reports',requireSession,async(req,res,next)=>{
  try{
    const key=String(req.body?.key||'').trim().slice(0,400);
    const name=normalizeSavedReportName(req.body?.name);
    const state=serializeTableView(req.body?.state||{});
    const validationError=savedReportValidationError({name,key,state});
    if(validationError)return res.status(400).json({error:validationError});
    const {rows}=await pool.query(`INSERT INTO saved_table_reports (user_key,report_key,name,state) VALUES ($1,$2,$3,$4::jsonb)
      ON CONFLICT (user_key,report_key,name) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()
      RETURNING id,name,(xmax=0) AS created`,[savedReportUserKey(req.session),key,name,JSON.stringify(state)]);
    req.audit={eventType:'Data',module:'Reports',action:rows[0].created?'Save table report':'Replace table report',targetType:'Saved report',targetReference:name,changedFields:[]};
    res.status(rows[0].created?201:200).json({id:rows[0].id,name:rows[0].name,replaced:!rows[0].created});
  }catch(error){next(error)}
});

app.delete('/api/saved-reports/:reportId',requireSession,async(req,res,next)=>{
  try{
    const reportId=Number(req.params.reportId);
    if(!Number.isSafeInteger(reportId)||reportId<1)return res.status(400).json({error:'Invalid saved report.'});
    const result=await pool.query('DELETE FROM saved_table_reports WHERE id=$1 AND user_key=$2 RETURNING name',[reportId,savedReportUserKey(req.session)]);
    if(!result.rowCount)return res.status(404).json({error:'This saved report no longer exists.'});
    req.audit={eventType:'Data',module:'Reports',action:'Delete table report',targetType:'Saved report',targetReference:result.rows[0].name,changedFields:[]};
    res.status(204).end();
  }catch(error){next(error)}
});

app.get('/api/remote-assistance/current',requireSession,async(req,res,next)=>{
  try{
    await expireRemoteAssistanceSessions();
    const {rows}=await pool.query(`SELECT id,status,access_level AS "accessLevel",reason,duration_minutes AS "durationMinutes",
      requester_login AS "requesterLogin",requester_name AS "requesterName",target_login AS "targetLogin",target_name AS "targetName",
      requested_at AS "requestedAt",responded_at AS "respondedAt",started_at AS "startedAt",expires_at AS "expiresAt"
      FROM remote_assistance_sessions
      WHERE target_session_public_id=$1 AND status=ANY($2::text[])
      ORDER BY requested_at DESC LIMIT 1`,[req.session.sessionId,REMOTE_ASSISTANCE_LIVE_STATUSES]);
    req.audit=false;
    res.set('Cache-Control','no-store');
    res.json({assistance:remoteAssistancePayload(rows[0])});
  }catch(error){next(error)}
});

app.post('/api/user-sessions/:sessionId/assistance',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    await expireRemoteAssistanceSessions();
    const targetSessionId=String(req.params.sessionId||'').trim();
    const currentToken=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
    const reason=String(req.body?.reason||'').replace(/\s+/g,' ').trim();
    const accessLevel=String(req.body?.accessLevel||'control').trim().toLowerCase();
    const durationMinutes=Number(req.body?.durationMinutes||15);
    if(reason.length<5||reason.length>500)return res.status(400).json({error:'Enter an assistance reason between 5 and 500 characters.'});
    if(!['view','control'].includes(accessLevel))return res.status(400).json({error:'Select view-only or BDMS control access.'});
    if(!REMOTE_ASSISTANCE_DURATIONS.has(durationMinutes))return res.status(400).json({error:'Assistance duration must be 5, 10, or 15 minutes.'});
    const {rows:targets}=await pool.query(`SELECT token,session_public_id AS "sessionId",employee_name AS name,login_name AS login,
      last_seen_at>NOW()-INTERVAL '2 minutes' AS online
      FROM auth_sessions WHERE session_public_id=$1`,[targetSessionId]);
    const target=targets[0];
    if(!target)return res.status(404).json({error:'This user session is no longer active.'});
    if(target.token===currentToken)return res.status(400).json({error:'You cannot request control of your current session.'});
    if(!target.online)return res.status(409).json({error:'Assistance can only be requested while the user is online in BDMS.'});
    const existing=await pool.query(`SELECT id FROM remote_assistance_sessions
      WHERE target_session_public_id=$1 AND status=ANY($2::text[]) AND expires_at>NOW() LIMIT 1`,[targetSessionId,REMOTE_ASSISTANCE_LIVE_STATUSES]);
    if(existing.rowCount)return res.status(409).json({error:'This user already has an active or pending assistance request.'});
    const {rows}=await pool.query(`INSERT INTO remote_assistance_sessions
      (target_session_public_id,target_login,target_name,requester_login,requester_name,access_level,reason,duration_minutes,status,expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'Pending',NOW()+INTERVAL '5 minutes')
      RETURNING id,status,access_level AS "accessLevel",reason,duration_minutes AS "durationMinutes",
        requester_login AS "requesterLogin",requester_name AS "requesterName",target_login AS "targetLogin",target_name AS "targetName",
        requested_at AS "requestedAt",responded_at AS "respondedAt",started_at AS "startedAt",expires_at AS "expiresAt"`,[
          target.sessionId,target.login,target.name,String(req.session.login||''),String(req.session.name||''),accessLevel,reason,durationMinutes
        ]);
    req.audit={eventType:'Security',module:'Remote assistance',action:'Request BDMS assistance',targetType:'User session',targetReference:target.login||target.name||targetSessionId,reason:`${accessLevel==='control'?'BDMS control':'View only'} for ${durationMinutes} minutes: ${reason}`,changedFields:[]};
    res.status(201).json({assistance:remoteAssistancePayload(rows[0])});
  }catch(error){next(error)}
});

app.patch('/api/remote-assistance/:assistanceId/respond',requireSession,async(req,res,next)=>{
  try{
    const assistanceId=String(req.params.assistanceId||'');
    const decision=String(req.body?.decision||'').trim().toLowerCase();
    if(!validRemoteAssistanceId(assistanceId))return res.status(400).json({error:'Invalid assistance request.'});
    if(!['approve','decline'].includes(decision))return res.status(400).json({error:'Choose approve or decline.'});
    const {rows}=await pool.query(`UPDATE remote_assistance_sessions SET
      status=$1,responded_at=NOW(),ended_at=CASE WHEN $1='Declined' THEN NOW() ELSE ended_at END,
      expires_at=CASE WHEN $1='Approved' THEN NOW()+(duration_minutes*INTERVAL '1 minute') ELSE NOW() END
      WHERE id=$2 AND target_session_public_id=$3 AND status='Pending' AND expires_at>NOW()
      RETURNING id,status,access_level AS "accessLevel",reason,duration_minutes AS "durationMinutes",
        requester_login AS "requesterLogin",requester_name AS "requesterName",target_login AS "targetLogin",target_name AS "targetName",
        requested_at AS "requestedAt",responded_at AS "respondedAt",started_at AS "startedAt",expires_at AS "expiresAt"`,[
          decision==='approve'?'Approved':'Declined',assistanceId,req.session.sessionId
        ]);
    if(!rows.length)return res.status(409).json({error:'This assistance request has expired or was already answered.'});
    const assistance=rows[0];
    req.audit={eventType:'Security',module:'Remote assistance',action:decision==='approve'?'Approve BDMS assistance':'Decline BDMS assistance',targetType:'Remote assistance',targetReference:assistanceId,reason:assistance.reason,changedFields:[]};
    res.json({assistance:remoteAssistancePayload(assistance)});
  }catch(error){next(error)}
});

app.post('/api/remote-assistance/:assistanceId/events',requireSession,async(req,res,next)=>{
  try{
    const assistanceId=String(req.params.assistanceId||'');
    const events=Array.isArray(req.body?.events)?req.body.events:[];
    if(!validRemoteAssistanceId(assistanceId))return res.status(400).json({error:'Invalid assistance session.'});
    if(!events.length||events.length>100)return res.status(400).json({error:'An assistance update must contain between 1 and 100 events.'});
    if(JSON.stringify(events).length>15*1024*1024)return res.status(413).json({error:'The assistance update is too large.'});
    const active=await pool.query(`UPDATE remote_assistance_sessions SET status='Active',started_at=COALESCE(started_at,NOW())
      WHERE id=$1 AND target_session_public_id=$2 AND status=ANY($3::text[]) AND expires_at>NOW()
      RETURNING id`,[assistanceId,req.session.sessionId,['Approved','Active']]);
    if(!active.rowCount)return res.status(409).json({error:'This assistance session is not active.'});
    const {rows}=await pool.query(`INSERT INTO remote_assistance_event_batches (assistance_id,payload)
      VALUES ($1,$2::jsonb) RETURNING id`,[assistanceId,JSON.stringify(events)]);
    req.audit=false;
    res.status(201).json({batchId:rows[0].id});
  }catch(error){next(error)}
});

app.get('/api/remote-assistance/:assistanceId/events',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    await expireRemoteAssistanceSessions();
    const assistanceId=String(req.params.assistanceId||'');
    const after=Math.max(0,Number(req.query.after)||0);
    if(!validRemoteAssistanceId(assistanceId))return res.status(400).json({error:'Invalid assistance session.'});
    const {rows:sessions}=await pool.query(`SELECT id,status,access_level AS "accessLevel",reason,duration_minutes AS "durationMinutes",
      requester_login AS "requesterLogin",requester_name AS "requesterName",target_login AS "targetLogin",target_name AS "targetName",
      requested_at AS "requestedAt",responded_at AS "respondedAt",started_at AS "startedAt",expires_at AS "expiresAt"
      FROM remote_assistance_sessions WHERE id=$1 AND requester_login=$2`,[assistanceId,String(req.session.login||'')]);
    if(!sessions.length)return res.status(404).json({error:'Assistance session not found.'});
    const {rows:batches}=await pool.query(`SELECT id,payload AS events FROM remote_assistance_event_batches
      WHERE assistance_id=$1 AND id>$2 ORDER BY id ASC LIMIT 100`,[assistanceId,after]);
    req.audit=false;
    res.set('Cache-Control','no-store');
    res.json({assistance:remoteAssistancePayload(sessions[0]),batches});
  }catch(error){next(error)}
});

app.post('/api/remote-assistance/:assistanceId/commands',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const assistanceId=String(req.params.assistanceId||'');
    const commandType=String(req.body?.type||'').trim().toLowerCase();
    const payload=req.body?.payload&&typeof req.body.payload==='object'?req.body.payload:{};
    if(!validRemoteAssistanceId(assistanceId))return res.status(400).json({error:'Invalid assistance session.'});
    if(!['click','input','scroll'].includes(commandType))return res.status(400).json({error:'Unsupported assistance command.'});
    if(JSON.stringify(payload).length>5000)return res.status(413).json({error:'Assistance command is too large.'});
    const active=await pool.query(`SELECT target_login,target_name FROM remote_assistance_sessions
      WHERE id=$1 AND requester_login=$2 AND access_level='control' AND status=ANY($3::text[]) AND expires_at>NOW()`,[
        assistanceId,String(req.session.login||''),['Approved','Active']
      ]);
    if(!active.rowCount)return res.status(409).json({error:'BDMS control is not active for this session.'});
    const {rows}=await pool.query(`INSERT INTO remote_assistance_commands (assistance_id,command_type,payload)
      VALUES ($1,$2,$3::jsonb) RETURNING id`,[assistanceId,commandType,JSON.stringify(payload)]);
    const target=active.rows[0];
    req.audit={eventType:'Security',module:'Remote assistance',action:`Remote ${commandType}`,targetType:'User session',targetReference:target.target_login||target.target_name||assistanceId,reason:'Action performed inside the approved BDMS tab',changedFields:[]};
    res.status(201).json({commandId:rows[0].id});
  }catch(error){next(error)}
});

app.get('/api/remote-assistance/:assistanceId/commands',requireSession,async(req,res,next)=>{
  try{
    const assistanceId=String(req.params.assistanceId||'');
    const after=Math.max(0,Number(req.query.after)||0);
    if(!validRemoteAssistanceId(assistanceId))return res.status(400).json({error:'Invalid assistance session.'});
    const active=await pool.query(`SELECT id,status,expires_at AS "expiresAt" FROM remote_assistance_sessions
      WHERE id=$1 AND target_session_public_id=$2 AND status=ANY($3::text[]) AND expires_at>NOW()`,[
        assistanceId,req.session.sessionId,['Approved','Active']
      ]);
    if(!active.rowCount)return res.status(409).json({error:'This assistance session has ended.'});
    const {rows}=await pool.query(`SELECT id,command_type AS type,payload FROM remote_assistance_commands
      WHERE assistance_id=$1 AND id>$2 ORDER BY id ASC LIMIT 100`,[assistanceId,after]);
    req.audit=false;
    res.set('Cache-Control','no-store');
    res.json({commands:rows,expiresAt:active.rows[0].expiresAt});
  }catch(error){next(error)}
});

app.patch('/api/remote-assistance/:assistanceId/end',requireSession,async(req,res,next)=>{
  try{
    const assistanceId=String(req.params.assistanceId||'');
    if(!validRemoteAssistanceId(assistanceId))return res.status(400).json({error:'Invalid assistance session.'});
    const adminLevel=String(req.session?.permissions?.adminLevel||'').trim().toLowerCase();
    const administrator=req.session?.role==='super'&&['admin','super admin'].includes(adminLevel);
    const {rows}=await pool.query(`UPDATE remote_assistance_sessions SET status='Ended',ended_at=NOW(),expires_at=NOW()
      WHERE id=$1 AND status=ANY($2::text[]) AND (target_session_public_id=$3 OR ($4::boolean AND requester_login=$5))
      RETURNING target_login AS "targetLogin",target_name AS "targetName"`,[
        assistanceId,REMOTE_ASSISTANCE_LIVE_STATUSES,req.session.sessionId,administrator,String(req.session.login||'')
      ]);
    if(!rows.length)return res.status(404).json({error:'This assistance session is no longer active.'});
    await Promise.all([
      pool.query('DELETE FROM remote_assistance_event_batches WHERE assistance_id=$1',[assistanceId]),
      pool.query('DELETE FROM remote_assistance_commands WHERE assistance_id=$1',[assistanceId]),
    ]);
    const target=rows[0];
    req.audit={eventType:'Security',module:'Remote assistance',action:'End BDMS assistance',targetType:'User session',targetReference:target.targetLogin||target.targetName||assistanceId,changedFields:[]};
    res.status(204).end();
  }catch(error){next(error)}
});

registerLoginHistoryRoutes(app,{pool,requireSuper,requireAdministrator,locationName:userSessionLocationName});
app.get('/api/user-sessions',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    await sessionStore.pruneExpired();
    await expireRemoteAssistanceSessions();
    const currentToken=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'').trim();
    const {rows}=await pool.query(`SELECT sessions.token,sessions.session_public_id AS "sessionId",sessions.employee_name AS "name",sessions.login_name AS "login",
      COALESCE(NULLIF(sessions.permissions->>'adminLevel',''),NULLIF(sessions.assigned_role,''),NULLIF(sessions.user_type,''),sessions.role) AS "roleLabel",
      sessions.user_type AS "userType",sessions.assigned_role AS "assignedRole",sessions.created_at AS "createdAt",sessions.last_seen_at AS "lastSeenAt",
      sessions.ip_address AS "ipAddress",sessions.device_id AS "deviceId",sessions.user_agent AS "userAgent",user_master.record_data AS "userRecord",
      assistance.id AS "assistanceId",assistance.status AS "assistanceStatus",assistance.access_level AS "assistanceAccessLevel",
      assistance.reason AS "assistanceReason",assistance.duration_minutes AS "assistanceDurationMinutes",assistance.expires_at AS "assistanceExpiresAt"
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
      LEFT JOIN LATERAL (
        SELECT remote.id,remote.status,remote.access_level,remote.reason,remote.duration_minutes,remote.expires_at
        FROM remote_assistance_sessions AS remote
        WHERE remote.target_session_public_id=sessions.session_public_id
          AND remote.requester_login=$1
          AND remote.status=ANY($2::text[])
          AND remote.expires_at>NOW()
        ORDER BY remote.requested_at DESC LIMIT 1
      ) AS assistance ON TRUE
      WHERE sessions.created_at>NOW()-INTERVAL '30 days'
      ORDER BY sessions.last_seen_at DESC,sessions.created_at DESC`,[String(req.session.login||''),REMOTE_ASSISTANCE_LIVE_STATUSES]);
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

app.post('/api/user-sessions/:sessionId/messages',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const sessionId=String(req.params.sessionId||'').trim();
    const message=normalizeSessionMessage(req.body?.message);
    const audioData=String(req.body?.audioData||'');
    const validationError=sessionMessagePayloadValidationError({message,audioData});
    if(validationError)return res.status(400).json({error:validationError});
    const {rows:targets}=await pool.query(`SELECT session_public_id AS "sessionId",employee_name AS "name",login_name AS "login",
      last_seen_at>NOW()-INTERVAL '2 minutes' AS online
      FROM auth_sessions WHERE session_public_id=$1 AND created_at>NOW()-INTERVAL '30 days'`,[sessionId]);
    const target=targets[0];
    if(!target)return res.status(404).json({error:'This session is no longer active.'});
    if(!target.online)return res.status(409).json({error:'Messages can only be sent to a user who is online.'});
    const {rows}=await pool.query(`INSERT INTO session_messages
      (target_session_public_id,target_login,target_name,sender_login,sender_name,message,audio_data)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id,created_at AS "createdAt"`,[
        target.sessionId,target.login,target.name,String(req.session.login||''),String(req.session.name||''),message,audioData
      ]);
    req.audit={eventType:'Security',module:'User sessions',action:'Send session message',targetType:'User session',targetReference:target.login||target.name||sessionId,reason:audioData?`Administrative voice message${message?` with ${message.length} text characters`:''}`:`Administrative message (${message.length} characters)`,changedFields:[]};
    res.status(201).json({id:rows[0].id,createdAt:rows[0].createdAt});
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
    await pool.query(`UPDATE remote_assistance_sessions SET status='Ended',ended_at=NOW(),expires_at=NOW()
      WHERE target_session_public_id=$1 AND status=ANY($2::text[])`,[sessionId,REMOTE_ASSISTANCE_LIVE_STATUSES]);
    await pool.query('DELETE FROM auth_sessions WHERE session_public_id=$1',[sessionId]);
    req.audit={eventType:'Security',module:'User sessions',action:'Force close session',targetType:'User session',targetReference:target.rows[0].login||target.rows[0].name||sessionId,changedFields:[]};
    res.status(204).end();
  }catch(error){next(error)}
});

app.get('/api/backups',requireSuper,requireAdministrator,async(_req,res,next)=>{
  try{
    const [{settings,updatedAt},{rows}]=await Promise.all([
      readBackupSettings(),
      pool.query(`SELECT id,file_name AS "fileName",status,trigger_type AS "triggerType",size_bytes AS "sizeBytes",
        checksum,table_counts AS "tableCounts",created_by_name AS "createdBy",error_message AS "errorMessage",
        started_at AS "startedAt",completed_at AS "completedAt",expires_at AS "expiresAt",storage_path<>'' AS downloadable
        FROM backup_runs ORDER BY started_at DESC LIMIT 100`),
    ]);
    res.set('Cache-Control','no-store');
    res.json({settings,updatedAt,storageRoot:backupStorageRoot,history:rows});
  }catch(error){next(error)}
});

app.put('/api/backups/settings',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const settings=normalizeBackupSettings(req.body||{});
    await fs.mkdir(backupFolder(settings),{recursive:true});
    await pool.query(`INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ($1,$2::jsonb,NOW())
      ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`,[BACKUP_SETTING_KEY,JSON.stringify(settings)]);
    req.audit={eventType:'Administration',module:'Backup',action:'Update backup schedule',targetType:'Backup settings',targetReference:settings.storageFolder,changedFields:['enabled','scheduleTime','weekdays','storageFolder','retentionDays','maxBackups']};
    res.json({settings,storageRoot:backupStorageRoot});
  }catch(error){next(error)}
});

app.post('/api/backups/run',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const result=await createStoredBackup({triggerType:'Manual schedule',actor:req.session});
    await pruneStoredBackups();
    req.audit={eventType:'Administration',module:'Backup',action:'Create stored backup',targetType:'Database backup',targetReference:result.fileName,reason:`Completed ${result.sizeBytes} bytes; SHA-256 ${result.checksum}`,changedFields:[]};
    const {filePath:storedPath,...publicResult}=result;
    res.status(201).json(publicResult);
  }catch(error){next(error)}
});

app.post('/api/backups/export',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const folder=path.join(backupStorageRoot,'manual-exports');
    const result=await createStoredBackup({triggerType:'Manual export',actor:req.session,folderOverride:folder});
    req.audit={eventType:'Administration',module:'Backup',action:'Export full backup',targetType:'Database backup',targetReference:result.fileName,reason:`Exported ${result.sizeBytes} bytes; SHA-256 ${result.checksum}`,changedFields:[]};
    res.set('Cache-Control','no-store');
    res.set('X-Backup-Checksum',result.checksum);
    res.download(result.filePath,result.fileName,async(error)=>{
      await fs.rm(result.filePath,{force:true}).catch(()=>{});
      await pool.query("UPDATE backup_runs SET storage_path='',status=$1,error_message=$2 WHERE id=$3",[
        error?'Failed':'Exported',error?String(error.message||'Download interrupted').slice(0,500):'',result.id
      ]).catch(()=>{});
      if(error&&!res.headersSent)next(error);
    });
  }catch(error){next(error)}
});

app.delete('/api/backups/:backupId',requireSuper,requireAdministrator,async(req,res,next)=>{
  const backupId=String(req.params.backupId||'').trim();
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(backupId))return res.status(400).json({error:'Invalid backup reference.'});
  const client=await pool.connect();
  let locked=false,transactionStarted=false,originalPath='',stagedPath='';
  try{
    const {rows:locks}=await client.query("SELECT pg_try_advisory_lock(hashtext('bdms_backup_operation')) AS locked");
    locked=Boolean(locks[0]?.locked);
    if(!locked)return res.status(409).json({error:'A backup or restore is currently running. Try deleting this history after it completes.'});
    await client.query('BEGIN');transactionStarted=true;
    const {rows}=await client.query('SELECT file_name,storage_path,status FROM backup_runs WHERE id=$1 FOR UPDATE',[backupId]);
    const backup=rows[0];
    if(!backup){await client.query('ROLLBACK');transactionStarted=false;return res.status(404).json({error:'Backup history record not found.'});}
    if(backup.storage_path){
      originalPath=path.resolve(backup.storage_path);
      if(!originalPath.startsWith(`${backupStorageRoot}${path.sep}`))throw Object.assign(new Error('The recorded backup path is outside protected storage.'),{status:409});
      if(existsSync(originalPath)){
        stagedPath=`${originalPath}.deleting-${backupId}`;
        await fs.rename(originalPath,stagedPath);
      }
    }
    await client.query('DELETE FROM backup_runs WHERE id=$1',[backupId]);
    await client.query('COMMIT');transactionStarted=false;
    if(stagedPath)await fs.rm(stagedPath,{force:true}).catch(error=>console.error('Deleted backup file cleanup failed:',error.message));
    req.audit={eventType:'Administration',module:'Backup',action:'Delete backup',targetType:'Database backup',targetReference:backup.file_name,reason:`Deleted ${backup.status} backup history${originalPath?' and recovery file':''}`,changedFields:['history','recoveryFile']};
    res.status(204).end();
  }catch(error){
    if(transactionStarted)await client.query('ROLLBACK').catch(()=>{});
    if(stagedPath&&originalPath&&existsSync(stagedPath))await fs.rename(stagedPath,originalPath).catch(()=>{});
    next(error);
  }finally{
    if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('bdms_backup_operation'))").catch(()=>{});
    client.release();
  }
});

app.get('/api/backups/:backupId/download',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const backupId=String(req.params.backupId||'').trim();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(backupId))return res.status(400).json({error:'Invalid backup reference.'});
    const {rows}=await pool.query(`SELECT file_name,storage_path FROM backup_runs WHERE id=$1 AND status='Completed'`,[backupId]);
    const backup=rows[0];
    if(!backup?.storage_path)return res.status(404).json({error:'This backup file is no longer available.'});
    const target=path.resolve(backup.storage_path);
    if(!target.startsWith(`${backupStorageRoot}${path.sep}`)||!existsSync(target))return res.status(404).json({error:'This backup file is no longer available.'});
    req.audit={eventType:'Administration',module:'Backup',action:'Download stored backup',targetType:'Database backup',targetReference:backup.file_name,changedFields:[]};
    res.set('Cache-Control','no-store');
    res.download(target,backup.file_name);
  }catch(error){next(error)}
});

app.post('/api/backups/import/inspect',requireSuper,requireTrueSuperAdmin,async(req,res,next)=>{
  let filePath='';
  try{
    await prunePendingBackupImports();
    const contentLength=Number(req.get('content-length')||0);
    const maxBytes=2*1024*1024*1024;
    if(contentLength>maxBytes)return res.status(413).json({error:'Backup files larger than 2 GB must be restored with the server restore script.'});
    const originalName=String(req.get('x-backup-file-name')||'').replace(/[^a-z0-9._-]+/gi,'-').slice(0,180);
    if(!originalName.toLowerCase().endsWith('.ndjson.gz'))return res.status(400).json({error:'Select a BDMS .ndjson.gz backup file.'});
    await fs.mkdir(backupImportRoot,{recursive:true});
    const token=randomUUID();
    filePath=path.join(backupImportRoot,`${token}.ndjson.gz`);
    let received=0;
    const meter=new Transform({transform(chunk,_encoding,callback){
      received+=chunk.length;
      callback(received>maxBytes?Object.assign(new Error('Backup file exceeds the 2 GB upload limit.'),{status:413}):null,chunk);
    }});
    await pipeline(req,meter,createWriteStream(filePath));
    if(!received)throw Object.assign(new Error('The selected backup file is empty.'),{status:400});
    const [details,checksum]=await Promise.all([inspectBackupFile(filePath),sha256File(filePath)]);
    const expiresAt=Date.now()+30*60*1000;
    pendingBackupImports.set(token,{filePath,originalName,login:String(req.session.login||''),expiresAt,details,checksum,sizeBytes:received});
    req.audit={eventType:'Administration',module:'Backup',action:'Inspect imported backup',targetType:'Database backup',targetReference:originalName,reason:`Verified ${received} bytes; SHA-256 ${checksum}`,changedFields:[]};
    res.set('Cache-Control','no-store');
    res.json({token,fileName:originalName,sizeBytes:received,checksum,expiresAt:new Date(expiresAt).toISOString(),...details});
  }catch(error){
    if(filePath)await fs.rm(filePath,{force:true}).catch(()=>{});
    next(error);
  }
});

app.post('/api/backups/import/restore',requireSuper,requireTrueSuperAdmin,async(req,res,next)=>{
  const token=String(req.body?.token||'').trim();
  const pending=pendingBackupImports.get(token);
  try{
    if(String(req.body?.confirmation||'').trim()!=='RESTORE BDMS')return res.status(400).json({error:'Type RESTORE BDMS exactly to confirm the recovery operation.'});
    if(!pending||pending.expiresAt<Date.now()||pending.login!==String(req.session.login||''))return res.status(410).json({error:'This inspected backup has expired. Inspect the file again.'});
    const safety=await createStoredBackup({triggerType:'Pre-restore',actor:req.session,folderOverride:path.join(backupStorageRoot,'pre-restore')});
    const client=await pool.connect();
    let restored;
    let locked=false;
    try{
      const {rows:locks}=await client.query("SELECT pg_try_advisory_lock(hashtext('bdms_backup_operation')) AS locked");
      locked=Boolean(locks[0]?.locked);
      if(!locked)throw Object.assign(new Error('Another backup or restore is already running. Try again after it completes.'),{status:409});
      restored=await restoreDatabase({client,input:pending.filePath});
    }finally{
      if(locked)await client.query("SELECT pg_advisory_unlock(hashtext('bdms_backup_operation'))").catch(()=>{});
      client.release();
    }
    pendingBackupImports.delete(token);
    await fs.rm(pending.filePath,{force:true}).catch(()=>{});
    req.audit={eventType:'Administration',module:'Backup',action:'Restore imported backup',targetType:'Database backup',targetReference:pending.originalName,reason:`Safety backup: ${safety.fileName}`,changedFields:Object.keys(restored.tables||{})};
    res.json({restored,safetyBackup:{fileName:safety.fileName,checksum:safety.checksum},signInAgain:true});
  }catch(error){
    if(pending&&pending.expiresAt<Date.now()){
      pendingBackupImports.delete(token);
      await fs.rm(pending.filePath,{force:true}).catch(()=>{});
    }
    next(error);
  }
});

app.get('/api/audit-events',requireSuper,requireAdministrator,async(req,res,next)=>{
  try{
    const paged=String(req.query.paged||'').toLowerCase()==='true';
    const limit=Math.min(5000,Math.max(1,Number(req.query.limit)||1000));
    const beforeAt=String(req.query.beforeAt||'').trim();
    const beforeId=Number(req.query.beforeId)||0;
    const {fromDate,toDate}=auditDateRange(req.query);
    const params=[fromDate,toDate];
    const conditions=[
      `occurred_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata')`,
      `occurred_at < ((($2::date+1)::timestamp) AT TIME ZONE 'Asia/Kolkata')`,
      AUDIT_VISIBLE_SCOPE_SQL,
    ];
    if(paged&&beforeAt&&beforeId){
      params.push(beforeAt,beforeId);
      conditions.push(`(occurred_at,id)<($${params.length-1}::timestamptz,$${params.length}::bigint)`);
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
        WHERE occurred_at >= ($1::date::timestamp AT TIME ZONE 'Asia/Kolkata')
          AND occurred_at < ((($2::date+1)::timestamp) AT TIME ZONE 'Asia/Kolkata')
          AND ${AUDIT_VISIBLE_SCOPE_SQL}`,[fromDate,toDate]);
      summary=summaryRows[0]||{total:0,failed:0,users:0,devices:0};
    }
    res.json({events,summary,range:{fromDate,toDate},hasMore,nextCursor:hasMore&&last?{beforeAt:last.occurredAt,beforeId:last.id}:null});
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

async function reportScheduleScope(session,settings,{personal=false}={}){
  if(!personal&&canManageAllReportSchedules(session)){
    const {rows}=await pool.query(`SELECT record_data FROM master_records WHERE master_name='Hierarchy master' ORDER BY created_at ASC`);
    let roleSettings=normalizeHierarchyReportScheduleSettings(settings);
    for(const [key,designation] of Object.entries(HIERARCHY_REPORT_DESIGNATIONS)){
      const rule=hierarchyRuleForDesignation(rows,{key,...designation});
      if(rule)roleSettings=applyHierarchyDeliveryRule(roleSettings,key,rule);
    }
    return {canManageAll:true,allowedDesignationKeys:Object.keys(settings.designations||{}),allowedReports:DIRECTOR_REPORT_TITLES,roleSettings};
  }
  const user=await currentUserRecord(session);
  const resolved=resolveMobileAccess({user});
  const profile={...resolved,assignedRole:session?.assignedRole||resolved.assignedRole,permissions:{...resolved.permissions,...(session?.permissions||{})}};
  const designation=flowDesignationForUser(user,profile);
  if(!designation)return null;
  // The role default a user customises is the one the sender would use: the
  // administrator's schedule after any Hierarchy master days/times rule.
  const {rows:hierarchyRows}=await pool.query(`SELECT record_data FROM master_records WHERE master_name='Hierarchy master' ORDER BY created_at ASC`);
  const hierarchyRule=hierarchyRuleForDesignation(hierarchyRows,designation);
  const roleSettings=hierarchyRule?applyHierarchyDeliveryRule(settings,designation.key,hierarchyRule):normalizeHierarchyReportScheduleSettings(settings);
  return {
    canManageAll:false,
    allowedDesignationKeys:[designation.key],
    allowedReports:reportsAssignedToDesignation(roleSettings,designation.key),
    user,
    login:reportRecipientLogin(user)||String(session?.login||'').trim().toLowerCase(),
    name:String(user.employee||user.name||session?.name||user.login||'').trim(),
    roleSettings,
  };
}

function scopedReportScheduleSettings(settings,scope){
  if(scope.canManageAll)return scope.roleSettings||settings;
  const key=scope.allowedDesignationKeys[0];
  return {designations:{[key]:(scope.roleSettings||settings).designations[key]}};
}

async function reportScheduleResponse(scope,settings,extra={}){
  const designationKey=scope.allowedDesignationKeys[0];
  const userSchedule=scope.canManageAll?null:normalizeUserReportSchedule(await storedUserReportSchedule(scope.login),{designationKey,allowedReports:scope.allowedReports,roleSchedules:(scope.roleSettings||settings).designations[designationKey]?.schedules});
  return {
    settings:scopedReportScheduleSettings(settings,scope),
    canManageAll:scope.canManageAll,
    allowedDesignationKeys:scope.allowedDesignationKeys,
    allowedReports:scope.allowedReports,
    userName:scope.name||'',
    userLogin:scope.login||'',
    userSchedule,
    ...extra,
  };
}

app.get('/api/report-schedule-settings',requireSession,async(req,res,next)=>{
  try{
    const [{rows},settings]=await Promise.all([
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees' ORDER BY created_at ASC`),
      storedHierarchyReportScheduleSettings(),
    ]);
    const scope=await reportScheduleScope(req.session,settings,{personal:req.query.scope==='personal'});
    if(!scope)return res.status(403).json({error:'No report designation is assigned to this profile.'});
    const recipients={};
    for(const row of rows){
      const user=row.record_data||{};
      const designation=flowDesignationForUser(user,resolveMobileAccess({user}));
      const login=String(user.login||user.employee||user.name||'').trim().toLowerCase();
      if(!designation||!login||!scope.allowedDesignationKeys.includes(designation.key))continue;
      (recipients[designation.key]??=[]).push({login,name:String(user.employee||user.name||user.login||login).trim(),hasPhone:Boolean(String(user.phone||user.phoneNo||user.phoneNumber||'').trim())});
    }
    res.json(await reportScheduleResponse(scope,settings,{recipients}));
  }catch(error){next(error)}
});

app.put('/api/report-schedule-settings',requireSession,async(req,res,next)=>{
  try{
    const current=await storedHierarchyReportScheduleSettings();
    const scope=await reportScheduleScope(req.session,current,{personal:req.query.scope==='personal'});
    if(!scope)return res.status(403).json({error:'No report designation is assigned to this profile.'});
    const body=req.body&&typeof req.body==='object'?req.body:{};
    if(scope.canManageAll){
      // Administrators save the role defaults every user in that role starts from.
      const settings=normalizeHierarchyReportScheduleSettings({designations:{...(scope.roleSettings||current).designations,...body.designations}});
      for(const [key,designation] of Object.entries(settings.designations)){
        if(body.designations?.[key])designation.managedByReportSettings=true;
      }
      await pool.query(`INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ($1,$2::jsonb,NOW())
        ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`,[
        HIERARCHY_REPORT_SCHEDULE_SETTING_KEY,JSON.stringify(settings),
      ]);
      return res.json(await reportScheduleResponse(await reportScheduleScope(req.session,settings),settings));
    }
    // Every other user saves a personal copy; the shared role default is never rewritten here.
    if(!scope.login)return res.status(400).json({error:'Your account has no login name, so a personal report schedule cannot be saved.'});
    const settingKey=userReportScheduleSettingKey(scope.login);
    if(body.resetToDefault===true||body.userSchedule===null){
      await pool.query('DELETE FROM app_settings WHERE setting_key=$1',[settingKey]);
    }else{
      const designationKey=scope.allowedDesignationKeys[0];
      const submitted=body.userSchedule&&typeof body.userSchedule==='object'?body.userSchedule:body.designations?.[designationKey];
      if(!submitted||typeof submitted!=='object')return res.status(400).json({error:'Your report schedule was not provided.'});
      const personal=normalizeUserReportSchedule({...submitted,designationKey,updatedAt:new Date().toISOString()},{designationKey,allowedReports:scope.allowedReports,roleSchedules:(scope.roleSettings||current).designations[designationKey]?.schedules});
      const validationError=userReportScheduleValidationError(personal);
      if(validationError)return res.status(400).json({error:validationError});
      await pool.query(`INSERT INTO app_settings (setting_key,setting_value,updated_at) VALUES ($1,$2::jsonb,NOW())
        ON CONFLICT (setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`,[settingKey,JSON.stringify(personal)]);
    }
    res.json(await reportScheduleResponse(scope,current));
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
      parameters:[message],context:{site:String(req.body.site||'').trim()||(/site/i.test(reportType)?targetName:'Multiple sites — see report scope'),report:{title:reportType,summary:message}},
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
    message,(message_audio <> '') AS "messageAudioAvailable",(attachment_data <> '') AS "attachmentAvailable",attachment_name AS "attachmentName",
    attachment_type AS "attachmentType",status,resolution_message AS "resolutionMessage",(resolution_audio <> '') AS "resolutionAudioAvailable",
    (resolution_attachment_data <> '') AS "resolutionAttachmentAvailable",resolution_attachment_name AS "resolutionAttachmentName",
    resolution_attachment_type AS "resolutionAttachmentType",resolved_by AS "resolvedBy",
    to_char(resolved_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "resolvedAt",
    to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "createdAt"`;
}

function isTicketAdmin(session){return session?.role==='super'&&session?.permissions?.adminLevel!=='Manager'}
const userManagesSite=(user,site)=>reportScopeIncludesSite(managerReportScope(user),site);

async function ticketVisibleToSession(ticket,session){
  if(session?.role==='super'&&session?.permissions?.adminLevel!=='Manager')return true;
  if(session?.role!=='super')return String(ticket?.creatorLogin||'').trim().toLowerCase()===String(session?.login||'').trim().toLowerCase();
  const manager=await currentUserRecord(session);
  const creatorRoles=managerRoleSelection(session?.permissions?.managerRoles?.length
    ?session.permissions.managerRoles:session?.permissions?.managerRole).map(managerUserRole);
  return creatorRoles.includes(ticket?.creatorRole)&&userManagesSite(manager,ticket?.site);
}

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
  const workflowExcludedLogins=new Set(workflowType?rows.map(({record_data})=>record_data||{}).filter((user)=>isExcludedWorkflowWhatsAppRecipient(user,resolveMobileAccess({user}),reportSettings,workflowType)).map((user)=>String(user.login||'').trim().toLowerCase()).filter(Boolean):[]);
  const reportsOnlyLogins=new Set(rows.map(({record_data})=>record_data||{}).filter(user=>isWhatsAppReportsOnlyRecipient(user)).map(user=>String(user.login||'').trim().toLowerCase()));
  for(const row of rows){
    const user=row.record_data||{};
    const login=String(user.login||'').trim().toLowerCase();
    if(workflowExcludedLogins.has(login)||reportsOnlyLogins.has(login))continue;
    if(workflowType&&!isWorkflowWhatsAppRecipient(user,workflowType,site,reportSettings))continue;
    const phone=String(user.phone||user.phoneNo||user.phoneNumber||'').trim();
    if(login&&!usersByLogin.has(login))usersByLogin.set(login,user);
    if(login&&phone&&!contacts.has(login))contacts.set(login,{name:String(user.employee||user.name||user.login||login),phone});
  }
  const eligibleLogins=[...usersByLogin.keys()];
  const missingPhone=eligibleLogins.filter((login)=>!contacts.has(login));
  const missingResults=await Promise.all(missingPhone.map(async(login)=>{const user=usersByLogin.get(login)||{};const status='Skipped - phone number missing';await pool.query(`INSERT INTO whatsapp_alert_history
    (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
    ['System notification',String(reference||''),'',String(user.employee||user.name||user.login||login),'',status]);return {login,status};}));
  const deliveryResults=await Promise.all([...contacts.entries()].map(async([login,contact])=>{
    let status='Sent';
    try{
      const whatsappEnv=await metaWhatsAppRuntimeEnv();
      const context={...workflowTemplate?.context,site,recipient:usersByLogin.get(login)};
      if(workflowTemplate)try{await sendMetaWhatsAppTemplate({to:contact.phone,...workflowTemplate,purpose:messagePurpose,context},{env:whatsappEnv})}
      catch(templateError){
        if(templateError.code==='WHATSAPP_POLICY_PAUSED')throw templateError;
        const fallback=reportTemplateFallback(messagePurpose,workflowTemplate.parameters,whatsappEnv.WHATSAPP_REPORT_SETTINGS,whatsappEnv.WHATSAPP_TEMPLATE_APPROVALS,`*SITE: ${site||'Not recorded'}*\n*Nerve Center notification*\n${message}`,context);
        await sendMetaWhatsAppText({to:contact.phone,message:fallback,purpose:messagePurpose},{env:whatsappEnv});
      }
      else await sendMetaWhatsAppText({to:contact.phone,message:`*SITE: ${String(site||'Not recorded').replace(/[*\r\n]/g,' ')}*\n*Nerve Center notification*\n${message}`,purpose:messagePurpose},{env:whatsappEnv});
    }
    catch(error){status=`${error.code==='WHATSAPP_POLICY_PAUSED'?'Skipped':'Failed'} - ${String(error?.message||'Meta delivery error').slice(0,160)}`;console.error(`WhatsApp notification failed for ${login}:`,error.message)}
    await pool.query(`INSERT INTO whatsapp_alert_history
      (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,
      ['System notification',String(reference||''),'',contact.name,contact.phone,status]);
    return {login,status};
  }));
  return [...missingResults,...deliveryResults];
}

async function genericWhatsAppAlertLogins(client,recipients,{purpose,site}){
  const selected=new Set(recipients.map(value=>String(value||'').trim().toLowerCase()).filter(Boolean));
  const {rows}=await client.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
  const excluded=new Set(rows.map(({record_data})=>record_data||{}).filter(user=>isWhatsAppReportsOnlyRecipient(user)).map(user=>String(user.login||'').trim().toLowerCase()));
  return [...new Set(rows.map(({record_data})=>record_data||{}).filter(user=>{
    const login=String(user.login||'').trim().toLowerCase(),profile=resolveMobileAccess({user});
    if(!login||excluded.has(login))return false;
    if(isWhatsAppAllAlertRecipient(user,profile))return true;
    if(profile.sessionRole!=='normal')return false;
    const sameSite=reportScopeIncludesSite(userSiteScope(user),site);
    // CRM users may read their own tickets only. Request updates can go to
    // every operational user at the site, as requested by the delivery policy.
    return purpose==='dailyUpdate'?sameSite&&['Production User','Maintenance User','MIS User'].includes(profile.assignedRole):selected.has(login);
  }).map(user=>String(user.login||'').trim().toLowerCase()))];
}

async function addTicketNotifications(client,recipients,reference,message,workflowTemplate,{whatsapp=true,whatsappRecipients=null,workflowType='',site=''}={}){
  const logins=[...new Set(recipients.map((value)=>String(value||'').trim().toLowerCase()).filter(Boolean))];
  for(const login of logins){
    await client.query(`INSERT INTO crm_notifications (recipient_login,ticket_reference,message) VALUES ($1,$2,$3)`,[login,reference,message]);
  }
  if(whatsapp){
    const audience=workflowType?whatsappRecipients??logins:await genericWhatsAppAlertLogins(client,whatsappRecipients??logins,{purpose:workflowTemplate?.templateKey,site});
    await sendWhatsAppNotifications(client,audience,reference,message,workflowTemplate,{workflowType,site});
  }
}

async function addTicketNotificationsBestEffort(client,recipients,reference,message,workflowTemplate,options){
  try{
    await addTicketNotifications(client,recipients,reference,message,workflowTemplate,options);
  }catch(error){
    console.error(`Request ${reference} was updated, but its follow-up notifications could not be saved.`,error);
  }
}

async function sendGenericWhatsAppAlertBestEffort(recipients,reference,message,template,site){
  try{
    const audience=await genericWhatsAppAlertLogins(pool,recipients,{purpose:template.templateKey,site});
    return await sendWhatsAppNotifications(pool,audience,reference,message,template,{site});
  }catch(error){console.error(`Saved ${reference}, but WhatsApp follow-up failed.`,error.message);return []}
}

let consolidatedReportRunning=false;

function vehicleTransferManagerRoles(session={}){
  return managerRoleSelection(session.permissions?.managerRoles?.length
    ?session.permissions.managerRoles:session.permissions?.managerRole);
}

const VEHICLE_TRANSFER_PM_ROLES=['Project Manager','Production Manager'];

function hasVehicleTransferPmRole(managerRoles=[]){
  return VEHICLE_TRANSFER_PM_ROLES.some((role)=>managerRoles.includes(role));
}

async function vehicleTransferAccessContext(session,client=pool){
  const user=await currentUserRecord(session,client);
  const managerRoles=vehicleTransferManagerRoles(session);
  const adminLevel=String(session?.permissions?.adminLevel||'').trim().toLowerCase();
  const administrator=session?.role==='super'&&['admin','super admin'].includes(adminLevel);
  const manager=session?.role==='super'&&adminLevel==='manager';
  const misUser=session?.role==='normal'&&session.assignedRole==='MIS User';
  const misManager=manager&&managerRoles.includes('MIS Manager');
  const pmManager=manager&&hasVehicleTransferPmRole(managerRoles);
  const scope=manager?managerReportScope(user):userSiteScope(user);
  return {user,administrator,manager,misUser,misManager,pmManager,scope,
    canView:administrator||misUser||misManager||pmManager,
    canSubmit:misUser||misManager};
}

function transferVisibleToContext(record,context){
  if(context.administrator)return true;
  if(context.misUser)return [record.source,record.destination].some((site)=>reportScopeIncludesSite(context.scope,site));
  if(context.manager)return [record.source,record.destination].some((site)=>reportScopeIncludesSite(context.scope,site));
  return false;
}

function transferSiteActionAllowed(context,site){
  return context.pmManager&&reportScopeIncludesSite(context.scope,site);
}

function transferMisVerificationAllowed(context,site){
  if(context.misUser)return reportScopeIncludesSite(context.scope,site);
  return context.misManager&&reportScopeIncludesSite(context.scope,site);
}

async function vehicleTransferPmLogins(client,site){
  const {rows}=await client.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
  const logins=[];
  for(const row of rows){
    const user=row.record_data||{};
    const login=String(user.login||'').trim().toLowerCase();
    if(!login)continue;
    const profile=resolveMobileAccess({user});
    if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'
      &&hasVehicleTransferPmRole(profile.permissions.managerRoles)
      &&userManagesSite(user,site))logins.push(login);
  }
  return [...new Set(logins)];
}

async function vehicleTransferMisLogins(client,site){
  const {rows}=await client.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
  const logins=[];
  for(const row of rows){
    const user=row.record_data||{};
    const login=String(user.login||'').trim().toLowerCase();
    if(!login)continue;
    const profile=resolveMobileAccess({user});
    const siteMatches=reportScopeIncludesSite(userSiteScope(user),site);
    const isSiteMisUser=profile.sessionRole==='normal'&&profile.assignedRole==='MIS User'&&siteMatches;
    const isSiteMisManager=profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'
      &&profile.permissions.managerRoles.includes('MIS Manager')&&userManagesSite(user,site);
    if(isSiteMisUser||isSiteMisManager)logins.push(login);
  }
  return [...new Set(logins)];
}

async function vehicleTransferSiteOptions(client=pool){
  const {rows}=await client.query(`SELECT master_name,record_data FROM master_records
    WHERE master_name IN ('Region master','Equipment master') ORDER BY created_at ASC`);
  const configured=REGION_DATA.flatMap((region)=>region.sites);
  for(const row of rows){
    if(row.master_name==='Region master')configured.push(...String(row.record_data?.sites||'').split(/\s*\|\s*/));
    else configured.push(row.record_data?.currentLocation||row.record_data?.location||row.record_data?.site||'');
  }
  return [...new Map(configured.map(displaySiteName).filter(Boolean).map((site)=>[canonicalSiteName(site),site])).values()];
}

app.get('/api/vehicle-transfers',requireSession,async(req,res,next)=>{
  try{
    const context=await vehicleTransferAccessContext(req.session);
    if(!context.canView)return res.status(403).json({error:'Only MIS users, MIS managers, assigned Project or Production Managers, and administrators can view vehicle transfers.'});
    const [{rows:transferRows},{rows:equipmentRows},sites]=await Promise.all([
      pool.query(`SELECT id,record_data,created_at FROM master_records WHERE master_name='Vehicle transfers' ORDER BY created_at DESC,id DESC`),
      pool.query(`SELECT id,record_data FROM master_records WHERE master_name='Equipment master' ORDER BY created_at ASC`),
      vehicleTransferSiteOptions(),
    ]);
    const records=transferRows.map((row)=>({id:row.id,...row.record_data,
      submittedAt:row.record_data.submittedAt||row.created_at,
      status:vehicleTransferStatus(row.record_data)}))
      .filter((record)=>transferVisibleToContext(record,context))
      .map((record)=>({...record,
        canApproveSource:vehicleTransferStatus(record)===VEHICLE_TRANSFER_STATUS.SOURCE_APPROVAL&&transferSiteActionAllowed(context,record.source),
        canVerifyDestination:vehicleTransferStatus(record)===VEHICLE_TRANSFER_STATUS.MIS_VERIFICATION&&transferMisVerificationAllowed(context,record.destination),
        canAcceptDestination:vehicleTransferStatus(record)===VEHICLE_TRANSFER_STATUS.DESTINATION_ACCEPTANCE&&transferSiteActionAllowed(context,record.destination),
      }));
    const equipment=equipmentRows.map((row)=>({id:row.id,...row.record_data})).filter((record)=>{
      if(!context.canSubmit)return false;
      const site=record.currentLocation||record.location||record.site;
      return reportScopeIncludesSite(context.scope,site);
    });
    res.set('Cache-Control','private, no-store');
    res.json({records,equipment,sites,capabilities:{canSubmit:context.canSubmit,canApproveSource:context.pmManager,
      canVerifyDestination:context.misUser||context.misManager,canAcceptDestination:context.pmManager}});
  }catch(error){next(error)}
});

app.post('/api/vehicle-transfers',requireSession,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const context=await vehicleTransferAccessContext(req.session,client);
    if(!context.canSubmit)return res.status(403).json({error:'Only an MIS User or MIS Manager can submit a vehicle transfer.'});
    const equipmentId=Number(req.body?.equipmentMasterId);
    await client.query('BEGIN');
    const {rows:equipmentRows}=await client.query(`SELECT id,record_data FROM master_records
      WHERE master_name='Equipment master' AND id=$1 FOR UPDATE`,[equipmentId]);
    const equipmentRow=equipmentRows[0];
    if(!equipmentRow){await client.query('ROLLBACK');return res.status(404).json({error:'The selected vehicle is no longer available in Vehicle Master.'})}
    const equipment={id:equipmentRow.id,...equipmentRow.record_data};
    const source=displaySiteName(equipment.currentLocation||equipment.location||equipment.site||'');
    const permittedSource=reportScopeIncludesSite(context.scope,source);
    if(!permittedSource){await client.query('ROLLBACK');return res.status(403).json({error:'You can submit transfers only for vehicles at your assigned locations.'})}
    const transferNo=String(req.body?.transferNo||'').trim().slice(0,80)||`VT-${Date.now()}-${randomUUID().slice(0,4).toUpperCase()}`;
    const record=normalizeOperationalSiteFields({
      transferNo,transferDate:String(req.body?.transferDate||'').trim(),source,
      destination:String(req.body?.destination||'').trim(),equipmentMasterId:equipmentRow.id,
      equipment:equipment.door||equipment.reg||equipment.equipmentName||equipment.itemName||'',door:equipment.door||'',reg:equipment.reg||'',
      modelNo:equipment.modelNo||equipment.model||'',manufacturerSerialNo:equipment.manufacturerSerialNo||'',lastMaintenanceDate:equipment.lastMaintenanceDate||'',
      chassisNo:equipment.chassisNo||'',driver:String(req.body?.driver||'').trim().slice(0,160),
      dieselQty:String(req.body?.dieselQty||'').trim().slice(0,80),kmr:String(req.body?.kmr||'').trim().slice(0,80),hmr:String(req.body?.hmr||'').trim().slice(0,80),
      remarks:String(req.body?.remarks||'').trim().slice(0,1000),status:VEHICLE_TRANSFER_STATUS.SOURCE_APPROVAL,
      submittedBy:req.session.name||req.session.login||'MIS',submittedLogin:String(req.session.login||'').trim().toLowerCase(),submittedAt:new Date().toISOString(),
    });
    const validationError=vehicleTransferValidationError(record);
    if(validationError){await client.query('ROLLBACK');return res.status(400).json({error:validationError})}
    const duplicate=await client.query(`SELECT id,record_data FROM master_records WHERE master_name='Vehicle transfers'
      AND lower(record_data->>'transferNo')=lower($1) LIMIT 1`,[transferNo]);
    if(duplicate.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'This transfer number already exists.'})}
    const pending=await client.query(`SELECT id FROM master_records WHERE master_name='Vehicle transfers'
      AND record_data->>'equipmentMasterId'=$1 AND record_data->>'status'=ANY($2::text[]) LIMIT 1`,[
        String(equipmentRow.id),[VEHICLE_TRANSFER_STATUS.SOURCE_APPROVAL,VEHICLE_TRANSFER_STATUS.MIS_VERIFICATION,VEHICLE_TRANSFER_STATUS.DESTINATION_ACCEPTANCE]
      ]);
    if(pending.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'This vehicle already has a transfer awaiting approval or acceptance.'})}
    const {rows}=await client.query(`INSERT INTO master_records (master_name,record_data) VALUES ('Vehicle transfers',$1::jsonb)
      RETURNING id,record_data,created_at`,[JSON.stringify(record)]);
    await client.query('COMMIT');
    const saved={id:rows[0].id,...rows[0].record_data,submittedAt:rows[0].record_data.submittedAt||rows[0].created_at,status:VEHICLE_TRANSFER_STATUS.SOURCE_APPROVAL};
    const recipients=await vehicleTransferPmLogins(pool,saved.source);
    await addTicketNotificationsBestEffort(pool,recipients,saved.transferNo,`Vehicle transfer ${saved.transferNo} for ${saved.equipment} is awaiting source-site PM dispatch approval from ${saved.source} to ${saved.destination}.`,null,{whatsapp:false});
    req.audit={eventType:'Vehicle transfer',module:'Vehicle transfers',action:'Submit vehicle transfer',targetType:'Vehicle transfer',targetReference:saved.transferNo,
      ...vehicleTransferAuditDetails(saved,{previousStatus:'Draft'})};
    res.status(201).json(saved);
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});

app.patch('/api/vehicle-transfers/:id/source-approval',requireSession,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const context=await vehicleTransferAccessContext(req.session,client);
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'A valid vehicle transfer is required.'});
    await client.query('BEGIN');
    const {rows}=await client.query(`SELECT record_data FROM master_records WHERE id=$1 AND master_name='Vehicle transfers' FOR UPDATE`,[id]);
    const before=rows[0]?.record_data;
    if(!before){await client.query('ROLLBACK');return res.status(404).json({error:'Vehicle transfer not found.'})}
    if(!transferSiteActionAllowed(context,before.source)){await client.query('ROLLBACK');return res.status(403).json({error:'Only the assigned source-site Project Manager can approve dispatch.'})}
    if(vehicleTransferStatus(before)!==VEHICLE_TRANSFER_STATUS.SOURCE_APPROVAL){await client.query('ROLLBACK');return res.status(409).json({error:'This transfer is no longer awaiting source approval.'})}
    const updated={...before,status:VEHICLE_TRANSFER_STATUS.MIS_VERIFICATION,sourceApprovedBy:req.session.name||req.session.login||'PM',sourceApprovedLogin:String(req.session.login||'').trim().toLowerCase(),sourceApprovedAt:new Date().toISOString()};
    await client.query(`UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name='Vehicle transfers'`,[JSON.stringify(updated),id]);
    await client.query('COMMIT');
    const recipients=await vehicleTransferMisLogins(pool,updated.destination);
    await addTicketNotificationsBestEffort(pool,recipients,updated.transferNo,`Vehicle transfer ${updated.transferNo} for ${updated.equipment} was dispatched from ${updated.source}. Destination-site MIS verification is required at ${updated.destination}.`,null,{whatsapp:false});
    req.audit={eventType:'Vehicle transfer',module:'Vehicle transfers',action:'Release vehicle from source',targetType:'Vehicle transfer',targetReference:updated.transferNo,
      ...vehicleTransferAuditDetails(updated,{previousStatus:before.status||VEHICLE_TRANSFER_STATUS.SOURCE_APPROVAL})};
    res.json({id,...updated});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});

app.patch('/api/vehicle-transfers/:id/destination-verification',requireSession,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const context=await vehicleTransferAccessContext(req.session,client);
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'A valid vehicle transfer is required.'});
    await client.query('BEGIN');
    const {rows}=await client.query(`SELECT record_data FROM master_records WHERE id=$1 AND master_name='Vehicle transfers' FOR UPDATE`,[id]);
    const before=rows[0]?.record_data;
    if(!before){await client.query('ROLLBACK');return res.status(404).json({error:'Vehicle transfer not found.'})}
    if(!transferMisVerificationAllowed(context,before.destination)){await client.query('ROLLBACK');return res.status(403).json({error:'Only an assigned destination-site MIS User or MIS Manager can verify this vehicle.'})}
    if(vehicleTransferStatus(before)!==VEHICLE_TRANSFER_STATUS.MIS_VERIFICATION){await client.query('ROLLBACK');return res.status(409).json({error:'This transfer is not awaiting destination MIS verification.'})}
    const updated={...before,status:VEHICLE_TRANSFER_STATUS.DESTINATION_ACCEPTANCE,
      destinationMisVerifiedBy:req.session.name||req.session.login||'MIS',destinationMisVerifiedLogin:String(req.session.login||'').trim().toLowerCase(),destinationMisVerifiedAt:new Date().toISOString()};
    await client.query(`UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name='Vehicle transfers'`,[JSON.stringify(updated),id]);
    await client.query('COMMIT');
    const recipients=await vehicleTransferPmLogins(pool,updated.destination);
    await addTicketNotificationsBestEffort(pool,recipients,updated.transferNo,`Destination MIS verified vehicle transfer ${updated.transferNo} for ${updated.equipment} at ${updated.destination}. Destination Project Manager acceptance is now required.`,null,{whatsapp:false});
    req.audit={eventType:'Vehicle transfer',module:'Vehicle transfers',action:'Verify vehicle at destination',targetType:'Vehicle transfer',targetReference:updated.transferNo,
      ...vehicleTransferAuditDetails(updated,{previousStatus:before.status})};
    res.json({id,...updated});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});

app.patch('/api/vehicle-transfers/:id/destination-acceptance',requireSession,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const context=await vehicleTransferAccessContext(req.session,client);
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'A valid vehicle transfer is required.'});
    await client.query('BEGIN');
    const {rows}=await client.query(`SELECT record_data FROM master_records WHERE id=$1 AND master_name='Vehicle transfers' FOR UPDATE`,[id]);
    const before=rows[0]?.record_data;
    if(!before){await client.query('ROLLBACK');return res.status(404).json({error:'Vehicle transfer not found.'})}
    if(!transferSiteActionAllowed(context,before.destination)){await client.query('ROLLBACK');return res.status(403).json({error:'Only the assigned destination-site Project Manager can accept this vehicle.'})}
    if(vehicleTransferStatus(before)!==VEHICLE_TRANSFER_STATUS.DESTINATION_ACCEPTANCE){await client.query('ROLLBACK');return res.status(409).json({error:'This transfer is not awaiting destination PM acceptance.'})}
    if(!before.destinationMisVerifiedAt){await client.query('ROLLBACK');return res.status(409).json({error:'Destination MIS verification must be completed before PM acceptance.'})}
    const equipmentRows=await client.query(`SELECT id,record_data FROM master_records WHERE master_name='Equipment master' FOR UPDATE`);
    const equipmentRow=equipmentRows.rows.find((row)=>transferMatchesEquipment(before,{id:row.id,...row.record_data}));
    if(!equipmentRow){await client.query('ROLLBACK');return res.status(409).json({error:'The matching vehicle was not found in Vehicle Master. Update the master identity before accepting.'})}
    const acceptedAt=new Date().toISOString(),acceptedBy=req.session.name||req.session.login||'PM';
    const updatedEquipment=applyAcceptedVehicleTransfer(equipmentRow.record_data,before,{acceptedAt,acceptedBy});
    const updated={...before,status:VEHICLE_TRANSFER_STATUS.COMPLETED,destinationAcceptedBy:acceptedBy,destinationAcceptedLogin:String(req.session.login||'').trim().toLowerCase(),destinationAcceptedAt:acceptedAt,vehicleMasterUpdatedAt:acceptedAt,vehicleMasterRecordId:equipmentRow.id};
    await client.query(`UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name='Equipment master'`,[JSON.stringify(updatedEquipment),equipmentRow.id]);
    await client.query(`UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name='Vehicle transfers'`,[JSON.stringify(updated),id]);
    await client.query('COMMIT');
    const [sourceRecipients,destinationMisRecipients]=await Promise.all([
      vehicleTransferPmLogins(pool,updated.source),vehicleTransferMisLogins(pool,updated.destination),
    ]);
    const recipients=[updated.submittedLogin,...sourceRecipients,...destinationMisRecipients].filter(Boolean);
    await addTicketNotificationsBestEffort(pool,recipients,updated.transferNo,`Vehicle transfer ${updated.transferNo} was accepted at ${updated.destination}. Vehicle Master now shows ${updated.equipment} at ${updated.destination}.`,null,{whatsapp:false});
    const transferAudit=vehicleTransferAuditDetails(updated,{previousStatus:before.status});
    transferAudit.changedFields.push({field:'Vehicle Master location',before:before.source,after:before.destination});
    req.audit={eventType:'Vehicle transfer',module:'Vehicle transfers',action:'Accept vehicle at destination',targetType:'Vehicle transfer',targetReference:updated.transferNo,...transferAudit};
    res.json({id,...updated});
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});

async function sendScheduledConsolidatedWhatsAppReports(now=new Date()){
  if(!databaseReady||consolidatedReportRunning)return {skipped:true};
  return {skipped:true,reason:'Fleet consolidated schedule is handled by the hierarchy report flow'};
  if(!consolidatedReportDue(now))return {skipped:true,reason:'outside scheduled report window'};
  consolidatedReportRunning=true;
  try{
    const window=consolidatedReportWindow(now);
    const [{rows:requestRows},{rows:equipmentRows},{rows:userRows}]=await Promise.all([
      pool.query(`SELECT reference,equipment_name AS equipment,door_number AS door,chassis_number AS chassis,site,status,idle_reason AS "idleReason",
        owner_name AS "user",closed_by AS "closedBy",started_at AS "startedAt",closed_at AS "closedAt",
        accepted_at AS "acceptedAt",in_progress_at AS "inProgressAt",verified_at AS "verifiedAt"
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
        try{await sendMetaWhatsAppTemplate({to:phone,templateKey:'consolidatedRequestReport',parameters:[summary],context:{report:{site:scope.label,title:'Fleet consolidated report',period:`${reportDateTime(window.start)} to ${reportDateTime(window.end)}`,summary}}},{env:whatsappEnv})}
        catch(templateError){console.warn('Consolidated WhatsApp notification template unavailable; attempting PDF delivery:',templateError.message)}
        const pdf=await buildFleetConsolidatedReportPdf({scopeLabel:scope.label,start:window.start,end:window.end,openRequests:scopedOpen,closedRequests:scopedClosed});
        await sendMetaWhatsAppDocument({to:phone,buffer:pdf,filename:reportFilename('Fleet',scope.key,window.slotKey),caption:`*SITE: ${scope.label}*\n*Nerve Center | Fleet consolidated report*\n*Period:* ${reportDateTime(window.start)} to ${reportDateTime(window.end)} IST\nOpen the attached PDF for complete details.`},{env:whatsappEnv});
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
  const pdfFilename=siteReportFilename('CRM',scopeLabel,slotKey,'pdf');
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

function crmReportGroups({user,profile,reportSettings,scheduleSettings,userSchedule,hierarchyRule,now}){
  const designation=flowDesignationForUser(user,profile);
  if(designation&&userSchedule&&(!userSchedule.designationKey||userSchedule.designationKey===designation.key)){
    const roleSettings=hierarchyRule?applyHierarchyDeliveryRule(scheduleSettings,designation.key,hierarchyRule):scheduleSettings;
    const effective=applyUserReportScheduleOverride(roleSettings,designation.key,userSchedule);
    const allowed=effective.designations[designation.key];
    const login=reportRecipientLogin(user);
    if(!allowed?.allRecipients&&!allowed?.recipientLogins?.includes(login))return [];
    return combineReportWindowGroups(reportsDueForDesignation(designation.key,now,20,effective)).map(group=>({...group,slotKey:`CRM-${group.slotKey}`}));
  }
  // A delayed poll can cover multiple nearby slots. Keep each existing CRM
  // claim key so retries and already-sent reports remain independently tracked.
  const windows=scheduledReportWindowsDue(reportSettings.crm,now,20)
    .map(window=>({...window,slotKey:ticketReportWindow(window.end,reportSettings.crm).slotKey}));
  return windows.map(window=>({window,slotKey:window.slotKey,scheduleKey:'crm-default'}));
}

let consolidatedTicketReportRunning=false;
async function sendScheduledConsolidatedTicketReports(now=new Date()){
  if(!databaseReady||consolidatedTicketReportRunning)return {skipped:true};
  const reportSettings=await storedWhatsAppReportSettings();
  if(!whatsappPurposeEnabled(reportSettings,'consolidatedTicketReport',now))return {skipped:true,reason:'paused by Report settings'};
  consolidatedTicketReportRunning=true;
  try{
    const [{rows:userRows},{rows:hierarchyRows},{rows:equipmentRows},scheduleSettings,userScheduleOverrides]=await Promise.all([
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Hierarchy master' ORDER BY created_at ASC`),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Equipment master'`),
      storedHierarchyReportScheduleSettings(),storedUserReportScheduleOverrides(),
    ]);
    const windows=new Map(),bundles=new Map();
    let sent=0,failed=0,skipped=0;
    for(const row of userRows){
      const user=row.record_data||{},profile=resolveMobileAccess({user});
      if(profile.sessionRole!=='super')continue;
      // Legacy manager accounts may normalize to Admin permissions. Directors
      // retain their existing account category for the CRM report switches.
      const crmRole={admin:'Admin',manager:'Manager',superAdmin:'Super Admin'}[whatsAppRecipientRole(user,profile)]||profile.permissions.adminLevel;
      if(!reportSettings.crm.recipientRoles.includes(crmRole))continue;
      const login=reportRecipientLogin(user),phone=String(user.phone||user.phoneNo||user.phoneNumber||'').trim();
      if(!login)continue;
      const designation=flowDesignationForUser(user,profile);
      const hierarchyRule=designation?hierarchyRuleForDesignation(hierarchyRows,designation):null;
      const scope=hierarchyRecipientReportScope(user,profile,hierarchyRule?.siteAccess);
      if(Array.isArray(scope.sites)&&!scope.sites.length){skipped++;continue}
      const groups=crmReportGroups({user,profile,reportSettings,scheduleSettings,userSchedule:userScheduleOverrides.get(login),hierarchyRule,now});
      for(const group of groups){
        const {window,slotKey}=group,key=`${window.start.toISOString()}/${window.end.toISOString()}`;
        if(!windows.has(key)){
          const {rows}=await pool.query(`SELECT reference,site,creator_name AS "user",message AS remarks,status,
            created_at AS "openedAt",resolved_at AS "resolvedAt" FROM crm_tickets
            WHERE (created_at >= $1 AND created_at < $2) OR (resolved_at >= $1 AND resolved_at < $2)`,[window.start,window.end]);
          const tickets=rows.filter(ticket=>timestampInReportWindow(ticket.openedAt,window)||timestampInReportWindow(ticket.resolvedAt,window))
            .map(ticket=>ticket.resolvedAt&&new Date(ticket.resolvedAt)>=window.end?{...ticket,resolvedAt:null,status:'Open'}:ticket);
          windows.set(key,prepareTicketReportRows(tickets,window.end));
        }
        const tickets=windows.get(key).filter(ticket=>reportScopeIncludesSite(scope,ticket.site));
        const sites=reportSites({requests:tickets,equipmentRecords:equipmentRows.map(row=>row.record_data||{})},scope);
        const selectedSites=sites.filter(site=>reportSettings.crm.sendEmpty||tickets.some(ticket=>canonicalSiteName(ticket.site)===site));
        if(!selectedSites.length){skipped++;continue}
        const claim=await pool.query(`INSERT INTO whatsapp_consolidated_report_runs
            (slot_key,recipient_login,scope_key,status,attempts,updated_at) VALUES ($1,$2,$3,'Sending',1,NOW())
            ON CONFLICT (slot_key,recipient_login,scope_key) DO UPDATE
              SET status='Sending',attempts=whatsapp_consolidated_report_runs.attempts+1,updated_at=NOW()
              WHERE whatsapp_consolidated_report_runs.status LIKE 'Failed%' AND whatsapp_consolidated_report_runs.attempts<3
            RETURNING id`,[slotKey,login,'CRM-SELECTED-LOCATIONS']);
        if(!claim.rowCount){skipped++;continue}
        const recipientName=String(user.employee||user.name||user.login||login);
        let status='Sent';
        try{
          if(!phone)throw new Error('Phone number missing');
          const siteReports=[],siteBundles=[];
          for(const site of selectedSites){
            const selected=tickets.filter(ticket=>canonicalSiteName(ticket.site)===site);
            const scopedOpen=selected.filter(ticket=>!ticket.resolvedAt),scopedClosed=selected.filter(ticket=>Boolean(ticket.resolvedAt));
            const bundleKey=`${key}/${site}`;
            if(!bundles.has(bundleKey))bundles.set(bundleKey,publishCrmReportFiles({scopeLabel:displaySiteName(site),start:window.start,end:window.end,openTickets:scopedOpen,closedTickets:scopedClosed,slotKey,scopeKey:site}));
            const bundle=await bundles.get(bundleKey);
            siteBundles.push(bundle);
            siteReports.push(siteReportMessageContext({kind:'CRM',site,window,count:selected.length,pdfUrl:bundle.pdfUrl,xlsxUrl:bundle.xlsxUrl,summary:`${selected.length} tickets with activity | ${scopedOpen.length} open | ${scopedClosed.length} resolved`}));
          }
          const delivery=recipientReportMessage({kind:'CRM',window,reports:siteReports});
          const env=await metaWhatsAppRuntimeEnv();
          try{await sendMetaWhatsAppTemplate({to:phone,templateKey:'consolidatedTicketReport',parameters:[delivery.message],context:{report:delivery.reportContext}},{env})}
          catch(templateError){
            // An uncertain response may already have delivered the message.
            // Fall back only after a definite unavailable-template rejection.
            if(templateError.code==='WHATSAPP_POLICY_PAUSED'||Number(templateError.metaCode)!==132001)throw templateError;
            if(siteBundles.length===1){
              const bundle=siteBundles[0];
              await sendMetaWhatsAppDocument({to:phone,buffer:bundle.pdf,purpose:'consolidatedTicketReport',filename:bundle.pdfFilename,caption:delivery.message},{env});
            }else{
              await sendMetaWhatsAppText({to:phone,message:delivery.message,purpose:'consolidatedTicketReport'},{env});
            }
          }
          sent++;
        }catch(error){status=`Failed - ${String(error?.message||'CRM delivery error').slice(0,160)}`;failed++;console.error(`CRM report failed for ${login}:`,error.message)}
        await Promise.all([
          pool.query(`UPDATE whatsapp_consolidated_report_runs SET status=$1,updated_at=NOW() WHERE id=$2`,[status,claim.rows[0].id]),
          pool.query(`INSERT INTO whatsapp_alert_history
              (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,['Consolidated CRM report',selectedSites.map(displaySiteName).join(' | '),slotKey,recipientName,phone,status]),
        ]);
      }
    }
    return {sent,failed,skipped};
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

async function publishDirectorReportFiles({baseUrl,slotKey,now=new Date(),reportTitles=null,heading="Director's Daily Report",scheduleLabel='Daily 07:00:00 PM IST',siteAccess='',eventRequest=null,window=null,sourceData:providedSource=null}){
  if(window){
    const sourceData=providedSource||await directorReportSourceData();
    const tables=buildSiteFleetReportTables({source:sourceData,site:siteAccess,window,reportTitles:reportTitles||[]});
    const site=displaySiteName(siteAccess);
    const title=`${site} - Consolidated fleet report`;
    const subtitle=`${formatDisplayDateTime(window.start)} to ${formatDisplayDateTime(window.end)} IST`;
    const pdf=await buildTableBundlePdf({title,subtitle,tables,generatedAt:now});
    const xlsx=buildXlsxReportBundleBuffer({title:`${title} | ${subtitle}`,tables});
    const pdfFilename=siteReportFilename('Fleet',site,slotKey,'pdf'),xlsxFilename=siteReportFilename('Fleet',site,slotKey,'xlsx');
    const pdfCode=randomUUID().replace(/-/g,'').slice(0,16),xlsxCode=randomUUID().replace(/-/g,'').slice(0,16);
    await pool.query(`DELETE FROM published_reports WHERE expires_at<=NOW()`);
    await pool.query(`INSERT INTO published_reports (id,short_code,filename,content_type,file_data,expires_at) VALUES
      ($1,$2,$3,'application/pdf',$4,NOW()+INTERVAL '14 days'),
      ($5,$6,$7,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',$8,NOW()+INTERVAL '14 days')`,
      [randomUUID(),pdfCode,pdfFilename,pdf,randomUUID(),xlsxCode,xlsxFilename,xlsx]);
    const pdfUrl=`${baseUrl}/r/${pdfCode}`,xlsxUrl=`${baseUrl}/r/${xlsxCode}`;
    return {slotKey,generatedAt:now,links:[{title,site,pdfUrl,xlsxUrl,rowCount:tables[0].rows.length}],
      files:[{filename:pdfFilename,contentType:'application/pdf',content:pdf},{filename:xlsxFilename,contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',content:xlsx}],
      reportContext:siteReportMessageContext({site,window,count:tables[0].rows.length,pdfUrl,xlsxUrl}),
      message:buildSiteReportMessage({site,window,count:tables[0].rows.length,pdfUrl,xlsxUrl})};
  }
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
  const message=buildDirectorWhatsAppMessage({generatedAt:now,links,heading,scheduleLabel,siteScope:siteAccess||'All permitted sites'});
  return {slotKey,generatedAt:now,links,files,message,reportContext:{site:siteAccess||'All permitted sites',title:heading,period:formatDisplayDateTime(now),summary:message}};
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
      parameters:[bundle.message],context:{report:bundle.reportContext||{site:'All permitted sites',title:'Fleet report bundle',period:formatDisplayDateTime(bundle.generatedAt),summary:bundle.message}},
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

function combineReportWindowGroups(groups=[]){
  const combined=new Map();
  for(const group of groups){
    if(!group.window)continue;
    const key=`${group.window.start.toISOString()}/${group.window.end.toISOString()}`;
    const current=combined.get(key)||{window:group.window,reports:[],slotKeys:[],scheduleKeys:[],labels:[]};
    current.reports.push(...group.reports);current.slotKeys.push(group.slotKey);current.scheduleKeys.push(group.scheduleKey);current.labels.push(group.scheduleLabel);combined.set(key,current);
  }
  return [...combined.values()].map(group=>({...group,reports:[...new Set(group.reports)],slotKey:group.slotKeys.sort().join('+'),scheduleKey:group.scheduleKeys.sort().join('+'),scheduleLabel:[...new Set(group.labels)].join(' + ')}));
}

let hierarchyReportRunning=false;
async function sendScheduledHierarchyReportBundles(now=new Date(),event=null){
  if(event)return {skipped:true,reason:'Individual events use alerts; reports are consolidated at scheduled times.'};
  if(!databaseReady||hierarchyReportRunning)return {skipped:true};
  if(!whatsappPurposeEnabled(await storedWhatsAppReportSettings(),'consolidatedRequestReport',now))return {skipped:true,reason:'paused by Report settings'};
  hierarchyReportRunning=true;
  try{
    const [{rows:userRows},{rows:hierarchyRows},scheduleSettings,userScheduleOverrides]=await Promise.all([
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees' ORDER BY created_at ASC`),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Hierarchy master' ORDER BY created_at ASC`),
      storedHierarchyReportScheduleSettings(),storedUserReportScheduleOverrides(),
    ]);
    let sourceData=null;
    const bundles=new Map();
    let sent=0,failed=0,skipped=0;
    for(const row of userRows){
      const user=row.record_data||{},profile=resolveMobileAccess({user});
      const designation=flowDesignationForUser(user,profile);
      if(!designation)continue;
      const designationSettings=scheduleSettings.designations[designation.key];
      const login=reportRecipientLogin(user);
      if(!designationSettings?.allRecipients&&!designationSettings?.recipientLogins?.includes(login)){skipped++;continue}
      const hierarchyRule=hierarchyRuleForDesignation(hierarchyRows,designation);
      const roleScheduleSettings=hierarchyRule?applyHierarchyDeliveryRule(scheduleSettings,designation.key,hierarchyRule):scheduleSettings;
      const effectiveScheduleSettings=applyUserReportScheduleOverride(roleScheduleSettings,designation.key,userScheduleOverrides.get(login)||null);
      if(hierarchyRule){
        // Only report rows this recipient may receive can advance the window.
        // The effective settings are a fresh per-recipient copy.
        const effectiveDesignation=effectiveScheduleSettings.designations[designation.key];
        effectiveDesignation.schedules=effectiveDesignation.schedules.map(schedule=>({...schedule,
          reports:schedule.reports.filter(title=>hierarchyAccessAllowsReport(hierarchyRule.reportAccess,title)),
        }));
      }
      const dueGroups=combineReportWindowGroups(reportsDueForDesignation(designation.key,now,20,effectiveScheduleSettings));
      if(!dueGroups.length)continue;
      const recipientScope=hierarchyRecipientReportScope(user,profile,hierarchyRule?.siteAccess);
      if(Array.isArray(recipientScope.sites)&&!recipientScope.sites.length){skipped++;continue}
      const phone=String(user.phone||user.phoneNo||user.phoneNumber||'').trim();
      const recipientName=String(user.employee||user.name||user.login||designation.label);
      if(!phone){skipped++;continue}
      sourceData??=await directorReportSourceData();
      const sites=reportSites(sourceData,recipientScope);
      for(const group of dueGroups){
        const reportTitles=group.reports.filter(title=>!hierarchyRule||hierarchyAccessAllowsReport(hierarchyRule.reportAccess,title));
        if(!reportTitles.length){skipped++;continue}
        if(!sites.length){skipped++;continue}
        const {slotKey,scheduleKey,window,scheduleLabel}=group;
        const claim=await pool.query(`INSERT INTO whatsapp_consolidated_report_runs
            (slot_key,recipient_login,scope_key,status,attempts,updated_at) VALUES ($1,$2,$3,'Sending',1,NOW())
            ON CONFLICT (slot_key,recipient_login,scope_key) DO UPDATE
              SET status='Sending',attempts=whatsapp_consolidated_report_runs.attempts+1,updated_at=NOW()
              WHERE whatsapp_consolidated_report_runs.status LIKE 'Failed%' AND whatsapp_consolidated_report_runs.attempts<3
            RETURNING id`,[slotKey,login,`HIERARCHY-${designation.key}-${scheduleKey}-SELECTED-LOCATIONS`]);
        if(!claim.rowCount){skipped++;continue}
        let status='Sent';
        try{
          const siteReports=[];
          for(const site of sites){
            const bundleKey=JSON.stringify([site,window.start,window.end,[...reportTitles].sort()]);
            if(!bundles.has(bundleKey))bundles.set(bundleKey,publishDirectorReportFiles({baseUrl:publicBaseUrl(),slotKey,now,reportTitles,siteAccess:site,heading:`${designation.label} Consolidated Report`,scheduleLabel,window,sourceData}));
            const bundle=await bundles.get(bundleKey);
            siteReports.push(bundle.reportContext);
          }
          const delivery=recipientReportMessage({window,reports:siteReports});
          const env=await metaWhatsAppRuntimeEnv();
          await sendMetaWhatsAppTemplate({to:phone,templateKey:'consolidatedRequestReport',purpose:'consolidatedRequestReport',parameters:[delivery.message],context:{report:delivery.reportContext}},{env});sent++;
        }catch(error){
          status=`Failed - ${String(error?.message||'Hierarchy WhatsApp delivery error').slice(0,160)}`;failed++;
          console.error(`Hierarchy WhatsApp report failed for ${recipientName}:`,error.message);
        }
        await Promise.all([
            pool.query(`UPDATE whatsapp_consolidated_report_runs SET status=$1,updated_at=NOW() WHERE id=$2`,[status,claim.rows[0].id]),
            pool.query(`INSERT INTO whatsapp_alert_history
              (report_type,target_name,report_level,recipient_name,recipient_phone,status) VALUES ($1,$2,$3,$4,$5,$6)`,['Consolidated fleet report',sites.map(displaySiteName).join(' | '),slotKey,recipientName,phone,status]),
        ]);
      }
    }
    return {sent,failed,skipped};
  }finally{hierarchyReportRunning=false}
}

async function sendRequestEventReports(){
  return {skipped:true,reason:'Individual events use alerts; reports are consolidated at scheduled times.'};
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
    const siteMatches=reportScopeIncludesSite(userSiteScope(user),requestSite);
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
      managerScope=userSiteScope(await currentUserRecord(req.session));
    }else if(req.session.permissions?.adminLevel==='Manager'){
      const user=await currentUserRecord(req.session);
      values.push(managerRoleSelection(req.session.permissions?.managerRoles?.length?req.session.permissions.managerRoles:req.session.permissions?.managerRole).map(managerUserRole));
      conditions.push(`creator_role=ANY($${values.length}::text[])`);
      managerScope=managerReportScope(user);
    }
    if(category){values.push(category);conditions.push(`category=$${values.length}`)}
    const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
    const {rows}=await pool.query(`SELECT ${ticketProjection()} FROM crm_tickets ${where} ORDER BY created_at DESC`,values);
    const visibleRows=managerScope?rows.filter((ticket)=>reportScopeIncludesSite(managerScope,ticket.site)):rows;
    const payload=visibleRows.map(normalizeOperationalSiteFields);
    if(typeof sendPrivateJson==='function')return sendPrivateJson(req,res,'tickets',payload);
    return res.json(payload);
  }catch(error){next(error)}
});

const ticketMediaFields={
  'message-audio':{column:'message_audio',nameColumn:null,fallbackName:'ticket-message.webm'},
  attachment:{column:'attachment_data',nameColumn:'attachment_name',fallbackName:'ticket-attachment'},
  'resolution-audio':{column:'resolution_audio',nameColumn:null,fallbackName:'ticket-resolution.webm'},
  'resolution-attachment':{column:'resolution_attachment_data',nameColumn:'resolution_attachment_name',fallbackName:'resolution-attachment'},
};

app.get('/api/tickets/:reference/media/:kind',requireSession,async(req,res,next)=>{
  try{
    const media=ticketMediaFields[String(req.params.kind||'')];
    if(!media)return res.status(404).json({error:'Ticket media is not available.'});
    const nameSelection=media.nameColumn?`,${media.nameColumn} AS name`:`,'' AS name`;
    const {rows}=await pool.query(`SELECT creator_login AS "creatorLogin",creator_role AS "creatorRole",site,
      ${media.column} AS data${nameSelection} FROM crm_tickets WHERE reference=$1`,[String(req.params.reference||'').trim()]);
    const ticket=rows[0];
    if(!ticket||!await ticketVisibleToSession(ticket,req.session))return res.status(404).json({error:'Ticket media is not available.'});
    return sendDataUrlMedia(res,ticket.data,{name:ticket.name||media.fallbackName});
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
    const assignedSites=userSiteSelection(user);
    const site=req.session.role==='super'
      ? displaySiteName(user.site||user.location||user.currentLocation)||'Not assigned'
      : displaySiteName(req.body?.site||(assignedSites.length===1?assignedSites[0]:''));
    if(req.session.role!=='super'&&!reportScopeIncludesSite(userSiteScope(user),site))
      return res.status(403).json({error:'Select one of your assigned sites for this ticket.'});

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
      {templateKey:'ticketCreated',parameters:[reference,req.session.name||creatorLogin,site],context:{ticket:rows[0],url:publicBaseUrl()}},{whatsapp:false});
    await client.query('COMMIT');
    res.status(201).json(normalizeOperationalSiteFields(rows[0]));
    void sendGenericWhatsAppAlertBestEffort([creatorLogin,...recipients.adminLogins],reference,`Ticket ${reference} was created.`,
      {templateKey:'ticketCreated',parameters:[reference,req.session.name||creatorLogin,site],context:{ticket:rows[0],url:publicBaseUrl()}},site);
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
      {templateKey:'ticketResolved',parameters:[ticket.reference,req.session.name||'Admin'],context:{ticket,url:publicBaseUrl()}},{whatsapp:false});
    await client.query('COMMIT');
    res.json(ticket);
    void sendGenericWhatsAppAlertBestEffort([ticket.creatorLogin,...recipients.adminLogins],ticket.reference,`Ticket ${ticket.reference} was resolved.`,
      {templateKey:'ticketResolved',parameters:[ticket.reference,req.session.name||'Admin'],context:{ticket,url:publicBaseUrl()}},ticket.site);
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
      const siteMatches=reportScopeIncludesSite(userSiteScope(user),request.site);
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
        COALESCE(NULLIF(r.site,''),t.site,transfer.record_data->>'destination','') AS site,
        COALESCE(r.door_number,transfer.record_data->>'door',transfer.record_data->>'equipment','') AS door,
        COALESCE(t.category,CASE WHEN transfer.id IS NOT NULL THEN 'Vehicle transfer' END,'') AS "ticketCategory",
        to_char(n.created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "createdAt"
        FROM crm_notifications n
        LEFT JOIN maintenance_requests r ON r.reference=n.ticket_reference
        LEFT JOIN crm_tickets t ON t.reference=n.ticket_reference
        LEFT JOIN master_records transfer ON transfer.master_name='Vehicle transfers'
          AND transfer.record_data->>'transferNo'=n.ticket_reference
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

    const [ticketResult,requestResult,transferResult]=await Promise.all([
      pool.query(`SELECT ${ticketProjection()} FROM crm_tickets WHERE reference=$1`,[reference]),
      pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]),
      pool.query(`SELECT id,record_data FROM master_records WHERE master_name='Vehicle transfers' AND record_data->>'transferNo'=$1 ORDER BY created_at DESC LIMIT 1`,[reference]),
    ]);
    if([ticketResult,requestResult,transferResult].filter((result)=>result.rows.length).length>1)return unavailable();

    if(ticketResult.rows.length){
      const ticket=ticketResult.rows[0];
      if(!await ticketVisibleToSession(ticket,req.session))return unavailable();
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

    if(transferResult.rows.length){
      const transfer={id:transferResult.rows[0].id,...transferResult.rows[0].record_data};
      const context=await vehicleTransferAccessContext(req.session);
      if(!context.canView||!transferVisibleToContext(transfer,context))return unavailable();
      return res.json({kind:'transfer',reference,record:{...transfer,status:vehicleTransferStatus(transfer)}});
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
  registration_number AS reg, chassis_number AS chassis, driver_name AS "driverName", driver_name_source AS "driverNameSource", superior_name AS superior, site, category, complaint, (complaint_audio <> '') AS "complaintAudioAvailable", complaint_language AS "complaintLanguage", maintenance_work_language AS "maintenanceWorkLanguage",
  (complaint_media <> '[]'::jsonb) AS "complaintMediaAvailable",
  to_char(started_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS start,
  to_char(accepted_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "acceptedAt", accepted_by AS "acceptedBy", acceptance_required AS "acceptanceRequired",
  to_char(arrival_flagged_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "arrivalFlaggedAt", arrival_flagged_by AS "arrivalFlaggedBy", arrival_flag_remark AS "arrivalFlagRemark",
  to_char(mis_flagged_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "misFlaggedAt", mis_flagged_by AS "misFlaggedBy", mis_flag_remark AS "misFlagRemark",
  CASE WHEN closed_at IS NULL THEN '—' ELSE CONCAT(FLOOR(EXTRACT(EPOCH FROM (closed_at-started_at))/86400)::int,'d ',FLOOR(MOD(EXTRACT(EPOCH FROM (closed_at-started_at)),86400)/3600)::int,'h ',FLOOR(MOD(EXTRACT(EPOCH FROM (closed_at-started_at)),3600)/60)::int,'m') END AS hours,
  status, idle_reason AS "idleReason", owner_name AS owner, requester_login AS "requesterLogin", requester_role AS "requesterRole",
  to_char(ideal_requested_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "idealRequestedAt",
  ideal_requested_by AS "idealRequestedBy",to_char(ideal_approved_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "idealApprovedAt",ideal_approved_by AS "idealApprovedBy",
  to_char(closed_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "closedAt",
  closed_by AS "closedBy", maintenance_work AS "maintenanceWork", (maintenance_audio <> '') AS "maintenanceAudioAvailable", delayed_reason AS "delayedReason", to_char(expected_completion_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "expectedCompletionAt", verification_status AS "verificationStatus",
  to_char(verified_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "verifiedAt",
  verified_by AS "verifiedBy", first_trip_done AS "firstTripDone",
  to_char(first_trip_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "firstTripAt",
  first_trip_by AS "firstTripBy", (first_trip_card_image <> '') AS "firstTripCardUploaded",
  meter_type AS "meterType", opening_meter_reading AS "openingMeterReading",
  opening_meter_readings AS "openingMeterReadings", closing_meter_readings AS "closingMeterReadings",
  (opening_meter_file <> '') AS "openingMeterFileUploaded", opening_meter_file_name AS "openingMeterFileName",
  closing_meter_reading AS "closingMeterReading", (closing_meter_file <> '') AS "closingMeterFileUploaded",
  closing_meter_file_name AS "closingMeterFileName"`;

const infoPulseProjection=`reference AS ref,equipment_name AS equipment,equipment_group AS "equipmentGroup",door_number AS door,
  registration_number AS reg,site,category,complaint,owner_name AS owner,requester_login AS "requesterLogin",
  to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "createdAt",
  to_char(started_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS start,status,idle_reason AS "idleReason",
  to_char(closed_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "closedAt",
  to_char(expected_completion_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS "expectedCompletionAt",
  verification_status AS "verificationStatus",to_char(verified_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "verifiedAt",
  meter_type AS "meterType",EXISTS(SELECT 1 FROM maintenance_daily_remarks remark WHERE remark.request_reference=maintenance_requests.reference) AS "hasDailyRemarks"`;

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
      site,category,complaint,complaint_audio AS "complaintAudio",maintenance_work AS "maintenanceWork",maintenance_audio AS "maintenanceAudio",ideal_requested_by AS "idealRequestedBy",chassis_number AS chassis,registration_number AS reg,owner_name AS owner,idle_reason AS "idleReason",status,started_at AS "startedAtRaw",
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
        ? {templateKey:'requestIdle',parameters:[equipmentDetails,request.site,requestNotificationTime(eventTime),request.idleReason||'Not recorded',request.ref,'Project Manager or Production Manager must approve Make On Road',workflowRequestLink(request.ref,publicBaseUrl())],context:{request}}
        : {templateKey:'requestOpened',parameters:[request.ref,request.site,request.equipmentGroup||request.equipment||'Not available',request.door||'Not available',request.category||'Breakdown',request.owner||'Production User',requestNotificationTime(eventTime),request.expectedCompletionAtRaw?requestNotificationTime(request.expectedCompletionAtRaw):'Not set',workflowRequestLink(request.ref,publicBaseUrl())],context:{request}};
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
    const {rows}=await pool.query(`SELECT ${infoPulseProjection} FROM maintenance_requests ORDER BY created_at DESC`);
    const visibleRows=requestsVisibleToSession(scopeInfoPulseRequests(rows,scope),authorization.session);
    const payload={requests:visibleRows,scope};
    if(typeof sendPrivateJson==='function')return sendPrivateJson(req,res,'info-pulse',payload);
    return res.json(payload);
  }catch(error){next(error)}
});

// Records when a user last saw the login Info Pulse so it opens once per
// four hours across every sign-in and device, not on every login.
app.post('/api/info-pulse/prompt',requireSession,async(req,res,next)=>{
  try{
    res.set('Cache-Control','no-store');
    const authorization=await currentDashboardAuthorization(req.session);
    const operationalRole=authorization?.session.role==='normal'&&['Production User','Maintenance User','MIS User'].includes(authorization.session.assignedRole);
    if(!authorization||(authorization.session.role!=='super'&&!operationalRole&&authorization.session.permissions?.readRequests!==true))
      return res.json({show:false,closeAfterMs:0,nextAvailableAt:0});
    res.json(await claimInfoPulsePrompt((text,values)=>pool.query(text,values),infoPulsePromptKey(req.session)));
  }catch(error){next(error)}
});

registerRequestCorrectionRoutes();

app.get('/api/requests',requireSession,async(req,res,next)=>{
  try{
    const operationalRole=req.session.role==='normal'&&['Production User','Maintenance User','MIS User'].includes(req.session.assignedRole);
    const generalDashboard=req.session.assignedRole==='General User'&&req.query.scope==='dashboard'&&req.session.permissions?.viewDashboardRequests===true;
    if(req.session.role!=='super'&&!operationalRole&&!generalDashboard&&req.session.permissions?.readRequests!==true)
      return res.status(403).json({error:'Your assigned role is not authorized to view maintenance requests.'});
    const requesterLogin=String(req.session.login||'').trim().toLowerCase();
    const dashboardScope=req.query.scope==='dashboard';
    let query=req.session.role==='normal'&&req.session.assignedRole==='Production User'&&!dashboardScope
      ? {text:`SELECT ${requestProjection} FROM maintenance_requests WHERE requester_login=$1 ORDER BY created_at DESC`,values:[requesterLogin]}
      : {text:`SELECT ${requestProjection} FROM maintenance_requests ORDER BY created_at DESC`,values:[]};
    let scopedSite=null,scopedManagerSites=null;
    if(req.session.role==='normal'){
      const operationalUser=await currentUserRecord(req.session);
      scopedSite=userSiteScope(operationalUser);
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
        ? rows.filter((row)=>reportScopeIncludesSite(scopedSite,row.site))
        : [];
    const visibleRows=requestsVisibleToSession(siteVisibleRows,req.session);
    const payload=await attachDailyRemarks(visibleRows);
    if(typeof sendPrivateJson==='function')return sendPrivateJson(req,res,'requests',payload);
    return res.json(payload);
  }catch(error){next(error)}
});

const requestTimelineProjection=`id AS "timelineRequestId",started_at AS start,accepted_at AS "acceptedAt",closed_at AS "closedAt",first_trip_at AS "firstTripAt",verified_at AS "verifiedAt",expected_completion_at AS "expectedCompletionAt",ideal_requested_at AS "idealRequestedAt",ideal_approved_at AS "idealApprovedAt",in_progress_at AS "inProgressAt",NOW() AS "timelineRecordedAt"`;

const requestCorrectionProjection=`id,request_reference AS "requestReference",site,correction_type AS "correctionType",
  original_values AS "originalValues",proposed_changes AS "proposedChanges",reason,status,
  evidence_name AS "evidenceName",evidence_type AS "evidenceType",
  requested_by_login AS "requestedByLogin",requested_by_name AS "requestedByName",requested_at AS "requestedAt",
  reviewed_by_login AS "reviewedByLogin",reviewed_by_name AS "reviewedByName",reviewed_at AS "reviewedAt",review_remark AS "reviewRemark",
  applied_by_login AS "appliedByLogin",applied_by_name AS "appliedByName",applied_at AS "appliedAt"`;
const requestCorrectionSourceProjection=`id AS "timelineRequestId",reference,site,equipment_name AS equipment,equipment_group AS "equipmentGroup",door_number AS door,
  requester_login AS "requesterLogin",
  started_at AS "startedAt",started_at AS start,category,complaint,driver_name AS "driverName",superior_name AS "superiorName",meter_type AS "meterType",opening_meter_reading AS "openingMeterReading",
  accepted_at AS "acceptedAt",accepted_by AS "acceptedBy",expected_completion_at AS "expectedCompletionAt",
  closed_at AS "closedAt",closed_by AS "closedBy",maintenance_work AS "maintenanceWork",delayed_reason AS "delayedReason",
  verified_at AS "verifiedAt",verified_by AS "verifiedBy",first_trip_done AS "firstTripDone",first_trip_at AS "firstTripAt",first_trip_by AS "firstTripBy",
  closing_meter_reading AS "closingMeterReading",NOW() AS "timelineRecordedAt"`;

async function requestCorrectionAccessContext(session,client=pool){
  const user=await currentUserRecord(session,client);
  const adminLevel=String(session?.permissions?.adminLevel||'').trim().toLowerCase();
  const administrator=session?.role==='super'&&['admin','super admin'].includes(adminLevel);
  const managerRoles=managerRoleSelection(session?.permissions?.managerRoles?.length?session.permissions.managerRoles:session?.permissions?.managerRole);
  const pm=session?.role==='super'&&adminLevel==='manager'&&hasVehicleTransferPmRole(managerRoles);
  const allowedTypes=session?.role==='normal'?requestCorrectionTypesForRole(session.assignedRole):[];
  const requester=allowedTypes.length>0;
  return {user,administrator,pm,requester,allowedTypes,login:String(session?.login||'').trim().toLowerCase(),scope:pm?managerReportScope(user):requester?userSiteScope(user):null};
}

function correctionVisibleToContext(correction,context){
  return context.administrator
    ||(context.pm&&reportScopeIncludesSite(context.scope,correction.site))
    ||(context.requester&&String(correction.requestedByLogin||'').trim().toLowerCase()===context.login);
}

async function correctionAdministratorLogins(client=pool){
  const {rows}=await client.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`);
  return [...new Set(rows.flatMap((row)=>{
    const user=row.record_data||{},profile=resolveMobileAccess({user});
    const adminLevel=String(profile.permissions?.adminLevel||'').trim().toLowerCase();
    const login=String(user.login||'').trim().toLowerCase();
    return profile.sessionRole==='super'&&['admin','super admin'].includes(adminLevel)&&login?[login]:[];
  }))];
}

function correctionStageError(type,row={}){
  if(type==='maintenanceAcceptance'&&!row.acceptedAt)return 'Maintenance acceptance has not been recorded yet.';
  if(type==='onRoad'&&!row.closedAt)return 'The On Road entry has not been recorded yet.';
  if(type==='misVerification'&&!row.verifiedAt)return 'MIS verification has not been recorded yet.';
  return '';
}

function correctionValuesStillMatch(type,current,original,proposed){
  const snapshot=requestCorrectionSnapshot(current,type);
  return Object.keys(proposed||{}).every((key)=>JSON.stringify(snapshot[key]??'')===JSON.stringify(original?.[key]??''));
}

function registerRequestCorrectionRoutes(){
  app.get('/api/request-corrections',requireSession,async(req,res,next)=>{
  try{
    const context=await requestCorrectionAccessContext(req.session);
    if(!context.administrator&&!context.pm&&!context.requester)return res.status(403).json({error:'This account cannot access request corrections.'});
    const {rows}=await pool.query(`SELECT ${requestCorrectionProjection} FROM request_corrections ORDER BY requested_at DESC,id DESC`);
    res.set('Cache-Control','private, no-store');
    res.json({records:rows.filter((row)=>correctionVisibleToContext(row,context)),capabilities:{canCreate:context.requester,canReview:context.pm,canApply:context.administrator,allowedTypes:context.allowedTypes}});
  }catch(error){next(error)}
});

  app.get('/api/request-corrections/:id/evidence',requireSession,async(req,res,next)=>{
  try{
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'A valid correction is required.'});
    const context=await requestCorrectionAccessContext(req.session);
    const {rows}=await pool.query(`SELECT site,evidence_data AS "evidenceData",evidence_name AS "evidenceName",evidence_type AS "evidenceType" FROM request_corrections WHERE id=$1`,[id]);
    const row=rows[0];
    if(!row)return res.status(404).json({error:'Correction request not found.'});
    if(!correctionVisibleToContext(row,context))return res.status(403).json({error:'This correction belongs to a different location.'});
    res.set('Cache-Control','private, no-store');
    res.json(row);
  }catch(error){next(error)}
});

  app.post('/api/request-corrections',requireSession,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const access=await requestCorrectionAccessContext(req.session,client);
    if(!access.requester)return res.status(403).json({error:'Only Production, Maintenance, or MIS users can request a correction.'});
    const reference=String(req.body?.requestReference||'').trim();
    const type=requestCorrectionType(req.body?.correctionType);
    if(!access.allowedTypes.includes(type))return res.status(403).json({error:'You can request corrections only for entries created by your assigned department.'});
    const reason=String(req.body?.reason||'').trim();
    const evidenceData=String(req.body?.evidenceData||'');
    const evidenceName=String(req.body?.evidenceName||'').trim().slice(0,240);
    const evidenceType=String(req.body?.evidenceType||'image/jpeg').trim().slice(0,100);
    await client.query('BEGIN');
    const {rows}=await client.query(`SELECT ${requestCorrectionSourceProjection} FROM maintenance_requests WHERE reference=$1 FOR UPDATE`,[reference]);
    const request=rows[0];
    if(!request){await client.query('ROLLBACK');return res.status(404).json({error:'Maintenance request not found.'})}
    if(!reportScopeIncludesSite(access.scope,request.site)){await client.query('ROLLBACK');return res.status(403).json({error:'This request belongs to a different location.'})}
    if(req.session.assignedRole==='Production User'&&String(request.requesterLogin||'').trim().toLowerCase()!==access.login){await client.query('ROLLBACK');return res.status(403).json({error:'Production users can request correction only for their own Off Road entry.'})}
    const stageError=correctionStageError(type,request);
    if(stageError){await client.query('ROLLBACK');return res.status(409).json({error:stageError})}
    const originalValues=requestCorrectionSnapshot(request,type);
    let proposedChanges;
    try{proposedChanges=normalizeRequestCorrectionChanges(type,req.body?.proposedChanges||{},originalValues)}
    catch(error){await client.query('ROLLBACK');return res.status(error.status||400).json({error:error.message})}
    const validationError=requestCorrectionValidationError({type,reason,evidenceData,evidenceName,proposedChanges,originalValues});
    if(validationError){await client.query('ROLLBACK');return res.status(400).json({error:validationError})}
    const inserted=await client.query(`INSERT INTO request_corrections
      (request_reference,site,correction_type,original_values,proposed_changes,reason,evidence_data,evidence_name,evidence_type,status,requested_by_login,requested_by_name)
      VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9,$10,$11,$12) RETURNING ${requestCorrectionProjection}`,
      [reference,request.site,type,JSON.stringify(originalValues),JSON.stringify(proposedChanges),reason,evidenceData,evidenceName,evidenceType,REQUEST_CORRECTION_STATUS.PENDING,access.login,req.session.name||req.session.login||'User']);
    await client.query('COMMIT');
    const saved=inserted.rows[0];
    const pmLogins=await vehicleTransferPmLogins(pool,request.site);
    await addTicketNotificationsBestEffort(pool,pmLogins,reference,`Correction approval is required for ${reference} (${REQUEST_CORRECTION_TYPES[type].label}) at ${request.site}. Requested by ${saved.requestedByName}.`,null,{whatsapp:false});
    req.audit={eventType:'Correction',module:'Maintenance Requests',action:'User requested correction',targetType:'Maintenance request',targetReference:reference,reason,
      changedFields:[...requestCorrectionChangedFields(type,originalValues,proposedChanges),{field:'Correction status',before:'Draft',after:REQUEST_CORRECTION_STATUS.PENDING},{field:'Evidence image',before:'',after:evidenceName}]};
    res.status(201).json(saved);
  }catch(error){await client.query('ROLLBACK').catch(()=>{});if(error.code==='23505')return res.status(409).json({error:'This request already has an open correction of the selected type.'});next(error)}finally{client.release()}
});

  app.patch('/api/request-corrections/:id/review',requireSession,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const id=Number(req.params.id),decision=String(req.body?.decision||'').trim().toLowerCase(),remark=String(req.body?.remark||'').trim();
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'A valid correction is required.'});
    if(!['approve','reject'].includes(decision))return res.status(400).json({error:'Select Approve or Reject.'});
    if(remark.length<5||remark.length>1000)return res.status(400).json({error:'Enter a PM review remark between 5 and 1,000 characters.'});
    await client.query('BEGIN');
    const context=await requestCorrectionAccessContext(req.session,client);
    const {rows}=await client.query(`SELECT ${requestCorrectionProjection} FROM request_corrections WHERE id=$1 FOR UPDATE`,[id]);
    const before=rows[0];
    if(!before){await client.query('ROLLBACK');return res.status(404).json({error:'Correction request not found.'})}
    if(!context.pm||!reportScopeIncludesSite(context.scope,before.site)){await client.query('ROLLBACK');return res.status(403).json({error:'Only the assigned site Project / Production Manager can review this correction.'})}
    if(before.status!==REQUEST_CORRECTION_STATUS.PENDING){await client.query('ROLLBACK');return res.status(409).json({error:'This correction is no longer awaiting PM approval.'})}
    const status=decision==='approve'?REQUEST_CORRECTION_STATUS.APPROVED:REQUEST_CORRECTION_STATUS.REJECTED;
    const updated=await client.query(`UPDATE request_corrections SET status=$1,reviewed_by_login=$2,reviewed_by_name=$3,reviewed_at=NOW(),review_remark=$4 WHERE id=$5 RETURNING ${requestCorrectionProjection}`,
      [status,String(req.session.login||'').trim().toLowerCase(),req.session.name||req.session.login||'Project Manager',remark,id]);
    await client.query('COMMIT');
    const saved=updated.rows[0];
    const adminLogins=status===REQUEST_CORRECTION_STATUS.APPROVED?await correctionAdministratorLogins(pool):[];
    await addTicketNotificationsBestEffort(pool,[saved.requestedByLogin,...adminLogins],saved.requestReference,`Correction ${saved.id} for ${saved.requestReference} was ${status.toLowerCase()} by ${saved.reviewedByName}. ${status===REQUEST_CORRECTION_STATUS.APPROVED?'Admin may now apply the approved change.':'The record remains unchanged.'}`,null,{whatsapp:false});
    req.audit={eventType:'Correction',module:'Maintenance Requests',action:decision==='approve'?'Approve correction':'Reject correction',targetType:'Maintenance request',targetReference:saved.requestReference,reason:remark,
      changedFields:[{field:'Correction status',before:before.status,after:status}]};
    res.json(saved);
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});

  app.patch('/api/request-corrections/:id/apply',requireSession,async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const access=await requestCorrectionAccessContext(req.session,client);
    if(!access.administrator)return res.status(403).json({error:'Only an Admin or Super Admin can apply an approved correction.'});
    const id=Number(req.params.id);
    if(!Number.isInteger(id)||id<=0)return res.status(400).json({error:'A valid correction is required.'});
    await client.query('BEGIN');
    const correctionResult=await client.query(`SELECT ${requestCorrectionProjection} FROM request_corrections WHERE id=$1 FOR UPDATE`,[id]);
    const correction=correctionResult.rows[0];
    if(!correction){await client.query('ROLLBACK');return res.status(404).json({error:'Correction request not found.'})}
    if(correction.status!==REQUEST_CORRECTION_STATUS.APPROVED){await client.query('ROLLBACK');return res.status(409).json({error:'This correction is locked until the assigned PM approves it.'})}
    const requestResult=await client.query(`SELECT ${requestCorrectionSourceProjection} FROM maintenance_requests WHERE reference=$1 FOR UPDATE`,[correction.requestReference]);
    const before=requestResult.rows[0];
    if(!before){await client.query('ROLLBACK');return res.status(404).json({error:'The maintenance request no longer exists.'})}
    if(!correctionValuesStillMatch(correction.correctionType,before,correction.originalValues,correction.proposedChanges)){
      await client.query('ROLLBACK');
      return res.status(409).json({error:'The original request changed after this correction was submitted. Create a new correction from the latest values.'});
    }
    const timelineKey={startedAt:'start',acceptedAt:'acceptedAt',expectedCompletionAt:'expectedCompletionAt',closedAt:'closedAt',firstTripAt:'firstTripAt',verifiedAt:'verifiedAt'};
    const timelineChanges=Object.fromEntries(Object.entries(correction.proposedChanges).filter(([key])=>timelineKey[key]).map(([key,value])=>[timelineKey[key],value||null]));
    validateRequestTimelineChange(before,timelineChanges,{now:before.timelineRecordedAt,userEntered:Object.keys(timelineChanges).filter((key)=>key!=='expectedCompletionAt')});
    const fields=requestCorrectionFields(correction.correctionType).filter((field)=>Object.prototype.hasOwnProperty.call(correction.proposedChanges,field.key));
    const values=[];
    const assignments=fields.map((field)=>{
      values.push(correction.proposedChanges[field.key]===''&&field.kind==='datetime'?null:correction.proposedChanges[field.key]);
      const cast=field.kind==='datetime'?'::timestamptz':field.kind==='boolean'?'::boolean':'';
      return `${field.column}=$${values.length}${cast}`;
    });
    values.push(correction.requestReference);
    await client.query(`UPDATE maintenance_requests SET ${assignments.join(',')} WHERE reference=$${values.length}`,values);
    const timelineEvents=requestCorrectionTimelineFields(correction.correctionType,correction.proposedChanges);
    if(timelineEvents.length)await recordRequestTimeline(client,req,correction.requestReference,before,{events:timelineEvents,sources:Object.fromEntries(timelineEvents.map((event)=>[event,'user'])),reason:correction.reason,requireCorrectionReason:timelineEvents});
    const updated=await client.query(`UPDATE request_corrections SET status=$1,applied_by_login=$2,applied_by_name=$3,applied_at=NOW() WHERE id=$4 RETURNING ${requestCorrectionProjection}`,
      [REQUEST_CORRECTION_STATUS.APPLIED,String(req.session.login||'').trim().toLowerCase(),req.session.name||req.session.login||'Administrator',id]);
    await client.query('COMMIT');
    const saved=updated.rows[0];
    const pmLogins=await vehicleTransferPmLogins(pool,saved.site);
    await addTicketNotificationsBestEffort(pool,[...pmLogins,saved.requestedByLogin],saved.requestReference,`Approved correction ${saved.id} was applied to ${saved.requestReference} by ${saved.appliedByName}.`,null,{whatsapp:false});
    req.audit={eventType:'Correction',module:'Maintenance Requests',action:'Apply approved correction',targetType:'Maintenance request',targetReference:saved.requestReference,reason:saved.reason,
      changedFields:[...requestCorrectionChangedFields(saved.correctionType,saved.originalValues,saved.proposedChanges),{field:'Correction status',before:REQUEST_CORRECTION_STATUS.APPROVED,after:REQUEST_CORRECTION_STATUS.APPLIED}]};
    res.json(saved);
  }catch(error){await client.query('ROLLBACK').catch(()=>{});next(error)}finally{client.release()}
});
}

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
      const assignedScope=userSiteScope(user);
      if(!reportScopeIncludesSite(assignedScope,request.site))return res.status(403).json({error:'This request belongs to a different location.'});
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

app.get('/api/requests/:reference/complaint-media',requireSession,async(req,res,next)=>{
  try{
    const authorization=await currentDashboardAuthorization(req.session);
    if(!authorization)return res.status(401).json({error:'This user account no longer exists. Please sign in again.'});
    const {session,user}=authorization;
    const operational=session.role==='normal'&&['Production User','Maintenance User','MIS User'].includes(session.assignedRole);
    if(session.role!=='super'&&!operational&&session.permissions?.readRequests!==true)return res.status(403).json({error:'Your assigned role cannot view request attachments.'});
    const reference=String(req.params.reference||'').trim();
    const {rows}=await pool.query('SELECT site,requester_login AS "requesterLogin" FROM maintenance_requests WHERE reference=$1',[reference]);
    const request=rows[0];
    if(!request)return res.status(404).json({error:'Request not found.'});
    if(session.role==='super'&&session.permissions?.adminLevel==='Manager'&&!reportScopeIncludesSite(managerReportScope(user),request.site))return res.status(403).json({error:'This request belongs to a different location.'});
    if(session.role==='normal'){
      const assignedScope=userSiteScope(user);
      if(!reportScopeIncludesSite(assignedScope,request.site))return res.status(403).json({error:'This request belongs to a different location.'});
      if(session.assignedRole==='Production User'&&String(request.requesterLogin||'').trim().toLowerCase()!==String(user.login||req.session.login||'').trim().toLowerCase())return res.status(403).json({error:'Only your own request attachments are available.'});
    }
    const media=await pool.query('SELECT complaint_media FROM maintenance_requests WHERE reference=$1',[reference]);
    res.set('Cache-Control','no-store');
    res.json({items:media.rows[0]?.complaint_media||[]});
  }catch(error){next(error)}
});

const requestAudioFields={
  complaint:{column:'complaint_audio',fallbackName:'complaint-audio.webm'},
  maintenance:{column:'maintenance_audio',fallbackName:'maintenance-audio.webm'},
};

app.get('/api/requests/:reference/audio/:kind',requireSession,async(req,res,next)=>{
  try{
    const audio=requestAudioFields[String(req.params.kind||'')];
    if(!audio)return res.status(404).json({error:'Request audio is not available.'});
    const authorization=await currentDashboardAuthorization(req.session);
    if(!authorization)return res.status(401).json({error:'This user account no longer exists. Please sign in again.'});
    const {session,user}=authorization;
    const operational=session.role==='normal'&&['Production User','Maintenance User','MIS User'].includes(session.assignedRole);
    if(session.role!=='super'&&!operational&&session.permissions?.readRequests!==true)return res.status(403).json({error:'Your assigned role cannot play request audio.'});
    const reference=String(req.params.reference||'').trim();
    const {rows}=await pool.query(`SELECT site,requester_login AS "requesterLogin",${audio.column} AS data FROM maintenance_requests WHERE reference=$1`,[reference]);
    const request=rows[0];
    if(!request)return res.status(404).json({error:'Request audio is not available.'});
    if(session.role==='super'&&session.permissions?.adminLevel==='Manager'&&!reportScopeIncludesSite(managerReportScope(user),request.site))return res.status(404).json({error:'Request audio is not available.'});
    if(session.role==='normal'){
      const assignedScope=userSiteScope(user);
      if(!reportScopeIncludesSite(assignedScope,request.site))return res.status(404).json({error:'Request audio is not available.'});
      if(session.assignedRole==='Production User'&&String(request.requesterLogin||'').trim().toLowerCase()!==String(user.login||req.session.login||'').trim().toLowerCase())return res.status(404).json({error:'Request audio is not available.'});
    }
    return sendDataUrlMedia(res,request.data,{name:audio.fallbackName,fallbackType:'audio/webm'});
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
      const assignedScope=userSiteScope(user);
      if(!reportScopeIncludesSite(assignedScope,rows[0].site))throw Object.assign(new Error('This vehicle is outside your assigned maintenance location.'),{status:403});
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
      const eligible=await client.query(`SELECT ${requestProjection},requester_login FROM maintenance_requests WHERE reference=$1 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql}`,[reference]);
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
      const profile=resolveMobileAccess({user});const siteMatches=reportScopeIncludesSite(userSiteScope(user),eligible.rows[0].site);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Admin')recipients.push(login);
      if(profile.sessionRole==='super'&&profile.permissions.adminLevel==='Manager'&&profile.permissions.managerRoles.some((role)=>['Maintenance Manager','Production Manager'].includes(role))&&userManagesSite(user,eligible.rows[0].site))recipients.push(login);
    }
    await addTicketNotificationsBestEffort(pool,recipients,reference,`${authorName} ${updatedToday?'updated today’s':'added a'} daily maintenance update for ${reference}.`,
      {templateKey:'dailyUpdate',parameters:[authorName,reference],context:{request:eligible.rows[0],remark,delayReason,updatedAt:new Date(),url:workflowRequestLink(reference,publicBaseUrl())}},{whatsapp:true,site:eligible.rows[0].site});
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
      const assignedScope=userSiteScope(user);
      if(!reportScopeIncludesSite(assignedScope,current.site))
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
  const {rows}=await client.query(`SELECT reference AS ref,door_number AS door,chassis_number AS chassis,status,
      owner_name AS owner,
      to_char(created_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "createdAt",
      to_char(closed_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "closedAt",
      to_char(verified_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI:SS') AS "verifiedAt"
    FROM maintenance_requests
    WHERE (
      ($1<>'' AND lower(trim(door_number))=lower(trim($1))) OR
      ($2<>'' AND lower(trim(chassis_number))=lower(trim($2)))
    ) ORDER BY created_at DESC`,[normalizedDoor,normalizedChassis]);
  // A request hidden from every operational view must not silently block a
  // replacement. Closure/verification timestamps also outrank stale status text.
  return requestsVisibleGlobally(rows).find(isActiveMaintenanceRequest)||null;
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
    const {ref,equipment='',equipmentGroup='',door,reg='',chassis='',driverName='',driverNameSource='',site='Not assigned',category='Maintenance request',complaint,complaintAudio='',complaintLanguage='',start,meterType=''}=req.body||{};
    const storedSite=canonicalSiteName(site)==='sasti ob'?'Sasti OB':String(site||'').trim()||'Not assigned';
    const storedComplaintLanguage=(String(complaintLanguage).trim().toLowerCase().match(/^(en|hi|mr|bn|or|te|gu|pa|ta|kn)(-|$)/i)||[])[1]||'';
    const normalizedMeterType=String(meterType).trim().toUpperCase();
    if(!ref||!door||!complaint)return res.status(400).json({error:'Reference, door number and complaint are required.'});
    if(!String(chassis).trim())return res.status(400).json({error:'Chassis number is required. Contact the admin team to update the chassis number in Equipment Master.'});
    if(!validRequestAudioDataUrl(complaintAudio))return res.status(400).json({error:'Complaint audio must be a supported recording up to 3 MB.'});
    const complaintMedia=req.body?.complaintMedia??[];
    if(req.body?.complaintMedia!==undefined&&!validComplaintMedia(complaintMedia))return res.status(400).json({error:'Attach at most one photo and one video, in supported formats, up to 5 MB each.'});
    if(!['KMR','HMR'].includes(normalizedMeterType))return res.status(400).json({error:'Choose a valid KMR/HMR meter type.'});
    const requester=await currentUserRecord(req.session);
    if(req.session.role==='normal'){
      const assignedScope=userSiteScope(requester);
      if(!reportScopeIncludesSite(assignedScope,storedSite))return res.status(403).json({error:'Create maintenance requests only for your assigned location.'});
    }
    const startedAt=String(start||'').trim()?parseRequestTimelineTimestamp(start):new Date();
    validateRequestTimelineChange({}, {start:startedAt||String(start)}, {userEntered:['start']});
    const superior=String(requester.superior||'').trim().slice(0,200);
    const storedDriverName=String(driverName).trim().slice(0,200);
    const storedDriverSource=storedDriverName?(String(driverNameSource).trim().slice(0,200)||'Manual'):'';
    const {rows}=await createRequestWithVehicleLock({door,chassis},async(client)=>{
    const result=await client.query(`INSERT INTO maintenance_requests
      (reference,equipment_name,equipment_group,door_number,registration_number,chassis_number,driver_name,driver_name_source,superior_name,site,category,complaint,complaint_audio,complaint_language,started_at,acceptance_required,status,owner_name,requester_login,requester_role,meter_type,opening_meter_reading,opening_meter_file,opening_meter_file_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$22,$14,TRUE,'Open',$15,$16,$17,$18,$19,$20,$21)
      RETURNING ${requestProjection}`,
      [ref,equipment,String(equipmentGroup).trim().slice(0,200),door,reg,chassis,storedDriverName,storedDriverSource,String(superior).trim().slice(0,200),storedSite,category,complaint,complaintAudio,startedAt,req.session.name||'Mobile User',String(req.session.login||'').trim().toLowerCase(),String(req.session.assignedRole||'').trim(),normalizedMeterType,'','','',storedComplaintLanguage]);
    if(complaintMedia.length){
      await client.query('UPDATE maintenance_requests SET complaint_media=$2::jsonb WHERE reference=$1',[ref,JSON.stringify(complaintMedia)]);
      result.rows[0].complaintMediaAvailable=true;
    }
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
          {templateKey:'requestOpened',parameters:[rows[0].ref,rows[0].site,rows[0].equipmentGroup||rows[0].equipment||'Not available',rows[0].door||'Not available',rows[0].category,openedBy,openedAt,rows[0].expectedCompletionAt||'Not set',workflowRequestLink(rows[0].ref,publicBaseUrl())],context:{request:rows[0]}},
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
    const explicitAcceptance=req.body?.acceptRequest===true;
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
    const accepting=!before.acceptedAt&&(before.acceptanceRequired||explicitAcceptance);
    validateRequestTimelineChange(before,{expectedCompletionAt:expectedAt||expectedCompletionAt,...(accepting?{acceptedAt:before.timelineRecordedAt}:{})},{now:before.timelineRecordedAt,userEntered:['expectedCompletionAt']});
    buildRequestTimelineChanges(before,{...before,expectedCompletionAt:expectedAt},{events:['expectedCompletionAt'],reason:req.body?.correctionReason,requireCorrectionReason:['expectedCompletionAt']});
    const result=await client.query(`UPDATE maintenance_requests SET category=$1,complaint=$2,
      complaint_language=CASE WHEN complaint=$2 THEN complaint_language ELSE '' END,
      accepted_at=CASE WHEN accepted_at IS NULL AND (acceptance_required OR $11::boolean) THEN NOW() ELSE accepted_at END,accepted_by=CASE WHEN accepted_at IS NULL AND (acceptance_required OR $11::boolean) THEN $8 ELSE accepted_by END,expected_completion_at=$3::timestamptz,meter_type=$4,
      opening_meter_reading=$5,opening_meter_file=CASE WHEN $6<>'' THEN $6 ELSE opening_meter_file END,opening_meter_file_name=CASE WHEN $6<>'' THEN $7 ELSE opening_meter_file_name END,
      opening_meter_readings=opening_meter_readings || $10::jsonb
      WHERE reference=$9 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql}
      RETURNING ${requestProjection}`,[category,complaint,expectedAt,normalizedMeterType,normalizedOpeningMeterReading,openingMeterFile,String(openingMeterFileName).trim().slice(0,255),req.session.name||'Maintenance User',reference,JSON.stringify({...openingMeterReadings,[normalizedMeterType]:normalizedOpeningMeterReading}),explicitAcceptance]);
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
    const maintenanceWorkLanguage=(String(req.body?.maintenanceWorkLanguage||'').trim().toLowerCase().match(/^(en|hi|mr|bn|or|te|gu|pa|ta|kn)(-|$)/i)||[])[1]||'';
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
      const assignedScope=userSiteScope(user);
      if(!reportScopeIncludesSite(assignedScope,existingRows[0].site))return res.status(403).json({error:'This vehicle is outside your assigned maintenance location.'});
    }
    if(!ideal&&status==='Closed'&&existingRows[0].status==='Closed'&&!existingRows[0].verifiedAt)return res.json(existingRows[0]);
    const {rows,delayedClosure}=await withMaintenanceArrivalGuard(req,reference,async(client,before)=>{
    if(!ideal&&status==='Closed'){
      validateRequestTimelineChange(before,{closedAt},{now:before.timelineRecordedAt,userEntered:['closedAt']});
      buildRequestTimelineChanges(before,{...before,closedAt},{events:['closedAt'],reason:req.body?.correctionReason,requireCorrectionReason:['closedAt']});
    }
    const {rows:meterRows}=await client.query(`SELECT meter_type,opening_meter_reading,opening_meter_file,expected_completion_at,delayed_reason FROM maintenance_requests WHERE reference=$1 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql}`,[reference]);
    if(!meterRows.length)throw arrivalRedFlagError();
    const delayedClosure=!ideal&&status==='Closed'&&delayedReasonRequired(meterRows[0].expected_completion_at,closedAt);
    // Closing is never blocked for a missing delayed reason; the reason recorded from the Delayed reason column is kept as is.
    const effectiveDelayedReason=delayedReason||String(meterRows[0].delayed_reason||'').trim();
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
      ? await client.query(`UPDATE maintenance_requests SET closed_at=NULL,closed_by='',maintenance_work=$1,maintenance_audio=$2,maintenance_work_language=$6,status='Idle',idle_reason=$3,
          ideal_requested_at=NOW(),ideal_requested_by=$4,ideal_approved_at=NULL,ideal_approved_by=''
          WHERE reference=$5 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql} RETURNING ${requestProjection}`,
          [maintenanceWork,maintenanceAudio,idleReason,req.session.name||'Maintenance User',reference,maintenanceWorkLanguage])
      : status==='Closed'
        ? await client.query(`UPDATE maintenance_requests SET closed_at=$1,closed_by=$2,maintenance_work=$3,maintenance_audio=$4,maintenance_work_language=$7,delayed_reason=$5,status='Closed'
            WHERE reference=$6 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql} RETURNING ${requestProjection}`,
            [closedAt,req.session.name||'Maintenance User',maintenanceWork,maintenanceAudio,effectiveDelayedReason,reference,maintenanceWorkLanguage])
        : await client.query(`UPDATE maintenance_requests SET closed_at=NULL,closed_by='',maintenance_work=$1,maintenance_audio=$2,maintenance_work_language=$6,status=$3,
            in_progress_at=CASE WHEN status<>'In progress' AND $3='In progress' THEN COALESCE(in_progress_at,NOW()) ELSE in_progress_at END,
            in_progress_by=CASE WHEN status<>'In progress' AND $3='In progress' AND in_progress_at IS NULL THEN $5 ELSE in_progress_by END
            WHERE reference=$4 AND status NOT IN ('Closed','Idle','Ideal') AND verified_at IS NULL AND ${arrivalFlagReadySql} RETURNING ${requestProjection}`,
            [maintenanceWork,maintenanceAudio,status,reference,req.session.name||req.session.login||'Maintenance User',maintenanceWorkLanguage]);
    if(!rows.length)throw arrivalRedFlagError();
    if(delayedReason){
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
        {templateKey:'requestIdle',parameters:[equipmentDetails,rows[0].site,idleAt,rows[0].idleReason,rows[0].ref,'Project Manager or Production Manager must approve Make On Road',workflowRequestLink(rows[0].ref,publicBaseUrl())],context:{request:rows[0]}},
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
          {templateKey:'requestClosed',parameters:[rows[0].ref,equipmentDetails,rows[0].site,closedBy,closedAtLabel,rows[0].hours||'Not available',workflowRequestLink(rows[0].ref,publicBaseUrl())],context:{request:rows[0]}},
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
      {templateKey:'requestClosed',parameters:[rows[0].ref,equipmentDetails,rows[0].site,req.session.name||'Project / Production Manager',approvedAt,rows[0].hours||'Not available',workflowRequestLink(rows[0].ref,publicBaseUrl())],context:{request:rows[0]}},
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
    const misScope=userSiteScope(misUser);
    if(!misScope.sites.length)return res.status(403).json({error:'A location must be assigned before this MIS user can raise a red flag.'});
    const {rows:existingRows}=await pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
    const existing=existingRows[0];
    if(!existing)return res.status(404).json({error:'This request no longer exists.'});
    if(!reportScopeIncludesSite(misScope,existing.site))return res.status(403).json({error:'This request belongs to a different location.'});
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
    const misScope=userSiteScope(misUser);
    if(!misScope.sites.length)return res.status(403).json({error:'A location must be assigned before this MIS user can verify requests.'});
    const {rows:existingRows}=await pool.query(`SELECT ${requestProjection} FROM maintenance_requests WHERE reference=$1`,[reference]);
    if(!existingRows.length)return res.status(409).json({error:'This request no longer exists.'});
    const existing=existingRows[0];
    if(!reportScopeIncludesSite(misScope,existing.site))return res.status(403).json({error:'This request belongs to a different location.'});
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
      if(retryRows[0]?.verifiedAt&&reportScopeIncludesSite(misScope,retryRows[0].site))return res.json(retryRows[0]);
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
          {templateKey:'requestVerified',parameters:[rows[0].ref,equipmentDetails,rows[0].site,verifiedBy,verifiedAt,closingMeter,workflowRequestLink(rows[0].ref,publicBaseUrl())],context:{request:rows[0]}},
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
    const misScope=userSiteScope(misUser);
    if(!misScope.sites.length)return res.status(403).json({error:'A location must be assigned before this MIS user can view trip cards.'});
    const {rows}=await pool.query(`SELECT site,first_trip_card_image AS image FROM maintenance_requests
      WHERE reference=$1 AND status='Closed' AND verified_at IS NOT NULL`,[reference]);
    if(!rows.length)return res.status(404).json({error:'Verified closed request not found.'});
    if(!reportScopeIncludesSite(misScope,rows[0].site))return res.status(403).json({error:'This request belongs to a different location.'});
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
    if(req.session.role==='normal'&&!reportScopeIncludesSite(userSiteScope(await currentUserRecord(req.session)),row.site))
      return res.status(403).json({error:'This request belongs to a different location.'});
    let allowed=req.session.role==='super'||req.session.permissions?.readRequests===true;
    if(req.session.role==='normal'&&req.session.assignedRole==='Maintenance User')allowed=true;
    if(req.session.role==='normal'&&req.session.assignedRole==='Production User')allowed=String(row.requester_login||'').trim().toLowerCase()===String(req.session.login||'').trim().toLowerCase();
    if(req.session.role==='normal'&&req.session.assignedRole==='MIS User'){
      const user=await currentUserRecord(req.session);
      allowed=reportScopeIncludesSite(userSiteScope(user),row.site);
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
    const payload={
      records:scopeDashboardEquipmentRecords(fleetSnapshot,authorization.session,authorization.user,scope),
      scope,
    };
    if(typeof sendPrivateJson==='function')return sendPrivateJson(req,res,'dashboard-equipment',payload);
    return res.json({records:payload.records,scope:payload.scope});
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
      ? ['Production User','Maintenance User','MIS User'].includes(session.assignedRole)||(session.assignedRole==='General User'&&generalUserCanAccessMenu(session,'Reports'))
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
    const canViewDelayedReasons=superCanView('Delayed Reason')||req.session.permissions?.closeRequests===true||req.session.permissions?.editRequests===true;
    if(!canViewEquipment&&!canViewRepairTypes&&!canViewDelayedReasons)
      return res.status(403).json({error:'Your assigned role is not authorized to view master records.'});
    const managerRecord=(req.session.role==='super'&&req.session.permissions?.adminLevel==='Manager')||req.session.role==='normal'?await currentUserRecord(req.session):null;
    const managerScope=managerRecord?(req.session.role==='normal'?userSiteScope(managerRecord):managerReportScope(managerRecord)):null;
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
    if(master==='Vehicle transfers')return res.status(409).json({error:'Use the controlled Vehicle transfers workflow so both PM approvals and the Vehicle Master update are recorded.'});
    const records=Array.isArray(req.body)?req.body:[req.body];
    if(!master||!records.length||records.some(record=>!record||typeof record!=='object'||Array.isArray(record)))
      return res.status(400).json({error:'A master name and one or more records are required.'});
    if(master==='Users & employees'&&records.some(record=>isTrueSuperAdmin(record))&&!isTrueSuperAdmin(req.session.permissions))
      return res.status(403).json({error:'Only a Super Admin can create another Super Admin account.'});
    let prepared;
    try{
      prepared=records.map((record,index)=>{
        try{
          if(master==='Shift Master')return normalizeOperationalSiteFields(normalizeShiftRecord(record));
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
    }else if(master==='Equipment master'||master==='Shift Master'){
      const client=await pool.connect();
      try{
        await client.query('BEGIN');
        const existing=await client.query(
          'SELECT id,record_data FROM master_records WHERE master_name=$1 FOR UPDATE',
          [master]
        );
        const identityFor=master==='Equipment master'?equipmentIdentity:shiftIdentity;
        const byIdentity=new Map(existing.rows.map(row=>[identityFor(row.record_data),row]).filter(([identity])=>identity));
        rows=[];
        for(const record of prepared){
          const identity=identityFor(record);
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
    const validationError=!password?'A new password is required.':password!==confirmation?'The password confirmation does not match.':'';
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
    if(master==='Vehicle transfers')return res.status(409).json({error:'Vehicle transfer workflow records cannot be edited directly.'});
    const id=Number(req.params.id);
    const record=req.body;
    if(!master||!Number.isInteger(id)||id<=0||!record||typeof record!=='object'||Array.isArray(record))
      return res.status(400).json({error:'A valid master record is required.'});
    const existingSnapshot=await pool.query('SELECT record_data FROM master_records WHERE id=$1 AND master_name=$2',[id,master]);
    if(!existingSnapshot.rows.length)return res.status(404).json({error:'Master record not found.'});
    const previousRecord=existingSnapshot.rows[0].record_data;
    let storedRecord=master==='Shift Master'
      ?normalizeOperationalSiteFields(normalizeShiftRecord(record))
      :normalizeOperationalSiteFields(record);
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
    req.audit={eventType:'Master data',module:master,action:'Edit record',targetType:master,targetReference:String(storedRecord.login||storedRecord.employee||storedRecord.door||storedRecord.repairType||storedRecord.shiftCode||id),changedFields:auditChangedFields(previousRecord,storedRecord)};
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
  {label:'Source location',key:'sourceLocation'},
  {label:'Destination location',key:'destinationLocation'},
  {label:'Work completed',key:'workCompleted'},
  {label:'Work pending',key:'workPending'},
  {label:'Outcome',key:'outcome'},
  {label:'HTTP status',key:'statusCode'},
  {label:'Reason / details',key:'reason'},
  {label:'Changes',key:'changedFields'},
  {label:'IP address',key:'ipAddress'},
  {label:'Device ID',key:'deviceId'},
  {label:'Session ID',key:'sessionId'},
];
const USER_ACTIVITY_EXPORT_COLUMNS=[
  {label:'User',key:'userName'},
  {label:'Login',key:'login'},
  {label:'Role',key:'role'},
  {label:'Sessions',key:'sessionCount'},
  {label:'Total activity count',key:'totalActivityCount'},
  {label:'Successful activities',key:'successfulCount'},
  {label:'Failed activities',key:'failedCount'},
  {label:'Total worked time (HH:MM:SS)',key:'totalWorkedTime'},
  {label:'Total worked minutes',key:'totalWorkedMinutes'},
  {label:'First activity',key:'firstActivityAt'},
  {label:'Last activity',key:'lastActivityAt'},
  {label:'Modules used',key:'modules'},
  {label:'Processes performed',key:'processes'},
];

function auditExportCell(event,key){
  if(key==='occurredAt')return formatDisplayDateTime(event.occurredAt);
  if(key==='changedFields')return Array.isArray(event.changedFields)&&event.changedFields.length?JSON.stringify(event.changedFields):'';
  const transferFields={sourceLocation:'Source location',destinationLocation:'Destination location',workCompleted:'Work completed',workPending:'Work pending'};
  if(transferFields[key])return Array.isArray(event.changedFields)?event.changedFields.find((change)=>change.field===transferFields[key])?.after||'':'';
  return event[key]??'';
}

function userActivityExportCell(row,key){
  if(['firstActivityAt','lastActivityAt'].includes(key))return row[key]?formatDisplayDateTime(row[key]):'';
  return row[key]??'';
}

async function publishAuditWorkbook({shortCode,filename,workbook}){
  await pool.query(`INSERT INTO published_reports (id,short_code,filename,content_type,file_data,expires_at)
    VALUES ($1,$2,$3,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',$4,NOW()+INTERVAL '30 days')`,
    [randomUUID(),shortCode,filename,workbook]);
  return `${publicBaseUrl()}/r/${shortCode}`;
}

let auditLogExportRunning=false;
async function sendScheduledAuditLogExports(now=new Date()){
  if(!databaseReady||auditLogExportRunning)return {skipped:true};
  const slotKey=auditLogExportSlot(now);
  const {rows:currentRows}=await pool.query(`SELECT status,attempts,updated_at FROM audit_log_export_runs WHERE slot_key=$1`,[slotKey]);
  const current=currentRows[0];
  if(current?.status?.startsWith('Sent'))return {skipped:true,reason:'already sent',slotKey};
  if(current?.status==='Sending'&&Date.now()-new Date(current.updated_at).getTime()<10*60*1000)return {skipped:true,reason:'already running',slotKey};
  if(current?.status?.startsWith('Failed')&&Date.now()-new Date(current.updated_at).getTime()<10*60*1000)return {skipped:true,reason:'waiting to retry',slotKey};
  if(!current){
    const {rows:lastRows}=await pool.query(`SELECT updated_at FROM audit_log_export_runs WHERE status LIKE 'Sent%' ORDER BY updated_at DESC LIMIT 1`);
    if(!auditLogExportDue(now,lastRows[0]?.updated_at))return {skipped:true,reason:'outside five-day schedule'};
  }
  const claim=await pool.query(`INSERT INTO audit_log_export_runs (slot_key,status,attempts,updated_at)
    VALUES ($1,'Sending',1,NOW())
    ON CONFLICT (slot_key) DO UPDATE SET status='Sending',attempts=audit_log_export_runs.attempts+1,updated_at=NOW()
      WHERE (audit_log_export_runs.status LIKE 'Failed%' OR audit_log_export_runs.status='Sending') AND audit_log_export_runs.updated_at<NOW()-INTERVAL '10 minutes'
    RETURNING attempts`,[slotKey]);
  if(!claim.rowCount)return {skipped:true,reason:'already claimed',slotKey};
  auditLogExportRunning=true;
  let status='Failed - export did not complete';
  try{
    const exportCutoff=now;
    const [{rows:eventRows},{rows:userRows},{rows:sessionRows}]=await Promise.all([
      pool.query(`SELECT ${AUDIT_EVENT_PROJECTION} FROM audit_events WHERE occurred_at<=$1 AND ${AUDIT_VISIBLE_SCOPE_SQL} ORDER BY occurred_at ASC,id ASC`,[exportCutoff]),
      pool.query(`SELECT record_data FROM master_records WHERE master_name='Users & employees'`),
      pool.query(`SELECT session_id AS "sessionId",actor_login AS "actorLogin",actor_name AS "actorName",actor_role AS "actorRole",
        started_at AS "startedAt",last_seen_at AS "lastSeenAt",active_seconds AS "activeSeconds" FROM user_session_activity WHERE started_at<=$1`,[exportCutoff]),
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
    const configuredEmails=[...new Set(recipients.map((recipient)=>recipient.email.toLowerCase()).filter(Boolean))];
    if(!configuredEmails.length)throw new Error('No Admin or Super Admin email address is configured. Audit records were retained.');
    const activityRows=buildUserActivitySummary(eventRows,{sessions:sessionRows});
    const totalWorkedMinutes=totalUserWorkedMinutes(activityRows);
    const auditWorkbook=buildXlsxWorkbookBuffer('Nerve Center Audit Trail',AUDIT_EXPORT_COLUMNS,eventRows.map((event)=>AUDIT_EXPORT_COLUMNS.map(({key})=>auditExportCell(event,key))));
    const activityWorkbook=buildXlsxWorkbookBuffer('Nerve Center User Activity',USER_ACTIVITY_EXPORT_COLUMNS,activityRows.map((row)=>USER_ACTIVITY_EXPORT_COLUMNS.map(({key})=>userActivityExportCell(row,key))));
    const auditShortCode=randomUUID().replace(/-/g,'').slice(0,16);
    const activityShortCode=randomUUID().replace(/-/g,'').slice(0,16);
    await pool.query(`DELETE FROM published_reports WHERE expires_at<=NOW()`);
    const [auditUrl,userActivityUrl]=await Promise.all([
      publishAuditWorkbook({shortCode:auditShortCode,filename:`BDMS-Audit-Trail-${slotKey}.xlsx`,workbook:auditWorkbook}),
      publishAuditWorkbook({shortCode:activityShortCode,filename:`BDMS-User-Activity-${slotKey}.xlsx`,workbook:activityWorkbook}),
    ]);
    await pool.query(`UPDATE audit_log_export_runs SET audit_report_short_code=$1,user_activity_report_short_code=$2,
      exported_event_count=$3,updated_at=NOW() WHERE slot_key=$4`,[auditShortCode,activityShortCode,eventRows.length,slotKey]);
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
            WHERE audit_log_export_deliveries.status LIKE 'Failed%' AND audit_log_export_deliveries.updated_at<NOW()-INTERVAL '10 minutes'
          RETURNING attempts`,[slotKey,emailKey]);
        if(delivery.rowCount){
          let deliveryStatus='Sent';
          try{
            const result=await sendAuditLogExportEmail({to:recipient.email,auditUrl,userActivityUrl,generatedAt:now,rowCount:eventRows.length,userCount:activityRows.length,totalWorkedMinutes});
            if(result.sent&&result.confirmed)emailSent++;else throw new Error(result.reason||'The mail server did not confirm delivery.');
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
            WHERE audit_log_export_deliveries.status LIKE 'Failed%' AND audit_log_export_deliveries.updated_at<NOW()-INTERVAL '10 minutes'
          RETURNING attempts`,[slotKey,normalizedPhone]);
        if(delivery.rowCount){
          let deliveryStatus='Sent';
          try{
            await sendMetaWhatsAppTemplate({
              to:recipient.phone,templateKey:'consolidatedRequestReport',purpose:'consolidatedRequestReport',
              parameters:[`Nerve Center five-day reports. Audit Trail: ${auditUrl} User Activity: ${userActivityUrl} Links expire in 30 days.`],
              context:{report:{site:'All sites — organisation audit',title:'Five-day audit and user activity',period:`Latest five days, generated ${formatDisplayDateTime(now)}`,summary:`${eventRows.length} audit entries | ${activityRows.length} users`,pdfUrl:auditUrl,xlsxUrl:userActivityUrl,notes:'Audit Trail and User Activity downloads. Links expire in 30 days.'}},
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
      COUNT(*) FILTER (WHERE channel='Email' AND status='Sent')::int AS email_sent,
      COUNT(*) FILTER (WHERE channel='Email' AND status LIKE 'Failed%')::int AS email_failed,
      COUNT(*) FILTER (WHERE channel='WhatsApp' AND status LIKE 'Failed%')::int AS whatsapp_failed
      FROM audit_log_export_deliveries WHERE slot_key=$1`,[slotKey]);
    const confirmedEmails=Number(deliveryRows[0]?.email_sent||0);
    const failedEmails=Number(deliveryRows[0]?.email_failed||0);
    if(confirmedEmails<configuredEmails.length||failedEmails)throw new Error(`Administrator email confirmation incomplete (${confirmedEmails}/${configuredEmails.length}). Audit records were retained.`);
    deliveryFailures=Number(deliveryRows[0]?.whatsapp_failed||0);
    const client=await pool.connect();
    let purgedEventCount=0;
    try{
      await client.query('BEGIN');
      const purged=await client.query(`DELETE FROM audit_events WHERE occurred_at<=$1`,[exportCutoff]);
      purgedEventCount=Number(purged.rowCount||0);
      await client.query(`DELETE FROM user_session_activity WHERE last_seen_at<=$1::timestamptz-INTERVAL '15 minutes'`,[exportCutoff]);
      await client.query(`UPDATE user_session_activity SET started_at=$1,last_seen_at=$1,active_seconds=0 WHERE last_seen_at<=$1`,[exportCutoff]);
      status=`Sent - ${confirmedEmails} administrator email(s) confirmed${deliveryFailures?`; ${deliveryFailures} WhatsApp warning(s)`:''}`;
      await client.query(`UPDATE audit_log_export_runs SET status=$1,mail_confirmed_at=NOW(),purged_at=NOW(),purged_event_count=$2,updated_at=NOW() WHERE slot_key=$3`,[status,purgedEventCount,slotKey]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error}
    finally{client.release()}
    return {slotKey,status,rowCount:eventRows.length,userCount:activityRows.length,auditUrl,userActivityUrl,emailSent,whatsappSent,deliveryFailures,purgedEventCount};
  }catch(error){
    status=`Failed - ${String(error?.message||'Audit Trail export error').slice(0,180)}`;
    await pool.query(`UPDATE audit_log_export_runs SET status=$1,updated_at=NOW() WHERE slot_key=$2`,[status,slotKey]).catch(()=>{});
    throw error;
  }finally{auditLogExportRunning=false}
}

app.patch('/api/requests/:reference/delayed-reason',requireSession,requirePermission('editRequests',{role:'Maintenance User'}),async(req,res,next)=>{
  try{
    const reference=String(req.params.reference||'').trim();
    const delayedReason=String(req.body?.delayedReason||'').trim();
    if(!delayedReason||delayedReason.length>160)return res.status(400).json({error:'Enter a delayed reason of up to 160 characters.'});
    const {rows}=await withMaintenanceArrivalGuard(req,reference,async(client)=>client.query(
      `UPDATE maintenance_requests SET delayed_reason=$1 WHERE reference=$2 RETURNING ${requestProjection}`,
      [delayedReason,reference]));
    res.json(rows[0]);
  }catch(error){maintenanceWriteFailure(error,res,next)}
});

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

function backendResultSummary(result){
  if(result===undefined||result===null)return 'Completed';
  if(typeof result!=='object')return auditClean(result,500)||'Completed';
  const safe=Object.fromEntries(Object.entries(result).filter(([key])=>!/(token|secret|password|fileData|content|buffer)/i.test(key)).slice(0,16));
  return auditClean(JSON.stringify(safe),500)||'Completed';
}

async function appendBackendProcessAudit({module='Cloud runtime',action,targetReference='',outcome='Success',reason='',durationMs=0,errorCode=''}){
  const request={method:'SYSTEM',path:'/system/backend-process',headers:{},body:{},params:{},session:{login:'system',name:'Cloud runtime',assignedRole:'System'},socket:{},get:()=>''};
  await appendAuditEvent(request,{eventType:'Backend process',module,action,targetType:'Backend process',targetReference,actorLogin:'system',actorName:'Cloud runtime',actorRole:'System',outcome,reason,changedFields:[],durationMs,errorCode});
}

async function runAuditedBackendProcess({module,action,targetReference=''},task){
  const startedAt=Date.now();
  try{
    const result=await task();
    if(!result?.skipped)await appendBackendProcessAudit({module,action,targetReference,outcome:'Success',reason:backendResultSummary(result),durationMs:Date.now()-startedAt});
    return result;
  }catch(error){
    const safe=auditSafeError(error);
    await appendBackendProcessAudit({module,action,targetReference,outcome:'Failed',reason:safe.message,durationMs:Date.now()-startedAt,errorCode:safe.code});
    throw error;
  }
}

async function initializeDatabase(){
  try{
    await migrate();
    databaseReady=true;
    databaseError='';
    const expiredSessions=await sessionStore.pruneExpired();
    if(expiredSessions)console.log(`Session cleanup closed ${expiredSessions} session${expiredSessions===1?'':'s'} idle for more than 15 minutes.`);
    await appendBackendProcessAudit({module:'Cloud deployment',action:'Start application runtime',targetReference:deploymentSha||'Unknown commit',reason:`Database migration completed; scheduled jobs ${scheduledJobsEnabled?'enabled':'disabled'}.`});
    console.log('Database initialization completed.');
    if(scheduledJobsEnabled){
      if(oracleConfigured)void runAuditedBackendProcess({module:'Oracle synchronization',action:'Synchronize request drivers'},()=>syncTemporaryRequestDrivers())
        .then(result=>console.log('Oracle request-driver sync completed.',result))
        .catch(error=>console.error('Oracle request-driver startup sync failed.',error));
      void runAuditedBackendProcess({module:'Scheduled reports',action:'Generate consolidated fleet report'},()=>sendScheduledConsolidatedWhatsAppReports())
        .then(result=>console.log('Scheduled consolidated WhatsApp report check completed.',result))
        .catch(error=>console.error('Scheduled consolidated WhatsApp report check failed.',error));
      void runAuditedBackendProcess({module:'Scheduled reports',action:'Generate consolidated CRM report'},()=>sendScheduledConsolidatedTicketReports())
        .then(result=>console.log('Scheduled consolidated CRM WhatsApp report check completed.',result))
        .catch(error=>console.error('Scheduled consolidated CRM WhatsApp report check failed.',error));
      void runAuditedBackendProcess({module:'Scheduled reports',action:'Generate Director report bundle'},()=>sendScheduledDirectorReportBundles())
        .then(result=>console.log('Scheduled Director WhatsApp report check completed.',result))
        .catch(error=>console.error('Scheduled Director WhatsApp report check failed.',error));
      void runAuditedBackendProcess({module:'Scheduled reports',action:'Generate hierarchy report bundle'},()=>sendScheduledHierarchyReportBundles())
        .then(result=>console.log('Scheduled hierarchy WhatsApp report check completed.',result))
        .catch(error=>console.error('Scheduled hierarchy WhatsApp report check failed.',error));
      void runAuditedBackendProcess({module:'WhatsApp Integration',action:'Send workflow reminders'},()=>sendScheduledWorkflowWhatsAppReminders())
        .then(result=>console.log('Scheduled workflow WhatsApp reminder check completed.',result))
        .catch(error=>console.error('Scheduled workflow WhatsApp reminder check failed.',error));
      void runAuditedBackendProcess({module:'Audit Trail',action:'Generate five-day audit and user activity reports'},()=>sendScheduledAuditLogExports())
        .then(result=>console.log('Scheduled Audit Trail export check completed.',result))
        .catch(error=>console.error('Scheduled Audit Trail export check failed.',error));
      void runScheduledBackup()
        .then(result=>{if(!result?.skipped)console.log('Scheduled database backup completed.',result)})
        .catch(error=>console.error('Scheduled database backup failed.',error));
      void auditAdminLockIncidents().catch(error=>console.error('CRM admin-lock audit failed.',error));
      void metaWhatsAppRuntimeEnv().then((whatsappEnv)=>{
        if(whatsappEnv.META_WHATSAPP_BUSINESS_ACCOUNT_ID)return syncStandardWhatsAppTemplates({submit:true})
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
  const whatsappTemplateStatusTimer=setInterval(()=>{
    if(databaseReady)void syncStandardWhatsAppTemplates().catch(error=>console.error('WhatsApp template status refresh failed.',error.message));
  },15*60*1000);
  whatsappTemplateStatusTimer.unref?.();
  const requestDriverSyncTimer=setInterval(()=>{
    void runAuditedBackendProcess({module:'Oracle synchronization',action:'Synchronize request drivers'},()=>syncTemporaryRequestDrivers())
      .then(result=>console.log('Scheduled Oracle request-driver sync completed.',result))
      .catch(error=>console.error('Scheduled Oracle request-driver sync failed.',error));
  },driverSyncIntervalMs);
  requestDriverSyncTimer.unref?.();
  const consolidatedWhatsAppTimer=setInterval(()=>{
    void runAuditedBackendProcess({module:'Scheduled reports',action:'Generate consolidated fleet report'},()=>sendScheduledConsolidatedWhatsAppReports())
      .then(result=>{if(!result?.skipped)console.log('Scheduled consolidated WhatsApp report check completed.',result)})
      .catch(error=>console.error('Scheduled consolidated WhatsApp report check failed.',error));
  },60*1000);
  consolidatedWhatsAppTimer.unref?.();
  const consolidatedTicketWhatsAppTimer=setInterval(()=>{
    void runAuditedBackendProcess({module:'Scheduled reports',action:'Generate consolidated CRM report'},()=>sendScheduledConsolidatedTicketReports())
      .then(result=>{if(!result?.skipped)console.log('Scheduled consolidated CRM WhatsApp report check completed.',result)})
      .catch(error=>console.error('Scheduled consolidated CRM WhatsApp report check failed.',error));
  },60*1000);
  consolidatedTicketWhatsAppTimer.unref?.();
  const directorWhatsAppTimer=setInterval(()=>{
    void runAuditedBackendProcess({module:'Scheduled reports',action:'Generate Director report bundle'},()=>sendScheduledDirectorReportBundles())
      .then(result=>{if(!result?.skipped)console.log('Scheduled Director WhatsApp report check completed.',result)})
      .catch(error=>console.error('Scheduled Director WhatsApp report check failed.',error));
  },60*1000);
  directorWhatsAppTimer.unref?.();
  const hierarchyWhatsAppTimer=setInterval(()=>{
    void runAuditedBackendProcess({module:'Scheduled reports',action:'Generate hierarchy report bundle'},()=>sendScheduledHierarchyReportBundles())
      .then(result=>{if(!result?.skipped)console.log('Scheduled hierarchy WhatsApp report check completed.',result)})
      .catch(error=>console.error('Scheduled hierarchy WhatsApp report check failed.',error));
  },60*1000);
  hierarchyWhatsAppTimer.unref?.();
  const workflowReminderTimer=setInterval(()=>{
    void runAuditedBackendProcess({module:'WhatsApp Integration',action:'Send workflow reminders'},()=>sendScheduledWorkflowWhatsAppReminders())
      .then(result=>{if(!result?.skipped)console.log('Scheduled workflow WhatsApp reminder check completed.',result)})
      .catch(error=>console.error('Scheduled workflow WhatsApp reminder check failed.',error));
  },60*1000);
  workflowReminderTimer.unref?.();
  const auditLogExportTimer=setInterval(()=>{
    void runAuditedBackendProcess({module:'Audit Trail',action:'Generate five-day audit and user activity reports'},()=>sendScheduledAuditLogExports())
      .then(result=>{if(!result?.skipped)console.log('Scheduled Audit Trail export completed.',result)})
      .catch(error=>console.error('Scheduled Audit Trail export failed.',error));
  },60*1000);
  auditLogExportTimer.unref?.();
  const logRetentionTimer=setInterval(()=>{
    if(!databaseReady)return;
    void runAuditedBackendProcess({module:'Audit Trail',action:'Automatic log clean-up'},()=>runLogRetention())
      .then(result=>{if(!result?.skipped)console.log('Automatic log clean-up completed.',result)})
      .catch(error=>console.error('Automatic log clean-up failed.',error));
  },5*60*1000);
  logRetentionTimer.unref?.();
  const databaseBackupTimer=setInterval(()=>{
    void runScheduledBackup()
      .then(result=>{if(!result?.skipped)console.log('Scheduled database backup completed.',result)})
      .catch(error=>console.error('Scheduled database backup failed.',error));
  },60*1000);
  databaseBackupTimer.unref?.();
  const adminLockAuditTimer=setInterval(()=>void auditAdminLockIncidents().catch(error=>console.error('Scheduled CRM admin-lock audit failed.',error)),60*1000);
  adminLockAuditTimer.unref?.();
}
const backupImportCleanupTimer=setInterval(()=>{
  void prunePendingBackupImports().catch(error=>console.error('Backup import cleanup failed.',error));
},10*60*1000);
backupImportCleanupTimer.unref?.();
const expiredSessionCleanupTimer=setInterval(()=>{
  if(databaseReady){
    void sessionStore.pruneExpired().catch(error=>console.error('Idle session cleanup failed.',error));
    void expireRemoteAssistanceSessions().catch(error=>console.error('Remote assistance cleanup failed.',error));
  }
},60*1000);
expiredSessionCleanupTimer.unref?.();
