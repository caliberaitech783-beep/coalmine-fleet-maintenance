import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyChanges, decideRelease, readHealthyLive, validateReportDelta } from '../.github/scripts/release-plan.mjs';
import { eligibleArtifact, findRollbackArtifact } from '../.github/scripts/rollback-artifact.mjs';
import { includedRuntimePath, prepareRuntimePackage } from '../.github/scripts/package-runtime.mjs';
import { runtimeSourceFiles } from '../.github/scripts/runtime-source.mjs';

const commits = Array.from({ length: 7 }, (_, i) => String(i + 1).repeat(40));
const [base, one, two, three, four, five] = commits;
const ancestor = (a, b) => commits.indexOf(a) <= commits.indexOf(b);
const plan = overrides => decideRelease({ target: five, live: base, head: five, ancestor, files: ['src/main.jsx'], ...overrides });

test('all five merged changes ship as a cumulative revision; not just the fifth diff', () => {
  assert.equal(plan({ files: ['src/style.css', 'server.mjs', 'src/main.jsx', 'public/icon.png', 'test/demo.test.mjs'] }).mode, 'backend');
  assert.equal(plan({ live: four }).mode, 'ui');
});
test('outdated releases skip rather than overwrite already-live changes', () => {
  assert.equal(plan({ target: two, live: three }).mode, 'none');
  assert.equal(plan({ target: five, live: five }).mode, 'none');
  assert.equal(plan({ target: four }).mode, 'none');
});
test('divergent history and missing identities fail closed', () => {
  assert.throws(() => plan({ ancestor: () => false }), /does not include/);
  for (const key of ['target', 'live', 'head']) assert.throws(() => plan({ [key]: '' }), /identity/);
});
test('queued backend changes cannot be misclassified by a newer UI or documentation commit', () => {
  assert.equal(plan({ files: ['server.mjs', 'src/style.css'] }).mode, 'backend');
  assert.equal(plan({ files: ['server.mjs', 'README.md'] }).mode, 'backend');
  assert.equal(plan({ files: ['.github/workflows/production-release.yml', 'docs/releases.md'] }).mode, 'none');
});
test('file classification is conservative for dependencies, build tools, assets and unknown runtime files', () => {
  assert.equal(classifyChanges(['src/main.jsx', 'public/icon.png', 'index.html']), 'ui');
  assert.equal(classifyChanges(['test/example.test.mjs', 'README.md', '.github/scripts/release-plan.mjs']), 'none');
  assert.equal(classifyChanges(['.github/scripts/package-runtime.mjs']), 'backend');
  for (const file of ['package-lock.json', 'build-site.mjs', 'assets/fonts/font.ttf', 'new-server.js', 'scripts/new-task.mjs']) assert.equal(classifyChanges([file]), 'backend');
  assert.equal(plan({ files: [], force: true }).mode, 'backend');
  assert.equal(plan({ target: two, live: three, force: true }).mode, 'none');
});
test('report-only releases keep the narrow immutable-delta boundary', () => {
  validateReportDelta(['department-reports.mjs', 'test/department-reports.test.mjs']);
  assert.throws(() => validateReportDelta(['department-reports.mjs', 'server.mjs']), /unrelated/);
  assert.throws(() => validateReportDelta([]), /no changes/);
});
test('shared server imports under src take the backend lane and remain in runtime packages', () => {
  const runtimeFiles = runtimeSourceFiles(fileURLToPath(new URL('..', import.meta.url)));
  assert.ok(runtimeFiles.has('src/request-status.mjs'));
  assert.ok(runtimeFiles.has('src/mis-history.mjs'));
  assert.equal(classifyChanges(['src/request-status.mjs'], runtimeFiles), 'backend');
  assert.equal(classifyChanges(['src/main.jsx'], runtimeFiles), 'ui');
});
test('live baseline requires database, scheduler state and exact identity', async () => {
  const healthy = { status: 'ok', database: 'connected', scheduledJobsEnabled: true, commit: base };
  const fetcher = health => async () => ({ ok: true, json: async () => health });
  assert.equal(await readHealthyLive('https://example.test', fetcher(healthy)), base);
  for (const change of [{ database: 'offline' }, { status: 'error' }, { scheduledJobsEnabled: false }, { commit: '' }]) {
    await assert.rejects(readHealthyLive('https://example.test', fetcher({ ...healthy, ...change })), /baseline/);
  }
  await assert.rejects(readHealthyLive('https://example.test', async () => ({ ok: false, status: 503 })), /503/);
});

const artifact = { id: 10, name: `bdms-release-${base}`, expired: false, workflow_run: { id: 20, head_sha: base } };
const successfulRun = { id: 20, head_sha: base, status: 'completed', conclusion: 'success', event: 'push', head_branch: 'azure-hosting-1.0', path: '.github/workflows/production-release.yml' };
test('rollback is a retained successful production-source artifact, not an arbitrary previous commit', () => {
  assert.equal(eligibleArtifact(artifact, successfulRun, base), true);
  for (const update of [{ conclusion: 'failure' }, { status: 'in_progress' }, { event: 'pull_request' }, { head_branch: 'feature/test' }, { path: 'other.yml' }, { head_sha: one }]) assert.equal(eligibleArtifact(artifact, { ...successfulRun, ...update }, base), false);
  assert.equal(eligibleArtifact({ ...artifact, expired: true }, successfulRun, base), false);
});
test('missing or inaccessible rollback cannot silently allow an unprotected UI deployment', async () => {
  const env = { LIVE_SHA: base, GITHUB_REPOSITORY: 'example/repo', GH_TOKEN: 'test' };
  const none = await findRollbackArtifact(env, async () => ({ ok: true, json: async () => ({ artifacts: [] }) }));
  assert.equal(none.mode, 'backend');
  const retained = await findRollbackArtifact(env, async url => ({ ok: true, json: async () => url.includes('/artifacts?') ? { artifacts: [artifact] } : successfulRun }));
  assert.deepEqual(retained, { mode: 'ui', artifact_id: 10, run_id: 20 });
  await assert.rejects(findRollbackArtifact(env, async () => ({ ok: false, status: 403 })), /403/);
});
test('package includes application and report assets but excludes source UI, tests and local secrets', t => {
  const root = mkdtempSync(path.join(tmpdir(), 'bdms-package-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const files = ['server.mjs', 'src/shared.mjs', 'package.json', 'package-lock.json', 'DEPLOYMENT_SHA', 'dist/index.html', 'dist/app-version.txt', 'dist/.openai/hosting.json', 'node_modules/example/index.js', 'assets/fonts/font.ttf', 'src/main.jsx', '.env', '.github/workflows/test.yml', 'test/example.mjs'];
  for (const file of files) { mkdirSync(path.dirname(path.join(source, file)), { recursive: true }); writeFileSync(path.join(source, file), file); }
  writeFileSync(path.join(source, 'server.mjs'), 'import "./src/shared.mjs";');
  const destination = path.join(root, 'runtime');
  prepareRuntimePackage({ cwd: source, destination, tracked: files });
  for (const file of ['server.mjs', 'src/shared.mjs', 'assets/fonts/font.ttf', 'dist/index.html', 'node_modules/example/index.js', 'DEPLOYMENT_SHA']) assert.ok(existsSync(path.join(destination, file)));
  for (const file of ['.env', 'src/main.jsx', '.github', 'test', 'dist/.openai']) assert.equal(existsSync(path.join(destination, file)), false);
  assert.throws(() => prepareRuntimePackage({ cwd: source, destination, tracked: files }), /already exist/);
  assert.equal(includedRuntimePath('.env.production'), false);
  assert.equal(includedRuntimePath('server.mjs'), true);
});
test('real Git history with five contributors enforces ordering and preserves a backend delta', t => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'bdms-five-contributors-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init'); git('config', 'user.name', 'Release Test'); git('config', 'user.email', 'release-test@example.invalid');
  git('commit', '--allow-empty', '-m', 'live baseline'); const live = git('rev-parse', 'HEAD');
  const history = [];
  for (let person = 1; person <= 5; person++) {
    const file = person === 2 ? 'server.mjs' : `src/person-${person}.js`;
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true }); writeFileSync(path.join(cwd, file), `change ${person}`);
    git('add', '.'); git('commit', '-m', `Contributor ${person}`); history.push(git('rev-parse', 'HEAD'));
  }
  const realAncestor = (a, b) => { try { git('merge-base', '--is-ancestor', a, b); return true; } catch { return false; } };
  const target = history[4];
  const files = git('diff', '--name-only', live, target).split('\n');
  assert.equal(files.length, 5);
  assert.equal(decideRelease({ target, live, head: target, ancestor: realAncestor, files }).mode, 'backend');
  assert.equal(decideRelease({ target: history[2], live: history[3], head: target, ancestor: realAncestor, files }).mode, 'none');
});
