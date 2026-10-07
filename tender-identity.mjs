import {TENDER_ALL_PERMISSIONS,normalizedTenderSelection} from './tender-permissions.mjs';
import {assignedUserRoles} from './account-role-access.mjs';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {verifyPassword} from './password-auth.mjs';
import {loginRecordCandidates,userLoginCandidates} from './mobile-access.mjs';

export const TENDER_ROLES=['BD Executive','Bid Manager','Document Controller','Estimation','Technical','Legal','Finance / Treasury','BU Head','Bid Committee / Director','System Administrator'];
const enabled=v=>v===true||['true','yes','1'].includes(String(v).toLowerCase());
export function tenderProfile(row,key){
 const u=row?.record_data||{};
 const tenderUser=assignedUserRoles(u).includes('Tender User');
 const permissions=tenderUser?{desktop:Object.hasOwn(u,'tenderDesktopAccess')?normalizedTenderSelection(u.tenderDesktopAccess):[...TENDER_ALL_PERMISSIONS],mobile:Object.hasOwn(u,'tenderMobileAccess')?normalizedTenderSelection(u.tenderMobileAccess):[...TENDER_ALL_PERMISSIONS]}:null;
 const roles=tenderUser?['System Administrator']:[...new Set((Array.isArray(u.tenderRoles)?u.tenderRoles:String(u.tenderRoles||'').split(/\s*[|,]\s*/)).filter(r=>TENDER_ROLES.includes(r)))];
 if(!row||!(tenderUser||enabled(u.tenderAccess))||!roles.length||u.active===false||String(u.active).toLowerCase()==='false'||['inactive','disabled','terminated'].includes(String(u.status||'').toLowerCase())||u.mustChangePassword===true||!u.passwordHash)return null;
 return {tenderPermissions:permissions,id:String(row.id),login:String(u.login||userLoginCandidates(u)[0]||''),name:u.employee||u.name||u.login,email:u.mail||u.email||'',phone:u.phone||'',roles,businessUnit:String(u.tenderBusinessUnit||''),credentialVersion:createHmac('sha256',key).update(`${row.id}:${u.passwordHash}`).digest('hex')};
}
export function installTenderIdentity(app,pool,env=process.env){
 const key=String(env.TENDER_IDENTITY_KEY||'');
 app.post('/api/integrations/tender/:action',async(req,res,next)=>{
  res.set('Cache-Control','no-store');
  const supplied=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from(`Bearer ${key}`);
  if(key.length<32||supplied.length!==expected.length||!timingSafeEqual(supplied,expected))return res.status(401).json({error:'Integration authentication required.'});
  // Validation and directory requests run frequently; they are not user edits.
  if(req.params.action!=='authenticate')req.audit=false;
  try{
   if(!['authenticate','validate','directory'].includes(req.params.action))return res.sendStatus(404);
   if(req.params.action==='directory'){
    const {rows}=await pool.query("SELECT id,record_data FROM master_records WHERE master_name='Users & employees'");
    return res.json(rows.map(row=>tenderProfile(row,key)).filter(Boolean).map(({credentialVersion,...profile})=>profile));
   }
   let row;
   if(req.params.action==='authenticate'){
    const username=String(req.body?.username||'').trim().toLowerCase(),password=String(req.body?.password||'');
    if(!username||!password||username.length>200||password.length>1024)return res.status(401).json({error:'BDMS user name or password is incorrect.'});
    const {rows}=await pool.query("SELECT id,record_data FROM master_records WHERE master_name='Users & employees'");
    let matches=loginRecordCandidates(rows,username);
    const exact=matches.filter(r=>String(r.record_data.login||'').trim().toLowerCase()===username);
    if(exact.length)matches=exact;
    if(matches.length!==1||!verifyPassword(password,matches[0].record_data.passwordHash))return res.status(401).json({error:'BDMS user name or password is incorrect.'});
    row=matches[0];
   }else{
    if(!/^\d+$/.test(String(req.body?.id||'')))return res.sendStatus(401);
    row=(await pool.query("SELECT id,record_data FROM master_records WHERE master_name='Users & employees' AND id=$1",[req.body.id])).rows[0];
   }
   const profile=tenderProfile(row,key);
   if(!profile)return res.status(403).json({error:'Tender access is not enabled for this BDMS account, or its password must be changed. Contact your BDMS administrator.'});
   if(req.params.action==='validate'&&profile.credentialVersion!==req.body.credentialVersion)return res.status(401).json({error:'Your BDMS credentials changed. Please sign in again.'});
   if(req.params.action==='authenticate')req.audit={eventType:'Security',module:'Authentication',action:'Tender login',actorLogin:profile.login,actorName:profile.name,targetType:'User account',targetReference:profile.id,changedFields:[]};
   res.json(profile);
  }catch(error){next(error)}
 });
}
