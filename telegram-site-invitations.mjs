export function telegramInvitationSummary(chatIds,records){
  const result={invited:0,alreadyMember:0,failed:0,uncertain:0,pending:0};
  for(const chatId of new Set(chatIds.map(String))){
    const status=records.get(chatId);
    if(status==='Invited')result.invited++;
    else if(status==='Already in the group')result.alreadyMember++;
    else if(status==='Failed')result.failed++;
    else if(status)result.uncertain++;
    else result.pending++;
  }
  return result;
}

// Claim before contacting Telegram. An interrupted/uncertain send must never
// be retried automatically: Telegram may already have delivered it.
export async function telegramInvitationBatch({chatIds,read,claim,send,finish}){
  const ids=[...new Set(chatIds.map(String))].sort();
  const records=await read();
  for(const chatId of ids.filter(id=>!records.has(id)).slice(0,5)){
    if(!await claim(chatId))continue;
    let status;
    try{status=await send(chatId)}catch(error){
      status=(error?.status>=400&&error.status<500)||error?.code==='TELEGRAM_POLICY_PAUSED'?'Failed':'Uncertain';
    }
    await finish(chatId,status);
  }
  return telegramInvitationSummary(ids,await read());
}
