import pg from 'pg';
import { verifyOemTelegramBot } from '../oem-telegram.mjs';
import { createVolvoTelegramInvites, ensureVolvoTelegramTables, volvoContacts } from '../volvo-telegram-alerts.mjs';

const command = process.argv[2];
if (!['invite', 'status', 'enable'].includes(command) || !process.env.DATABASE_URL) {
  console.error('Usage in the app environment: node scripts/volvo-telegram-admin.mjs invite|status|enable');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

try {
  await verifyOemTelegramBot();
  await client.connect();
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(71903542)');
  await ensureVolvoTelegramTables(client);
  if (command === 'invite') {
    const links = await createVolvoTelegramInvites(client);
    await client.query('COMMIT');
    for (const { name, url } of links) console.log(`${name}  ${url}`);
  } else {
    const { rows } = await client.query('SELECT contact_id FROM volvo_telegram_contacts WHERE chat_id IS NOT NULL');
    const linked = new Set(rows.map(row => row.contact_id));
    const missing = volvoContacts.filter(contact => !linked.has(contact.id));
    if (command === 'enable') {
      if (missing.length) throw new Error(`Awaiting Telegram enrollment from ${missing.map(contact => contact.name).join(', ')}.`);
      await client.query('UPDATE volvo_telegram_state SET enabled_at=COALESCE(enabled_at,NOW()) WHERE id=1');
    }
    const { rows: [state] } = await client.query('SELECT enabled_at FROM volvo_telegram_state WHERE id=1');
    const { rows: deliveries } = await client.query('SELECT status,count(*)::int AS total FROM volvo_telegram_deliveries GROUP BY status');
    await client.query('COMMIT');
    console.log(JSON.stringify({ enabledAt: state.enabled_at, linked: linked.size, pending: missing.map(contact => contact.name), deliveries }, null, 2));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
