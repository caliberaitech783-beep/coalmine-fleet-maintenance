import test from 'node:test';
import assert from 'node:assert/strict';
import {telegramChatbotLink} from '../telegram-chatbot-link.mjs';
import {parseTelegramUpdate} from '../telegram.mjs';
test('public entry opens chatbot without connecting a shared identity',()=>{
 assert.equal(telegramChatbotLink('@caliber_bdms_bot'),'https://t.me/caliber_bdms_bot?start=bdms');
 const update=parseTelegramUpdate({message:{chat:{id:123,type:'private'},text:'/start bdms'}});
 assert.equal(update.kind,'start');assert.equal(update.token,'');
});
test('redirect rejects malformed usernames and external destinations',()=>{
 for(const name of ['', 'https://example.com', 'bot?start=secret','../other'])assert.throws(()=>telegramChatbotLink(name));
});
