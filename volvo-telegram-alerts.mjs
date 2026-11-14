import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createFleetAssetResolver } from './dashboard-equipment-metrics.mjs';
import { equipmentGroupValue } from './equipment-group.mjs';
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

const regionsBySite = new Map(Object.entries(areas).flatMap(([region, sites]) =>
  sites.map(site => [canonicalSiteName(site), region])));

export async function buildVolvoRegionalPdf(cases, region, checkpoint, now) {
  if (!Object.hasOwn(areas, region) || !hours.includes(checkpoint) || !cases.length
    || cases.some(({ row }) => regionsBySite.get(canonicalSiteName(row.site)) !== region)) {
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
    cases.length + ' breakdowns due | ' + cases.length + ' open | 0 resolved',
    'ACTION REQUIRED - Confirm the recovery plan and expected restoration time.',
    'PDF: Attached',
  ].join('\n');
  const buffer = await buildTableBundlePdf({
    title, subtitle: region + ' | ' + checkpoint + '-hour checkpoint | ' + timestamp(+now),
    tables: [{ title: region, columns, rows }], generatedAt: now, pageSize: 'A4',
  });
  return { buffer, caption, filename: 'Volvo-OEM-BD-' + region + '-' + checkpoint + 'h.pdf' };
}

async function sendRegionalReport(client, batch, chatId, now) {
  const { cases, region, checkpoint, contactId } = batch;
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
    if (claimed.length) pdf = await buildVolvoRegionalPdf(claimed, region, checkpoint, now);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
  if (!pdf) return;
  let result, errorMessage;
  try {
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
      ADD COLUMN IF NOT EXISTS approval_expires_at TIMESTAMPTZ;
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
  const approval = command.match(/^\/approve (\d{8})$/)?.[1];
  if (approval && chatId === ownerChatId) {
    const { rows } = await client.query(`
      UPDATE volvo_telegram_contacts SET chat_id=pending_chat_id, linked_at=NOW(),
        pending_chat_id=NULL, approval_hash=NULL, approval_expires_at=NULL,
        invite_hash=NULL, invite_expires_at=NULL
      WHERE approval_hash=$1 AND approval_expires_at>NOW() AND invite_expires_at>NOW()
        AND pending_chat_id IS NOT NULL AND chat_id IS NULL
        AND NOT EXISTS(SELECT 1 FROM volvo_telegram_contacts linked
          WHERE linked.chat_id=volvo_telegram_contacts.pending_chat_id)
      RETURNING contact_id,chat_id`, [hash(approval)]);
    const approved = rows[0];
    const name = volvoContacts.find(contact => contact.id === approved?.contact_id)?.name;
    await sendOemTelegramText({ chatId, message: approved
      ? `Approved Telegram enrollment for ${name}.`
      : 'That code is invalid, expired, or already used.' });
    if (approved) await sendOemTelegramText({ chatId: approved.chat_id, message: 'Your Volvo Telegram enrollment was approved.' });
    return;
  }
  if (command === '/start') {
    await sendOemTelegramText({ chatId, message: 'Open your individual Volvo invitation link to request access. The owner must approve your request.' });
    return;
  }
  const token = command.match(/^\/start ([a-zA-Z0-9_-]{32})$/)?.[1];
  if (!token || !ownerChatId || chatId === ownerChatId) return;
  const code = String(randomInt(10000000, 100000000));
  const approvalHash = hash(code);
  const { rows } = await client.query(`
    UPDATE volvo_telegram_contacts SET pending_chat_id=$1, approval_hash=$3,
      approval_expires_at=NOW()+INTERVAL '10 minutes'
    WHERE invite_hash=$2 AND invite_expires_at>NOW() AND chat_id IS NULL
      AND (approval_expires_at IS NULL OR approval_expires_at<=NOW())
      AND NOT EXISTS(SELECT 1 FROM volvo_telegram_contacts WHERE chat_id=$1)
    RETURNING contact_id`, [chatId, hash(token), approvalHash]);
  if (!rows.length) return;
  const name = volvoContacts.find(contact => contact.id === rows[0].contact_id)?.name;
  const account = [message.from?.first_name, message.from?.last_name, message.from?.username && '@' + message.from.username]
    .filter(Boolean).join(' ').replace(/[\r\n]/g, ' ').slice(0, 160);
  try {
    await sendOemTelegramText({ chatId: ownerChatId, message: [
      'Volvo Telegram enrollment request', `Contact: ${name}`, `Telegram account: ${account || chatId}`,
      `To approve, send /approve ${code} in this chat.`, 'The code expires in 10 minutes.',
    ].join('\n') });
  } catch (error) {
    await client.query(`UPDATE volvo_telegram_contacts
      SET pending_chat_id=NULL, approval_hash=NULL, approval_expires_at=NULL WHERE approval_hash=$1`, [approvalHash]);
    throw error;
  }
  await sendOemTelegramText({ chatId, message: 'Your request is waiting for owner approval. If the code expires, open your invitation link again.' });
}

async function enrollContacts(client, nextUpdate, configuredOwner) {
  const owner = clean(configuredOwner);
  const ownerChatId = /^[1-9]\d*$/.test(owner) ? owner : '';
  const updates = await oemTelegramRequest('getUpdates', {
    ...(nextUpdate == null ? {} : { offset: Number(nextUpdate) }), allowed_updates: ['message'],
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

export function volvoRecipients(site, checkpoint) {
  const location = canonicalSiteName(site);
  return volvoContacts.filter(contact => contact.sites.includes(location) && contact.checkpoints.includes(checkpoint));
}

function renderAlert(row, asset, event, now) {
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
    const state = (await client.query('SELECT next_update,enabled_at,owner_chat_id FROM volvo_telegram_state WHERE id=1')).rows[0];
    await enrollContacts(client, state.next_update, state.owner_chat_id);
    if (!state.enabled_at) return;
    const { requests, equipment } = await loadData();
    const resolve = createFleetAssetResolver(equipment);
    const linked = new Map((await client.query(`
      SELECT contact_id,chat_id FROM volvo_telegram_contacts WHERE chat_id IS NOT NULL
    `)).rows.map(row => [row.contact_id, row.chat_id]));
    const batches = new Map();
    for (const row of requests) {
      const { assetIndex } = resolve(row, { allowTransferred: true });
      const asset = equipment[assetIndex];
      const group = lower(asset && equipmentGroupValue(asset, asset.itemName || row.equipmentGroup));
      const make = lower(asset?.make || asset?.oem);
      if (!['volvo', 'volvo trucks', 'volvo tippers'].includes(make)
        || !(group ? /\b(trucks?|tippers?)\b/.test(group) : make !== 'volvo')
        || !clean(asset.door || asset.equipmentName) || !clean(asset.chassisNo || row.chassis)) continue;
      const started = indiaDateTimeEpoch(row.start);
      if (!Number.isFinite(started) || started > +now) continue;
      const history = (await client.query(`
        SELECT event,contact_id,status FROM volvo_telegram_deliveries WHERE reference=$1
      `, [row.ref])).rows;
      const open = !row.closedAt && !['closed', 'idle', 'ideal'].includes(lower(row.status));
      let event, recipients;
      if (open) {
        const due = hours.filter(value => started + value * hourMs <= +now);
        // At onboarding send the case's current level, then send each newly reached level.
        event = String(due.at(-1) ?? 'A');
        recipients = volvoRecipients(row.site, event === 'A' ? 24 : Number(event)).map(contact => contact.id);
      } else {
        if (lower(row.status) !== 'closed' || !row.verifiedAt || !row.verifiedBy
          || !(row.firstTripDone || row.productionFirstTripAt) || !Number.isFinite(indiaDateTimeEpoch(row.closedAt))) continue;
        event = 'C';
        recipients = [...new Set(history.filter(item => item.status === 'sent').map(item => item.contact_id))];
      }
      const checkpoint = Number(event);
      const deliveryEvent = checkpoint ? `pdf-${event}` : event;
      for (const id of recipients) {
        if (!linked.has(id) || history.some(item => item.event === deliveryEvent && item.contact_id === id)) continue;
        if (checkpoint) {
          const region = regionsBySite.get(canonicalSiteName(row.site));
          const key = JSON.stringify([id, region, checkpoint]);
          if (!batches.has(key)) batches.set(key, { cases: [], region, checkpoint, contactId: id });
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
          const chatId = linked.get(id);
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
      await sendRegionalReport(client, batch, linked.get(batch.contactId), now);
    }
  } finally {
    if (locked) await client.query('SELECT pg_advisory_unlock(71903542)').catch(() => {});
    client.release();
  }
}
