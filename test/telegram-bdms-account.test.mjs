import test from 'node:test';
import assert from 'node:assert/strict';
import {telegramBdmsAccountChoice as choose} from '../telegram-bdms-account.mjs';
test('multiple connected accounts require explicit selection without unlinking alerts',()=>{
 const links=[{login:'ANOOP'},{login:'prod'}];
 assert.deepEqual(choose({links,text:'/start'}),{kind:'choose',logins:['anoop','prod']});
 assert.deepEqual(choose({links,text:'/account ANOOP'}),{kind:'selected',login:'anoop',changed:true});
 assert.equal(choose({links,selectedLogin:'anoop',text:'Open breakdowns'}).login,'anoop');
 assert.equal(choose({links,selectedLogin:'anoop',text:'/account'}).kind,'choose');
});
test('forged and revoked account choices cannot grant access',()=>{
 const links=[{login:'prod'},{login:'mis'}];
 assert.equal(choose({links,text:'/account admin'}).kind,'choose');
 assert.equal(choose({links,selectedLogin:'revoked'}).kind,'choose');
 assert.equal(choose({links:[],selectedLogin:'admin'}).kind,'unlinked');
 assert.equal(choose({links:[{login:'prod'},{login:'PROD'}]}).login,'prod');
});
