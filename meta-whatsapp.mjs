const clean=(value)=>String(value??'').trim();

export const META_WORKFLOW_TEMPLATES={
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
  const accessToken=clean(env.META_WHATSAPP_ACCESS_TOKEN);
  const phoneNumberId=clean(env.META_WHATSAPP_PHONE_NUMBER_ID);
  const businessAccountId=clean(env.META_WHATSAPP_BUSINESS_ACCOUNT_ID);
  const graphVersion=clean(env.META_GRAPH_VERSION||'v25.0');
  return {accessToken,phoneNumberId,businessAccountId,graphVersion,
    configured:Boolean(accessToken&&phoneNumberId)};
}

export function normalizeWhatsAppRecipient(value){
  let phone=clean(value).replace(/\D/g,'');
  if(phone.length===10)phone=`91${phone}`;
  return phone;
}

async function metaRequest(path,{method='GET',body,env=process.env,fetchImpl=fetch}={}){
  const config=metaWhatsAppConfiguration(env);
  if(!config.configured)throw new Error('Meta WhatsApp Cloud API is not configured.');
  const response=await fetchImpl(`https://graph.facebook.com/${config.graphVersion}/${path}`,{
    method,
    headers:{Authorization:`Bearer ${config.accessToken}`,'Content-Type':'application/json'},
    ...(body?{body:JSON.stringify(body)}:{}),
  });
  const details=await response.json().catch(()=>({}));
  if(!response.ok){
    const message=clean(details?.error?.message)||`Meta WhatsApp request failed (${response.status}).`;
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
  return {configured:true,connected:true,phoneNumberId:details.id,
    displayPhoneNumber:details.display_phone_number||'',verifiedName:details.verified_name||'',
    qualityRating:details.quality_rating||''};
}

export async function sendMetaWhatsAppText({to,message},{env=process.env,fetchImpl=fetch}={}){
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

export async function sendMetaWhatsAppTemplate({to,templateKey,parameters=[]},{env=process.env,fetchImpl=fetch}={}){
  const config=metaWhatsAppConfiguration(env);
  const recipient=normalizeWhatsAppRecipient(to);
  const template=META_WORKFLOW_TEMPLATES[templateKey];
  if(!template)throw new Error(`Unknown Meta WhatsApp template: ${templateKey}`);
  if(!recipient||recipient.length<10||recipient.length>15)throw new Error('A valid WhatsApp recipient phone number is required.');
  if(parameters.length!==template.example.length)throw new Error(`Template ${template.name} requires ${template.example.length} parameters.`);
  const details=await metaRequest(`${config.phoneNumberId}/messages`,{method:'POST',env,fetchImpl,body:{
    messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'template',template:{
      name:template.name,language:{code:'en_US'},components:[{type:'body',parameters:parameters.map((value)=>({type:'text',text:clean(value)}))}],
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
    try{
      created=await metaRequest(`${config.businessAccountId}/message_templates`,{method:'POST',env,fetchImpl,body:{
        name:template.name,language:'en_US',category:'UTILITY',allow_category_change:true,
        components:[{type:'BODY',text:template.body,example:{body_text:[template.example]}}],
      }});
    }catch(error){
      throw new Error(`${template.name}: ${error instanceof Error?error.message:'Meta template submission failed.'}`);
    }
    results.push({key,name:template.name,status:created.status||'PENDING',id:created.id||'',existing:false});
  }
  return results;
}
