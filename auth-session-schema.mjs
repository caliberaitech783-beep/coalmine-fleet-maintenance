// A reverted administration feature left a unique public-ID column with an
// empty-string default. Older/current session inserts omit that optional column,
// so every login after the first failed with auth_sessions_public_id_idx.
// Preserve the column, index, and existing sessions; supply unique IDs in the DB.
export async function repairLegacySessionDefaults(client) {
  await client.query(`DO $session_compatibility$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'auth_sessions'::regclass
          AND attname = 'session_public_id' AND NOT attisdropped
      ) THEN
        ALTER TABLE auth_sessions
          ALTER COLUMN session_public_id SET DEFAULT gen_random_uuid()::text;
      END IF;
    END;
    $session_compatibility$;`);
}
