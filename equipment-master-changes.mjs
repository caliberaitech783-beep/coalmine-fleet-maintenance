import {randomBytes} from 'node:crypto';
import {
  applyEquipmentApproval, equipmentApprovalSchema, prepareSharedEquipmentApproval, saveEquipmentApproval,
} from './equipment-master-approval.mjs';

// Pulse owns the Equipment master. Every add, edit and delete, whether typed in Pulse or sent
// from Pulse-II, is staged as one change set and applied only after one shared OTP, sent to
// the three authorised mobiles, is entered. Pulse-II reads the result back through its
// normal master sync, so both applications always show the same Equipment master.
export const EQUIPMENT_MASTER = 'Equipment master';
export const MAX_CHANGES_PER_OTP = 5000;
const OPERATIONS = ['add', 'edit', 'delete'];
const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
export const maskPhone = phone => {
  const digits = String(phone).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
  return digits.length >= 4 ? `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}` : '••••';
};

// Validates the staged list and turns it into the frozen change set the OTP approves.
export function normalizeEquipmentChanges(input, {normalize = record => record} = {}) {
  if (!Array.isArray(input) || !input.length) fail('Add, edit or delete at least one equipment record before requesting the OTP.');
  if (input.length > MAX_CHANGES_PER_OTP) fail(`One OTP can approve up to ${MAX_CHANGES_PER_OTP} changes. Split the list.`);
  const touched = new Set();
  return input.map((change, index) => {
    const row = `Change ${index + 1}`;
    const operation = text(change?.operation).toLowerCase();
    if (!OPERATIONS.includes(operation)) fail(`${row}: choose add, edit or delete.`);
    let id = null;
    if (operation !== 'add') {
      id = Number(change.id);
      if (!Number.isSafeInteger(id) || id <= 0) fail(`${row}: the equipment record is invalid.`);
      if (touched.has(id)) fail(`${row}: the same equipment record is changed twice. Keep one change per record.`);
      touched.add(id);
    }
    let record = null;
    if (operation !== 'delete') {
      if (!change.record || typeof change.record !== 'object' || Array.isArray(change.record)) fail(`${row}: equipment details are required.`);
      const {id: _ignored, pulseWrite: _pw, ...fields} = change.record;
      try { record = normalize(fields); } catch (error) { fail(`${row}: ${error.message}`); }
    }
    return {operation, id, record, label: text(change.label || record?.door || record?.equipmentName || '', 120)};
  });
}

// Imports have always overwritten the record with the same identity (serial, asset, door...).
// Keep that behaviour, but resolve it before the OTP so the approvers see the true number of
// adds and edits. The last row wins when one import repeats an identity.
export function resolveImportOverwrites(changes, existing, {identity = () => ''} = {}) {
  const byIdentity = new Map(existing.map(row => [identity(row.record_data), Number(row.id)]).filter(([key]) => key));
  const touched = new Set(changes.filter(change => change.id).map(change => change.id));
  const resolved = [], addAt = new Map();
  for (const change of changes) {
    if (change.operation !== 'add') { resolved.push(change); continue; }
    const key = identity(change.record), match = key ? byIdentity.get(key) : undefined;
    const next = match ? {...change, operation: 'edit', id: match} : change;
    if (match && touched.has(match) && !addAt.has(key)) fail(`${change.label || 'An imported row'} matches equipment record ${match}, which is already changed in this list.`);
    if (key && addAt.has(key)) { resolved[addAt.get(key)] = next; continue; }
    if (key) addAt.set(key, resolved.length);
    if (match) touched.add(match);
    resolved.push(next);
  }
  return resolved;
}

export function changeSummary(changes) {
  const count = operation => changes.filter(change => change.operation === operation).length;
  return {add: count('add'), edit: count('edit'), delete: count('delete'), total: changes.length};
}

export function otpMessage({otp, summary, requestedBy, source}) {
  const parts = [summary.add && `${summary.add} add`, summary.edit && `${summary.edit} edit`, summary.delete && `${summary.delete} delete`].filter(Boolean).join(', ');
  return `Caliber Pulse Equipment master OTP: ${otp}. ${requestedBy} (${source}) requests ${parts}. Valid 10 minutes. Share only if you approve these changes.`;
}

// Applies an approved change set inside the caller's transaction. Edits and deletes must still
// point at a live record; a record changed in between is reported instead of silently skipped.
export async function applyEquipmentChangeSet(client, changes, {identity = () => ''} = {}) {
  await client.query('SELECT pg_advisory_xact_lock(783,43)');
  const {rows: existing} = await client.query('SELECT id,record_data FROM master_records WHERE master_name=$1 FOR UPDATE', [EQUIPMENT_MASTER]);
  const byId = new Map(existing.map(row => [Number(row.id), row]));
  const byIdentity = new Map(existing.map(row => [identity(row.record_data), row]).filter(([key]) => key));
  const applied = [];
  for (const change of changes) {
    if (change.operation === 'add') {
      const key = identity(change.record);
      const match = key && byIdentity.get(key);
      if (match) fail(`${change.label || 'New equipment'} already exists in the Equipment master (record ${match.id}). Edit that record instead.`, 409);
      const {rows} = await client.query('INSERT INTO master_records (master_name,record_data) VALUES ($1,$2::jsonb) RETURNING id', [EQUIPMENT_MASTER, JSON.stringify(change.record)]);
      if (key) byIdentity.set(key, {id: rows[0].id, record_data: change.record});
      applied.push({operation: 'add', id: Number(rows[0].id), label: change.label});
      continue;
    }
    const target = byId.get(change.id);
    if (!target) fail(`${change.label || 'Equipment record ' + change.id} no longer exists in Pulse. Refresh and stage the change again.`, 409);
    if (change.operation === 'edit') {
      const key = identity(change.record), clash = key && byIdentity.get(key);
      if (clash && Number(clash.id) !== change.id) fail(`${change.label || 'This edit'} would duplicate equipment record ${clash.id}.`, 409);
      await client.query('UPDATE master_records SET record_data=$1::jsonb WHERE id=$2 AND master_name=$3', [JSON.stringify(change.record), change.id, EQUIPMENT_MASTER]);
      if (key) byIdentity.set(key, {id: change.id, record_data: change.record});
    } else {
      await client.query('DELETE FROM master_records WHERE id=$1 AND master_name=$2', [change.id, EQUIPMENT_MASTER]);
      byId.delete(change.id);
    }
    applied.push({operation: change.operation, id: change.id, label: change.label});
  }
  return applied;
}

const SECRET_SCHEMA = `CREATE TABLE IF NOT EXISTS equipment_master_approval_secret (id INTEGER PRIMARY KEY CHECK (id=1), secret TEXT NOT NULL)`;

export function createEquipmentMasterChanges({pool, sendOtp, normalize, identity, env = process.env, now = () => Date.now()}) {
  let ready;
  const init = () => ready ||= (async () => {
    await pool.query(equipmentApprovalSchema);
    await pool.query(SECRET_SCHEMA);
    await pool.query('INSERT INTO equipment_master_approval_secret (id,secret) VALUES (1,$1) ON CONFLICT (id) DO NOTHING', [randomBytes(48).toString('hex')]);
  })().catch(error => { ready = null; throw error; });
  // A configured secret wins; otherwise one random secret is kept in the database so every
  // Pulse instance and restart verifies the same OTPs.
  const secret = async () => {
    const configured = text(env.EQUIPMENT_APPROVAL_SECRET, 400);
    if (Buffer.byteLength(configured) >= 32) return configured;
    await init();
    return (await pool.query('SELECT secret FROM equipment_master_approval_secret WHERE id=1')).rows[0].secret;
  };

  return {
    async request({changes, requestedBy, source = 'Pulse'}) {
      await init();
      const {rows: existing} = await pool.query('SELECT id,record_data FROM master_records WHERE master_name=$1', [EQUIPMENT_MASTER]);
      const frozen = resolveImportOverwrites(normalizeEquipmentChanges(changes, {normalize}), existing, {identity});
      const found = new Set(existing.map(row => Number(row.id)));
      const missing = frozen.find(change => change.id && !found.has(change.id));
      if (missing) fail(`${missing.label || 'Equipment record ' + missing.id} no longer exists in Pulse. Refresh and stage the change again.`, 409);
      const summary = changeSummary(frozen);
      const change = {changes: frozen, summary, requestedBy: text(requestedBy, 120) || 'Unknown user', source: text(source, 40), requestedAt: new Date(now()).toISOString()};
      const {request, recipients} = prepareSharedEquipmentApproval({change, secret: await secret(), now: now()});
      const otp = recipients[0].code, message = otpMessage({otp, summary, requestedBy: change.requestedBy, source: change.source});
      const sent = [], failures = [];
      for (const {phone} of recipients) {
        try { await sendOtp({phone, otp, message}); sent.push(phone); } catch (error) { failures.push(`${maskPhone(phone)}: ${error.message}`); }
      }
      if (!sent.length) fail(`The OTP could not be sent to any authorised mobile. ${failures.join(' ')}`.trim(), 502);
      request.sentTo = sent.map(maskPhone);
      await saveEquipmentApproval(pool, request);
      return {id: request.id, expiresAt: new Date(request.expiresAt).toISOString(), sentTo: request.sentTo, failures, summary};
    },
    async verify(id, code) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) fail('This OTP request is invalid. Request a new OTP.');
      await init();
      let applied = [];
      const status = await applyEquipmentApproval(pool, id, {code: text(code, 12), secret: await secret(), now: now()}, async (client, change) => {
        applied = await applyEquipmentChangeSet(client, change.changes, {identity});
      });
      if (status === 'invalid') fail('Wrong OTP. Check the code and try again.');
      if (status === 'unavailable') fail('Too many wrong attempts. Request a new OTP.', 409);
      if (status !== 'approved') fail('This OTP has expired or was already used. Request a new OTP.', 409);
      return {status, applied, summary: changeSummary(applied)};
    },
  };
}

const write = req => !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

// Registers the OTP routes and closes every direct write to the Equipment master.
export function registerEquipmentMasterChanges(app, {service, requireSuper, audit = () => {}}) {
  const guard = (req, res, next) => { req.params = {...req.params, master: encodeURIComponent(EQUIPMENT_MASTER)}; return requireSuper(req, res, next); };
  const respond = fn => async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(await fn(req)); } catch (error) { if (error.status) return res.status(error.status).json({error: error.message}); next(error); }
  };
  app.use('/api/masters/:master', (req, res, next) => {
    if (write(req) && decodeURIComponent(req.params.master) === EQUIPMENT_MASTER)
      return res.status(409).json({error: 'Equipment master changes need the shared OTP. Stage the changes and use Request OTP.', code: 'equipment_otp_required'});
    next();
  });
  app.post('/api/equipment-master/changes', guard, respond(async req => {
    const result = await service.request({changes: req.body?.changes, requestedBy: req.session?.name || req.session?.login, source: req.body?.source === 'Pulse-II' ? 'Pulse-II' : 'Pulse'});
    audit(req, {action: 'Request Equipment master OTP', reference: result.id, details: result.summary});
    return result;
  }));
  app.post('/api/equipment-master/changes/:id/verify', guard, respond(async req => {
    const result = await service.verify(req.params.id, req.body?.otp);
    audit(req, {action: 'Apply Equipment master changes by OTP', reference: req.params.id, details: result.summary});
    return result;
  }));
}
