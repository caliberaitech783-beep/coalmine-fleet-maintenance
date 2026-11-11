import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {createFeedCache,requestFeedWriteInvalidates} from '../request-feed-cache.mjs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('dashboard read keeps all active requests and first-trip details with one join', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const requestTable = server.match(/CREATE TABLE IF NOT EXISTS maintenance_requests \([\s\S]+?\n    \);/)[0];
  const columns = [...server.matchAll(/^ +ALTER TABLE maintenance_requests\s+ADD COLUMN IF NOT EXISTS [^;]+;/gm)]
    .map(([sql]) => sql);
  const tripTable = server.match(/CREATE TABLE IF NOT EXISTS production_first_trip_acceptances \([\s\S]+?\n    \);/)[0];
  await db.exec(requestTable);
  await db.exec(columns.join('\n'));
  await db.exec(`
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS vehicle_idle BOOLEAN DEFAULT FALSE;
    ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
    ${tripTable}
    INSERT INTO maintenance_requests(reference, door_number, complaint, created_at, archived_at)
      VALUES ('with-trip','D1','fault','2026-11-10',NULL),
             ('without-trip','D2','fault','2026-11-09',NULL),
             ('archived','D3','fault','2026-11-11','2026-11-11');
    INSERT INTO production_first_trip_acceptances
      (request_reference, production_first_trip_at, production_first_trip_by, production_first_trip_login, production_first_trip_remark)
      VALUES ('with-trip','2026-11-10 10:00+00','Operator','operator','Confirmed');
  `);
  const projectionCode = server.slice(server.indexOf('const requestProjection='), server.indexOf('const infoPulseProjection='));
  const projections = new Function(`${projectionCode}; return {requestProjection,dashboardRequestProjection};`)();
  const start = server.indexOf("app.get('/api/requests',requireSession");
  const route = server.slice(start, server.indexOf('\n});', start) + 4);
  let handler;
  const bindings = {
    app:{get(_path, _guard, run){handler=run;}}, requireSession(){},
    pool:{query:({text,values}) => db.query(text,values)}, ...projections,
    requestFeedCache:createFeedCache(), attachDailyRemarks:async rows => rows, requestsVisibleToSession:rows => rows,
  };
  new Function(...Object.keys(bindings), route)(...Object.values(bindings));
  const read = (scope) => new Promise((resolve,reject) => handler(
    {query:{scope},session:{role:'super',login:'admin'}}, {json:resolve}, reject,
  ));
  const dashboard = await read('dashboard');
  assert.deepEqual(dashboard, await read('workflow'));
  assert.deepEqual(dashboard.map(row => [row.ref,row.productionFirstTripAt,row.productionFirstTripBy,row.productionFirstTripLogin,row.productionFirstTripRemark]), [
    ['with-trip','2026-11-10 15:30:00','Operator','operator','Confirmed'],
    ['without-trip',null,'','',''],
  ]);
});

function clock(start = 1000) {
  let value = start;
  return {now: () => value, advance(ms) { value += ms; }};
}

test('only a write that can change the feed closes the window; sign-in, telemetry, bridge reads and unrelated writes leave it open', async () => {
  const cache = createFeedCache();
  let reads = 0;
  const load = async () => [{ref: `REQ-${++reads}`}];
  const open = ['/api/login', '/api/session-heartbeat', '/api/user-activity', '/api/logout',
    '/api/integrations/mis/pulse', '/api/integrations/mis/validate', '/api/mis-sso/validate',
    '/api/notifications/read', '/api/tickets', '/api/tickets/resolve', '/api/telegram/webhook', '/api/telegram/link',
    '/api/remote-assistance/7/events', '/api/user-sessions/7/messages', '/api/session-messages/7/dismiss', '/api/translate',
    '/api/announcements/3/acknowledge', '/api/whatsapp/send', '/api/report-settings', '/api/navigation-settings',
    '/api/backups/run', '/api/backups/settings', '/api/exports/pdf', '/api/info-pulse/prompt', '/api/requests-feature'];
  for (let user = 0; user < 100; user += 1) {
    for (const path of open) {
      assert.equal(requestFeedWriteInvalidates({method:'POST', path}), false, path);
      if (requestFeedWriteInvalidates({method:'POST', path})) cache.clear();
      await cache.read(load, 'revision-1');
    }
  }
  assert.equal(reads, 1, 'interleaved sign-ins, heartbeats, Pulse-II bridge reads and polls share one database load');
  const closing = [['POST', '/api/requests'], ['PATCH', '/api/requests/REQ/26/1/close'], ['POST', '/api/requests/REQ/26/1/daily-remarks'],
    ['PATCH', '/api/requests/REQ/26/1/production-first-trip'], ['DELETE', '/api/requests/REQ/26/1'], ['POST', '/api/requests/bulk-delete'],
    ['POST', '/api/request-corrections'], ['PATCH', '/api/request-corrections/4/apply'], ['POST', '/api/request-archives'], ['POST', '/api/request-archives/2/restore'],
    ['POST', '/api/masters/Equipment master'], ['PUT', '/api/masters/Users & employees/5'], ['DELETE', '/api/masters/Privilege/5'], ['POST', '/api/masters/Users & employees/5/password'],
    ['POST', '/api/vehicle-transfers'], ['PATCH', '/api/vehicle-transfers/3/source-approval'], ['POST', '/api/oracle/equipment/sync'],
    ['PATCH', '/api/cdir/employees/4'], ['POST', '/api/cdir/employee-transfers'], ['POST', '/api/change-initial-password'], ['POST', '/api/password-reset/confirm'], ['POST', '/api/preferred-language'],
    ['POST', '/api/data-housekeeping/purge'], ['POST', '/api/deletion-approvals/1/verify'], ['POST', '/api/backups/import/restore'], ['POST', '/api/selective-media/import/t/restore']];
  for (const [method, path] of closing) {
    assert.equal(requestFeedWriteInvalidates({method, path}), true, `${method} ${path}`);
    cache.clear();
    await cache.read(load, 'revision-1');
  }
  assert.equal(reads, 1 + closing.length);
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(requestFeedWriteInvalidates({method, path:'/api/requests'}), false, method);
  await cache.read(load, 'revision-2');
  assert.equal(reads, 2 + closing.length, 'database revisions still invalidate changes from another path');
});

test('dashboard and workflow polls reuse their own feeds until the data changes', async () => {
  const cache = createFeedCache();
  let reads = 0;
  const load = feed => async () => { reads += 1; return [feed]; };
  for (let i = 0; i < 100; i += 1) {
    assert.deepEqual(await cache.read(load('dashboard'), 'r1', 'dashboard'), ['dashboard']);
    assert.deepEqual(await cache.read(load('workflow'), 'r1', 'workflow'), ['workflow']);
  }
  assert.equal(reads, 2);
  await cache.read(load('dashboard'), 'r2', 'dashboard');
  assert.equal(reads, 3);
  cache.clear();
  await Promise.all([
    cache.read(load('dashboard'), 'r2', 'dashboard'),
    cache.read(load('workflow'), 'r2', 'workflow'),
  ]);
  assert.equal(reads, 5);
});

test('a slow in-flight read is shared beyond TTL, without reviving a cleared result', async () => {
  const time = clock();
  const cache = createFeedCache({ttlMs:100,now:time.now});
  let finish, reads = 0;
  const pending = cache.read(() => { reads++; return new Promise(resolve => {finish=resolve;}); }, 'r1');
  await Promise.resolve();
  time.advance(1000);
  const follower = cache.read(() => {reads++; return ['duplicate'];}, 'r1');
  assert.equal(reads, 1);
  cache.clear();
  const fresh = await cache.read(async () => {reads++; return ['fresh'];}, 'r1');
  finish(['old']);
  assert.deepEqual(await pending, ['old']);
  assert.deepEqual(await follower, ['old']);
  assert.deepEqual(await cache.read(async () => ['incorrect'], 'r1'), fresh);
  assert.equal(reads, 2);
});

test('equipment and remarks queries overlap and retain door mapping, history order and input rows', async () => {
  const start = server.indexOf('async function attachDailyRemarks(');
  const helper = server.slice(start, server.indexOf('// Site and role routing', start));
  const {requestsWithDoorNumbers} = await import('../equipment-door.mjs');
  const {approvedDelayedReason} = await import('../delayed-reason.mjs');
  const load = new Function('requestsWithDoorNumbers','approvedDelayedReason',`${helper};return attachDailyRemarks;`)(requestsWithDoorNumbers,approvedDelayedReason);
  const rows = [{ref:'REQ-1',reg:'MH-01',site:'Sasti OC',delayedReason:'Parts - OEM'}, {ref:'REQ-2',reg:'OTHER',site:'Sasti OC'}];
  const original = structuredClone(rows);
  const pending = [];
  const client = {query(sql, values) {return new Promise((resolve,reject) => pending.push({sql,values,resolve,reject}));}};
  const result = load(rows,client);
  assert.equal(pending.length, 2, 'both SQL reads start before either responds');
  assert.deepEqual(pending[1].values, [['REQ-1','REQ-2']]);
  const remarks = [{requestReference:'REQ-1',remark:'Latest'}, {requestReference:'REQ-1',remark:'Earlier'}];
  pending[1].resolve({rows:remarks});
  pending[0].resolve({rows:[{record_data:{reg:'MH-01',door:'D-101',site:'Sasti OC'}}]});
  const actual = await result;
  assert.equal(actual[0].door, 'D-101');
  assert.deepEqual(actual[0].dailyRemarks, remarks);
  assert.deepEqual(actual[1].dailyRemarks, []);
  assert.equal(actual[0].delayedReason, 'Parts - OEM');
  assert.deepEqual(rows, original);
  const failed = load(rows,{query:async () => {throw new Error('read failed');}});
  await assert.rejects(failed,/read failed/);
  assert.deepEqual(await load([], {query(){assert.fail('empty feed queried database');}}), []);
});

test('polls inside the window share one read of the feed', async () => {
  const time = clock();
  const cache = createFeedCache({ttlMs: 3000, now: time.now});
  let reads = 0;
  const load = async () => { reads += 1; return [{ref: `REQ-${reads}`}]; };

  const [first, second] = await Promise.all([cache.read(load), cache.read(load)]);
  assert.equal(reads, 1, 'two simultaneous polls must not hit the database twice');
  assert.deepEqual(first, second);

  time.advance(2999);
  await cache.read(load);
  assert.equal(reads, 1, 'a poll inside the window reuses the held result');

  time.advance(2);
  await cache.read(load);
  assert.equal(reads, 2, 'the window expires on its own');
});

test('a write clears the window so the refresh after it reads the database', async () => {
  const time = clock();
  const cache = createFeedCache({ttlMs: 3000, now: time.now});
  let reads = 0;
  const load = async () => { reads += 1; return reads; };

  assert.equal(await cache.read(load), 1);
  cache.clear();
  assert.equal(await cache.read(load), 2, 'the cleared window must not serve the pre-write rows');
  assert.equal(cache.stats.reads, 2);
});

test('a failed read is never handed to the next poll', async () => {
  const time = clock();
  const cache = createFeedCache({ttlMs: 3000, now: time.now});
  let attempt = 0;
  const load = async () => {
    attempt += 1;
    if (attempt === 1) throw new Error('database unavailable');
    return ['fresh'];
  };

  await assert.rejects(cache.read(load), /database unavailable/);
  assert.deepEqual(await cache.read(load), ['fresh']);
});

test('the requests route shares the feed and business writes clear it', () => {
  assert.match(server, /import \{createFeedCache,requestFeedWriteInvalidates\} from '\.\/request-feed-cache\.mjs';/);
  assert.match(server, /const requestFeedCache=createFeedCache\(\{ttlMs:30_000\}\);/);
  const guard = server.slice(server.indexOf('const requestFeedCache=createFeedCache('), server.indexOf('const port=Number('));
  assert.match(guard, /if\(requestFeedWriteInvalidates\(req\)\)\{/);
  assert.match(guard, /requestFeedCache\.clear\(\);/);
  assert.match(guard, /res\.on\('finish',\(\)=>requestFeedCache\.clear\(\)\);/);

  const route = server.slice(server.indexOf("app.get('/api/requests',requireSession"), server.indexOf("app.get('/api/requests/conflict'"));
  assert.match(route, /const ownRowsOnly=query\.values\.length>0;/);
  assert.match(route, /const rows=ownRowsOnly\?await readFeed\(\):await requestFeedCache\.read\(readFeed,JSON\.stringify\(revisions\),dashboardScope\?'dashboard':'workflow'\);/,
    'a production user reads only their own rows, so that query is not shared');
  assert.match(route, /const payload=requestsVisibleToSession\(siteVisibleRows,req\.session\)/,
    'every response is still filtered for the signed-in user');
  assert.match(route, /currentDataRevisions\(\['request-feed','master-data'\],client\)/,
    'unchanged polling responses must be decided before the full request query');
  assert.match(route, /sendPrivateNotModified\(req,res,etag\)\)return;/);
});

test('dashboard requests can authenticate and load when the shared pool is saturated', async () => {
  const overloaded = () => { throw new Error('Shared pool is saturated'); };
  const session = {role:'super', login:'test-admin'};
  const dashboardSessionStore = {get: async token => token === 'valid-session' ? session : null};
  const records = [{ref:'REQ-1'}];
  const dashboardReadPool = {query: async () => ({rows:records})};
  const select = new Function('dashboardReadPool', 'dashboardSessionStore',
    server.slice(server.indexOf('function selectDashboardReadPool('), server.indexOf('app.use(selectDashboardReadPool);')) +
    'return selectDashboardReadPool;')(dashboardReadPool, dashboardSessionStore);
  let allowed = true;
  const readSession = new Function('sessionStore', 'membershipOnboardingPath', 'telegramMembershipFor',
    server.slice(server.indexOf('async function readSession('), server.indexOf('function sessionActivityDetails(')) +
    'return readSession;')({get:overloaded}, () => false, async (login, force, client) => {
      assert.equal(login, session.login);
      assert.equal(client, dashboardReadPool);
      return {allowed};
    });
  let handler;
  const bindings = {
    app:{get(_path, _guard, run){handler=run;}},
    requireSession(){}, pool:{query:overloaded}, requestProjection:'reference AS ref',
    dashboardRequestProjection:'reference AS ref', requestFeedCache:createFeedCache(),
    currentDataRevisions:async (_keys, client) => {assert.equal(client,dashboardReadPool);return {};},
    attachDailyRemarks:async (rows, client) => {assert.equal(client,dashboardReadPool);return rows;},
    requestsVisibleToSession:rows => rows,
  };
  const start = server.indexOf("app.get('/api/requests',requireSession");
  const route = server.slice(start, server.indexOf('\n});', start) + 4);
  new Function(...Object.keys(bindings), route)(...Object.values(bindings));
  const request = (scope, token = 'valid-session') => {
    const req = {method:'GET',path:'/api/requests',query:{scope},headers:{authorization:'Bearer '+token}};
    select(req, {}, () => {});
    return req;
  };
  const req = request('dashboard');
  req.session = await readSession(req);
  assert.equal(req.session, session);
  const rows = await new Promise((resolve, reject) => handler(req, {json:resolve}, reject));
  assert.deepEqual(rows, records);
  assert.equal(await readSession(request('dashboard','unknown-token')), null);
  allowed = false;
  await assert.rejects(readSession(request('dashboard')), {status:403,code:'TELEGRAM_MEMBERSHIP_REQUIRED'});
  await assert.rejects(readSession(request('workflow')), /Shared pool is saturated/);
});

test('a click never waits for WhatsApp delivery to Meta', () => {
  const helper = server.slice(server.indexOf('const whatsappDeliveries=new Set();'), server.indexOf('async function addTicketNotificationsBestEffort('));
  assert.match(helper, /setImmediate\(\(\)=>\{/, 'delivery is handed to the event loop');
  assert.match(helper, /whatsappDeliveries\.delete\(delivery\)/);
  assert.match(helper, /if\(whatsapp\)deferWhatsAppNotifications\(logins,reference,message,workflowTemplate/,
    'the in-app notification is still written before the reply, the WhatsApp fan-out is not');
  assert.doesNotMatch(helper, /await sendWhatsAppNotifications\(client,/, 'the request must not block on Meta');

  const firstTrip = server.slice(server.indexOf('async function notifyProductionFirstTripPending('), server.indexOf("app.get('/api/tickets',"));
  assert.match(firstTrip, /setImmediate\(\(\)=>\{\s*sendWhatsAppNotifications\(pool,recipients,request\.ref,message,null,\{site:request\.site,purpose:'requestClosed'\}\)/);
});
