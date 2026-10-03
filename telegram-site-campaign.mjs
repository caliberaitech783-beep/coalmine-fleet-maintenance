import {TELEGRAM_SITES,telegramUserHasSite} from './telegram-site-groups.mjs';

// Fixed identity for the explicitly requested, one-time follow-up campaign.
export const TELEGRAM_SITE_CAMPAIGN='site-joining-2026-10-03';
export function telegramSiteExport(users,groups){
  return users.flatMap(({login,user})=>{
    const sites=TELEGRAM_SITES.filter(site=>telegramUserHasSite(user,site));
    return (sites.length?sites:['']).map(site=>({login,name:String(user.employee||user.name||login),
      designation:String(user.designation||''),site,invitationLink:groups.find(group=>group.site===site)?.inviteLink||'',
      review:site?'':'Site assignment required'}));
  });
}
export function telegramCampaignRecipients(users,groups){
  const accounts=new Map();
  for(const {chatId,login,user} of users){
    const links=groups.filter(group=>group.inviteLink&&telegramUserHasSite(user,group.site));
    if(!links.length)continue;
    const key=String(chatId),existing=accounts.get(key)||{chatId:key,login,name:String(user.employee||user.name||login),links:[]};
    for(const link of links)if(!existing.links.some(value=>value.site===link.site))existing.links.push({site:link.site,invitationLink:link.inviteLink});
    accounts.set(key,existing);
  }
  return [...accounts.values()];
}
export function telegramCampaignMessage(recipient){
  return `BDMS site group invitations\n\n${recipient.links.map(link=>`${link.site}\n${link.invitationLink}`).join('\n\n')}\n\nTap each assigned site link, then Request to Join. BDMS checks your connected Telegram account and current site assignment. Production, Maintenance, MIS and the site head can reply and share site updates here.`;
}
export async function telegramCampaignBatch({recipients,read,claim,send,finish}){
  const records=await read();
  for(const recipient of recipients.filter(value=>!records.has(value.chatId)).slice(0,5)){
    if(!await claim(recipient))continue;
    let result={status:'Sent',reason:''};
    try{await send(recipient)}catch(error){
      const definitive=Number(error?.status)>=400&&Number(error?.status)<500;
      result={status:definitive?'Failed':'Uncertain',reason:definitive?'Telegram rejected delivery; check whether this user blocked the bot or disconnected.':'Delivery could not be confirmed. Do not resend without review.'};
    }
    await finish(recipient,result);
  }
  const saved=await read();
  const rows=recipients.map(recipient=>({login:recipient.login,name:recipient.name,sites:recipient.links.map(link=>link.site),
    status:saved.get(recipient.chatId)?.status||'Pending',reason:saved.get(recipient.chatId)?.reason||''}));
  return {campaign:TELEGRAM_SITE_CAMPAIGN,total:rows.length,sent:rows.filter(row=>row.status==='Sent').length,
    failed:rows.filter(row=>row.status==='Failed').length,uncertain:rows.filter(row=>!['Sent','Failed','Pending'].includes(row.status)).length,
    pending:rows.filter(row=>row.status==='Pending').length,rows};
}
