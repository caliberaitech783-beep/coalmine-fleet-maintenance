// Read-only, private-chat pilot. Data must be supplied by the application's
// current authorization and request visibility rules, never by an LLM.
export const BDMS_CHAT_KEYBOARD={keyboard:[['Open breakdowns','Running BD'],['Find vehicle/request','Pending work'],['Help / सहायता']],resize_keyboard:true};
export const BDMS_LANGUAGE_KEYBOARD={keyboard:[['English','हिंदी']],resize_keyboard:true};
export const BDMS_WELCOME='Welcome to Caliber Pulse. Please select your language first, then choose your query. / कैलिबर पल्स में आपका स्वागत है। पहले अपनी भाषा चुनें, फिर अपना प्रश्न चुनें।';
const menus={en:[['Site summary','Open breakdowns'],['Running BD','Closed requests'],['First trip pending','MIS pending'],['Breakdown ageing','Find vehicle/request'],['Pending work','Help'],['Change language']],hi:[['साइट सारांश','खुले ब्रेकडाउन'],['रनिंग बी डी','बंद अनुरोध'],['पहली ट्रिप लंबित','MIS सत्यापन लंबित'],['ब्रेकडाउन अवधि','वाहन / अनुरोध खोजें'],['लंबित कार्य','सहायता'],['भाषा बदलें']]};
export function bdmsChatRole(session={}){
  if(!bdmsChatCanRead(session))return 'denied';
  if(session.role==='super')return 'management';
  return {'Production User':'production','Maintenance User':'maintenance','MIS User':'mis'}[session.assignedRole]||'viewer';
}
const roleQueries={production:['summary','own','open','running','closed','firstTrip','findPrompt','pending'],maintenance:['summary','open','running','updates','ageing','findPrompt','pending'],mis:['summary','mis','firstTrip','verified','closed','running','findPrompt','pending'],management:['summary','open','running','closed','firstTrip','mis','verified','updates','ageing','findPrompt','pending'],viewer:['summary','open','running','closed','ageing','findPrompt']};
const labels={summary:['Site summary','साइट सारांश'],own:['My requests','मेरे अनुरोध'],open:['Open breakdowns','खुले ब्रेकडाउन'],running:['Running BD','रनिंग बी डी'],closed:['Closed requests','बंद अनुरोध'],firstTrip:['First trip pending','पहली ट्रिप लंबित'],mis:['MIS pending','MIS सत्यापन लंबित'],verified:['Verified requests','सत्यापित अनुरोध'],updates:['Repair updates','मरम्मत अपडेट'],ageing:['Breakdown ageing','ब्रेकडाउन अवधि'],findPrompt:['Find vehicle/request','वाहन / अनुरोध खोजें'],pending:['Pending work','लंबित कार्य']};
labels.transfers=['Vehicle transfer details','वाहन ट्रांसफर विवरण'];
labels.ticketClose=['Ticket close status','टिकट बंद स्थिति'];
labels.firstTripVerification=['First trip verification details','पहली ट्रिप सत्यापन विवरण'];
labels.idle=['Idle details','आइडल विवरण'];
labels.todayBd=['Total BD today','आज के कुल ब्रेकडाउन'];
labels.dateBd=['BD by date / days','तारीख / दिनों के अनुसार ब्रेकडाउन'];
labels.fleet=['Vehicle availability','वाहन उपलब्धता'];
for(const [role,queries] of Object.entries(roleQueries)){
  queries.push('ticketClose','idle','todayBd','dateBd','fleet');
  if(['production','mis','management'].includes(role))queries.push('firstTripVerification');
  if(['mis','management'].includes(role))queries.push('transfers');
}
export function bdmsChatTransfersAllowed(session={}){
  if(session.role==='normal')return session.assignedRole==='MIS User';
  if(session.role!=='super')return false;
  if(session.permissions?.adminLevel!=='Manager')return true;
  const roles=session.permissions?.managerRoles||[session.permissions?.managerRole];
  return roles.some(role=>['MIS Manager','Project Manager','Production Manager'].includes(role));
}
export function bdmsChatKeyboard(language,session={role:'super'}){
  if(!menus[language])return BDMS_LANGUAGE_KEYBOARD;
  const keys=roleQueries[bdmsChatRole(session)]||[];
  const items=keys.filter(key=>key!=='transfers'||bdmsChatTransfersAllowed(session)).map(key=>labels[key][language==='hi'?1:0]);
  if(bdmsChatRole(session)==='production'&&items.length)items[0]=language==='hi'?'मेरे अनुरोध सारांश':'My requests summary';
  items.push(language==='hi'?'सहायता':'Help',language==='hi'?'भाषा बदलें':'Change language');
  return {keyboard:Array.from({length:Math.ceil(items.length/2)},(_,i)=>items.slice(i*2,i*2+2)),resize_keyboard:true};
}
export function bdmsChatQueryAllowed(text,session){
  const kind=bdmsChatIntent(text).kind;
  if(kind==='transfers')return bdmsChatTransfersAllowed(session);
  return ['menu','help','excluded'].includes(kind)||(roleQueries[bdmsChatRole(session)]||[]).includes(kind==='find'?'findPrompt':kind);
}
export function bdmsChatFlow(text,language,session={role:'super'}){
  const input=String(text||'').trim();
  const selection=/^English$/i.test(input)?'en':/^(हिंदी|Hindi)$/i.test(input)?'hi':'';
  if(selection)return {language:selection,text:selection==='hi'?'हिंदी चुनी गई। अपनी भूमिका के अनुसार प्रश्न चुनें।':'English selected. Choose a query for your role.',keyboard:bdmsChatKeyboard(selection,session)};
  if(!['en','hi'].includes(language)||/^(\/start|change language|भाषा बदलें)$/i.test(input))return {language:'',text:BDMS_WELCOME,keyboard:BDMS_LANGUAGE_KEYBOARD,welcome:true};
  return {language,query:true,keyboard:bdmsChatKeyboard(language,session)};
}
export function bdmsChatIntent(text=''){
  const value=String(text).trim().slice(0,300);
  if(/account|iboss|loan|emi|payment|purchase|\bgrn\b|खाता|भुगतान/i.test(value))return {kind:'excluded'};
  if(/^(\/start|\/menu|menu)$/i.test(value))return {kind:'menu'};
  if(/help|सहायता|मदद/i.test(value))return {kind:'help'};
  if(/total bd today|आज के कुल ब्रेकडाउन/i.test(value))return {kind:'todayBd'};
  if(/vehicle availability|on.?road|off.?road|वाहन उपलब्धता/i.test(value))return {kind:'fleet'};
  if(/^\/bd\s|bd by date|last (7|30) days|तारीख \/ दिनों|पिछले (7|30) दिन/i.test(value))return {kind:'dateBd'};
  if(/vehicle transfer|वाहन ट्रांसफर/i.test(value))return {kind:'transfers'};
  if(/ticket close|टिकट बंद/i.test(value))return {kind:'ticketClose'};
  if(/first trip verification|पहली ट्रिप सत्यापन/i.test(value))return {kind:'firstTripVerification'};
  if(/idle|idel|ideal details|आइडल/i.test(value))return {kind:'idle'};
  if(/summary|सारांश/i.test(value))return {kind:'summary'};
  if(/my requests|मेरे अनुरोध/i.test(value))return {kind:'own'};
  if(/repair updates|मरम्मत अपडेट/i.test(value))return {kind:'updates'};
  if(/verified requests|सत्यापित अनुरोध/i.test(value))return {kind:'verified'};
  if(/ageing|aging|अवधि/i.test(value))return {kind:'ageing'};
  if(/first trip|पहली ट्रिप/i.test(value))return {kind:'firstTrip'};
  if(/mis pending|MIS सत्यापन/i.test(value))return {kind:'mis'};
  if(/closed|बंद अनुरोध/i.test(value))return {kind:'closed'};
  if(/running\s*(with\s*)?bd|रनिंग/i.test(value))return {kind:'running'};
  if(/pending|लंबित/i.test(value))return {kind:'pending'};
  if(/open|खुले|खुला/i.test(value))return {kind:'open'};
  if(/^(find vehicle\/request|वाहन \/ अनुरोध खोजें)$/i.test(value))return {kind:'findPrompt'};
  const search=value.replace(/^(?:\/find|find|search|खोजें)\s+/i,'').trim();
  if(/^(?:\/find|find|search|खोजें)\s+/i.test(value)||/^REQ-\d+$/i.test(value))return {kind:'find',search};
  return {kind:'menu'};
}
export function bdmsChatCanRead(session={}){
  if(['Account User','Tender User','HR User'].includes(session.assignedRole)||session.userType==='Account User')return false;
  return session.role==='super'||['Production User','Maintenance User','MIS User'].includes(session.assignedRole)||session.permissions?.readRequests===true;
}
export function bdmsChatAnswer(options){
  if(bdmsChatRole(options.session)==='production'){
    const login=String(options.session.login||'').trim().toLowerCase();
    options={...options,requests:(options.requests||[]).filter(r=>login&&String(r.requesterLogin||'').trim().toLowerCase()===login)};
  }
  if(!bdmsChatQueryAllowed(options.text,options.session))return options.language==='hi'?'यह प्रश्न आपकी BDMS भूमिका के लिए उपलब्ध नहीं है। अपने मेनू से प्रश्न चुनें।':'This query is not available for your BDMS role. Choose a query from your menu.';
  const answer=bdmsChatEnglishAnswer(options);
  if(options.language!=='hi')return answer;
  const translations=[['Your BDMS role does not permit breakdown queries. / आपकी भूमिका को ब्रेकडाउन देखने की अनुमति नहीं है।','आपकी भूमिका को ब्रेकडाउन देखने की अनुमति नहीं है।'],['This bot supports BDMS breakdown operations only. Accounts and other applications are excluded. / यह बॉट केवल BDMS ब्रेकडाउन के लिए है।','यह बॉट केवल BDMS ब्रेकडाउन के लिए है। खाते और अन्य ऐप शामिल नहीं हैं।'],['BDMS pilot · Read only / केवल जानकारी','BDMS पायलट · केवल जानकारी'],['Scope:','अनुमति वाले साइट:'],['Choose Open breakdowns, Running BD, Find vehicle/request, Pending work or Help.','नीचे दिए गए मेनू से अपना प्रश्न चुनें।'],['No requests or statuses will be changed.','अनुरोध या स्थिति नहीं बदली जाएगी।'],['Matching requests:','मिले अनुरोध:'],['Vehicle / request details','वाहन / अनुरोध विवरण'],['Complaint:','समस्या:'],['Maintenance:','मेंटेनेंस:'],['No update recorded','कोई अपडेट दर्ज नहीं'],['Pending first-trip / MIS entries · Approvals not included','पहली ट्रिप / MIS लंबित · अनुमोदन शामिल नहीं'],['Closed requests','बंद अनुरोध'],['First trip pending','पहली ट्रिप लंबित'],['MIS pending','MIS सत्यापन लंबित'],['Breakdown ageing · oldest first','ब्रेकडाउन अवधि · सबसे पुराने पहले'],['Site summary','साइट सारांश'],['Open:','खुले:'],['Closed:','बंद:'],['Running BD:','रनिंग बी डी:'],['Started:','शुरू:'],['Showing the first 8. Use /find to narrow the result.','पहले 8 दिखाए गए हैं। अधिक सटीक खोज के लिए /find भेजें।'],['Enter at least three characters of the door or request number.','डोर या अनुरोध नंबर के कम से कम तीन अक्षर लिखें।']];
  translations.push(['My requests','मेरे अनुरोध'],['Repair updates','मरम्मत अपडेट'],['Verified requests','सत्यापित अनुरोध'],['Pending repairs','लंबित मरम्मत'],['Running BD is included in Open.','रनिंग बी डी की संख्या खुले अनुरोधों में शामिल है।'],['Choose a query from your role menu.','अपनी भूमिका के मेनू से प्रश्न चुनें।']);
  if(bdmsChatIntent(options.text).kind==='help')return `BDMS सहायता\nआपको अपनी भूमिका और अनुमति वाले साइट के अनुसार जानकारी दिखाई जाती है।\nखोज: /find के बाद डोर या अनुरोध नंबर भेजें।\nलंबित कार्य: ${bdmsChatRole(options.session)==='production'?'पहली ट्रिप':bdmsChatRole(options.session)==='maintenance'?'मरम्मत':bdmsChatRole(options.session)==='mis'?'MIS सत्यापन':'पहली ट्रिप और MIS सत्यापन'}। अनुमोदन अभी शामिल नहीं हैं।\nसभी दर्ज समस्याएँ ठीक होने पर ही अनुरोध बंद करें।`;
  if(bdmsChatIntent(options.text).kind==='findPrompt')return 'डोर या अनुरोध नंबर भेजें। उदाहरण: /find V160';
  return translations.reduce((result,[en,hi])=>result.replaceAll(en,hi),answer);
}
function bdmsChatEnglishAnswer({text,session={},requests=[],scopeLabel='Assigned sites',baseUrl='https://pulse.cmll.in'}){
  if(!bdmsChatCanRead(session))return 'Your BDMS role does not permit breakdown queries. / आपकी भूमिका को ब्रेकडाउन देखने की अनुमति नहीं है।';
  const intent=bdmsChatIntent(text);
  if(intent.kind==='excluded')return 'This bot supports BDMS breakdown operations only. Accounts and other applications are excluded. / यह बॉट केवल BDMS ब्रेकडाउन के लिए है।';
  if(intent.kind==='menu')return `BDMS pilot · Read only / केवल जानकारी\nScope: ${scopeLabel}\nChoose a query from your role menu.\nNo requests or statuses will be changed.`;
  if(intent.kind==='help')return 'BDMS help / सहायता\nOpen breakdowns: unresolved requests.\nRunning BD: operating with repairs pending; the request remains open.\nFind: send /find REQ-number or /find door-number.\nPending work: first-trip or MIS entries on on-road requests. Approvals are not included in this pilot yet.\nClose a request only when every recorded issue is resolved. / सभी समस्याएँ ठीक होने पर ही अनुरोध बंद करें।';
  if(intent.kind==='findPrompt')return 'Send /find followed by the door number or request number. / डोर नंबर या अनुरोध नंबर भेजें।\nExample: /find V160';
  let rows=requests.filter(r=>!r.archivedAt),title='';
  if(intent.kind==='idle'){rows=rows.filter(r=>['Idle','Ideal'].includes(r.status)||(r.status==='Closed'&&(typeof r.vehicleIdle==='boolean'?r.vehicleIdle:Boolean(r.idealRequestedAt)&&!r.idealApprovedAt)));title='Idle details';}
  if(intent.kind==='firstTripVerification'){rows=rows.filter(r=>['Closed','Running BD'].includes(r.status));title='First trip verification details';}
  if(intent.kind==='ticketClose'){title='Breakdown ticket close status';}
  if(intent.kind==='own'){rows=rows.filter(r=>String(r.requesterLogin||'').toLowerCase()===String(session.login||'').toLowerCase());title='My requests';}
  if(intent.kind==='updates'){rows=rows.filter(r=>r.status!=='Closed');title='Repair updates';}
  if(intent.kind==='verified'){rows=rows.filter(r=>r.verifiedAt);title='Verified requests';}
  if(intent.kind==='summary')return `Site summary\nScope: ${scopeLabel}\nOpen: ${rows.filter(r=>r.status!=='Closed').length}\nRunning BD: ${rows.filter(r=>r.status==='Running BD').length}\nClosed: ${rows.filter(r=>r.status==='Closed').length}\nRunning BD is included in Open.`;
  if(intent.kind==='closed'){rows=rows.filter(r=>r.status==='Closed');title='Closed requests';}
  if(intent.kind==='firstTrip'){rows=rows.filter(r=>['Closed','Running BD'].includes(r.status)&&!r.verifiedAt&&!r.firstTripDone);title='First trip pending';}
  if(intent.kind==='mis'){rows=rows.filter(r=>['Closed','Running BD'].includes(r.status)&&!r.verifiedAt&&r.firstTripDone);title='MIS pending';}
  if(intent.kind==='ageing'){rows=rows.filter(r=>r.status!=='Closed').sort((a,b)=>String(a.start||'9999').localeCompare(String(b.start||'9999')));title='Breakdown ageing · oldest first';}
  if(intent.kind==='open'){rows=rows.filter(r=>r.status!=='Closed');title='Open breakdowns / खुले ब्रेकडाउन';}
  if(intent.kind==='running'){rows=rows.filter(r=>r.status==='Running BD');title='Running BD / रनिंग बी डी';}
  if(intent.kind==='pending'){
    const role=bdmsChatRole(session);
    rows=rows.filter(r=>role==='maintenance'?r.status!=='Closed':['Closed','Running BD'].includes(r.status)&&!r.verifiedAt&&(role==='production'?!r.firstTripDone:role==='mis'?r.firstTripDone:true));
    title=role==='maintenance'?'Pending repairs':role==='production'?'First trip pending':role==='mis'?'MIS pending':'Pending first-trip / MIS entries · Approvals not included';
  }
  if(intent.kind==='find'){
    const key=intent.search.toLowerCase();
    if(key.length<3)return 'Enter at least three characters of the door or request number.';
    rows=rows.filter(r=>String(r.ref||'').toLowerCase()===key||String(r.door||'').toLowerCase().includes(key));
    title='Vehicle / request details';
  }
  const clean=v=>String(v??'').replace(/[\r\n]+/g,' ').slice(0,180);
  const detail=rows.slice(0,8).map(r=>`${clean(r.ref)} · ${clean(r.door||r.equipment)}\n${clean(r.site)} · ${clean(r.status)}\n${intent.kind==='ageing'?`Started: ${clean(r.start||'Not recorded')}\n`:''}${['find','updates'].includes(intent.kind)?`Complaint: ${clean(r.complaint)}\nMaintenance: ${clean(r.work||r.maintenanceWork||'No update recorded')}\n`:''}${baseUrl.replace(/\/$/,'')}/?request=${encodeURIComponent(r.ref)}`);
  return `${title}\nScope: ${scopeLabel}\nMatching requests: ${rows.length}\n\n${detail.join('\n\n')||'No matching requests in your permitted scope. / आपकी अनुमति वाले साइट में कोई अनुरोध नहीं मिला।'}${rows.length>8?'\n\nShowing the first 8. Use /find to narrow the result.':''}`.slice(0,4000);
}
