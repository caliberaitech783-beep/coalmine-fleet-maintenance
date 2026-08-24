const clean=(value)=>String(value??'').trim();

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
    const error=new Error(clean(details?.error?.message)||`Meta WhatsApp request failed (${response.status}).`);
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
