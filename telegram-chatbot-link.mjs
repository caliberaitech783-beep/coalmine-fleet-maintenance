export function telegramChatbotLink(username){
 const name=String(username||'').replace(/^@/,'').trim();
 if(!/^[A-Za-z0-9_]{5,32}$/.test(name))throw new Error('Telegram bot username is unavailable.');
 // This is a public entry marker, never a user's one-time linking token.
 return `https://t.me/${name}?start=bdms`;
}
