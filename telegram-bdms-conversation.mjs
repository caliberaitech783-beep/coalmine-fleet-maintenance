import {bdmsChatAnswer,bdmsChatCanRead,bdmsChatRole,bdmsChatKeyboard,bdmsChatIntent,bdmsChatTransfersAllowed} from './telegram-bdms-chatbot.mjs';
import {bdmsChatMetricsReply} from './telegram-bdms-metrics.mjs';

const actions={maintenance:['Maintenance details','मेंटेनेंस विवरण'],timeline:['Request timeline','अनुरोध समयरेखा'],linked:['Linked requests','लिंक किए गए अनुरोध'],history:['Vehicle history','वाहन इतिहास'],handoff:['First trip / MIS details','पहली ट्रिप / MIS विवरण'],back:['Back to results','सूची पर वापस'],main:['Main menu','मुख्य मेनू']};
actions.closure=['Closure details','बंद करने का विवरण'];
actions.idleDetail=['Idle request details','आइडल अनुरोध विवरण'];
const label=(key,language)=>actions[key][language==='hi'?1:0];
const clean=value=>String(value||'').replace(/[\r\n]+/g,' ').slice(0,700);
const followup=language=>language==='hi'?'आगे क्या देखना चाहेंगे? क्या इस अनुरोध का मेंटेनेंस विवरण दिखाऊँ?':'What would you like to see next? Should I show maintenance details for this request?';
const keyboard=items=>({keyboard:items.map(item=>[item]),resize_keyboard:true});

// Context stores identifiers only. Every turn rechecks them against fresh,
// already site-scoped records; context is never authority to read a request.
export function bdmsChatConversation({text,language='en',session={},requests=[],transfers=[],tickets=[],fleetRecords=null,today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata'}).format(new Date()),scopeLabel,baseUrl='https://pulse.cmll.in',context={}}){
  const mainKeyboard=bdmsChatKeyboard(language,session),hi=language==='hi';
  if(!bdmsChatCanRead(session))return {text:hi?'आपकी भूमिका को अनुमति नहीं है।':'Your BDMS role does not permit breakdown queries.',keyboard:mainKeyboard,context:{}};
  let visible=requests.filter(r=>!r.archivedAt);
  if(bdmsChatRole(session)==='production')visible=visible.filter(r=>session.login&&String(r.requesterLogin||'').toLowerCase()===String(session.login).toLowerCase());
  const input=String(text||'').trim();
  const action=Object.keys(actions).find(key=>actions[key].includes(input));
  if(action==='main'||/^\/menu$/i.test(input))return {text:bdmsChatAnswer({text:'/menu',language,session,requests:visible,scopeLabel}),keyboard:mainKeyboard,context:{}};
  const safeQuery=typeof context.listQuery==='string'?context.listQuery.slice(0,300):'/menu';
  if(action==='back')return bdmsChatConversation({text:safeQuery,language,session,requests:visible,transfers,tickets,fleetRecords,today,scopeLabel,baseUrl});
  if(['todayBd','dateBd','fleet'].includes(bdmsChatIntent(input).kind))return {text:bdmsChatMetricsReply({text:input,language,requests:visible,fleetRecords,today}),keyboard:keyboard(hi?['आज के कुल ब्रेकडाउन','पिछले 7 दिन','पिछले 30 दिन','तारीख / दिनों के अनुसार ब्रेकडाउन','वाहन उपलब्धता',label('main',language)]:['Total BD today','Last 7 days','Last 30 days','BD by date / days','Vehicle availability',label('main',language)]),context:{}};
  const transferId=input.match(/^Transfer (.+)$/)?.[1];
  if(bdmsChatIntent(input).kind==='transfers'||transferId){
    if(!bdmsChatTransfersAllowed(session))return {text:hi?'आपकी भूमिका को वाहन ट्रांसफर देखने की अनुमति नहीं है।':'Your role does not permit vehicle transfer queries.',keyboard:mainKeyboard,context:{}};
    const transfer=transferId?transfers.find(r=>String(r.id)===transferId):null;
    if(transferId&&!transfer)return {text:hi?'ट्रांसफर आपकी अनुमति में उपलब्ध नहीं है।':'Transfer not available in your permitted scope.',keyboard:mainKeyboard,context:{}};
    const detail=transfer?[['Vehicle / वाहन',transfer.door||transfer.equipment],['Source / स्रोत',transfer.source],['Destination / गंतव्य',transfer.destination],['Date / तारीख',transfer.transferDate],['Status / स्थिति',transfer.status],['Source approval / स्रोत अनुमोदन',transfer.sourceApprovedBy],['MIS verification / MIS सत्यापन',transfer.destinationMisVerifiedBy],['Destination acceptance / गंतव्य स्वीकृति',transfer.destinationAcceptedBy]].map(([key,v])=>`${key}: ${clean(v)||'—'}`).join('\n'):transfers.slice(0,8).map(r=>`Transfer ${r.id} · ${clean(r.door||r.equipment)}\n${clean(r.source)} → ${clean(r.destination)} · ${clean(r.status)}`).join('\n\n');
    return {text:`${hi?'वाहन ट्रांसफर विवरण':'Vehicle transfer details'}\n${detail||(hi?'कोई अनुमति वाला ट्रांसफर नहीं मिला।':'No permitted transfers found.')}\n\n${hi?'आगे क्या देखना चाहेंगे?':'What would you like to see next?'}`,keyboard:keyboard([...(!transfer?transfers.slice(0,8).map(r=>`Transfer ${r.id}`):[label('back',language)]),label('main',language)]),context:{listQuery:language==='hi'?'वाहन ट्रांसफर विवरण':'Vehicle transfer details'}};
  }
  const ticketId=input.match(/^Ticket (.+)$/)?.[1];
  if(ticketId){
    const ticket=tickets.find(r=>r.reference===ticketId);
    if(!ticket)return {text:hi?'टिकट आपकी अनुमति में उपलब्ध नहीं है।':'Ticket not available in your permitted scope.',keyboard:mainKeyboard,context:{}};
    return {text:`${ticket.reference}\n${hi?'टिकट स्थिति':'Ticket status'}: ${clean(ticket.status)}\n${hi?'समाधान':'Resolution'}: ${clean(ticket.resolutionMessage)||'—'}\n${hi?'समाधान किया':'Resolved by'}: ${clean(ticket.resolvedBy)||'—'}\n${hi?'समाधान समय':'Resolved at'}: ${clean(ticket.resolvedAt)||'—'}\n${hi?'स्थिति रिकॉर्ड के अनुसार दिखाई गई है।':'Status is shown as recorded.'}`,keyboard:keyboard([label('back',language),label('main',language)]),context:{listQuery:language==='hi'?'टिकट बंद स्थिति':'Ticket close status'}};
  }
  const selection=input.match(/^(?:\/request\s+)?(REQ-[A-Za-z0-9-]+)$/i)?.[1];
  const selectedRef=selection||(['maintenance','timeline','linked','history','handoff','closure','idleDetail'].includes(action)?context.selectedRef:'');
  if(selectedRef){
    const record=visible.find(r=>String(r.ref).toUpperCase()===String(selectedRef).toUpperCase());
    if(!record)return {text:hi?'यह अनुरोध आपकी वर्तमान अनुमति में उपलब्ध नहीं है।':'This request is not available in your current permitted scope.',keyboard:mainKeyboard,context:{}};
    const state={selectedRef:record.ref,listQuery:safeQuery};
    const options=['maintenance','timeline','linked','history','closure','idleDetail'];
    if(['production','mis','management'].includes(bdmsChatRole(session)))options.push('handoff');
    options.push('back','main');
    const detailKeyboard=keyboard(options.map(key=>label(key,language)));
    const value=(en,hindi,data)=>`${hi?hindi:en}: ${clean(data)|| (hi?'दर्ज नहीं':'Not recorded')}`;
    const header=`${record.ref} · ${clean(record.door||record.equipment)}\n${clean(record.site)} · ${clean(record.status)}`;
    let detail='';
    if(action==='maintenance'){
      detail=[value('Maintenance work','मरम्मत कार्य',record.maintenanceWork||record.work),value('Accepted by','स्वीकार किया',record.acceptedBy),value('Expected completion','अपेक्षित समाप्ति',record.expectedCompletionAt),value('Closed by','बंद किया',record.closedBy)];
      for(const remark of (record.dailyRemarks||[]).slice(0,5))detail.push(`${clean(remark.createdAt)} · ${clean(remark.authorName)}: ${clean(remark.remark)}`);
      detail=detail.join('\n');
    }else if(action==='closure')detail=[value('Recorded status','दर्ज स्थिति',record.status),value('Closed at','बंद समय',record.closedAt),value('Closed by','बंद किया',record.closedBy),value('Work completed','पूरा कार्य',record.maintenanceWork||record.work),value('MIS verified','MIS सत्यापित',record.verifiedAt)].join('\n');
    else if(action==='idleDetail')detail=[value('Idle flag','आइडल स्थिति',String(Boolean(record.vehicleIdle))),value('Idle reason','आइडल कारण',record.idleReason),value('Requested at','अनुरोध समय',record.idealRequestedAt),value('Requested by','अनुरोध किया',record.idealRequestedBy),value('Approved at','अनुमोदन समय',record.idealApprovedAt),value('Approved by','अनुमोदन किया',record.idealApprovedBy)].join('\n');
    else if(action==='timeline')detail=[value('Breakdown started','ब्रेकडाउन शुरू',record.start),value('Accepted','स्वीकार',record.acceptedAt),value('Running BD','रनिंग बी डी',record.runningBdAt),value('Closed','बंद',record.closedAt),value('First trip','पहली ट्रिप',record.productionFirstTripAt||record.firstTripAt),value('MIS verified','MIS सत्यापित',record.verifiedAt)].join('\n');
    else if(action==='handoff'){
      if(!options.includes('handoff'))return {text:hi?'यह विवरण आपकी भूमिका के लिए उपलब्ध नहीं है।':'This detail is not available for your role.',keyboard:detailKeyboard,context:state};
      detail=[value('Production first trip','प्रोडक्शन पहली ट्रिप',record.productionFirstTripAt),value('Recorded by Production','प्रोडक्शन में दर्ज किया',record.productionFirstTripBy),value('Production remark','प्रोडक्शन टिप्पणी',record.productionFirstTripRemark),value('MIS first-trip entry','MIS पहली ट्रिप प्रविष्टि',record.firstTripAt),value('Recorded by MIS','MIS में दर्ज किया',record.firstTripBy),value('MIS remark','MIS टिप्पणी',record.firstTripRemark),value('MIS verified','MIS सत्यापित',record.verifiedAt),value('Verified by','सत्यापित किया',record.verifiedBy)].join('\n');
    }else if(action==='linked'||action==='history'){
      const related=visible.filter(r=>r.ref!==record.ref&&(action==='linked'?(record.linkedRequestReferences||[]).includes(r.ref):record.door&&r.door===record.door&&r.site===record.site));
      detail=related.slice(0,8).map(r=>`${r.ref} · ${clean(r.status)}`).join('\n')||(hi?'आपकी अनुमति में संबंधित अनुरोध नहीं हैं।':'No related requests in your permitted scope.');
      return {text:`${header}\n\n${label(action,language)}\n${detail}\n\n${followup(language)}`,keyboard:keyboard([...related.slice(0,8).map(r=>r.ref),...options.map(key=>label(key,language))]),context:state};
    }else detail=value('Complaint','समस्या',record.complaint);
    return {text:`${header}\n\n${detail}\n\n${followup(language)}`.slice(0,4000),keyboard:detailKeyboard,context:state};
  }
  if(action)return {text:hi?'पहले सूची से एक अनुरोध चुनें।':'Select a request from the results first.',keyboard:mainKeyboard,context:{}};
  const answer=bdmsChatAnswer({text:input,language,session,requests:visible,scopeLabel,baseUrl});
  const ticketQuery=bdmsChatIntent(input).kind==='ticketClose';
  const support=ticketQuery?tickets.slice(0,8):[];
  const supportText=support.length?'\n\n'+(hi?'BDMS सहायता टिकट':'BDMS support tickets')+'\n'+support.map(t=>`Ticket ${t.reference} · ${clean(t.status)}`).join('\n'):'';
  const lines=answer.split('\n');
  const shown=visible.filter(r=>lines.some(line=>line.startsWith(`${r.ref} ·`))).slice(0,8);
  if(!shown.length&&!support.length)return {text:answer,keyboard:mainKeyboard,context:{}};
  return {text:`${answer}${supportText}\n\n${hi?'आगे क्या देखना चाहेंगे? नीचे एक अनुरोध चुनें।':'What would you like to see next? Select a request or ticket below for details.'}`.slice(0,4096),keyboard:keyboard([...shown.map(r=>r.ref),...support.map(t=>`Ticket ${t.reference}`),label('main',language)]),context:{listQuery:input}};
}
