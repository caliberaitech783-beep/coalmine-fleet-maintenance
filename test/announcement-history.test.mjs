import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const client=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
test('announcement history is authenticated, paginated and independent of acknowledgements and popup expiry',()=>{
  const route=server.slice(server.indexOf("app.get('/api/announcements/history'"),server.indexOf("app.get('/api/announcements/pending'"));
  assert.match(route,/history',requireSession/);
  assert.match(route,/withdrawn_at IS NULL/);
  assert.match(route,/id<\$1/);
  assert.match(route,/LIMIT 51/);
  assert.match(route,/Number.isSafeInteger/);
  assert.doesNotMatch(route,/announcement_acknowledgements|make_interval|requireAdministrator|DELETE|UPDATE|INSERT/);
  assert.match(server,/app.post\('\/api\/announcements',requireSuper,requireAdministrator/);
  assert.match(server,/app.patch\('\/api\/announcements\/:announcementId\/withdraw',requireSuper,requireAdministrator/);
});
test('all desktop and operational navigation bars end with announcement history',()=>{
  assert.equal((client.match(/<AnnouncementHistoryButton token=\{authToken\} \/>/g)||[]).length,2);
  assert.equal((client.match(/<AnnouncementHistoryButton token=\{authToken\} \/>\s*<\/nav>/g)||[]).length,2);
  const component=client.slice(client.indexOf('function AnnouncementHistoryButton'),client.indexOf('function formatTwelveHourDateTime'));
  assert.match(component,/AnnouncementImage/);
  assert.match(component,/Load older announcements/);
  assert.match(component,/whiteSpace:'pre-wrap'/);
  assert.doesNotMatch(component,/acknowledge|method:'POST'|method:'PATCH'/);
});
test('announcement archive is full-screen, readable and isolated from navigation colours',()=>{
  const component=client.slice(client.indexOf('function AnnouncementHistoryButton'),client.indexOf('function formatTwelveHourDateTime'));
  const css=readFileSync(new URL('../src/user-sessions.css',import.meta.url),'utf8');
  assert.match(component,/open&&createPortal\(<Modal/);
  assert.match(component,/<\/Modal>,document.body\)/);
  assert.match(component,/className="announcement-archive-modal"/);
  assert.doesNotMatch(component,/announcement-image thumbnail/);
  assert.match(css,/\.modal\.announcement-archive-modal\{[^}]*height:100dvh/);
  assert.match(css,/\.announcement-archive-modal \.announcement-history ul\{max-height:none;overflow:visible/);
  assert.match(css,/\.announcement-archive-modal \.announcement-history li p\{[^}]*color:#17233c;overflow-wrap:anywhere/);
});
