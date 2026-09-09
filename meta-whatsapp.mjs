import {META_WORKFLOW_TEMPLATES} from './whatsapp-template-catalog.mjs';
import {normalizeWhatsAppReportSettings,whatsappPurposeEnabled} from './whatsapp-report-settings.mjs';
import {effectiveReportTemplate} from './whatsapp-template-runtime.mjs';

const clean=(value)=>String(value??'').trim();
const providerName=(env=process.env)=>clean(env.WHATSAPP_PROVIDER||'meta').toLowerCase()==='fast2sms'?'fast2sms':'meta';
const deliveryPaused=(env=process.env)=>['true','1','yes','on'].includes(clean(env.META_WHATSAPP_DELIVERY_PAUSED).toLowerCase());
let deliveryPolicyReader=null;
export function setWhatsAppDeliveryPolicyReader(reader){deliveryPolicyReader=reader;}
const assertDeliveryActive=async(env,purpose='')=>{
  const settings=normalizeWhatsAppReportSettings(deliveryPolicyReader?await deliveryPolicyReader():env.WHATSAPP_REPORT_SETTINGS);
  if(deliveryPaused(env)||((deliveryPolicyReader||env.WHATSAPP_REPORT_SETTINGS)&&!whatsappPurposeEnabled(settings,purpose))){
    const error=new Error('WhatsApp delivery is paused by Report settings.');
    error.code='WHATSAPP_POLICY_PAUSED';error.status=409;throw error;
  }
  return settings;
};

export {META_WORKFLOW_TEMPLATES} from './whatsapp-template-catalog.mjs';

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

async function metaRequest(path,{method='GET',body,env=process.env,fetchImpl=fetch,purpose=''}={}){
  if(path.endsWith('/messages'))await assertDeliveryActive(env,purpose);
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

export async function sendMetaWhatsAppText({to,message,purpose=''},{env=process.env,fetchImpl=fetch}={}){
  await assertDeliveryActive(env,purpose);
  const config=metaWhatsAppConfiguration(env);
  const recipient=normalizeWhatsAppRecipient(to);
  const text=clean(message);
  if(!recipient||recipient.length<10||recipient.length>15)throw new Error('A valid WhatsApp recipient phone number is required.');
  if(!text)throw new Error('A WhatsApp message is required.');
  if(text.length>4096)throw new Error('WhatsApp text messages cannot exceed 4096 characters.');
  const details=await metaRequest(`${config.phoneNumberId}/messages`,{method:'POST',env,fetchImpl,purpose,body:{
    messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'text',text:{preview_url:false,body:text},
  }});
  return {sent:true,recipient,messageId:details?.messages?.[0]?.id||''};
}

export async function sendMetaWhatsAppDocument({to,buffer,filename='nerve-center-report.pdf',caption='',purpose=''},{env=process.env,fetchImpl=fetch}={}){
  await assertDeliveryActive(env,purpose);
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
  const details=await metaRequest(`${config.phoneNumberId}/messages`,{method:'POST',env,fetchImpl,purpose,body:{
    messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'document',document:{id:upload.id,filename:safeFilename,...(safeCaption?{caption:safeCaption}:{})},
  }});
  return {sent:true,recipient,mediaId:upload.id,messageId:details?.messages?.[0]?.id||''};
}

export async function sendMetaWhatsAppTemplate({to,templateKey,parameters=[],purpose=templateKey},{env=process.env,fetchImpl=fetch}={}){
  const settings=await assertDeliveryActive(env,purpose);
  const config=metaWhatsAppConfiguration(env);
  const recipient=normalizeWhatsAppRecipient(to);
  const template=effectiveReportTemplate(purpose,settings,env.WHATSAPP_TEMPLATE_APPROVALS)||META_WORKFLOW_TEMPLATES[templateKey];
  if(!template)throw new Error(`Unknown Meta WhatsApp template: ${templateKey}`);
  if(!recipient||recipient.length<10||recipient.length>15)throw new Error('A valid WhatsApp recipient phone number is required.');
  if(parameters.length!==template.example.length)throw new Error(`Template ${template.name} requires ${template.example.length} parameters.`);
  const bodyParameters=parameters.map((value)=>({type:'text',text:clean(value).replace(/\s+/g,' ')}));
  const components=[{type:'body',parameters:bodyParameters}];
  if(template.otpButton)components.push({type:'button',sub_type:'url',index:'0',parameters:bodyParameters});
  const details=await metaRequest(`${config.phoneNumberId}/messages`,{method:'POST',env,fetchImpl,purpose,body:{
    messaging_product:'whatsapp',recipient_type:'individual',to:recipient,type:'template',template:{
      name:template.name,language:{code:'en_US'},components,
    },
  }});
  return {sent:true,recipient,template:template.name,messageId:details?.messages?.[0]?.id||''};
}

export async function metaWhatsAppTemplateStatuses({env=process.env,fetchImpl=fetch,templates=META_WORKFLOW_TEMPLATES}={}){
  const config=metaWhatsAppConfiguration(env);
  if(!config.businessAccountId)throw new Error('META_WHATSAPP_BUSINESS_ACCOUNT_ID is required to manage templates.');
  const names=new Set(Object.values(templates).map(template=>template.name)), results=[],seen=new Set();
  let cursor='';
  for(let page=0;page<20;page++){
    const details=await metaRequest(`${config.businessAccountId}/message_templates?fields=id,name,status,category,language&limit=250${cursor?`&after=${encodeURIComponent(cursor)}`:''}`,{env,fetchImpl});
    results.push(...(details.data||[]).filter(item=>names.has(item.name)&&(!item.language||item.language==='en_US')));
    const after=details.paging?.cursors?.after;
    if(!details.paging?.next||!after||seen.has(after))break;
    seen.add(after);cursor=after;
  }
  return results;
}

export async function submitMetaWhatsAppTemplates({env=process.env,fetchImpl=fetch,templates=META_WORKFLOW_TEMPLATES}={}){
  const config=metaWhatsAppConfiguration(env);
  if(!config.businessAccountId)throw new Error('META_WHATSAPP_BUSINESS_ACCOUNT_ID is required to manage templates.');
  const existing=await metaWhatsAppTemplateStatuses({env,fetchImpl,templates});
  const byName=new Map(existing.map((template)=>[template.name,template]));
  const results=[];
  for(const [key,template] of Object.entries(templates)){
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
