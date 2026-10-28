const menus=profile=>[...(profile.permissions?.misDesktopAccess||[]),...(profile.permissions?.misMobileAccess||[])];
export function installMisPulseBridge(app,{identity,readRequests,readMasters,verifyRequest}){
 app.post('/api/integrations/mis/pulse',async(req,res,next)=>{
  res.set('Cache-Control','no-store');req.audit=false;
  try{
   const validation=Object.create(req);validation.body={grant:req.body?.grant};
   let status=200,result,failure;
   const capture={set(){return capture},status(code){status=code;return capture},json(body){result=body;return capture}};
   await identity.handlers['/api/integrations/mis/validate'](validation,capture,error=>{failure=error});
   if(failure)throw failure;
   if(status!==200||!result?.profile)return res.status(401).json({error:'Pulse sign-in expired. Sign in normally again to reconnect.'});
   const profile=result.profile,allowed=menus(profile),action=req.body?.action;
   const tripAccess=['Vehicle Log Book','Trip Card Bulk Scan'].some(menu=>allowed.includes(menu));
   if(action==='masters'&&allowed.includes('Pulse Master Sync'))return res.json(await readMasters(profile));
   if(action==='requests'&&(tripAccess||allowed.includes('Pulse Master Sync')))return res.json(await readRequests(profile));
   if(action==='verify'&&tripAccess){
    const reference=String(req.body?.reference||'').trim();
    const payload=req.body?.payload;
    if(!reference||reference.length>200||!payload||!String(payload.firstTripRemark||'').startsWith('Pulse II automatic MIS verification | '))return res.status(400).json({error:'A saved Pulse II trip-card verification is required.'});
    // The normal verification handler still checks the source user's assigned
    // sites, current request state, evidence, meters and timeline in a transaction.
    req.session={...profile,permissions:{...profile.permissions,separateMisCredentials:false,verifyRequests:true}};
    req.params={reference};req.body=payload;
    return verifyRequest(req,res,next);
   }
   res.status(403).json({error:'Your assigned MIS menus do not allow this Pulse connection action.'});
  }catch(error){if(error.status)return res.status(error.status).json({error:error.message});next(error)}
 });
}
