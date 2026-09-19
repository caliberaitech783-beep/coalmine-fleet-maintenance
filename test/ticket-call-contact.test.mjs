import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {userRecordPhone,telHref,phonesByLogin,withCreatorContact} from '../ticket-contact.mjs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const main=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8').replace(/\r\n/g,'\n');
const css=readFileSync(new URL('../src/motion-icons.css',import.meta.url),'utf8').replace(/\r\n/g,'\n');

test('phone numbers become dialable tel links; Indian ten-digit numbers get +91',()=>{
  assert.equal(userRecordPhone({phone:' 98765 43210 '}),'98765 43210');
  assert.equal(userRecordPhone({phoneNo:'9876543210'}),'9876543210');
  assert.equal(userRecordPhone({phoneNumber:'+91 98765 43210'}),'+91 98765 43210');
  assert.equal(userRecordPhone({}),'');
  assert.equal(telHref('98765 43210'),'tel:+919876543210');
  assert.equal(telHref('09876543210'),'tel:+919876543210','leading trunk zero dropped');
  assert.equal(telHref('919876543210'),'tel:+919876543210');
  assert.equal(telHref('+91-98765-43210'),'tel:+919876543210');
  assert.equal(telHref('07152 244567'),'tel:+917152244567','landline with STD code');
  assert.equal(telHref(''),'');
  assert.equal(telHref('123'),'','too short to dial');
  assert.equal(telHref('Not available'),'');
});

test('tickets get the raiser\'s phone by login; others are left untouched',()=>{
  const phones=phonesByLogin([{login:'SatyaSai',phone:'9876543210'},{login:'nophone'},{login:'',phone:'111'},{login:'satyasai',phone:'0000000000'}]);
  assert.deepEqual([...phones],[['satyasai','9876543210']],'first record wins, blanks skipped');
  const [withPhone,withoutPhone]=withCreatorContact([{reference:'T1',creatorLogin:'satyasai'},{reference:'T2',creatorLogin:'nophone'}],phones);
  assert.deepEqual(withPhone,{reference:'T1',creatorLogin:'satyasai',creatorPhone:'9876543210',creatorPhoneHref:'tel:+919876543210'});
  assert.deepEqual(withoutPhone,{reference:'T2',creatorLogin:'nophone'});
});

test('only admin and manager ticket lists carry contact details; the table shows a Call column after User',()=>{
  const route=server.slice(server.indexOf("app.get('/api/tickets',requireSession"),server.indexOf('const ticketMediaFields'));
  assert.match(route,/if\(req\.session\.role==='super'&&payload\.length\)\{/,'operational users never receive phone numbers');
  assert.match(route,/lower\(record_data->>'login'\)=ANY\(\$1::text\[\]\)/);
  assert.match(route,/payload=withCreatorContact\(payload,phonesByLogin\(userRows\.map\(\(row\)=>row\.record_data\)\)\);/);
  assert.match(route,/sendPrivateJson\(req,res,'tickets',payload\)/);
  assert.match(main,/<th>Ticket ID<\/th><th>User<\/th><th>Call<\/th><th>Site<\/th>/);
  assert.match(main,/<td className="ticket-call-cell">\{ticket\.creatorPhoneHref \? <a className="ticket-call" href=\{ticket\.creatorPhoneHref\}/);
  assert.match(main,/<span className="ticket-call-number">\{ticket\.creatorPhone\}<\/span><\/a> : <span className="ticket-call-missing"/);
  assert.match(main,/row\.reference === ticket\.reference \? \{creatorPhone: row\.creatorPhone, creatorPhoneHref: row\.creatorPhoneHref, \.\.\.ticket\} : row/,'saving a ticket keeps its phone');
  assert.match(css,/\.ticket-call-icon \{[^}]*background: linear-gradient\(135deg, #4ade80, #16a34a\);/);
  assert.match(css,/@keyframes ticket-call-ring \{/);
});
