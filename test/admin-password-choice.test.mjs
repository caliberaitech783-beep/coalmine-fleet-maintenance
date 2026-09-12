import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {hashPassword, verifyPassword} from '../password-auth.mjs';

const server = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const sourceBetween = (start, end) => {
  const from = server.indexOf(start), to = server.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from);
  return server.slice(from, to);
};
const passwordRoute = sourceBetween("app.post('/api/masters/:master/:id/password',", "app.put('/api/masters/:master/:id',");
const loginRoute = sourceBetween("app.post('/api/login',", 'const passwordResetRequestMessage=');
const response = () => ({statusCode: 200, status(code) {this.statusCode = code; return this;}, json(body) {this.body = body; return this;}});

// Exercise the real route handlers with an isolated in-memory account. Never
// start the application server or change a real employee's credentials.
function harness({targetLevel = '', actorLevel = 'Admin', missing = false} = {}) {
  let user = {login: 'PASSWORD.TEST', employee: 'Password test', phone: '9900000000', adminLevel: targetLevel, passwordHash: hashPassword('original'), mustChangePassword: false};
  const queries = [], sessions = [], handlers = new Map();
  const requireSuper = Symbol('requireSuper');
  let released = 0;
  const query = async (sql, values = []) => {
    queries.push({sql, values});
    if (sql.includes('SELECT record_data FROM master_records')) return {rows: missing ? [] : [{record_data: user}]};
    if (sql.includes('SELECT id,record_data FROM master_records')) return {rows: [{id: 37, record_data: user}]};
    if (sql.startsWith('UPDATE master_records SET record_data=')) user = JSON.parse(values[0]);
    return {rows: [], rowCount: 1};
  };
  const context = {
    app: {post(path, ...callbacks) {handlers.set(path, callbacks);}},
    pool: {query, async connect() {return {query, release() {released++;}};}},
    requireSuper, hashPassword, verifyPassword,
    isTrueSuperAdmin: record => record?.adminLevel === 'Super Admin',
    userLoginCandidates: record => [record.login.toLowerCase()],
    loginRecordCandidates: (rows, username) => rows.filter(row => row.record_data.login.toLowerCase() === username),
    privilegeForUser: () => ({}),
    resolveMobileAccess: () => ({sessionRole: 'super', userType: 'Super User', permissions: {adminLevel: 'Admin'}}),
    ADMIN_LOCK_POLICY_PAUSED: true,
    randomUUID: () => 'isolated-login-token',
    sessionStore: {async create(session) {sessions.push(session);}},
    loginPayload: ({token}) => ({token}),
  };
  runInNewContext(passwordRoute + '\n' + loginRoute, context);
  assert.equal(handlers.get('/api/masters/:master/:id/password')[0], requireSuper, 'admin authorization stays on the route');
  return {
    queries, sessions,
    get user() {return user;},
    get released() {return released;},
    async change(body) {
      const req = {params: {master: 'Users & employees', id: '37'}, session: {permissions: {adminLevel: actorLevel}}, body};
      const res = response();
      await handlers.get('/api/masters/:master/:id/password').at(-1)(req, res, error => {throw error;});
      return {req, res};
    },
    async login(password) {
      const res = response();
      await handlers.get('/api/login')[0]({body: {username: 'PASSWORD.TEST', password}}, res, error => {throw error;});
      return res;
    },
  };
}

test('administrator can set short, phone-number and literal-space passwords and sign in with each', async () => {
  for (const password of ['1', '9900000000', 'abc', '  exact password  ', ' ']) {
    const app = harness();
    const {req, res} = await app.change({password, confirmation: password, requireChange: false});
    assert.equal(res.statusCode, 200);
    assert.notEqual(app.user.passwordHash, password);
    assert.ok(verifyPassword(password, app.user.passwordHash));
    assert.equal(app.user.mustChangePassword, false);
    assert.equal((await app.login(password)).statusCode, 200);
    assert.equal(app.sessions.length, 1);
    assert.ok(app.queries.some(({sql}) => sql.startsWith('DELETE FROM auth_sessions')));
    assert.ok(app.queries.some(({sql}) => sql.startsWith('UPDATE password_reset_sessions SET used_at')));
    assert.ok(app.queries.some(({sql}) => sql.startsWith('DELETE FROM password_change_sessions')));
    assert.ok(app.queries.some(({sql}) => sql === 'COMMIT'));
    assert.equal(app.released, 1);
    assert.equal(req.audit.changedFields[0].after, '[protected]');
    assert.equal(req.audit.changedFields[0].before, '[protected]');
  }
});

test('empty and mismatched passwords are rejected without changing the account', async () => {
  for (const body of [{}, {password: '', confirmation: ''}, {password: '1', confirmation: '2'}, {password: '1'}]) {
    const app = harness(), originalHash = app.user.passwordHash;
    const {res} = await app.change(body);
    assert.equal(res.statusCode, 400);
    assert.equal(app.user.passwordHash, originalHash);
    assert.ok(app.queries.some(({sql}) => sql === 'ROLLBACK'));
    assert.ok(!app.queries.some(({sql}) => sql.startsWith('UPDATE master_records')));
    assert.equal(app.released, 1);
  }
});

test('wrong passwords still fail and exact leading/trailing spaces are significant', async () => {
  const app = harness();
  await app.change({password: '  a  ', confirmation: '  a  ', requireChange: false});
  assert.equal((await app.login('a')).statusCode, 401);
  assert.equal((await app.login('wrong')).statusCode, 401);
  assert.equal((await app.login('')).statusCode, 400);
  assert.equal(app.sessions.length, 0);
});

test('the administrator controls mandatory next-login change, with the checkbox default preserved', async () => {
  const app = harness();
  await app.change({password: '9900000000', confirmation: '9900000000'});
  assert.equal(app.user.mustChangePassword, true);
  const res = await app.login('9900000000');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.requiresPasswordChange, true);
  assert.equal(app.sessions.length, 0);
});

test('Super Admin protection and missing-account handling remain enforced', async () => {
  const body = {password: '1', confirmation: '1', requireChange: false};
  const restricted = harness({targetLevel: 'Super Admin'});
  assert.equal((await restricted.change(body)).res.statusCode, 403);
  assert.ok(!restricted.queries.some(({sql}) => sql.startsWith('UPDATE master_records')));
  assert.equal((await harness({targetLevel: 'Super Admin', actorLevel: 'Super Admin'}).change(body)).res.statusCode, 200);
  assert.equal((await harness({missing: true}).change(body)).res.statusCode, 404);
});

test('admin password fields require confirmation without browser minimum-length rules', () => {
  const ui = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  const form = ui.slice(ui.indexOf('<form className="form employee-password-form"'), ui.indexOf('</form>', ui.indexOf('<form className="form employee-password-form"')));
  assert.doesNotMatch(form, /minLength|maxLength|pattern=/);
  assert.match(form, /name="password"[^>]+required/);
  assert.match(form, /name="confirmation"[^>]+required/);
  assert.match(form, /registered phone number/);
  assert.match(form, /name="requireChange"[^>]+defaultChecked/);
  assert.match(ui, /disabled=\{working \|\| !username\.trim\(\) \|\| !password\}/);
});
