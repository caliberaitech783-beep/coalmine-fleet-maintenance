import {createHash,randomBytes} from 'node:crypto';
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

function assertReady(config,purpose,settings,privateChatId=''){
  if(!config.configured){const error=new Error('Telegram is not configured.');error.code='TELEGRAM_NOT_CONFIGURED';throw error}
  // Personal messages such as OTPs may only go to one person's own chat, whose id is positive.
  const allowedPrivate=PRIVATE_PURPOSES.has(purpose)&&/^\d+$/.test(privateChatId);
  if(config.paused||!(allowedPrivate||telegramPurposeEnabled(settings,purpose))){const error=new Error('Telegram delivery is paused for this message type.');error.code='TELEGRAM_POLICY_PAUSED';throw error}
}

export async function sendTelegramText({message,purpose='',settings,chatId,privateChat=false},{env=process.env,fetchImpl=fetch}={}){
  const config=telegramConfiguration(privateChat||clean(chatId)?{...env,TELEGRAM_DEFAULT_CHAT_ID:clean(chatId)||clean(env.TELEGRAM_DEFAULT_CHAT_ID)}:env);
  assertReady(config,purpose,settings,privateChat?clean(chatId):'');
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

// "Require Telegram at login": off until an administrator turns it on, with a
// list of logins (for example directors or OEM staff) who are never asked.
export function normalizeTelegramRequirement(value={}){
  const logins=Array.isArray(value?.exemptLogins)?value.exemptLogins:[];
  return {enabled:value?.enabled===true,
    exemptLogins:[...new Set(logins.map(login=>clean(login).toLowerCase()).filter(Boolean))].sort()};
}

export function telegramRequiredFor(requirement,login,{botConfigured=true}={}){
  const settings=normalizeTelegramRequirement(requirement);
  const key=clean(login).toLowerCase();
  return Boolean(botConfigured&&settings.enabled&&key&&!settings.exemptLogins.includes(key));
}

// Telegram echoes this secret in every webhook call. It is derived from the bot
// token, so no extra setting is needed and a new token rotates it.
export function telegramWebhookSecret(env=process.env){
  const token=clean(env.TELEGRAM_BOT_TOKEN);
  return token?createHash('sha256').update(`nerve-center-webhook:${token}`).digest('hex').slice(0,48):'';
}

export function newTelegramLinkToken(){
  return randomBytes(18).toString('base64url');
}

// Reads the parts of a webhook update the account-link flow needs: a private
// "/start <token>" or "/stop", or the user blocking the bot.
export function parseTelegramUpdate(update){
  const message=update?.message;
  if(message?.chat?.type==='private'&&typeof message.text==='string'){
    const [command,argument='']=message.text.trim().split(/\s+/,2);
    const name=clean(command).toLowerCase().replace(/@.*$/,'');
    return {kind:name==='/start'?'start':name==='/stop'?'stop':'text',chatId:String(message.chat.id),
      token:name==='/start'&&/^[A-Za-z0-9_-]{16,64}$/.test(argument)?argument:'',
      username:clean(message.from?.username)};
  }
  const member=update?.my_chat_member;
  if(member?.chat?.type==='private'&&['kicked','left'].includes(member.new_chat_member?.status))
    return {kind:'blocked',chatId:String(member.chat.id)};
  const request=update?.chat_join_request;
  if(request?.chat?.id&&request?.from?.id)
    return {kind:'joinRequest',groupChatId:String(request.chat.id),userId:String(request.from.id),userChatId:String(request.user_chat_id||request.from.id)};
  // A basic group upgraded to a supergroup gets a new id; alerts must follow it.
  if(update?.message?.migrate_to_chat_id)
    return {kind:'migrated',groupChatId:String(update.message.chat.id),newChatId:String(update.message.migrate_to_chat_id)};
  return {kind:'ignored'};
}

let cachedBotUsername='';
export async function telegramBotUsername({env=process.env,fetchImpl=fetch}={}){
  if(!cachedBotUsername)cachedBotUsername=clean((await telegramRequest('getMe',{env,fetchImpl,json:{}}))?.username);
  return cachedBotUsername;
}

// Join requests let the bot admit only BDMS administrators to the admin group.
export const TELEGRAM_WEBHOOK_UPDATES=['message','my_chat_member','chat_join_request'];

export async function ensureTelegramWebhook(baseUrl,{env=process.env,fetchImpl=fetch}={}){
  const config=telegramConfiguration(env);
  const url=`${clean(baseUrl).replace(/\/+$/,'')}/api/telegram/webhook`;
  if(!config.botToken||!url.startsWith('https://'))return {registered:false};
  const info=await telegramRequest('getWebhookInfo',{env,fetchImpl,json:{}});
  const wanted=[...TELEGRAM_WEBHOOK_UPDATES].sort().join(',');
  if(info?.url!==url||[...(info?.allowed_updates||[])].sort().join(',')!==wanted)
    await telegramRequest('setWebhook',{env,fetchImpl,json:{url,secret_token:telegramWebhookSecret(env),allowed_updates:TELEGRAM_WEBHOOK_UPDATES}});
  return {registered:true,url,pendingUpdates:info?.pending_update_count||0,lastError:clean(info?.last_error_message)};
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

// The admin group invite asks to join; the bot then approves administrators only.
export async function createTelegramJoinRequestLink(chatId,{env=process.env,fetchImpl=fetch}={}){
  const result=await telegramRequest('createChatInviteLink',{env,fetchImpl,json:{chat_id:chatId,name:'BDMS administrators',creates_join_request:true}});
  return clean(result?.invite_link);
}

export async function answerTelegramJoinRequest(chatId,userId,approve,{env=process.env,fetchImpl=fetch}={}){
  return telegramRequest(approve?'approveChatJoinRequest':'declineChatJoinRequest',{env,fetchImpl,json:{chat_id:chatId,user_id:Number(userId)}});
}

export async function telegramChatMemberStatus(chatId,userId,{env=process.env,fetchImpl=fetch}={}){
  const member=await telegramRequest('getChatMember',{env,fetchImpl,json:{chat_id:chatId,user_id:Number(userId)}});
  return clean(member?.status);
}
