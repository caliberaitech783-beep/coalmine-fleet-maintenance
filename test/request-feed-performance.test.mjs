import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFeedCache} from '../request-feed-cache.mjs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function clock(start = 1000) {
  let value = start;
  return {now: () => value, advance(ms) { value += ms; }};
}

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

test('the requests route shares the feed and every write clears it', () => {
  assert.match(server, /import \{createFeedCache\} from '\.\/request-feed-cache\.mjs';/);
  assert.match(server, /const requestFeedCache=createFeedCache\(\{ttlMs:3000\}\);/);
  const guard = server.slice(server.indexOf('const requestFeedCache=createFeedCache('), server.indexOf('const port=Number('));
  assert.match(guard, /if\(req\.method!=='GET'&&req\.method!=='HEAD'\)\{/);
  assert.match(guard, /requestFeedCache\.clear\(\);/);
  assert.match(guard, /res\.on\('finish',\(\)=>requestFeedCache\.clear\(\)\);/);

  const route = server.slice(server.indexOf("app.get('/api/requests',requireSession"), server.indexOf("app.get('/api/requests/conflict'"));
  assert.match(route, /const ownRowsOnly=query\.values\.length>0;/);
  assert.match(route, /const rows=ownRowsOnly\?await readFeed\(\):await requestFeedCache\.read\(readFeed\);/,
    'a production user reads only their own rows, so that query is not shared');
  assert.match(route, /const payload=requestsVisibleToSession\(siteVisibleRows,req\.session\)/,
    'every response is still filtered for the signed-in user');
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
