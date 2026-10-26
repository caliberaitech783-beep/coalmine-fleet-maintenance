import {randomInt} from 'node:crypto';
import {hashPassword,verifyPassword} from './password-auth.mjs';
import {META_WORKFLOW_TEMPLATES} from './whatsapp-template-catalog.mjs';

// The legacy filename is retained; deletion codes now travel only through
// Fast2SMS WhatsApp authentication templates, independently of report pauses.
export const DELETION_PHONE = '+919925565281';
export const DELETION_PHONE_MASKED = '+91 ******5281';

export function deletionWhatsAppConfiguration(env = process.env, savedSettings = {}) {
  const candidates=[['deletion environment',env.DELETION_FAST2SMS_API_KEY],['saved Fast2SMS credential',savedSettings.providerApiKey],
    ['existing WhatsApp environment',env.FAST2SMS_WHATSAPP_API_KEY],['legacy Fast2SMS environment',env.FAST2SMS_API_KEY]];
  const match=candidates.find(([,value])=>String(value || '').trim());
  return {apiKey:String(match?.[1] || '').trim(),credentialSource:match?.[0] || 'missing',
    phoneNumberId:String(savedSettings.phoneNumberId || env.META_WHATSAPP_PHONE_NUMBER_ID || '').trim(),
    businessAccountId:String(savedSettings.businessAccountId || env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || '').trim(),
    version:String(savedSettings.graphVersion || env.META_GRAPH_VERSION || 'v25.0').trim(),
    templateName:String(env.DELETION_WHATSAPP_TEMPLATE_NAME || META_WORKFLOW_TEMPLATES.passwordResetOtp.name).trim(),
    language:String(env.DELETION_WHATSAPP_TEMPLATE_LANGUAGE || 'en_US').trim()};
}

function configured(config) {
  return Boolean(config.apiKey && /^\d+$/.test(config.phoneNumberId) && /^\d+$/.test(config.businessAccountId)
    && /^v\d+\.\d+$/.test(config.version) && /^[a-z0-9_]+$/.test(config.templateName) && /^[a-z]{2}(?:_[A-Z]{2})?$/.test(config.language));
}

export function deletionWhatsAppConfigured(env = process.env, savedSettings = {}) {
  return configured(deletionWhatsAppConfiguration(env,savedSettings));
}

export function createDeletionWhatsApp({env = process.env, readSettings = async()=>({}), fetchImpl = globalThis.fetch} = {}) {
  async function configuration() {
    const direct=deletionWhatsAppConfiguration(env);
    return env.DELETION_FAST2SMS_API_KEY && configured(direct) ? direct : deletionWhatsAppConfiguration(env,await readSettings());
  }
  async function request(config,resource,body) {
    if (!configured(config)) throw Object.assign(new Error('Deletion is blocked: configure the existing Fast2SMS WhatsApp key, sender phone ID and business account ID first.'), {status:503});
    let response;
    try {
      response=await fetchImpl(`https://www.fast2sms.com/dev/whatsapp/${config.version}/${resource}`, {
        method:body?'POST':'GET', signal:AbortSignal.timeout(15000),
        headers:{Authorization:config.apiKey,'Content-Type':'application/json',Accept:'application/json'},
        ...(body?{body:JSON.stringify(body)}:{}),
      });
    } catch {
      throw Object.assign(new Error('Fast2SMS WhatsApp is unavailable. No deletion was authorized.'),{status:503});
    }
    // Do not return provider bodies or messages: they may echo codes or secrets.
    const details=await response.json().catch(()=>null);
    if (!response.ok || !details || details.error || details.status===false || details.success===false || details.return===false)
      throw Object.assign(new Error('Fast2SMS WhatsApp rejected the request. Check the sender, approved authentication template and account balance. No deletion was authorized.'), {status:503});
    return details;
  }
  return {
    configured:async () => configured(await configuration()),
    status:async () => {const config=await configuration();return {provider:'Fast2SMS',channel:'WhatsApp',phone:DELETION_PHONE_MASKED,
      credentialConfigured:Boolean(config.apiKey),senderConfigured:/^\d+$/.test(config.phoneNumberId),businessAccountConfigured:/^\d+$/.test(config.businessAccountId),
      templateName:config.templateName,credentialSource:config.credentialSource,configured:configured(config)};},
    send:async () => {
      const config=await configuration();
      // Confirm the reused template is an approved authentication template in
      // this account. Never substitute text messages, utility templates or SMS.
      const templates=await request(config,`${config.businessAccountId}/message_templates?name=${encodeURIComponent(config.templateName)}&fields=name,status,category,language`);
      const approved=Array.isArray(templates.data)&&templates.data.some(template=>template?.name===config.templateName && template.status==='APPROVED'
        && template.category==='AUTHENTICATION' && template.language===config.language);
      if(!approved)throw Object.assign(new Error('Deletion is blocked: the WhatsApp authentication template is missing, unapproved, or has a different language.'),{status:503});
      const otp=String(randomInt(0,1_000_000)).padStart(6,'0');
      const otpHash=hashPassword(otp);
      const result=await request(config,`${config.phoneNumberId}/messages`,{
        messaging_product:'whatsapp',recipient_type:'individual',to:DELETION_PHONE.slice(1),type:'template',
        template:{name:config.templateName,language:{code:config.language},components:[
          {type:'body',parameters:[{type:'text',text:otp}]},
          {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:otp}]},
        ]},
      });
      const id=result.messages?.[0]?.id;
      if(result.messaging_product!=='whatsapp' || !/^wamid\.[a-zA-Z0-9._~+/=-]{1,500}$/.test(String(id || '')))
        throw Object.assign(new Error('Fast2SMS returned no valid WhatsApp message identifier. No deletion was authorized.'),{status:503});
      return {id:`fast2sms-whatsapp:${id}`,otpHash};
    },
    check:async (id, code, otpHash) => {
      if(!/^fast2sms-whatsapp:wamid\.[a-zA-Z0-9._~+/=-]{1,500}$/.test(String(id)) || !/^\d{6}$/.test(String(code)))return false;
      if(!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(String(otpHash || '')) || !verifyPassword(code,otpHash))return false;
      // WhatsApp sends the code; the approval database enforces expiry,
      // attempts, session/record binding and single-use consumption.
      return true;
    },
  };
}

// Compatibility for existing internal imports; no SMS delivery remains.
export const createDeletionSms=createDeletionWhatsApp;
export const deletionSmsConfiguration=deletionWhatsAppConfiguration;
export const deletionSmsConfigured=deletionWhatsAppConfigured;
