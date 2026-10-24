import {TELEGRAM_SITES} from './telegram-site-groups.mjs';

// Staging health probe only: no identities, links, settings or credentials.
export function registerTelegramMembershipReadiness(app,{scheduledJobsEnabled,commit,groups,checkGroup}){
  let cached;
  app.get('/api/health/telegram-membership',async(req,res,next)=>{
    if(scheduledJobsEnabled||!commit||req.query.deployment!==commit)return res.sendStatus(404);
    res.set('Cache-Control','no-store');
    try{
      if(!cached||Date.now()-cached.time>300000){
        const promise=(async()=>{
          const registered=await groups();
          const sites=await Promise.all(TELEGRAM_SITES.map(async site=>{
            const group=registered.find(group=>group.site===site);let botReady=false;
            if(group)try{await checkGroup(group.chatId);botReady=true;}catch{}
            return {site,registered:Boolean(group),botReady};
          }));
          return {commit,ready:sites.every(site=>site.botReady),sites};
        })();
        cached={time:Date.now(),promise};
      }
      res.json(await cached.promise);
    }catch(error){cached=null;next(error);}
  });
}
