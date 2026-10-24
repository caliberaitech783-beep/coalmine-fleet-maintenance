import {parseReportTimestamp, elapsedLabel} from './report-metrics.mjs';
import {formatDisplayDateTime} from './date-time-format.mjs';
import {requestMeterReadings} from './request-equipment.mjs';
import {canonicalSiteName} from './site-location.mjs';
import {requestsWithDoorNumbers} from './equipment-door.mjs';
import {requestsVisibleGlobally} from './mis-request-visibility.mjs';
import {REGION_DATA,displaySiteName} from './region-scope.mjs';

export const HOURLY_PREVIEW_COLUMNS = ['Section','Door no. with Registered no.','Total BD Time','Type of BD','BD Details','Daily Update','Diff KMR','Diff. HMR','Start Time','End Time','Equipment Category','Idle Since / Duration / Reason'];
const at = value => parseReportTimestamp(value)?.getTime();
const label = value => value ? formatDisplayDateTime(value) : '—';
const firstTrip = row => at(row.productionFirstTripAt) || at(row.firstTripAt);
const endOfBd = row => at(row.closedAt) || at(row.idealRequestedAt);
const vehicle = row => String(row.chassis || row.door || row.reg || row.ref).trim().toLowerCase();
const count = rows => new Set(rows.map(vehicle)).size;
const difference = (row, type) => {
  const opening = requestMeterReadings(row, 'opening')[type];
  const closing = requestMeterReadings(row, 'closing')[type];
  if (closing == null || String(closing).trim() === '') return 'Pending closing reading';
  if (opening == null || String(opening).trim() === '') return '—';
  return Number.isFinite(Number(opening)) && Number.isFinite(Number(closing)) ? String(Number((Number(closing)-Number(opening)).toFixed(3))) : '—';
};

export function hourlyBreakdownWindow(cutoff,period='two-hour') {
  const end=new Date(cutoff).getTime();
  if(!Number.isFinite(end))throw new Error('A valid report cutoff is required.');
  const day=new Date(end+330*60000).toISOString().slice(0,10);
  const hours=/^[1-8]-hour$/.test(period)?Number(period.split('-')[0]):2;
  const start=period==='today'?Date.parse(`${day}T00:00:00+05:30`):end-hours*3600000;
  return {end,start,previous:start-(period==='today'?86400000:hours*3600000)};
}

export function buildHourlyBreakdownPreview(requests, cutoff, site='Sasti OC',period='two-hour') {
  const {end,start,previous}=hourlyBreakdownWindow(cutoff,period);
  if (!Number.isFinite(end)) throw new Error('A valid report cutoff is required.');
  const source = requestsVisibleGlobally(requests).filter(row => canonicalSiteName(row.site) === canonicalSiteName(site) && at(row.start) <= end);
  const inWindow = (value, from=start, to=end) => value >= from && value < to;
  const openAt = (row, time) => at(row.start) < time && (!endOfBd(row) || endOfBd(row) >= time);
  const idleAt = (row, time) => {
    if (row.vehicleIdle === false && !['idle','ideal'].includes(String(row.status || '').toLowerCase())) return false;
    const idle = at(row.idealRequestedAt), approved = at(row.idealApprovedAt), trip = firstTrip(row);
    return idle < time && !(approved < time) && !(trip < time);
  };
  const incoming = source.filter(row => inWindow(at(row.start)));
  const continuing = source.filter(row => at(row.start) < start && openAt(row,end));
  const closed = source.filter(row => inWindow(endOfBd(row)));
  const outgoing = source.filter(row => inWindow(firstTrip(row)));
  const idle = source.filter(row => idleAt(row,end));
  const rows = [];
  for (const [section, cases] of [['IN',incoming],['Continuing BD',continuing],['CLOSED',closed],['OUT',outgoing],['IDLE',idle]]) {
    cases.sort((a,b)=>at(a.start)-at(b.start));
    for (const row of cases) {
      const closedAt = endOfBd(row), effectiveEnd = closedAt && closedAt < end ? closedAt : end;
      const remarks = (row.dailyRemarks || []).filter(remark => at(remark.createdAt) < end).sort((a,b)=>at(b.createdAt)-at(a.createdAt));
      const current = remarks.filter(remark => inWindow(at(remark.createdAt)));
      const updates = (current.length ? current : remarks.slice(0,1)).map(remark => `${label(remark.createdAt)}: ${remark.remark || ''}${remark.delayReason ? ` (${remark.delayReason})` : ''}`).join('\n');
      const door = String(row.door || '').trim(), reg = String(row.reg || '').trim();
      const identity = [door || 'Door not recorded', ...(reg && !door.replace(/[^a-z0-9]/gi,'').toLowerCase().includes(reg.replace(/[^a-z0-9]/gi,'').toLowerCase()) ? [reg] : [])].join(' / ');
      const sectionLabel = `${{IN:'🔴','Continuing BD':'🔴',CLOSED:'🟢',OUT:'🟢',IDLE:'🟠'}[section]} ${section}`;
      rows.push([sectionLabel,identity,elapsedLabel(row.start,new Date(effectiveEnd)),row.category || '—',row.complaint || '—',updates || 'No maintenance update recorded',difference(row,'KMR'),difference(row,'HMR'),label(row.start),closedAt && closedAt < end ? label(new Date(closedAt)) : 'Pending',row.equipmentGroup || row.equipment || '—',section==='IDLE' ? `${label(row.idealRequestedAt)} / ${elapsedLabel(row.idealRequestedAt,new Date(end))} / ${row.idleReason || 'Reason not recorded'}` : '—']);
    }
  }
  return {site:displaySiteName(site),start:new Date(start).toISOString(),end:new Date(end).toISOString(),period:`${label(new Date(start))} to ${label(new Date(end))} IST`,columns:HOURLY_PREVIEW_COLUMNS,
    counts:{'Opening BD':count(source.filter(row=>openAt(row,start))),'New BD':count(incoming),'Closing BD':count(closed),'Previous BD':count(source.filter(row=>inWindow(at(row.start),previous,start))),'Previous Close':count(source.filter(row=>inWindow(endOfBd(row),previous,start))),'Total Idle Now':count(idle)},rows};
}

export function buildAllSitesHourlyBreakdownPreview(requests,cutoff,period='two-hour') {
  const names=[...new Map([...REGION_DATA.flatMap(region=>region.sites),...requests.map(row=>row.site).filter(Boolean)].map(site=>[canonicalSiteName(site),displaySiteName(site)])).values()];
  const sites=names.map(site=>buildHourlyBreakdownPreview(requests,cutoff,site,period));
  return {site:'All sites',period:sites[0].period,start:sites[0].start,end:sites[0].end,sites};
}

export function registerHourlyBreakdownPreview(app,{pool,requireSession,requireAdministrator,linkedTelegramChat,sendTelegramDocument,buildTableExportPdf}) {
  const loadReport=async({allSites=false,period='two-hour'}={})=>{
    let client;
    try {
      client=await pool.connect();
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const {rows:[clock]}=await client.query('SELECT NOW() AS cutoff');
      const cutoff=new Date(clock.cutoff), previous=new Date(hourlyBreakdownWindow(cutoff,period).previous);
      // Read only the requested site's pending cases and recent transitions.
      // Omit media and full-history joins used by the global request feed.
      const {rows}=await client.query(`SELECT reference AS ref,site,status,owner_name AS owner,created_at AS "createdAt",equipment_group AS "equipmentGroup",equipment_name AS equipment,
        door_number AS door,registration_number AS reg,chassis_number AS chassis,category,complaint,started_at AS start,
        closed_at AS "closedAt",vehicle_idle AS "vehicleIdle",ideal_requested_at AS "idealRequestedAt",ideal_approved_at AS "idealApprovedAt",idle_reason AS "idleReason",
        first_trip_at AS "firstTripAt",opening_meter_readings AS "openingMeterReadings",closing_meter_readings AS "closingMeterReadings",
        meter_type AS "meterType",opening_meter_reading AS "openingMeterReading",closing_meter_reading AS "closingMeterReading",
        (SELECT production_first_trip_at FROM production_first_trip_acceptances p WHERE p.request_reference=maintenance_requests.reference) AS "productionFirstTripAt"
        FROM maintenance_requests WHERE archived_at IS NULL AND ($1::text[] IS NULL OR lower(trim(site))=ANY($1::text[])) AND started_at<$2
        AND (closed_at IS NULL OR closed_at>=$3 OR first_trip_at>=$3 OR ideal_requested_at IS NOT NULL
          OR EXISTS(SELECT 1 FROM production_first_trip_acceptances p WHERE p.request_reference=maintenance_requests.reference AND production_first_trip_at>=$3))`,
        [allSites?null:['sasti oc','sasti ob','sasti ii','sasti'],cutoff,previous]);
      const refs=rows.map(row=>row.ref);
      const {rows:remarks}=await client.query(`SELECT request_reference AS ref,remark,delay_reason AS "delayReason",created_at AS "createdAt"
        FROM maintenance_daily_remarks WHERE request_reference=ANY($1::text[]) AND created_at<$2 ORDER BY created_at DESC`,[refs,cutoff]);
      const grouped=new Map();for(const remark of remarks){if(!grouped.has(remark.ref))grouped.set(remark.ref,[]);grouped.get(remark.ref).push(remark);}
      const {rows:equipment}=await client.query(`SELECT jsonb_build_object(
        'door',record_data->>'door','reg',record_data->>'reg','registration',record_data->>'registration',
        'registrationNumber',record_data->>'registrationNumber','equipmentName',record_data->>'equipmentName',
        'chassisNo',record_data->>'chassisNo','chassis',record_data->>'chassis','manufacturerSerialNo',record_data->>'manufacturerSerialNo',
        'engineNo',record_data->>'engineNo','model',record_data->>'model','modelNo',record_data->>'modelNo',
        'itemName',record_data->>'itemName','group',record_data->>'group','category',record_data->>'category',
        'currentLocation',record_data->>'currentLocation','location',record_data->>'location','site',record_data->>'site'
        ) AS record FROM master_records WHERE master_name='Equipment master'`);
      const prepared=requestsWithDoorNumbers(rows,equipment.map(row=>row.record)).map(row=>({...row,dailyRemarks:grouped.get(row.ref)||[]}));
      const result=allSites?buildAllSitesHourlyBreakdownPreview(prepared,cutoff,period):buildHourlyBreakdownPreview(prepared,cutoff,'Sasti OC',period);
      await client.query('COMMIT');
      return result;
    } catch(error){if(client)await client.query('ROLLBACK').catch(()=>{});throw error;}
    finally{client?.release();}
  };
  app.get('/api/reports/hourly-breakdown-preview',requireSession,requireAdministrator,async(req,res,next)=>{
    try{
      const result=await loadReport({allSites:req.query?.site==='all',period:(['two-hour','today','1-hour','2-hour','3-hour','4-hour','5-hour','6-hour','7-hour','8-hour'].includes(req.query?.period)?req.query.period:'two-hour')});
      res.set('Cache-Control','no-store');res.json(result);
    }catch(error){next(error);}
  });
  if(app.post)app.post('/api/reports/hourly-breakdown-preview/telegram',requireSession,requireAdministrator,async(req,res,next)=>{
    try{
      const site=REGION_DATA.flatMap(region=>region.sites).find(site=>canonicalSiteName(site)===canonicalSiteName(req.body?.site));
      if(!site)return res.status(400).json({error:'Choose a configured report site.'});
      if(!['two-hour','today','1-hour','2-hour','3-hour','4-hour','5-hour','6-hour','7-hour','8-hour'].includes(req.body?.period))return res.status(400).json({error:'Choose Latest 1–8 hours or Today.'});
      // Resolve the signed-in user's link server-side; caller-supplied recipients are ignored.
      const chatId=String(await linkedTelegramChat(req.session.login)||'');
      if(!/^\d+$/.test(chatId))return res.status(400).json({error:'Connect Telegram from your Pulse profile first. Reports go only to your linked private chat.'});
      const bundle=await loadReport({allSites:true,period:req.body.period});
      const report=bundle.sites.find(report=>report.site===site);
      const summary=Object.entries(report.counts).map(([name,count])=>`${name}: ${count}`).join(' · ');
      const title=`${site} · Consolidated BD report`;
      const buffer=await buildTableExportPdf({title:`${title}\n${report.period}\n${summary}`,columns:report.columns.map(label=>({label})),rows:report.rows,pageSize:'A3'});
      const filename=`consolidated-bd-${site.replace(/[^a-z0-9]+/gi,'-').toLowerCase()}-${report.end.replace(/[:.]/g,'-')}.pdf`;
      req.audit={eventType:'Integration',module:'Telegram',action:'Send BD report to myself',targetType:'Current user Telegram',targetId:site,changedFields:[]};
      const sent=await sendTelegramDocument({chatId,buffer,filename,caption:`${title}\n${report.period}\n${summary}`});
      if(!sent?.sent)throw new Error('Telegram did not confirm delivery.');
      res.status(201).json({sent:true,messageId:sent.messageId,site,period:report.period});
    }catch(error){next(error);}
  });
}
