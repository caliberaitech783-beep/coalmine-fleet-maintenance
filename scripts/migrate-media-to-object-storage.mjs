import pg from "pg";
import {randomUUID} from "node:crypto";
import {createMediaStorage, mediaObjectKey, safeMediaFilename} from "../media-storage.mjs";

const {Pool} = pg;
const storage = createMediaStorage(process.env);
if (!storage) throw new Error("Configure Azure Blob or S3 object storage before running this migration.");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: String(process.env.DATABASE_SSL || "true").toLowerCase() === "false" ? false : {rejectUnauthorized: false},
  max: 2,
});

const targets = [
  {table: "maintenance_requests", key: "reference", owner: "requester_login", data: "opening_meter_file", name: "opening_meter_file_name", media: "opening_meter_media_id", purpose: "request-opening-meter", fallback: "opening-trip-card"},
  {table: "maintenance_requests", key: "reference", owner: "requester_login", data: "closing_meter_file", name: "closing_meter_file_name", media: "closing_meter_media_id", purpose: "request-closing-meter", fallback: "closing-trip-card"},
  {table: "maintenance_requests", key: "reference", owner: "requester_login", data: "first_trip_card_image", name: "", media: "first_trip_card_media_id", purpose: "request-first-trip-card", fallback: "first-trip-card"},
  {table: "crm_tickets", key: "id", owner: "creator_login", data: "attachment_data", name: "attachment_name", media: "attachment_media_id", purpose: "ticket-attachment", fallback: "ticket-attachment"},
  {table: "crm_tickets", key: "id", owner: "creator_login", data: "resolution_attachment_data", name: "resolution_attachment_name", media: "resolution_attachment_media_id", purpose: "ticket-resolution", fallback: "ticket-resolution"},
];

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) return null;
  return {contentType: match[1].toLowerCase(), body: Buffer.from(match[2], "base64")};
}

const extensionFor = (contentType) => ({
  "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf",
  "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
}[contentType] || "");

async function migrateTarget(target) {
  const nameSelect = target.name ? `,${target.name} AS original_name` : ",'' AS original_name";
  const {rows} = await pool.query(`SELECT ${target.key} AS record_key,${target.owner} AS owner_login,${target.data} AS media_data${nameSelect}
    FROM ${target.table} WHERE ${target.media} IS NULL AND ${target.data} LIKE 'data:%;base64,%' ORDER BY ${target.key}`);
  let migrated = 0;
  for (const row of rows) {
    const parsed = parseDataUrl(row.media_data);
    if (!parsed) {
      console.warn(`Skipping invalid ${target.table}.${target.data} value for ${row.record_key}.`);
      continue;
    }
    const id = randomUUID();
    const originalName = safeMediaFilename(row.original_name || `${target.fallback}-${row.record_key}${extensionFor(parsed.contentType)}`);
    const objectKey = mediaObjectKey({id, purpose: target.purpose, fileName: originalName});
    await storage.uploadBuffer({objectKey, contentType: parsed.contentType, body: parsed.body});
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`INSERT INTO media_objects
        (id,storage_provider,object_key,original_name,content_type,size_bytes,purpose,owner_login,status,completed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'ready',NOW())`,[
        id, storage.provider, objectKey, originalName, parsed.contentType, parsed.body.length, target.purpose, String(row.owner_login || "").trim().toLowerCase(),
      ]);
      const result = await client.query(`UPDATE ${target.table} SET ${target.media}=$1,${target.data}='' WHERE ${target.key}=$2 AND ${target.media} IS NULL`,[id,row.record_key]);
      if (!result.rowCount) throw new Error("The source record changed while it was being migrated.");
      await client.query("COMMIT");
      migrated += 1;
      console.log(`Migrated ${target.table}.${target.data} for ${row.record_key}.`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      await storage.delete(objectKey).catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
  return migrated;
}

try {
  let total = 0;
  for (const target of targets) total += await migrateTarget(target);
  console.log(`Media migration complete. ${total} database payload(s) moved to ${storage.provider} object storage.`);
} finally {
  await pool.end();
}
