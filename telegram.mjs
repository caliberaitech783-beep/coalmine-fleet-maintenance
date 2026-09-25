import {normalizeWhatsAppReportSettings,whatsappPurposeEnabled} from './whatsapp-report-settings.mjs';

const clean=(value)=>String(value??'').trim();
const TELEGRAM_TEXT_LIMIT=4096;
const TELEGRAM_CAPTION_LIMIT=1024;
// Password reset OTPs are personal and must never reach a shared group.
const PRIVATE_PURPOSES=new Set(['passwordResetOtp']);

export function telegramConfiguration(env=process.env){
  const botToken=clean(env.TELEGRAM_BOT_TOKEN);
  const chatId=clean(env.TELEGRAM_DEFAULT_CHAT_ID);
  const paused=['true','1','yes','on'].includes(clean(env.TELEGRAM_DELIVERY_PAUSED).toLowerCase());
  return {botToken,chatId,paused,configured:Boolean(botToken&&/^-?\d+$/.test(chatId))};
}

// Telegram follows the per-event choices in Report settings, but not the global
// WhatsApp switch, so WhatsApp can be turned off while Telegram keeps running.
export function telegramPurposeEnabled(settings,purpose='',now=new Date()){
  if(PRIVATE_PURPOSES.has(purpose))return false;
  if(!settings)return true;
  return whatsappPurposeEnabled({...normalizeWhatsAppReportSettings(settings),enabled:true},purpose,now);
}

// WhatsApp messages use *bold*; Telegram's legacy Markdown is fragile with user
// text, so bold markers are dropped and the message is sent as plain text.
export function telegramPlainText(message){
  return clean(message).replace(/\*([^*\n]+)\*/g,'$1').slice(0,TELEGRAM_TEXT_LIMIT);
}

async function telegramRequest(method,{env,fetchImpl,json,form}){
  const config=telegramConfiguration(env);
  const response=await fetchImpl(`https://api.telegram.org/bot${config.botToken}/${method}`,json
    ?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(json)}
    :{method:'POST',body:form});
  const details=await response.json().catch(()=>({}));
  if(!response.ok||details?.ok!==true){
    // Never include the request URL in errors: it carries the bot token.
    const error=new Error(`Telegram ${method} failed: ${clean(details?.description)||`HTTP ${response.status}`}`);
    error.status=response.status;
    error.migrateToChatId=details?.parameters?.migrate_to_chat_id;
    throw error;
  }
  return details.result;
}

function assertReady(config,purpose,settings){
  if(!config.configured){const error=new Error('Telegram is not configured.');error.code='TELEGRAM_NOT_CONFIGURED';throw error}
  if(config.paused||!telegramPurposeEnabled(settings,purpose)){const error=new Error('Telegram delivery is paused for this message type.');error.code='TELEGRAM_POLICY_PAUSED';throw error}
}

export async function sendTelegramText({message,purpose='',settings,chatId},{env=process.env,fetchImpl=fetch}={}){
  const config=telegramConfiguration(env);
  assertReady(config,purpose,settings);
  const text=telegramPlainText(message);
  if(!text)throw new Error('A Telegram message is required.');
  const target=clean(chatId)||config.chatId;
  const result=await telegramRequest('sendMessage',{env,fetchImpl,json:{chat_id:target,text,disable_web_page_preview:true}});
  return {sent:true,chatId:target,messageId:result?.message_id};
}

export async function sendTelegramDocument({buffer,filename='nerve-center-report.pdf',caption='',purpose='',settings,chatId},{env=process.env,fetchImpl=fetch}={}){
  const config=telegramConfiguration(env);
  assertReady(config,purpose,settings);
  const documentBuffer=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer||[]);
  if(!documentBuffer.length)throw new Error('A PDF document is required.');
  if(documentBuffer.length>50*1024*1024)throw new Error('Telegram documents cannot exceed 50 MB.');
  const target=clean(chatId)||config.chatId;
  const form=new FormData();
  form.append('chat_id',target);
  const text=telegramPlainText(caption).slice(0,TELEGRAM_CAPTION_LIMIT);
  if(text)form.append('caption',text);
  const safeFilename=clean(filename).replace(/[\\/:*?"<>|]+/g,'-').slice(0,120)||'nerve-center-report.pdf';
  form.append('document',new Blob([documentBuffer],{type:'application/pdf'}),safeFilename);
  const result=await telegramRequest('sendDocument',{env,fetchImpl,form});
  return {sent:true,chatId:target,messageId:result?.message_id};
}

export async function telegramStatus({env=process.env,fetchImpl=fetch}={}){
  const config=telegramConfiguration(env);
  if(!config.configured)return {configured:false,connected:false,paused:config.paused};
  const [bot,chat]=await Promise.all([
    telegramRequest('getMe',{env,fetchImpl,json:{}}),
    telegramRequest('getChat',{env,fetchImpl,json:{chat_id:config.chatId}}),
  ]);
  return {configured:true,connected:true,paused:config.paused,botUsername:clean(bot?.username),chatTitle:clean(chat?.title||chat?.username),chatId:config.chatId};
}
