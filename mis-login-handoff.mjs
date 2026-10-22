import {createHash,randomBytes} from 'node:crypto';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
const proof=value=>createHash('sha256').update(String(value)).digest('base64url');
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const callback='https://pulse-ll.cmll.in/api/mis-credentials/callback';

// Reuse the existing credential checks and retry policy. Never return the
// long-lived MIS grant to the browser or put a password/token in a URL.
export function installMisLoginHandoff(app,{pool,identity}){
 async function capture(handler,req,res){
  let body,error;
  const proxy={set:(...args)=>res.set(...args),status(code){res.status(code);return proxy;},json(value){body=value;}};
  await handler(req,proxy,value=>{error=value;});
  if(error)throw error;
  return body;
 }
 const safe=handler=>async(req,res,next)=>{
  res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});req.audit=false;
  try{await handler(req,res);}catch(error){next(error);}
 };
 app.post('/api/mis-login/authorize',safe(async(req,res)=>{
  const {state,challenge}=req.body||{};
  if(!valid(state)||!valid(challenge))return res.status(400).json({error:'Start MIS sign-in again using the MIS tab in Pulse.'});
  const result=await capture(identity.handlers['/api/integrations/mis/authenticate'],req,res);
  if(res.statusCode>=400||!result?.grant)return res.json(result);
  const code=randomBytes(32).toString('base64url');
  await pool.query('DELETE FROM mis_login_codes WHERE expires_at<=NOW()');
  await pool.query("INSERT INTO mis_login_codes(code_hash,challenge,state,grant_token,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '60 seconds')",[digest(code),challenge,state,result.grant]);
  const target=new URL(callback);target.searchParams.set('code',code);target.searchParams.set('state',state);
  res.json({redirectUrl:target.toString()});
 }));
 app.post('/api/integrations/mis/exchange',safe(async(req,res)=>{
  const {code,state,verifier}=req.body||{};
  if(!valid(code)||!valid(state)||!valid(verifier))return res.status(400).json({error:'Invalid MIS sign-in handoff.'});
  const {rows}=await pool.query('DELETE FROM mis_login_codes WHERE code_hash=$1 AND challenge=$2 AND state=$3 AND expires_at>NOW() RETURNING grant_token',[digest(code),proof(verifier),state]);
  if(!rows[0])return res.status(401).json({error:'MIS sign-in expired. Start again from Pulse.'});
  const validationReq=Object.assign(Object.create(req),{body:{grant:rows[0].grant_token}});
  const result=await capture(identity.handlers['/api/integrations/mis/validate'],validationReq,res);
  if(res.statusCode>=400||!result?.profile)return res.json(result);
  res.json({grant:rows[0].grant_token,profile:result.profile});
 }));
 return {initialize:()=>pool.query('CREATE TABLE IF NOT EXISTS mis_login_codes(code_hash TEXT PRIMARY KEY,challenge TEXT NOT NULL,state TEXT NOT NULL,grant_token TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL)')};
}
