import {TELEGRAM_SITES,telegramUserHasSite} from './telegram-site-groups.mjs';

export const REQUIRED_SITE_LINKS={
  'Jayant OC':'https://t.me/+_UoCyKUxIbwyMzE1',
  'Sasti OC':'https://t.me/+fWnPZkOH6PIzZjQ1',
  'Majri OC':'https://t.me/+3ucfdtfP7A02MTk1',
  'Gauri Pauni OC (2nd)':'https://t.me/+xjR4_7L7b_U5MDY1',
  'Dudhichua OC':'https://t.me/+Oe5Q41rg6no3MjQ1',
  'Dhoptala OC (2nd)':'https://t.me/+p7w_u8NM0602Njk9',
  'Dudhichua East OC':'https://t.me/+IQxBULYIh7ExOGFl',
  'Lalpeth OC':'https://t.me/+LuSNfCNrAWhkOTM1',
};

// Only onboarding and session lifecycle are available before verification.
export function membershipOnboardingPath(path){
  return ['/api/telegram/me','/api/telegram/link','/api/logout','/api/session-status','/api/session-heartbeat'].includes(path);
}

export function createMembershipChecker({checkMember,checkGroup,now=Date.now,ttl=60000}){
  const cache=new Map(),groupChecks=new Map(),inFlight=new Map();
  return async function membership({user,chatId,groups,force=false}){
    const sites=TELEGRAM_SITES.filter(site=>telegramUserHasSite(user,site));
    const results=await Promise.all(sites.map(async site=>{
      const group=groups.find(group=>group.site===site);
      const row={site,inviteLink:REQUIRED_SITE_LINKS[site],joined:false,status:!chatId?'Not connected':!group?'Group not configured':'Not joined',checkedAt:null};
      if(chatId&&group){
        const key=`${group.chatId}:${chatId}`;
        let saved=cache.get(key);
        if(force||!saved||now()-saved.time>=ttl){
          let pending=inFlight.get(key);
          if(!pending){
            pending=(async()=>{
              let checked=groupChecks.get(group.chatId);
              if(!checked||now()-checked.time>=300000){
                checked={time:now(),promise:Promise.resolve().then(()=>checkGroup(group.chatId))};
                groupChecks.set(group.chatId,checked);
              }
              try{await checked.promise;}catch(error){groupChecks.delete(group.chatId);throw error;}
              const member=await checkMember(group.chatId,chatId);
              const result={time:now(),joined:['member','administrator','creator'].includes(member.status)||(member.status==='restricted'&&member.is_member===true)};
              cache.set(key,result);
              if(cache.size>10000)for(const [id,value] of cache)if(now()-value.time>=ttl)cache.delete(id);
              return result;
            })();
            inFlight.set(key,pending);
          }
          try{
            saved=await pending;
          }catch{saved=null;cache.delete(key);row.status='Verification unavailable';}
          finally{if(inFlight.get(key)===pending)inFlight.delete(key);}
        }
        if(saved){row.joined=saved.joined;row.status=saved.joined?'Joined':'Not joined';row.checkedAt=new Date(saved.time).toISOString();}
      }
      return row;
    }));
    return {required:true,linked:Boolean(chatId),groups:results,allowed:Boolean(chatId&&sites.length&&results.every(row=>row.joined)),assignmentRequired:!sites.length};
  };
}
