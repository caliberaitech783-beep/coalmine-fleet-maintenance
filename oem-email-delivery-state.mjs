// Only known pre-delivery failures may be retried. Timeouts/unknown outcomes
// require investigation because the mail server may already have accepted mail.
export function safeOemRetry(error,sendStarted) {
  return !sendStarted || error?.code==='EAUTH' || ['ECONNECTION','EDNS'].includes(error?.code);
}
export function safeOemError(error) {
  return String(error?.message||error||'Unknown error')
    .replace(/(password|pass|authorization|token)\s*[:=]\s*\S+/gi,'$1=[redacted]')
    .replace(/\b(?:AUTH PLAIN|AUTH LOGIN)\s+\S+/gi,'AUTH [redacted]').slice(0,500);
}
export async function ensureOemDeliveryDetails(client) {
  await client.query(`ALTER TABLE oem_email_deliveries
    ADD COLUMN IF NOT EXISTS retry_safe BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS attachments JSONB,
    ADD COLUMN IF NOT EXISTS attempts JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ`);
}
