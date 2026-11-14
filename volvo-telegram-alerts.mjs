import { createHash, randomBytes, randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createFleetAssetResolver } from './dashboard-equipment-metrics.mjs';
import { indiaDateTimeEpoch } from './report-date-range.mjs';
import { canonicalSiteName } from './site-location.mjs';
import { oemTelegramRequest, sendOemTelegramPdf, sendOemTelegramText, verifyOemTelegramBot } from './oem-telegram.mjs';
import { buildTableBundlePdf } from './table-export-pdf.mjs';

const hours = [24, 48, 96, 144];
const areas = {
  WCL: ['Majri OC', 'Sasti OC', 'Dhoptala OC (2nd)', 'Gauri Pauni OC (2nd)'],
  NCL: ['Jayant OC', 'Dudhichua OC', 'Dudhichua East OC'],
};
export const volvoContacts = [
  ['tushar-shende', 'Tushar Shende', ['WCL'], [24, 48, 96, 144]],
  ['kasturi-sai-shashank', 'Kasturi Sai Shashank', ['WCL'], [48, 96, 144]],
  ['v-krishna-kishore', 'V Krishna Kishore', ['WCL', 'NCL'], [96, 144]],
  ['shantanu-mondal', 'Shantanu Mondal', ['NCL'], [24, 48, 96, 144]],
  ['ranjan-kumar-singh', 'Ranjan Kumar Singh', ['NCL'], [48, 96, 144]],
  ['aditya-rai', 'Aditya Rai', ['NCL'], [96, 144]],
  ['sanay-pawar', 'Sanay Pawar', ['WCL'], [144]],
  ['brijesh-gautam', 'Brijesh Gautam', ['NCL'], [144]],
  ['sachin-shivani', 'Sachin Shivani', ['WCL', 'NCL'], [144]],
].map(([id, name, regions, checkpoints]) => ({
  id, name, regions, checkpoints, sites: regions.flatMap(region => areas[region].map(canonicalSiteName)),
}));

const hash = value => createHash('sha256').update(value).digest('hex');
const publicOtpHash = (chatId, code) => `public-v2:${hash(`${chatId}:${code}`)}`;
const clean = value => String(value ?? '').trim();
const lower = value => clean(value).toLowerCase();
const hourMs = 3600000;
const dateFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function timestamp(epoch) {
  if (!Number.isFinite(epoch)) return 'Not recorded';
  const parts = Object.fromEntries(dateFormat.formatToParts(epoch).map(({ type, value }) => [type, value]));
  return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute} IST`;
}
const field = value => clean(value).replace(/\s+/g, ' ').slice(0, 360) || 'Not recorded';

export async function buildVolvoRegionalPdf(cases, contact, checkpoint, now) {
  const region = contact.regions.join(" + ");
  if ( !hours.includes(checkpoint) || !cases.length
    || cases.some(({ row }) => !contact.sites.includes(canonicalSiteName(row.site)))) {
    throw new Error('Invalid Volvo PDF region or checkpoint.');
  }
  const columns = ['Breakdown ID', 'Location', 'Vehicle', 'Door No.', 'Chassis No.', 'Status',
    'Reported at', 'Days of BD', 'Reason of BD', 'Latest action', 'Expected restoration'].map(label => ({ label }));
  const ordered = [...cases].sort((a, b) => a.row.site.localeCompare(b.row.site)
    || indiaDateTimeEpoch(a.row.start) - indiaDateTimeEpoch(b.row.start));
  const starts = ordered.map(({ row }) => indiaDateTimeEpoch(row.start));
  const rows = ordered.map(({ row, asset }, index) => {
    const minutes = Math.floor((+now - starts[index]) / 60000);
    const age = [Math.floor(minutes / 1440) + 'd', Math.floor(minutes % 1440 / 60) + 'h', minutes % 60 + 'm'].join(' ');
    return [row.ref, row.site, asset.model || row.equipment, asset.door || asset.equipmentName,
      asset.chassisNo || row.chassis, row.status, timestamp(starts[index]), age, row.complaint,
      row.dailyRemarks?.[0]?.remark || row.maintenanceWork, timestamp(indiaDateTimeEpoch(row.expectedCompletionAt))].map(field);
  });
  const title = 'Volvo OEM BD consolidated report';
  const caption = [
    'REGIONS: ' + region, title, 'From: ' + timestamp(Math.min(...starts)), 'To: ' + timestamp(+now),
    'Shift: All shifts', '', 'REGION: ' + region, 'Checkpoint: ' + checkpoint + ' hours',
    'Locations: ' + [...new Set(ordered.map(({ row }) => field(row.site)))].join(', '),
    cases.length + ' open Volvo OEM breakdowns',
    'ACTION REQUIRED - Confirm the recovery plan and expected restoration time.',
    'PDF: Attached',
  ].join('\n');
  const buffer = await buildTableBundlePdf({
    title, subtitle: region + ' | ' + checkpoint + '-hour checkpoint | ' + timestamp(+now),
    tables: contact.regions.flatMap(area => areas[area].map(site => ({
      title: area + " | " + site, columns,
      rows: rows.filter((_, index) => canonicalSiteName(ordered[index].row.site) === canonicalSiteName(site)),
    }))).filter(table => table.rows.length), generatedAt: now, pageSize: 'A4',
  });
  return { buffer, caption, filename: 'Volvo-OEM-BD-' + region + '-' + checkpoint + 'h.pdf' };
}

async function sendRegionalReport(client, batch, openCases, chatId, now) {
  const { cases, contact, checkpoint } = batch;
  const contactId = contact.id;
  const event = 'pdf-' + checkpoint;
  const claimed = [];
  let pdf;
  await client.query('BEGIN');
  try {
    for (const entry of cases) {
      const { row } = entry;
      const result = await client.query(`
        INSERT INTO volvo_telegram_deliveries(reference,event,contact_id,status)
        SELECT reference,$2,$3,'sending' FROM maintenance_requests
        WHERE reference=$1 AND site=$4 AND status=$5 AND closed_at IS NULL
          AND archived_at IS NULL AND oem_responsibility='OEM'
        ON CONFLICT DO NOTHING RETURNING reference
      `, [row.ref, event, contactId, row.site, row.status]);
      if (result.rowCount) claimed.push(entry);
    }
    if (claimed.length) {
      const snapshot = openCases.filter(({ row }) => contact.sites.includes(canonicalSiteName(row.site)));
      const current = await client.query(`
        SELECT reference,site FROM maintenance_requests
        WHERE reference=ANY($1::text[]) AND archived_at IS NULL AND closed_at IS NULL
          AND oem_responsibility='OEM' AND lower(status) NOT IN ('closed','idle','ideal')
      `, [snapshot.map(({ row }) => row.ref)]);
      const sites = new Map(current.rows.map(row => [row.reference, row.site]));
      pdf = await buildVolvoRegionalPdf(snapshot.filter(({ row }) => sites.get(row.ref) === row.site),
        contact, checkpoint, now);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  if (!pdf) return;
  let result, errorMessage;
  try {
    for (const { row, asset } of claimed) {
      await sendOemTelegramText({ chatId, message: renderAlert(row, asset, String(checkpoint), now, contact) });
    }
    result = await sendOemTelegramPdf({ chatId, ...pdf });
  } catch (error) {
    errorMessage = error.message;
  }
  await client.query(`
    UPDATE volvo_telegram_deliveries SET status=$4,message_id=$5,error=$6,updated_at=NOW()
    WHERE reference=ANY($1::text[]) AND event=$2 AND contact_id=$3
  `, [claimed.map(({ row }) => row.ref), event, contactId,
    result ? 'sent' : 'review', result ? String(result.messageId) : null, errorMessage ?? null]);
}

export async function ensureVolvoTelegramTables(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS volvo_telegram_contacts (
      contact_id TEXT PRIMARY KEY, invite_hash TEXT UNIQUE, invite_expires_at TIMESTAMPTZ,
      chat_id TEXT UNIQUE, linked_at TIMESTAMPTZ
    );
    ALTER TABLE volvo_telegram_contacts
      ADD COLUMN IF NOT EXISTS pending_chat_id TEXT,
      ADD COLUMN IF NOT EXISTS approval_hash TEXT,
      ADD COLUMN IF NOT EXISTS approval_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS public_enrolled_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS public_verification_attempts INTEGER NOT NULL DEFAULT 0;
    CREATE UNIQUE INDEX IF NOT EXISTS volvo_telegram_approval_hash
      ON volvo_telegram_contacts(approval_hash) WHERE approval_hash IS NOT NULL;
    CREATE TABLE IF NOT EXISTS volvo_telegram_state (
      id INTEGER PRIMARY KEY CHECK(id=1), next_update BIGINT, enabled_at TIMESTAMPTZ
    );
    ALTER TABLE volvo_telegram_state ADD COLUMN IF NOT EXISTS owner_chat_id TEXT;
    INSERT INTO volvo_telegram_state(id) VALUES(1) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS volvo_telegram_deliveries (
      reference TEXT NOT NULL, event TEXT NOT NULL, contact_id TEXT NOT NULL,
      status TEXT NOT NULL, message_id TEXT, error TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY(reference,event,contact_id)
    )`);
}

export async function createVolvoTelegramInvites(client) {
  const links = [];
  for (const contact of volvoContacts) {
    const token = randomBytes(24).toString('base64url');
    const saved = await client.query(`
      INSERT INTO volvo_telegram_contacts(contact_id,invite_hash,invite_expires_at)
      VALUES($1,$2,NOW()+INTERVAL '7 days')
      ON CONFLICT(contact_id) DO UPDATE SET invite_hash=EXCLUDED.invite_hash,
        invite_expires_at=EXCLUDED.invite_expires_at, pending_chat_id=NULL, approval_hash=NULL,
        approval_expires_at=NULL WHERE volvo_telegram_contacts.chat_id IS NULL
      RETURNING contact_id`, [contact.id, hash(token)]);
    if (saved.rowCount) links.push({ name: contact.name, url: `https://t.me/OEMBD_BOT?start=${token}` });
  }
  return links;
}

async function handleEnrollment(client, message, ownerChatId) {
  const chatId = String(message?.chat?.id ?? '');
  if (message?.chat?.type !== 'private' || !/^[1-9]\d*$/.test(chatId)) return;
  const command = clean(message.text);
  const verification = /^\d{4}$/.test(command) ? command : '';
  if (verification) {
    const { rows } = await client.query(`
      UPDATE volvo_telegram_contacts SET
        public_verification_attempts=public_verification_attempts+1,
        public_enrolled_at=CASE WHEN approval_hash=$3 THEN NOW() END,
        pending_chat_id=CASE WHEN approval_hash=$3 THEN NULL ELSE pending_chat_id END,
        approval_expires_at=CASE WHEN approval_hash=$3 THEN NULL ELSE approval_expires_at END,
        approval_hash=CASE WHEN approval_hash=$3 THEN NULL ELSE approval_hash END
      WHERE contact_id=$1 AND pending_chat_id=$2 AND public_enrolled_at IS NULL
        AND approval_expires_at>NOW() AND public_verification_attempts<5
        AND approval_hash LIKE 'public-v2:%'
      RETURNING public_enrolled_at`, [`public:${chatId}`, chatId, publicOtpHash(chatId, verification)]);
    await sendOemTelegramText({ chatId, message: rows[0]?.public_enrolled_at
      ? 'Your bot enrollment was verified.'
      : 'Code verification failed. Use the code shared by the owner for your request. If it expired or you used all five attempts, send /start after the 10-minute window.' });
    return;
  }
  if (/^\/verify(?:\s|$)/.test(command)) {
    await sendOemTelegramText({ chatId, message: 'Send the four digits shared by the owner as a message. Send /start if you need to request a code.' });
    return;
  }
  const approval = command.match(/^\/approve (\d{8})$/)?.[1];
  if (approval && chatId === ownerChatId) {
    const { rows } = await client.query(`
      WITH pending AS (
        SELECT contact_id,pending_chat_id
        FROM volvo_telegram_contacts
        WHERE approval_hash=$1 AND approval_expires_at>NOW()
          AND invite_expires_at>NOW() AND contact_id NOT LIKE 'public:%'
          AND pending_chat_id IS NOT NULL AND chat_id IS NULL AND public_enrolled_at IS NULL
          AND NOT EXISTS(SELECT 1 FROM volvo_telegram_contacts linked
            WHERE linked.chat_id=volvo_telegram_contacts.pending_chat_id)
      )
      UPDATE volvo_telegram_contacts c SET
        chat_id=pending.pending_chat_id, linked_at=NOW(),
        pending_chat_id=NULL, approval_hash=NULL, approval_expires_at=NULL,
        invite_hash=NULL, invite_expires_at=NULL
      FROM pending WHERE c.contact_id=pending.contact_id
      RETURNING c.contact_id,c.chat_id`, [hash(approval)]);
    const approved = rows[0];
    const name = volvoContacts.find(contact => contact.id === approved?.contact_id)?.name;
    await sendOemTelegramText({ chatId, message: approved
      ? `Approved Telegram enrollment for ${name}.`
      : 'That code is invalid, expired, already used, or belongs to a public request that the applicant must verify.' });
    if (approved) await sendOemTelegramText({ chatId: approved.chat_id, message: 'Your Volvo Telegram enrollment was approved.' });
    return;
  }
  const publicRequest = command === '/start';
  if (publicRequest && (!ownerChatId || chatId === ownerChatId)) {
    await sendOemTelegramText({ chatId, message: ownerChatId ? 'This is the owner approval chat.' : 'Bot enrollment is temporarily unavailable. Send /start again later.' });
    return;
  }
  const token = command.match(/^\/start ([a-zA-Z0-9_-]{32})$/)?.[1];
  if ((!token && !publicRequest) || !ownerChatId || chatId === ownerChatId) return;
  const code = publicRequest ? String(randomInt(0, 10000)).padStart(4, '0')
    : String(randomInt(10000000, 100000000));
  const approvalHash = publicRequest ? publicOtpHash(chatId, code) : hash(code);
  const { rows } = publicRequest ? await client.query(`
    INSERT INTO volvo_telegram_contacts(contact_id,pending_chat_id,approval_hash,approval_expires_at)
    SELECT $1,$2,$3,NOW()+INTERVAL '10 minutes'
    WHERE NOT EXISTS(SELECT 1 FROM volvo_telegram_contacts WHERE chat_id=$2)
    ON CONFLICT(contact_id) DO UPDATE SET pending_chat_id=EXCLUDED.pending_chat_id,
      approval_hash=EXCLUDED.approval_hash, approval_expires_at=EXCLUDED.approval_expires_at,
      public_verification_attempts=0
    WHERE volvo_telegram_contacts.public_enrolled_at IS NULL
      AND (volvo_telegram_contacts.approval_expires_at IS NULL OR volvo_telegram_contacts.approval_expires_at<=NOW()
        OR volvo_telegram_contacts.approval_hash NOT LIKE 'public-v2:%')
    RETURNING contact_id`, [`public:${chatId}`, chatId, approvalHash]) : await client.query(`
    UPDATE volvo_telegram_contacts SET pending_chat_id=$1, approval_hash=$3,
      approval_expires_at=NOW()+INTERVAL '10 minutes'
    WHERE invite_hash=$2 AND invite_expires_at>NOW() AND chat_id IS NULL
      AND (approval_expires_at IS NULL OR approval_expires_at<=NOW())
      AND NOT EXISTS(SELECT 1 FROM volvo_telegram_contacts WHERE chat_id=$1)
    RETURNING contact_id`, [chatId, hash(token), approvalHash]);
  if (!rows.length) {
    if (publicRequest) {
      const { rowCount } = await client.query(`
        SELECT 1 FROM volvo_telegram_contacts WHERE chat_id=$1
          OR (contact_id=$2 AND public_enrolled_at IS NOT NULL)`, [chatId, `public:${chatId}`]);
      await sendOemTelegramText({ chatId, message: rowCount ? 'You are already enrolled.'
        : 'Your request is pending. Once the owner shares your code, send the four digits here.' });
    }
    return;
  }
  const name = volvoContacts.find(contact => contact.id === rows[0].contact_id)?.name;
  const account = [message.from?.first_name, message.from?.last_name, message.from?.username && '@' + message.from.username]
    .filter(Boolean).join(' ').replace(/[\r\n]/g, ' ').slice(0, 160);
  try {
    await sendOemTelegramText({ chatId: ownerChatId, message: [
      publicRequest ? 'Public bot enrollment request' : 'Volvo Telegram enrollment request',
      publicRequest ? 'Access: Bot enrollment only' : `Contact: ${name}`,
      `Telegram account: ${account || 'Name unavailable'} (ID ${chatId})`,
      publicRequest ? `Share this code privately with the applicant: ${code}. They must send the four digits in their own bot chat.`
        : `To approve, send /approve ${code} in this chat.`,
      'The code expires in 10 minutes.',
    ].join('\n') });
  } catch (error) {
    await client.query(`UPDATE volvo_telegram_contacts
      SET pending_chat_id=NULL, approval_hash=NULL, approval_expires_at=NULL WHERE approval_hash=$1`, [approvalHash]);
    throw error;
  }
  await sendOemTelegramText({ chatId, message: publicRequest
    ? 'The owner received your code. Once they share it with you, send the four digits here. If it expires, send /start again.'
    : 'Your request is waiting for owner approval. If the code expires, open your invitation link again.' });
}

async function enrollContacts(client, nextUpdate, configuredOwner) {
  const owner = clean(configuredOwner);
  const ownerChatId = /^[1-9]\d*$/.test(owner) ? owner : '';
  const updates = await oemTelegramRequest('getUpdates', {
    ...(nextUpdate == null ? {} : { offset: Number(nextUpdate) }), allowed_updates: ['message'], timeout: 5,
  });
  for (const update of updates) {
    try {
      await handleEnrollment(client, update.message, ownerChatId);
    } catch (error) {
      console.error('Volvo Telegram enrollment update failed.', error.message);
    }
    await client.query('UPDATE volvo_telegram_state SET next_update=$1 WHERE id=1', [update.update_id + 1]);
  }
}

// Keep a Telegram long poll open so enrollment is independent of the PDF scheduler.
export async function runVolvoTelegramEnrollment({ pool, isReady, signal }) {
  let initialized = false;
  while (!signal?.aborted) {
    let pause = 250;
    try {
      if (isReady()) {
        const client = await pool.connect();
        let locked = false;
        let discard = false;
        try {
          locked = (await client.query('SELECT pg_try_advisory_lock(71903543) AS locked')).rows[0].locked;
          if (locked) {
            if (!initialized) {
              await verifyOemTelegramBot();
              await ensureVolvoTelegramTables(client);
              initialized = true;
            }
            const { rows: [state] } = await client.query('SELECT next_update,owner_chat_id FROM volvo_telegram_state WHERE id=1');
            await enrollContacts(client, state.next_update, state.owner_chat_id);
            pause = 0;
          }
        } finally {
          if (locked) await client.query('SELECT pg_advisory_unlock(71903543)').catch(() => { discard = true; });
          client.release(discard);
        }
      }
    } catch (error) {
      console.error('Volvo Telegram enrollment polling failed.', error.message);
      pause = 1000;
    }
    if (pause) await delay(pause, undefined, { signal, ref: false }).catch(error => {
      if (error.name !== 'AbortError') throw error;
    });
  }
}

export function volvoRecipients(site, checkpoint) {
  const location = canonicalSiteName(site);
  return volvoContacts.filter(contact => contact.sites.includes(location) && contact.checkpoints.includes(checkpoint));
}

function renderAlert(row, asset, event, now, contact) {
  const started = indiaDateTimeEpoch(row.start);
  const stopped = event === 'C' ? indiaDateTimeEpoch(row.closedAt) : +now;
  const minutes = Math.max(0, Math.floor((stopped - started) / 60000));
  const checkpoint = Number(event);
  const level = hours.indexOf(checkpoint) + 1;
  const next = event === 'A' ? hours[0] : hours[level];
  const heading = event === 'A' ? '🔴 NEW OEM BREAKDOWN LEVEL 0'
    : event === 'C' ? '🟢 OEM BREAKDOWN RESOLVED' : `🔴 OEM BREAKDOWN ESCALATION LEVEL ${level}`;
  const action = event === 'A' ? 'ACTION REQUIRED - Please acknowledge and confirm the support plan.'
    : event === 'C' ? 'Vehicle restoration has been verified and automated escalation is closed.'
      : 'ACTION REQUIRED - Confirm the recovery plan and expected restoration time.';
  const latest = row.dailyRemarks?.[0];
  if (level) {
    const role = ['Service Engineer', 'Area Service Manager', 'Regional Service Head',
      'Service Engineer', 'Area Service Manager', 'Regional Service Head',
      'Area Sales Manager', 'Area Sales Manager', 'Regional Sales Manager'][volvoContacts.indexOf(contact)];
    return [
      `🔴 OEM BREAKDOWN ESCALATION LEVEL ${level}`,
      'ACTION REQUIRED - Vehicle breakdown remains open. Confirm the recovery plan and restoration ETA.',
      `Escalation Checkpoint: ${checkpoint} hours | ${checkpoint / 24} days`,
      `Breakdown ID: ${field(row.ref)}`,
      `Site: ${field(row.site)} | OEM: Volvo Trucks`,
      'Asset Category: Vehicle',
      `Vehicle: Volvo ${field(asset.model || row.equipment)}`,
      `Door No.: ${field(asset.door || row.door || asset.equipmentName)} | Fleet ID: ${field(asset.asset || asset.fleetId)}`,
      `Chassis / Serial No.: ${field(asset.chassisNo || row.chassis)}`,
      '',
      `Breakdown Age: ${Math.floor(minutes / 1440)} calendar days`,
      `Total Downtime: ${Math.floor(minutes / 1440)} day ${Math.floor(minutes % 1440 / 60)} hr ${minutes % 60} min`,
      `Production Impact: ${field(row.productionImpact)}`,
      'Resolution TAT: Not configured',
      'TAT Consumed: Not available',
      'TAT Status: Not configured',
      `Current OEM Status: ${field(latest?.remark || row.maintenanceWork || row.status)}`,
      '',
      `Pending From OEM: ${field(latest?.delayedReason || row.delayedReason)}`,
      'Required Response: Confirm the action plan, engineer assignment or visit, and restoration ETA.',
      `Escalated To: ${role} | ${contact.name}`,
      `Next Escalation: ${next ? timestamp(started + next * hourMs) : 'Final checkpoint'}`,
      '',
      `Alert Generated: ${timestamp(+now)}`,
      'Source: Caliber Pulse - Automated Escalation',
    ].join('\n');
  }
  return [
    heading, action,
    ...(level ? [`Escalation Checkpoint: ${checkpoint} hours / ${checkpoint / 24} days`] : []),
    `Breakdown ID: ${field(row.ref)}`, `Site: ${field(row.site)} | OEM: Volvo Trucks`,
    'Asset Category: Vehicle', `Vehicle: Volvo ${field(asset.model || row.equipment)}`,
    `Door No.: ${field(asset.door || asset.equipmentName)} | Fleet ID: ${field(asset.asset || asset.fleetId)}`,
    `Chassis No.: ${field(asset.chassisNo || row.chassis)}`, `Reported At: ${timestamp(started)}`,
    `Breakdown Age${event === 'C' ? ' at Closure' : ''}: ${Math.floor(minutes / 1440)} calendar days`,
    `Total Downtime: ${Math.floor(minutes / 1440)} day ${Math.floor(minutes % 1440 / 60)} hr ${minutes % 60} min`,
    ...(event === 'C' ? [
      `Restored At: ${timestamp(stopped)}`, `Corrective Action: ${field(row.maintenanceWork)}`,
      `Trial Result: ${field(row.firstTripRemark || row.productionFirstTripRemark || 'First trip completed')}`,
      `Restored By: ${field(row.closedBy)}`, `Verified By: ${field(row.verifiedBy)}`,
      'Verification Status: Verified',
    ] : [
      `Current Status: ${field(row.status)}`, `Fault Category: ${field(row.subCategory || row.category)}`,
      `Problem Reported: ${field(row.complaint)}`, `Latest Action: ${field(latest?.remark || row.maintenanceWork)}`,
      `Pending From OEM: ${field(latest?.delayedReason || row.delayedReason)}`,
      'OEM Scope: Validated', `Expected Restoration: ${timestamp(indiaDateTimeEpoch(row.expectedCompletionAt))}`,
      `Next Escalation: ${next ? timestamp(started + next * hourMs) : 'Final checkpoint'}`,
    ]),
    'TAT Status: Service TAT not configured',
    `Alert Generated: ${timestamp(+now)}`, 'Source: Caliber Pulse - Automated Alert',
  ].join('\n');
}

export async function runVolvoTelegram({ pool, loadData, now = new Date() }) {
  const client = await pool.connect();
  let locked = false;
  try {
    locked = (await client.query('SELECT pg_try_advisory_lock(71903542) AS locked')).rows[0].locked;
    if (!locked) return;
    await verifyOemTelegramBot();
    await ensureVolvoTelegramTables(client);
    const state = (await client.query('SELECT enabled_at FROM volvo_telegram_state WHERE id=1')).rows[0];
    if (!state.enabled_at) return;
    const { requests, equipment } = await loadData();
    const resolve = createFleetAssetResolver(equipment);
    const linked = new Map((await client.query(`
      SELECT contact_id,chat_id,linked_at FROM volvo_telegram_contacts
      WHERE chat_id ~ '^[1-9][0-9]*$' AND linked_at IS NOT NULL
    `)).rows.map(row => [row.contact_id, row]));
    const openCases = [];
    const batches = new Map();
    for (const row of requests) {
      const { assetIndex } = resolve(row, { allowTransferred: true });
      const asset = equipment[assetIndex];
      const make = lower(asset?.make || asset?.oem);
      if (!/^volvo(?: trucks?| tippers?)?$/.test(make)) continue;
      const started = indiaDateTimeEpoch(row.start);
      if (!Number.isFinite(started) || started > +now) continue;
      const history = (await client.query(`
        SELECT event,contact_id,status FROM volvo_telegram_deliveries WHERE reference=$1
      `, [row.ref])).rows;
      const open = !row.closedAt && !['closed', 'idle', 'ideal'].includes(lower(row.status));
      let event, recipients;
      if (open) {
        openCases.push({ row, asset });
        const checkpoint = hours.findLast(value => started + value * hourMs <= +now);
        event = String(checkpoint ?? 'A');
        const eventTime = started + (checkpoint ?? 0) * hourMs;
        recipients = volvoRecipients(row.site, checkpoint ?? 24).filter(contact => {
          const link = linked.get(contact.id);
          return link && eventTime >= +new Date(state.enabled_at) && eventTime >= +new Date(link.linked_at);
        }).map(contact => contact.id);
      } else {
        if (lower(row.status) !== 'closed' || !row.verifiedAt || !row.verifiedBy
          || !(row.firstTripDone || row.productionFirstTripAt) || !Number.isFinite(indiaDateTimeEpoch(row.closedAt))) continue;
        event = 'C';
        recipients = [...new Set(history.filter(item => item.status === 'sent').map(item => item.contact_id))]
          .filter(id => volvoContacts.some(contact => contact.id === id && contact.sites.includes(canonicalSiteName(row.site))));
      }
      const checkpoint = Number(event);
      const deliveryEvent = checkpoint ? `pdf-${event}` : event;
      for (const id of recipients) {
        if (!linked.has(id) || history.some(item => item.event === deliveryEvent && item.contact_id === id)) continue;
        if (checkpoint) {
          const contact = volvoContacts.find(item => item.id === id);
          const key = JSON.stringify([id, checkpoint]);
          if (!batches.has(key)) batches.set(key, { cases: [], contact, checkpoint });
          batches.get(key).cases.push({ row, asset });
          continue;
        }
        const current = (await client.query(`
          SELECT status,site,closed_at,archived_at,oem_responsibility FROM maintenance_requests WHERE reference=$1
        `, [row.ref])).rows[0];
        if (!current || current.archived_at || current.oem_responsibility !== 'OEM'
          || current.status !== row.status || Boolean(current.closed_at) !== Boolean(row.closedAt)
          || canonicalSiteName(current.site) !== canonicalSiteName(row.site)) break;
        const params = [row.ref, deliveryEvent, id];
        const claim = await client.query(`
          INSERT INTO volvo_telegram_deliveries(reference,event,contact_id,status)
          VALUES($1,$2,$3,'sending') ON CONFLICT DO NOTHING RETURNING reference
        `, params);
        if (!claim.rowCount) continue;
        let result;
        try {
          const chatId = linked.get(id).chat_id;
          result = await sendOemTelegramText({ chatId, message: renderAlert(row, asset, event, now) });
        } catch (error) {
          await client.query(`
            UPDATE volvo_telegram_deliveries SET status='review',error=$4,updated_at=NOW()
            WHERE reference=$1 AND event=$2 AND contact_id=$3
          `, [...params, error.message]);
          continue;
        }
        await client.query(`
          UPDATE volvo_telegram_deliveries SET status='sent',message_id=$4,updated_at=NOW()
          WHERE reference=$1 AND event=$2 AND contact_id=$3
        `, [...params, String(result.messageId)]);
      }
    }
    for (const batch of batches.values()) {
      await sendRegionalReport(client, batch, openCases, linked.get(batch.contact.id).chat_id, now);
    }
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(71903542)').catch(() => {});
    client.release();
  }
}
