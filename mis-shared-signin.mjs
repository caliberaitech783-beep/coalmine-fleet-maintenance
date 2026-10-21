import {createHash,randomBytes,randomUUID} from 'node:crypto';

const digest=value=>createHash('sha256').update(String(value)).digest('base64url');
const random=()=>randomBytes(32).toString('base64url');
const valid=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const issuerCookie='__Host-pulse_mis_signin',stateCookie='__Host-mis_signin_state',handoffCookie='__Host-mis_signin_ready';
const cookieOptions={httpOnly:true,secure:true,sameSite:'lax',path:'/'};
const cookie=(req,name)=>String(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
export function misSignInAllowed(profile){
  return Boolean(profile?.login&&(['MIS User','MIS Manager'].includes(profile.assignedRole)||profile.role==='super'))
    &&!['HR User','HR Manager','Account User','Tender User'].includes(profile?.assignedRole)
    &&!['Account User','Tender User'].includes(profile?.userType);
}
const publicProfile=profile=>({role:profile.role,name:profile.name,login:profile.login,userType:profile.userType,assignedRole:profile.assignedRole,permissions:profile.permissions||{},preferredLanguage:profile.preferredLanguage||'en',secondaryLanguage:profile.secondaryLanguage||''});

// Fixed endpoints, single-use authorization codes, S256 PKCE, server-held state,
// and a separate MIS session. Pulse passwords/tokens never reach the MIS client.
export function registerMisSharedSignIn(app,{pool,sessionStore,requireSession,mode=process.env.MIS_SSO_MODE||'off',issuer='https://pulse.cmll.in',client='https://pulseii.cmll.in',fetcher=fetch}){
  if(!['off','issuer','client'].includes(mode))throw Error('Invalid MIS sign-in mode.');
  const callback=client+'/api/mis-sso/callback';
  const safe=fn=>async(req,res)=>{
    res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});req.audit=false;
    try{await fn(req,res);}catch{res.status(503).json({error:'Shared sign-in is temporarily unavailable. Please retry.'});}
  };
  const request=async(path,body)=>{
    const response=await fetcher(issuer+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});
    if(!response.ok)return null;
    return response.json();
  };
  app.get('/api/mis-sso/config',safe(async(_req,res)=>res.json({mode})));
  if(mode==='issuer'){
    // An HttpOnly first-party cookie lets a new Pulse tab recognize an existing
    // login even when the original tab uses sessionStorage instead of Remember me.
    app.use((req,res,next)=>{
      if(['/api/login','/api/change-initial-password','/api/password-reset/confirm'].includes(req.path)){
        const json=res.json.bind(res);
        res.json=body=>{if(body?.token&&!body.requiresPasswordChange)res.cookie(issuerCookie,body.token,cookieOptions);return json(body);};
      }
      if(req.path==='/api/logout')res.clearCookie(issuerCookie,cookieOptions);
      next();
    });
    app.post('/api/mis-sso/remember',requireSession,safe(async(req,res)=>{
      const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
      res.cookie(issuerCookie,token,cookieOptions);res.json({ok:true});
    }));
    app.get('/api/mis-sso/authorize',safe(async(req,res)=>{
      const {state,code_challenge:challenge}=req.query;
      if(!valid(state)||!valid(challenge))return res.status(400).json({error:'Invalid shared sign-in request.'});
      const token=cookie(req,issuerCookie);
      const profile=await sessionStore.get(token);
      if(!profile){
        const login=new URL('/',issuer);login.searchParams.set('misSignIn','1');login.searchParams.set('state',state);login.searchParams.set('code_challenge',challenge);
        return res.redirect(303,login.toString());
      }
      if(!misSignInAllowed(profile))return res.status(403).json({error:'Your Pulse account is not assigned to MIS. Contact your administrator.'});
      await pool.query('DELETE FROM mis_sso_codes WHERE expires_at<NOW()');
      const code=random();
      await pool.query("INSERT INTO mis_sso_codes(code_hash,challenge,session_token,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '60 seconds')",[digest(code),challenge,token]);
      const target=new URL(callback);target.searchParams.set('code',code);target.searchParams.set('state',state);
      res.redirect(303,target.toString());
    }));
    app.post('/api/mis-sso/exchange',safe(async(req,res)=>{
      const {code,verifier}=req.body||{};
      if(!valid(code)||!valid(verifier))return res.status(400).json({error:'Invalid shared sign-in exchange.'});
      const {rows}=await pool.query('DELETE FROM mis_sso_codes WHERE code_hash=$1 AND challenge=$2 AND expires_at>NOW() RETURNING session_token',[digest(code),digest(verifier)]);
      const profile=rows[0]&&await sessionStore.get(rows[0].session_token);
      if(!misSignInAllowed(profile))return res.status(401).json({error:'Shared sign-in has expired.'});
      const grant=random();
      await pool.query('DELETE FROM mis_sso_grants WHERE expires_at<NOW()');
      await pool.query("INSERT INTO mis_sso_grants(grant_hash,session_token,expires_at) VALUES($1,$2,NOW()+INTERVAL '30 days')",[digest(grant),rows[0].session_token]);
      res.json({grant,profile:publicProfile(profile)});
    }));
    app.post('/api/mis-sso/validate',safe(async(req,res)=>{
      const grant=req.body?.grant;
      if(!valid(grant))return res.status(401).json({error:'Shared sign-in has expired.'});
      const {rows}=await pool.query('SELECT session_token FROM mis_sso_grants WHERE grant_hash=$1 AND expires_at>NOW()',[digest(grant)]);
      const profile=rows[0]&&await sessionStore.get(rows[0].session_token);
      if(!misSignInAllowed(profile))return res.status(401).json({error:'Shared sign-in has expired.'});
      res.json({profile:publicProfile(profile)});
    }));
  }
  if(mode==='client'){
    app.post('/api/login',safe(async(_req,res)=>res.status(403).json({error:'Use shared Pulse sign-in for MIS.'})));
    app.get('/api/mis-sso/start',safe(async(_req,res)=>{
      const state=random(),verifier=random();
      await pool.query('DELETE FROM mis_sso_pending WHERE expires_at<NOW()');
      await pool.query("INSERT INTO mis_sso_pending(state_hash,verifier,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')",[digest(state),verifier]);
      res.cookie(stateCookie,state,{...cookieOptions,maxAge:300000});
      const target=new URL('/api/mis-sso/authorize',issuer);target.searchParams.set('state',state);target.searchParams.set('code_challenge',digest(verifier));
      res.redirect(303,target.toString());
    }));
    app.get('/api/mis-sso/callback',safe(async(req,res)=>{
      const {state,code}=req.query;
      if(!valid(state)||!valid(code)||cookie(req,stateCookie)!==state)return res.status(400).json({error:'Shared sign-in request did not match this browser. Start again from MIS.'});
      res.clearCookie(stateCookie,cookieOptions);
      const {rows}=await pool.query('DELETE FROM mis_sso_pending WHERE state_hash=$1 AND expires_at>NOW() RETURNING verifier',[digest(state)]);
      if(!rows[0])return res.status(400).json({error:'Shared sign-in request has expired. Start again from MIS.'});
      const result=await request('/api/mis-sso/exchange',{code,verifier:rows[0].verifier});
      if(!result||!valid(result.grant)||!misSignInAllowed(result.profile))return res.status(401).json({error:'Pulse could not authorize MIS access.'});
      const token=randomUUID();
      await sessionStore.create({token,...publicProfile(result.profile)});
      await pool.query('INSERT INTO mis_sso_sessions(session_token,grant_token) VALUES($1,$2)',[token,result.grant]);
      res.cookie(handoffCookie,token,{...cookieOptions,maxAge:60000});
      res.redirect(303,client+'/?misSsoReady=1');
    }));
    app.get('/api/mis-sso/session',safe(async(req,res)=>{
      const token=cookie(req,handoffCookie);res.clearCookie(handoffCookie,cookieOptions);
      const profile=token&&await validateSession(token,await sessionStore.get(token));
      if(!profile)return res.status(401).json({error:'Shared sign-in has expired. Please retry.'});
      res.json({token,...publicProfile(profile)});
    }));
  }
  async function validateSession(token,session){
    if(mode!=='client'||!session)return session;
    const {rows}=await pool.query('SELECT grant_token FROM mis_sso_sessions WHERE session_token=$1',[token]);
    if(!rows[0])return null;
    // Recheck Pulse on every authenticated request: logout/revocation never
    // leaves an independent, long-lived MIS session authorized accidentally.
    const result=await request('/api/mis-sso/validate',{grant:rows[0].grant_token});
    return result&&misSignInAllowed(result.profile)?{...session,...publicProfile(result.profile)}:null;
  }
  return {
    validateSession,
    async initialize(){
      if(mode==='issuer'){await pool.query(`CREATE TABLE IF NOT EXISTS mis_sso_codes(code_hash TEXT PRIMARY KEY,challenge TEXT NOT NULL,session_token UUID NOT NULL,expires_at TIMESTAMPTZ NOT NULL)`);await pool.query(`CREATE TABLE IF NOT EXISTS mis_sso_grants(grant_hash TEXT PRIMARY KEY,session_token UUID NOT NULL,expires_at TIMESTAMPTZ NOT NULL)`);}
      if(mode==='client'){await pool.query(`CREATE TABLE IF NOT EXISTS mis_sso_pending(state_hash TEXT PRIMARY KEY,verifier TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL)`);await pool.query(`CREATE TABLE IF NOT EXISTS mis_sso_sessions(session_token UUID PRIMARY KEY REFERENCES auth_sessions(token) ON DELETE CASCADE,grant_token TEXT NOT NULL)`);}
    },
  };
}
