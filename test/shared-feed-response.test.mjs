import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import express from 'express';
import compression from 'compression';
import {createSharedFeedResponses, sendSharedFeedJson} from '../shared-feed-response.mjs';
import {createFeedCache} from '../request-feed-cache.mjs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

test('callers of one variant share one serialised body until the feed is read again', () => {
  const responses = createSharedFeedResponses();
  const rows = [{ref: 'REQ-1', site: 'A'}, {ref: 'REQ-2', site: 'B'}];
  let builds = 0;
  const all = () => { builds += 1; return rows; };
  const first = responses.body(rows, 'dashboard:super', all);
  for (let user = 0; user < 50; user += 1) assert.equal(responses.body(rows, 'dashboard:super', all), first);
  assert.equal(builds, 1);
  assert.deepEqual(JSON.parse(first.body.toString()), rows);

  const siteA = responses.body(rows, 'dashboard:site-a', () => { builds += 1; return rows.filter(row => row.site === 'A'); });
  assert.deepEqual(JSON.parse(siteA.body.toString()), [{ref: 'REQ-1', site: 'A'}]);
  assert.equal(builds, 2, 'another site scope has its own body');

  const reread = [...rows, {ref: 'REQ-3', site: 'A'}];
  const next = responses.body(reread, 'dashboard:super', () => { builds += 1; return reread; });
  assert.notEqual(next, first);
  assert.equal(JSON.parse(next.body.toString()).length, 3, 'a new feed read is never answered from the previous body');
  assert.equal(builds, 3);
  assert.deepEqual({builds: responses.stats.builds, reuses: responses.stats.reuses}, {builds: 3, reuses: 50});
});

test('an equal but separately read rows object does not reuse the earlier body', () => {
  const responses = createSharedFeedResponses();
  let builds = 0;
  const build = (rows) => () => { builds += 1; return rows; };
  const a = [{ref: 'REQ-1'}], b = [{ref: 'REQ-1'}];
  responses.body(a, 'v', build(a));
  responses.body(b, 'v', build(b));
  assert.equal(builds, 2);
  assert.throws(() => responses.body(null, 'v', () => []), TypeError);
});

test('each encoding is compressed once, a failure is not kept, and unknown encodings are skipped', async () => {
  let calls = 0, fail = true;
  const responses = createSharedFeedResponses({encoders: {
    br: async (body) => { calls += 1; if (fail) { fail = false; throw new Error('compression failed'); } return zlib.brotliCompressSync(body); },
  }});
  const entry = responses.body([{ref: 'REQ-1'}], 'v', () => [{ref: 'REQ-1'}]);
  await assert.rejects(responses.encoded(entry, 'br'));
  const [one, two] = await Promise.all([responses.encoded(entry, 'br'), responses.encoded(entry, 'br')]);
  assert.equal(one, two);
  assert.equal(calls, 2, 'one failed attempt, then one shared compression');
  assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(one).toString()), [{ref: 'REQ-1'}]);
  assert.equal(await responses.encoded(entry, 'deflate'), null);
});

test('idle bodies are dropped and the byte budget evicts the least recently used variant', () => {
  let time = 0;
  const responses = createSharedFeedResponses({maxBytes: 250, idleMs: 1000, now: () => time});
  const rows = [{text: 'x'.repeat(100)}];
  responses.body(rows, 'a', () => rows);
  time = 10; responses.body(rows, 'b', () => rows);
  assert.equal(responses.stats.entries, 2);
  time = 20; responses.body(rows, 'c', () => rows);
  assert.equal(responses.stats.entries, 2, 'the oldest variant is evicted to stay within the budget');
  let rebuilt = 0;
  responses.body(rows, 'a', () => { rebuilt += 1; return rows; });
  assert.equal(rebuilt, 1);
  time = 5000;
  responses.body(rows, 'd', () => rows);
  assert.equal(responses.stats.entries, 1, 'variants nobody asked for within the idle limit are released');
  assert.ok(responses.stats.bytes <= 250);
  responses.clear();
  assert.equal(responses.stats.entries, 0);
});

async function withApp(configure, run) {
  const app = express();
  app.use(compression({threshold: 1024}));
  configure(app);
  const listener = http.createServer(app);
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
  const request = (path, headers = {}) => new Promise((resolve, reject) => {
    http.get({host: '127.0.0.1', port: listener.address().port, path, headers}, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks)}));
    }).on('error', reject);
  });
  try { await run(request); }
  finally { await new Promise(resolve => listener.close(resolve)); }
}

test('the shared body reaches browsers as valid br, gzip or plain JSON behind the compression middleware', async () => {
  const responses = createSharedFeedResponses();
  const rows = Array.from({length: 400}, (_, index) => ({ref: `REQ-${index}`, complaint: 'Hydraulic hose leakage near the boom cylinder'}));
  let builds = 0;
  await withApp((app) => {
    app.get('/feed', (req, res, next) => sendSharedFeedJson(req, res, responses, {
      source: rows, variant: 'dashboard:super', etag: `W/"bdms-requests-${req.query.user}"`,
      build: () => { builds += 1; return rows; },
      setHeaders: (response, etag) => { response.set('Cache-Control', 'private, no-store'); response.set('ETag', etag); response.vary('Authorization'); },
    }).catch(next));
  }, async (request) => {
    const br = await request('/feed?user=a', {'Accept-Encoding': 'gzip, deflate, br'});
    assert.equal(br.status, 200);
    assert.equal(br.headers['content-encoding'], 'br');
    assert.match(br.headers['content-type'], /^application\/json/);
    assert.equal(br.headers.etag, 'W/"bdms-requests-a"');
    assert.equal(br.headers['cache-control'], 'private, no-store');
    assert.match(br.headers.vary, /Authorization/);
    assert.match(br.headers.vary, /Accept-Encoding/);
    assert.equal(Number(br.headers['content-length']), br.body.length);
    assert.deepEqual(JSON.parse(zlib.brotliDecompressSync(br.body).toString()), rows);
    assert.equal(Number(br.headers['x-payload-bytes']), Buffer.byteLength(JSON.stringify(rows)));

    const gzip = await request('/feed?user=b', {'Accept-Encoding': 'gzip'});
    assert.equal(gzip.headers['content-encoding'], 'gzip');
    assert.equal(gzip.headers.etag, 'W/"bdms-requests-b"', 'each caller keeps their own ETag');
    assert.deepEqual(JSON.parse(zlib.gunzipSync(gzip.body).toString()), rows);

    const plain = await request('/feed?user=c', {'Accept-Encoding': 'identity'});
    assert.equal(plain.headers['content-encoding'], undefined);
    assert.deepEqual(JSON.parse(plain.body.toString()), rows);

    const unchanged = await request('/feed?user=a', {'Accept-Encoding': 'br', 'If-None-Match': 'W/"bdms-requests-a"'});
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.body.length, 0);
    assert.equal(builds, 1, 'four callers, one serialisation');
  });
});

test('the request feed route shares bodies by role and site scope but never across them', async () => {
  const start = server.indexOf("app.get('/api/requests',requireSession");
  const route = server.slice(start, server.indexOf('\n});', start) + 4);
  assert.match(route, /if\(!ownRowsOnly&&etag&&typeof sendSharedFeedJson==='function'/, 'a user reading only their own rows is never given a shared body');
  assert.match(route, /variant:JSON\.stringify\(\[dashboardScope\?'dashboard':'workflow',req\.session\.role,req\.session\.assignedRole,scopedSite,scopedManagerSites\]\)/);
  assert.doesNotMatch(route.match(/variant:JSON\.stringify\(\[[^\]]+\]\)/)[0], /login/i, 'the variant holds no account identity');

  const feed = [{ref: 'REQ-A', site: 'Alpha'}, {ref: 'REQ-B', site: 'Beta'}];
  const responses = createSharedFeedResponses();
  const cache = createFeedCache();
  let reads = 0, serialised = 0;
  const users = {alpha1: 'Alpha', alpha2: 'Alpha', beta1: 'Beta'};
  let handler;
  const bindings = {
    app: {get(_path, _guard, run) { handler = run; }}, requireSession() {},
    pool: {query: async () => { reads += 1; return {rows: feed}; }},
    requestProjection: '*', dashboardRequestProjection: '*',
    requestFeedCache: cache, attachDailyRemarks: async rows => rows, requestsVisibleToSession: rows => rows,
    currentUserRecord: async session => ({site: users[session.login]}), userSiteScope: user => ({sites: [user.site]}),
    reportScopeIncludesSite: (scope, site) => scope.sites.includes(site),
    currentDataRevisions: async () => ({'request-feed': 7}),
    privateVersionEtag: (_namespace, _revisions, scope) => `W/"${scope.requesterLogin}"`,
    sendPrivateNotModified: () => false,
    setPrivateResponseHeaders: (res, etag) => { res.headers.ETag = etag; },
    sharedFeedResponses: responses,
    sendSharedFeedJson: async (_req, res, shared, options) => {
      const entry = shared.body(options.source, options.variant, () => { serialised += 1; return options.build(); });
      options.setHeaders(res, options.etag);
      res.payload = JSON.parse(entry.body.toString());
      return res;
    },
  };
  new Function(...Object.keys(bindings), route)(...Object.values(bindings));
  const read = async (session) => {
    const res = {headers: {}};
    await handler({query: {scope: 'dashboard'}, session}, res, (error) => { throw error; });
    return res;
  };
  const maintenance = (login) => ({role: 'normal', assignedRole: 'Maintenance User', login});
  const alpha1 = await read(maintenance('alpha1'));
  const alpha2 = await read(maintenance('alpha2'));
  const beta1 = await read(maintenance('beta1'));
  const admin = await read({role: 'super', login: 'admin', permissions: {readRequests: true}});
  assert.deepEqual(alpha1.payload, [{ref: 'REQ-A', site: 'Alpha'}]);
  assert.deepEqual(alpha2.payload, alpha1.payload);
  assert.deepEqual(beta1.payload, [{ref: 'REQ-B', site: 'Beta'}], 'another site never receives the first site\'s body');
  assert.deepEqual(admin.payload, feed);
  assert.deepEqual([alpha1.headers.ETag, alpha2.headers.ETag], ['W/"alpha1"', 'W/"alpha2"']);
  assert.equal(reads, 1, 'one database read');
  assert.equal(serialised, 3, 'two users of one site share a body; the other site and the administrator have their own');
});
