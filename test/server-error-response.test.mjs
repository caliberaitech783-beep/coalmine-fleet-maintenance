import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  describeServerError,
  isTransientDatabaseError,
  serverErrorHandler,
  TRANSIENT_DATABASE_MESSAGE,
  UNEXPECTED_ERROR_MESSAGE,
} from '../server-error-response.mjs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

function fakeResponse() {
  const res = { headers: {}, statusCode: 0, body: undefined, headersSent: false };
  res.set = (name, value) => { res.headers[name] = value; return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

test('database connection drops are reported as a retryable 503, not a 500 "Server error"', () => {
  const cases = [
    Object.assign(new Error('Connection terminated unexpectedly'), {}),
    Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }),
    Object.assign(new Error('the database system is starting up'), { code: '57P03' }),
    Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
    Object.assign(new Error('timeout exceeded when trying to connect'), {}),
    Object.assign(new Error('sorry, too many clients already'), { code: '53300' }),
    Object.assign(new Error('could not serialize access due to concurrent update'), { code: '40001' }),
    Object.assign(new Error('connection failure'), { code: '08006' }),
  ];
  for (const error of cases) {
    assert.equal(isTransientDatabaseError(error), true, error.message);
    const described = describeServerError(error);
    assert.equal(described.status, 503, error.message);
    assert.equal(described.body.error, TRANSIENT_DATABASE_MESSAGE);
    assert.equal(described.body.transient, true);
    assert.equal(described.retryAfterSeconds, 5);
  }
});

test('query mistakes and unknown failures stay 500 with a message that tells the user what to do', () => {
  for (const error of [
    Object.assign(new Error('column "nope" does not exist'), { code: '42703' }),
    Object.assign(new Error('null value in column violates not-null constraint'), { code: '23502' }),
    new TypeError("Cannot read properties of undefined (reading 'site')"),
    null,
    'string failure',
  ]) {
    assert.equal(isTransientDatabaseError(error), false);
    const described = describeServerError(error);
    assert.equal(described.status, 500);
    assert.equal(described.body.error, UNEXPECTED_ERROR_MESSAGE);
    assert.notEqual(described.body.error, 'Server error');
  }
});

test('route errors that carry a 4xx status reach the client with their own message and code', () => {
  const conflict = Object.assign(new Error('This request no longer exists.'), { status: 409 });
  assert.deepEqual(describeServerError(conflict), { status: 409, body: { error: 'This request no longer exists.' } });
  const flagged = Object.assign(new Error('Raise a red flag first.'), { status: 409, code: 'ARRIVAL_RED_FLAG_REQUIRED' });
  assert.deepEqual(describeServerError(flagged), { status: 409, body: { error: 'Raise a red flag first.', code: 'ARRIVAL_RED_FLAG_REQUIRED' } });
  const forbidden = Object.assign(new Error('Outside your location.'), { statusCode: 403 });
  assert.equal(describeServerError(forbidden).status, 403);
});

test('body parser rejections keep their status but hide tokenizer internals', () => {
  const malformed = Object.assign(new SyntaxError('Unexpected token } in JSON at position 12'), { status: 400, type: 'entity.parse.failed', expose: true });
  const described = describeServerError(malformed);
  assert.equal(described.status, 400);
  assert.doesNotMatch(described.body.error, /Unexpected token/);
  const tooLarge = Object.assign(new Error('request entity too large'), { status: 413, type: 'entity.too.large' });
  assert.equal(describeServerError(tooLarge).status, 413);
  assert.match(describeServerError(tooLarge).body.error, /CSV is too large/);
});

test('the express handler writes Retry-After for transient failures and never double-sends', () => {
  const logged = [];
  const handler = serverErrorHandler({ log: (...args) => logged.push(args) });
  const res = fakeResponse();
  handler(Object.assign(new Error('Connection terminated'), {}), { method: 'GET', originalUrl: '/api/requests' }, res, () => {});
  assert.equal(res.statusCode, 503);
  assert.equal(res.headers['Retry-After'], '5');
  assert.equal(res.body.error, TRANSIENT_DATABASE_MESSAGE);
  assert.match(logged[0][0], /\[503\] GET \/api\/requests/);

  const sent = fakeResponse();
  sent.headersSent = true;
  handler(new Error('late failure'), { method: 'GET', url: '/api/x' }, sent, () => {});
  assert.equal(sent.statusCode, 0, 'must not write after headers were sent');
});

test('server.mjs uses the shared handler and survives idle pool errors and stray rejections', () => {
  assert.match(server, /import \{serverErrorHandler\} from '\.\/server-error-response\.mjs'/);
  assert.match(server, /app\.use\(serverErrorHandler\(\)\)/);
  assert.doesNotMatch(server, /res\.status\(500\)\.json\(\{error:'Server error'\}\)/);
  assert.match(server, /pool\.on\('error'/);
  assert.match(server, /process\.on\('unhandledRejection'/);
  assert.match(server, /app\.get\('\/api\/health'/);
});
