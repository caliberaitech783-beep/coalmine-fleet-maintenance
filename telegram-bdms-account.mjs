// Telegram may legitimately be linked to several BDMS logins. Require an
// explicit choice, and recheck that choice against the current links each turn.
export function telegramBdmsAccountChoice({links=[],text='',selectedLogin=''}){
  const logins=[...new Set(links.map(r=>String(r.login||'').trim().toLowerCase()).filter(Boolean))];
  if(!logins.length)return {kind:'unlinked'};
  const command=String(text).trim().match(/^\/account(?:\s+(\S+))?$/i);
  if(command?.[1]){
    const login=command[1].toLowerCase();
    return logins.includes(login)?{kind:'selected',login,changed:true}:{kind:'choose',logins};
  }
  if(command)return {kind:'choose',logins};
  if(logins.length===1)return {kind:'selected',login:logins[0],changed:selectedLogin!==logins[0]};
  if(logins.includes(String(selectedLogin).toLowerCase()))return {kind:'selected',login:String(selectedLogin).toLowerCase(),changed:false};
  return {kind:'choose',logins};
}
