export function normalizeUsername(value){
  return String(value||'').trim().toLowerCase();
}

// Serialize only username-changing transactions. A table lock here would also
// wait behind unrelated Equipment, Shift, Privilege, and transfer writes because
// every master shares master_records.
export const USERNAME_WRITE_LOCK_KEY='Users & employees username writes';

export async function lockUsernamesForWrite(client){
  if(!client?.query)throw new TypeError('A database client is required.');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[USERNAME_WRITE_LOCK_KEY]);
}

export function duplicateUsername(existingRecords=[],incomingRecords=[]){
  const seen=new Set(existingRecords.map(record=>normalizeUsername(record?.login)).filter(Boolean));
  for(const record of incomingRecords){
    const username=normalizeUsername(record?.login);
    if(username&&seen.has(username))return String(record.login||'').trim();
    if(username)seen.add(username);
  }
  return '';
}
