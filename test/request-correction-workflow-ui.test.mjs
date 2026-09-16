import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [server,main,view]=await Promise.all([
  readFile(new URL('../server.mjs',import.meta.url),'utf8'),
  readFile(new URL('../src/main.jsx',import.meta.url),'utf8'),
  readFile(new URL('../src/request-corrections.jsx',import.meta.url),'utf8'),
]);

test('server persists a user-requested correction register with evidence, PM review, and Admin application',()=>{
  assert.match(server,/CREATE TABLE IF NOT EXISTS request_corrections/);
  assert.match(server,/evidence_data TEXT NOT NULL/);
  assert.match(server,/app\.post\('\/api\/request-corrections',requireSession/);
  assert.match(server,/Only Production, Maintenance, or MIS users can request a correction/);
  assert.match(server,/Production users can request correction only for their own Off Road entry/);
  assert.match(server,/allowedTypes:context\.allowedTypes/);
  assert.match(server,/Only the assigned site Project \/ Production Manager can review this correction/);
  assert.match(server,/This correction is locked until the assigned PM approves it/);
  assert.match(server,/action:'Apply approved correction'/);
});

test('user, PM, and Admin receive their dedicated correction step',()=>{
  assert.match(main,/\["Request corrections", Pencil\]/);
  assert.match(main,/> Request correction<\/button>/);
  assert.match(main,/Correction approvals/);
  assert.match(main,/\["Project Manager","Production Manager"\]/);
  assert.match(main,/<RequestCorrections session=\{session\} requests=\{requests\} Dialog=\{Modal\}/);
});

test('correction screen explains and enforces the approval sequence',()=>{
  assert.match(view,/Request PM approval/);
  assert.match(view,/Operational user request/);
  assert.match(view,/User requests with evidence/);
  assert.match(view,/Locked until PM approval/);
  assert.match(view,/Apply approved correction/);
  assert.match(view,/Upload correction evidence/);
  assert.match(view,/PM verification remark/);
  assert.match(view,/Search request, door, equipment, chassis, or site/);
  assert.match(view,/Search request, user, site, reason, or status/);
});
