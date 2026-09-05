const clean=(value)=>String(value??'').trim();
const providerName=(env=process.env)=>clean(env.WHATSAPP_PROVIDER||'meta').toLowerCase()==='fast2sms'?'fast2sms':'meta';
const deliveryPaused=(env=process.env)=>['true','1','yes','on'].includes(clean(env.META_WHATSAPP_DELIVERY_PAUSED).toLowerCase());
const assertDeliveryActive=(env)=>{
  if(deliveryPaused(env))throw new Error('WhatsApp delivery is temporarily paused pending hierarchy configuration.');
};

export const META_WORKFLOW_TEMPLATES={
  passwordResetOtp:{name:'nerve_password_reset_otp',category:'AUTHENTICATION',example:['123456'],otpButton:true,components:[
    {type:'BODY',add_security_recommendation:true},
    {type:'FOOTER',code_expiration_minutes:10},
    {type:'BUTTONS',buttons:[{type:'OTP',otp_type:'COPY_CODE',text:'Copy Code'}]},
  ]},
  consolidatedRequestReport:{name:'nerve_consolidated_request_report',body:'Nerve Center scheduled fleet report:\n\n{{1}}\n\nGenerated automatically. Open Nerve Center for the complete live view.',example:['SCOPE: WCL\nWINDOW: 26 Aug 2026, 10:00 PM - 27 Aug 2026, 6:00 AM\nOFF ROAD / OPEN: 2\nON ROAD / CLOSED: 1']},
  consolidatedTicketReport:{name:'nerve_consolidated_crm_ticket_report',body:'Nerve Center scheduled CRM ticket report:\n\n{{1}}\n\nGenerated automatically. Open Nerve Center for the complete live view.',example:['SCOPE: WCL\nWINDOW: 27 Aug 2026, 8:00 AM - 27 Aug 2026, 3:00 PM\nOPEN TICKETS: 3\nCLOSED TICKETS: 2']},
  ticketCreated:{name:'nerve_ticket_created',body:'Nerve Center: Ticket {{1}} was created by {{2}} at {{3}}. Please open Nerve Center to review it.',example:['TIC/MAJRI-OB/240826/000001','Anoop Paul','Majri OB']},
  ticketResolved:{name:'nerve_ticket_resolved',body:'Nerve Center: Ticket {{1}} was resolved by {{2}}. Please open Nerve Center to view the resolution.',example:['TIC/MAJRI-OB/240826/000001','Administrator']},
  maintenanceReminder:{name:'nerve_maintenance_reminder',body:'Nerve Center reminder: Please add the {{1}} maintenance update and delay reason for request {{2}}. This update is due now.',example:['9:00 AM','REQ-1787566831835']},
  dailyUpdate:{name:'nerve_daily_update',body:'Nerve Center: {{1}} added a daily maintenance update for request {{2}}. Please open Nerve Center to review it.',example:['Maintenance User','REQ-1787566831835']},
  requestOpened:{name:'nerve_request_opened_details',body:'Nerve Center: Request {{1}} opened.\n\nEquipment / Vehicle Details: {{2}}\nType of Breakdown: {{3}}\nDate & Time: {{4}}\nLocation: {{5}}\nUser: {{6}}\n\nPlease open Nerve Center to review it.',example:['REQ-1787566831835','TPC74-51347 | Door: TPC74-51347 | Chassis: MAT12345','Accidental','24 Aug 2026, 3:49 PM','Majri OB','Production User']},
  requestIdle:{name:'nerve_request_idle',body:'Nerve Center: Request {{1}} was marked Idle by {{2}}. Idle reason: {{3}}. Maintenance Manager approval is required to make it on road.',example:['REQ-1787566831835','Maintenance User','No driver']},
  requestClosed:{name:'nerve_request_closed_details',body:'Nerve Center: Request {{1}} closed.\n\nEquipment / Vehicle Details: {{2}}\nType of Breakdown: {{3}}\nClosing Date & Time: {{4}}\nMaintenance Work Details: {{5}}\nClosed By: {{6}}\n\nIt is now available in Closed History.',example:['REQ-1787566831835','TPC74-51347 | Door: TPC74-51347 | Chassis: MAT12345','Accidental','24 Aug 2026, 6:10 PM','Leaf spring replaced and vehicle tested','Maintenance User']},
  requestOnRoad:{name:'nerve_request_onroad',body:'Nerve Center: Request {{1}} was approved on road and closed at {{2}} by {{3}}. It is now awaiting MIS verification.',example:['REQ-1787566831835','24 Aug 2026, 6:15 PM','Maintenance Manager']},
  requestVerified:{name:'nerve_request_verified',body:'Nerve Center: Request {{1}} was verified by {{2}}. First trip status: {{3}}. Please open Nerve Center to review it.',example:['REQ-1787566831835','MIS User','Completed']},
};

export function metaWhatsAppConfiguration(env=process.env){
  const provider=providerName(env);
  const accessToken=clean(env.META_WHATSAPP_ACCESS_TOKEN);
  const providerApiKey=clean(env.FAST2SMS_WHATSAPP_API_KEY);
  const phoneNumberId=clean(env.META_WHATSAPP_PHONE_NUMBER_ID);
  const businessAccountId=clean(env.META_WHATSAPP_BUSINESS_ACCOUNT_ID);
  const graphVersion=clean(env.META_GRAPH_VERSION||'v25.0');
  return {provider,accessToken,providerApiKey,phoneNumberId,businessAccountId,graphVersion,
    configured:Boolean(phoneNumberId&&(provider==='fast2sms'?providerApiKey:accessToken))};
}

export function normalizeWhatsAppRecipient(value){
  let phone=clean(value).replace(/\D/g,'');
  if(phone.length===10)phone=`91${phone}`;
  return phone;
}

async function metaRequest(path,{method='GET',body,env=process.env,fetchImpl=fetch}={}){
  const config=metaWhatsAppConfiguration(env);
  if(!config.configured)throw new Error(`${config.provider==='fast2sms'?'Fast2SMS':'Meta'} WhatsApp API is not configured.`);
  const baseUrl=config.provider==='fast2sms'?'https://www.fast2sms.com/dev/whatsapp':'https://graph.facebook.com';
  const authorization=config.provider==='fast2sms'?config.providerApiKey:`Bearer ${config.accessToken}`;
  const response=await fetchImpl(`${baseUrl}/${config.graphVersion}/${path}`,{
    method,
    headers:{Authorization:authorization,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  const details=await response.json().catch(()=>({}));
  if(!response.ok||details?.status===false||details?.success===false){
    const message=clean(details?.error?.message||details?.message)||`${config.provider==='fast2sms'?'Fast2SMS':'Meta'} WhatsApp request failed (${response.status}).`;
    const explanation=clean(details?.error?.error_user_msg||details?.error?.error_data?.details);
    const error=new Error(explanation?`${message}: ${explanation}`:message);
    error.status=response.status;
    error.metaCode=details?.error?.code;
    throw error;
  }
  return details;
}

export async function metaWhatsAppStatus(options={}){
  const config=metaWhatsAppConfiguration(options.env);
  if(!config.configured)return {configured:false,connected:false};
  const details=await metaRequest(`${config.phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`,options);
  return {configured:true,connected:true,provider:config.provider,phoneNumberId:details.id,
    displayPhoneNumber:details.display_phone_number||'',verifiedName:details.verified_name||'',
    qualityRating:details.quality_rating||''};
}

export async function registerMetaWhatsAppPhone({pin},{env=process.env,fetchImpl=fetch}={}){
  const config=metaWhatsAppConfiguration(env);
  const verificationPin=clean(pin);
  if(!/^\d{6}$/.test(verificationPin))throw new Error('A valid six-digit Meta two-step verification PIN is required.');
  const details=await metaRequest(`${config.phoneNumberId}/register`,{method:'POST',env,fetchImpl,body:{
    messaging_product:'whatsapp',pin:verificationPin,
  }});
  return {registered:details.success===true,phoneNumberId:config.phoneNumberId};
}

export async function sendMetaWhatsAppText({to,message},{env=process.env,fetchImpl=fetch}={}){
  assertDeliveryActive(env);
  const config=metaWhatsAppConfiguration(env);
  const recipient=normalizeWhatsAppRecipient(to);
  const text=clean(message);
  if(!recipient||recipient.length<10||recipient.length>15)throw new Error('A valid WhatsApp recipient phone number is required.');
  if(!text)throw new Error('A WhatsApp message is required.');
  if(text.length>4096)throw new Error('WhatsApp text messages cannot exceed 4096 characters.');
  const details=await metaRequest(`${config.phoneNumberId}/messages`,{method:'POST',env,fetchImpl,body:{
    messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'text',text:{preview_url:false,body:text},
  }});
  return {sent:true,recipient,messageId:details?.messages?.[0]?.id||''};
}

export async function sendMetaWhatsAppDocument({to,buffer,filename='nerve-center-report.pdf',caption=''},{env=process.env,fetchImpl=fetch}={}){
  assertDeliveryActive(env);
  const config=metaWhatsAppConfiguration(env);
  const recipient=normalizeWhatsAppRecipient(to);
  const documentBuffer=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer||[]);
  const safeFilename=clean(filename).replace(/[\\/:*?"<>|]+/g,'-').slice(0,120)||'nerve-center-report.pdf';
  const safeCaption=clean(caption);
  if(!recipient||recipient.length<10||recipient.length>15)throw new Error('A valid WhatsApp recipient phone number is required.');
  if(!documentBuffer.length)throw new Error('A PDF document is required.');
  if(documentBuffer.length>100*1024*1024)throw new Error('WhatsApp documents cannot exceed 100 MB.');
  if(safeCaption.length>1024)throw new Error('WhatsApp document captions cannot exceed 1024 characters.');
  const form=new FormData();
  form.append('messaging_product','whatsapp');
  form.append('type','application/pdf');
  form.append('file',new Blob([documentBuffer],{type:'application/pdf'}),safeFilename);
  const baseUrl=config.provider==='fast2sms'?'https://www.fast2sms.com/dev/whatsapp':'https://graph.facebook.com';
  const authorization=config.provider==='fast2sms'?config.providerApiKey:`Bearer ${config.accessToken}`;
  const uploadResponse=await fetchImpl(`${baseUrl}/${config.graphVersion}/${config.phoneNumberId}/media`,{
    method:'POST',headers:{Authorization:authorization},body:form,
  });
  const upload=await uploadResponse.json().catch(()=>({}));
  if(!uploadResponse.ok||!clean(upload.id)){
    const message=clean(upload?.error?.message)||`Meta WhatsApp media upload failed (${uploadResponse.status}).`;
    throw new Error(message);
  }
  const details=await metaRequest(`${config.phoneNumberId}/messages`,{method:'POST',env,fetchImpl,body:{
    messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'document',document:{id:upload.id,filename:safeFilename,...(safeCaption?{caption:safeCaption}:{})},
  }});
  return {sent:true,recipient,mediaId:upload.id,messageId:details?.messages?.[0]?.id||''};
}

export async function sendMetaWhatsAppTemplate({to,templateKey,parameters=[]},{env=process.env,fetchImpl=fetch}={}){
  assertDeliveryActive(env);
  const config=metaWhatsAppConfiguration(env);
  const recipient=normalizeWhatsAppRecipient(to);
  const template=META_WORKFLOW_TEMPLATES[templateKey];
  if(!template)throw new Error(`Unknown Meta WhatsApp template: ${templateKey}`);
  if(!recipient||recipient.length<10||recipient.length>15)throw new Error('A valid WhatsApp recipient phone number is required.');
  if(parameters.length!==template.example.length)throw new Error(`Template ${template.name} requires ${template.example.length} parameters.`);
  const bodyParameters=parameters.map((value)=>({type:'text',text:clean(value).replace(/\s+/g,' ')}));
  const components=[{type:'body',parameters:bodyParameters}];
  if(template.otpButton)components.push({type:'button',sub_type:'url',index:'0',parameters:bodyParameters});
  const details=await metaRequest(`${config.phoneNumberId}/messages`,{method:'POST',env,fetchImpl,body:{
    messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'template',template:{
      name:template.name,language:{code:'en_US'},components,
    },
  }});
  return {sent:true,recipient,template:template.name,messageId:details?.messages?.[0]?.id||''};
}

export async function metaWhatsAppTemplateStatuses({env=process.env,fetchImpl=fetch}={}){
  const config=metaWhatsAppConfiguration(env);
  if(!config.businessAccountId)throw new Error('META_WHATSAPP_BUSINESS_ACCOUNT_ID is required to manage templates.');
  const details=await metaRequest(`${config.businessAccountId}/message_templates?fields=id,name,status,category,language&limit=250`,{env,fetchImpl});
  return (details.data||[]).filter((item)=>Object.values(META_WORKFLOW_TEMPLATES).some((template)=>template.name===item.name));
}

export async function submitMetaWhatsAppTemplates({env=process.env,fetchImpl=fetch}={}){
  const config=metaWhatsAppConfiguration(env);
  if(!config.businessAccountId)throw new Error('META_WHATSAPP_BUSINESS_ACCOUNT_ID is required to manage templates.');
  const existing=await metaWhatsAppTemplateStatuses({env,fetchImpl});
  const byName=new Map(existing.map((template)=>[template.name,template]));
  const results=[];
  for(const [key,template] of Object.entries(META_WORKFLOW_TEMPLATES)){
    if(byName.has(template.name)){results.push({key,name:template.name,status:byName.get(template.name).status,existing:true});continue}
    let created;
    const category=template.category||'UTILITY';
    try{
      created=await metaRequest(`${config.businessAccountId}/message_templates`,{method:'POST',env,fetchImpl,body:{
        name:template.name,language:'en_US',category,
        ...(category==='UTILITY'?{allow_category_change:true}:{}),
        components:template.components||[{type:'BODY',text:template.body,example:{body_text:[template.example]}}],
      }});
    }catch(error){
      throw new Error(`${template.name}: ${error instanceof Error?error.message:'Meta template submission failed.'}`);
    }
    results.push({key,name:template.name,status:created.status||'PENDING',id:created.id||'',existing:false});
  }
  return results;
}
