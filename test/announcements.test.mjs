import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ANNOUNCEMENT_ACTIVE_DAYS,
  ANNOUNCEMENT_MAX_LENGTH,
  announcementReaderKey,
  announcementValidationError,
  inboxDismissPath,
  inboxItems,
  normalizeAnnouncement,
} from '../announcement.mjs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const source = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const styles = readFileSync(new URL('../src/user-sessions.css', import.meta.url), 'utf8');
const routeOf = (start) => server.slice(server.indexOf(start), server.indexOf('\napp.', server.indexOf(start) + start.length));

test('announcement text is trimmed, required and capped at 500 characters', () => {
  assert.equal(normalizeAnnouncement('  Site closed tomorrow.\r\nReport at 8 AM.  '), 'Site closed tomorrow.\nReport at 8 AM.');
  assert.equal(announcementValidationError('   '), 'Write the announcement before sending.');
  assert.equal(announcementValidationError('x'.repeat(ANNOUNCEMENT_MAX_LENGTH + 1)), 'Keep the announcement within 500 characters.');
  assert.equal(announcementValidationError('Safety briefing at 9 AM in the workshop.'), '');
  assert.equal(ANNOUNCEMENT_ACTIVE_DAYS, 30);
});

test('acknowledgements are keyed per user login, falling back to the name, so closing once covers every device', () => {
  assert.equal(announcementReaderKey({ login: ' Ramesh.Kumar ', name: 'Ramesh Kumar' }), 'ramesh.kumar');
  assert.equal(announcementReaderKey({ login: '', name: 'Ramesh Kumar' }), 'name:ramesh kumar');
  assert.equal(announcementReaderKey({}), 'name:');
});

test('the inbox shows direct messages before announcements and closes each through its own route', () => {
  const items = inboxItems([{ id: 7, message: 'Call me' }], [{ id: 3, message: 'Holiday tomorrow' }]);
  assert.deepEqual(items.map(item => [item.kind, item.id]), [['message', 7], ['announcement', 3]]);
  assert.equal(inboxDismissPath(items[0]), '/api/session-messages/7/dismiss');
  assert.equal(inboxDismissPath(items[1]), '/api/announcements/3/acknowledge');
  assert.deepEqual(inboxItems(undefined, null), []);
});

test('only Admin and Super Admin can send, list or withdraw announcements; every user can read and close them', () => {
  assert.match(server, /app\.post\('\/api\/announcements',requireSuper,requireAdministrator,/);
  assert.match(server, /app\.get\('\/api\/announcements',requireSuper,requireAdministrator,/);
  assert.match(server, /app\.patch\('\/api\/announcements\/:announcementId\/withdraw',requireSuper,requireAdministrator,/);
  assert.match(server, /app\.get\('\/api\/announcements\/pending',requireSession,/);
  assert.match(server, /app\.patch\('\/api\/announcements\/:announcementId\/acknowledge',requireSession,/);
  const send = routeOf("app.post('/api/announcements',");
  assert.match(send, /announcementValidationError\(message\)/);
  assert.match(send, /action:'Send announcement'/, 'publishing is audited');
  const withdraw = routeOf("app.patch('/api/announcements/:announcementId/withdraw',");
  assert.match(withdraw, /WHERE id=\$1 AND withdrawn_at IS NULL RETURNING id/);
  assert.match(withdraw, /action:'Withdraw announcement'/);
});

test('pending announcements exclude withdrawn ones, ones already closed by this user, and ones older than 30 days', () => {
  const pending = routeOf("app.get('/api/announcements/pending',");
  assert.match(pending, /a\.withdrawn_at IS NULL AND a\.created_at>NOW\(\)-make_interval\(days => \$2::int\)/);
  assert.match(pending, /NOT EXISTS \(SELECT 1 FROM announcement_acknowledgements k WHERE k\.announcement_id=a\.id AND k\.reader_key=\$1\)/);
  assert.match(pending, /\[announcementReaderKey\(req\.session\),ANNOUNCEMENT_ACTIVE_DAYS\]/);
  assert.match(pending, /req\.audit=false;/, 'the 3-second poll is not written to the audit trail');
  const acknowledge = routeOf("app.patch('/api/announcements/:announcementId/acknowledge',");
  assert.match(acknowledge, /ON CONFLICT DO NOTHING/, 'closing twice is harmless');
  assert.match(acknowledge, /withdrawn_at IS NULL/, 'a withdrawn announcement cannot be acknowledged');
  assert.match(server, /CREATE TABLE IF NOT EXISTS announcements \(/);
  assert.match(server, /PRIMARY KEY \(announcement_id, reader_key\)/);
});

test('the shared popup polls announcements with direct messages and stays until the user closes it', () => {
  const inbox = source.slice(source.indexOf('function SessionMessageInbox('), source.indexOf('function UserSessionsPage('));
  assert.match(inbox, /fetch\('\/api\/session-messages',\{cache:'no-store',signal:controller\.signal,headers\}\),\n\s+fetch\('\/api\/announcements\/pending',\{cache:'no-store',signal:controller\.signal,headers\}\),/);
  assert.match(inbox, /\.map\(\(item\)=>\(\{\.\.\.item,kind:'message'\}\)\),\n\s+\.\.\.\(Array\.isArray\(announcementResult\.announcements\)/, 'direct messages come first');
  assert.match(inbox, /const isAnnouncement=current\.kind==='announcement';/);
  assert.match(inbox, /isAnnouncement\?`\/api\/announcements\/\$\{encodeURIComponent\(current\.id\)\}\/acknowledge`:`\/api\/session-messages\/\$\{encodeURIComponent\(current\.id\)\}\/dismiss`/);
  assert.match(inbox, /role="alertdialog" aria-modal="true"/);
  assert.match(inbox, /\{isAnnouncement\?'Announcement to all users':'Direct message'\}/);
  assert.match(inbox, /This message will remain open until you close it\./);
});

test('administrators compose announcements from the User Sessions page and can review or withdraw recent ones', () => {
  const composer = source.slice(source.indexOf('function AnnouncementComposer('), source.indexOf('function SessionMessageInbox('));
  assert.match(composer, /fetch\('\/api\/announcements',\{method:'POST'/);
  assert.match(composer, /maxLength="500"/);
  assert.match(composer, /Send to all users/);
  assert.match(composer, /window\.confirm\('Withdraw this announcement\?/);
  assert.match(composer, /closed by \{Number\(row\.acknowledgedCount\|\|0\)\.toLocaleString\('en-IN'\)\}/);
  const page = source.slice(source.indexOf('function UserSessionsPage('), source.indexOf('function UserSessionsPage(') + 12000);
  assert.match(page, /<button type="button" className="primary" onClick=\{\(\)=>setAnnouncing\(true\)\}><MessageCircle \/> Announce to all users<\/button>/);
  assert.match(page, /\{announcing&&<AnnouncementComposer session=\{session\}/);
  assert.match(page, /Announcement sent to all users\. Each user will see it until they close it\./);
  assert.match(styles, /\.session-message-inbox\.announcement header\{/);
  assert.match(styles, /\.announcement-history li button\{/);
});
