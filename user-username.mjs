export function normalizeUsername(value){
  return String(value||'').trim().toLowerCase();
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
