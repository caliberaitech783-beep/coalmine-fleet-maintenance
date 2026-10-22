import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFeedCache,requestFeedWriteInvalidates} from '../request-feed-cache.mjs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function clock(start = 1000) {
  let value = start;
  return {now: () => value, advance(ms) { value += ms; }};
}

test('telemetry cannot evict the feed but business and unknown writes still do', async () => {
  const cache = createFeedCache();
  let reads = 0;
  const load = async () => [{ref: `REQ-${++reads}`}];
  for (let user = 0; user < 100; user += 1) {
    for (const path of ['/api/session-heartbeat', '/api/user-activity']) {
      assert.equal(requestFeedWriteInvalidates({method:'POST', path}), false);
      if (requestFeedWriteInvalidates({method:'POST', path})) cache.clear();
      await cache.read(load, 'revision-1');
    }
  }
  assert.equal(reads, 1, '200 interleaved telemetry/poll pairs share one database load');
  for (const path of ['/api/requests', '/api/requests/REQ-1/close', '/api/masters', '/api/new-feature', '/api/session-heartbeat/extra']) {
    assert.equal(requestFeedWriteInvalidates({method:'POST', path}), true);
    cache.clear();
    await cache.read(load, 'revision-1');
  }
  assert.equal(reads, 6);
  assert.equal(requestFeedWriteInvalidates({method:'PATCH',path:'/api/user-activity'}), true);
  await cache.read(load, 'revision-2');
  assert.equal(reads, 7, 'database revisions still invalidate changes from another instance');
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
  assert.match(route, /const rows=ownRowsOnly\?await readFeed\(\):await requestFeedCache\.read\(readFeed,JSON\.stringify\(revisions\)\);/,
    'a production user reads only their own rows, so that query is not shared');
  assert.match(route, /const payload=requestsVisibleToSession\(siteVisibleRows,req\.session\)/,
    'every response is still filtered for the signed-in user');
  assert.match(route, /currentDataRevisions\(\['request-feed','master-data'\]\)/,
    'unchanged polling responses must be decided before the full request query');
  assert.match(route, /sendPrivateNotModified\(req,res,etag\)\)return;/);
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
