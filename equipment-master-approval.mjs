import {createHmac, randomInt, randomUUID, timingSafeEqual} from 'node:crypto';

export const equipmentApprovers = Object.freeze([
  'Ashish Thakur', 'Kishor Dherde', 'Ritikh Jagtap',
]);

const lifetimeMs = 10 * 60 * 1000;
const maxAttempts = 5;

function digest(secret, requestId, approver, code) {
  return createHmac('sha256', secret).update(JSON.stringify([requestId, approver, code])).digest();
}

export function prepareEquipmentApproval({change, accounts, secret, now = Date.now()}) {
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Equipment approval requires a signing secret.');
  const id = randomUUID();
  const recipients = equipmentApprovers.map(name => {
    const matches = accounts.filter(account => account.name?.trim().toLowerCase() === name.toLowerCase());
    const account = matches[0];
    const mobile = String(account?.mobile ?? '').replace(/[\s()+-]/g, '');
    if (matches.length !== 1 || !account.id || !/^\d{10,15}$/.test(mobile)) {
      throw new Error('Equipment approver must have a unique Login Master account and mobile number.');
    }
    const phone = /^\d{10}$/.test(mobile) ? '91' + mobile : mobile;
    return {approver: String(account.id), phone, code: String(randomInt(100000, 1000000))};
  });
  if (new Set(recipients.map(row => row.approver)).size !== 3 ||
      new Set(recipients.map(row => row.phone)).size !== 3) {
    throw new Error('Equipment approvers must have distinct accounts and mobile numbers.');
  }
  return {
    request: {
      id, change: structuredClone(change), expiresAt: now + lifetimeMs, status: 'pending',
      approvals: recipients.map(({approver, code}) => ({
        approver, hash: digest(secret, id, approver, code).toString('hex'), attempts: 0, approved: false,
      })),
    },
    recipients,
  };
}

// Persist this transition while holding the request row lock. Apply the stored change
// and persist the second approval in the same transaction.
export function verifyEquipmentApproval(request, {approver, code, secret, now = Date.now()}) {
  if (request.status !== 'pending' || now >= request.expiresAt) return 'closed';
  if (request.sharedApproval) {
    const entry = request.sharedApproval;
    if (entry.attempts >= maxAttempts) return 'unavailable';
    entry.attempts++;
    if (typeof code !== 'string' || !/^\d{6}$/.test(code) ||
        !timingSafeEqual(Buffer.from(entry.hash, 'hex'), digest(secret, request.id, 'shared', code))) {
      return 'invalid';
    }
    request.status = 'approved';
    return 'approved';
  }

  const entry = request.approvals.find(row => row.approver === String(approver));
  if (!entry || entry.approved || entry.attempts >= maxAttempts) return 'unavailable';
  entry.attempts++;
  if (typeof code !== 'string' || !/^\d{6}$/.test(code) ||
      !timingSafeEqual(Buffer.from(entry.hash, 'hex'), digest(secret, request.id, entry.approver, code))) {
    return 'invalid';
  }
  entry.approved = true;
  if (request.approvals.filter(row => row.approved).length < 2) return 'pending';
  request.status = 'approved';
  return 'approved';
}

export const equipmentApprovalSchema = `
  CREATE TABLE IF NOT EXISTS equipment_master_approvals (
    id UUID PRIMARY KEY,
    request_data JSONB NOT NULL
  );
`;

export async function saveEquipmentApproval(pool, request) {
  await pool.query(
    'INSERT INTO equipment_master_approvals (id, request_data) VALUES ($1, $2)',
    [request.id, JSON.stringify(request)],
  );
}

export async function applyEquipmentApproval(pool, id, submission, applyChange) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const {rows} = await client.query(
      'SELECT request_data FROM equipment_master_approvals WHERE id = $1 FOR UPDATE', [id],
    );
    const request = rows[0]?.request_data;
    const status = request ? verifyEquipmentApproval(request, submission) : 'closed';
    if (status === 'approved') await applyChange(client, request.change);
    if (['invalid', 'pending', 'approved'].includes(status)) {
      await client.query(
        'UPDATE equipment_master_approvals SET request_data = $2 WHERE id = $1',
        [id, JSON.stringify(request)],
      );
    }
    await client.query('COMMIT');
    return status;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function prepareEquipmentApprovalFromLoginMaster(pool, {change, secret, now}) {
  const {rows: accounts} = await pool.query(`
    SELECT id,
      COALESCE(NULLIF(trim(record_data->>'employee'), ''), trim(record_data->>'name')) AS name,
      COALESCE(NULLIF(trim(record_data->>'phone'), ''), NULLIF(trim(record_data->>'phoneNo'), ''), trim(record_data->>'phoneNumber')) AS mobile
    FROM master_records
    WHERE master_name = 'Users & employees'
      AND lower(COALESCE(NULLIF(trim(record_data->>'employee'), ''), trim(record_data->>'name'))) = ANY($1::text[])
  `, [equipmentApprovers.map(name => name.toLowerCase())]);
  return prepareEquipmentApproval({change, accounts, secret, now});
}

const equipmentApprovalPhones = Object.freeze(['919850396090', '917828619175', '919423604667']);

export function prepareSharedEquipmentApproval({change, secret, now = Date.now()}) {
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error('Equipment approval requires a signing secret.');
  const id = randomUUID();
  const code = String(randomInt(100000, 1000000));
  return {
    request: {
      id, change: structuredClone(change), expiresAt: now + lifetimeMs, status: 'pending',
      sharedApproval: {hash: digest(secret, id, 'shared', code).toString('hex'), attempts: 0},
    },
    recipients: equipmentApprovalPhones.map(phone => ({phone, code})),
  };
}
