import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runtimeSourceFiles } from './runtime-source.mjs';

export const productionBranch = 'azure-hosting-1.0';
const shaPattern = /^[0-9a-f]{40}$/;

// Unknown files deliberately take the staged backend lane. Never classify just
// the last pushed commit: a pending backend change may precede a UI change.
export function classifyChanges(files, runtimeFiles = new Set()) {
  let mode = 'none';
  for (const file of files) {
    // Packaging changes alter the deployed runtime even if application source
    // did not change, so validate them through staging (including first cutover).
    if (file === '.github/scripts/package-runtime.mjs') return 'backend';
    if (runtimeFiles.has(file)) return 'backend';
    if (/^(test\/|docs\/|\.github\/)/.test(file) || /^(README\.md|PROJECT_WORKFLOW\.md|AGENTS\.md|\.gitignore)$/.test(file)) continue;
    if (/^(src\/|public\/|index\.html$)/.test(file)) {
      if (mode === 'none') mode = 'ui';
    } else return 'backend';
  }
  return mode;
}

export function decideRelease({ target, live, head, ancestor, files, runtimeFiles, force = false }) {
  for (const sha of [target, live, head]) if (!shaPattern.test(sha || '')) throw new Error('Missing or invalid release identity; refusing deployment.');
  if (target === live && !force) return { mode: 'none', reason: 'Already live' };
  if (target !== live && ancestor(target, live)) return { mode: 'none', reason: 'Production already contains this release' };
  if (!ancestor(live, target)) throw new Error('Candidate does not include current production; refusing to overwrite parallel changes.');
  if (target !== head) {
    if (ancestor(target, head)) return { mode: 'none', reason: 'Superseded by a newer cumulative production-branch revision' };
    throw new Error('Candidate is not on the production branch.');
  }
  const mode = force ? 'backend' : classifyChanges(files, runtimeFiles);
  return { mode, reason: mode === 'none' ? 'No application changes since live production' : `${mode} changes since live production` };
}

function git(...args) { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
export function isAncestor(base, target) {
  try { git('merge-base', '--is-ancestor', base, target); return true; }
  catch (error) { if (error.status === 1) return false; throw error; }
}

export async function readHealthyLive(url, fetcher = fetch) {
  const response = await fetcher(`${url}/api/health?release-check=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Production health unavailable (${response.status}); no deployment attempted.`);
  const health = await response.json();
  if (health.status !== 'ok' || health.database !== 'connected' || health.scheduledJobsEnabled !== true || !shaPattern.test(health.commit || '')) {
    throw new Error('Production must have a healthy, identifiable baseline before release.');
  }
  return health.commit;
}

export function validateReportDelta(files) {
  if (!files.length || files.some(file => !['department-reports.mjs', 'test/department-reports.test.mjs'].includes(file))) {
    throw new Error('Report-only release contains an unrelated file or no changes.');
  }
}

export async function resolvePlan(env = process.env) {
  const target = git('rev-parse', 'HEAD');
  if (env.GITHUB_EVENT_NAME === 'pull_request') return { mode: 'check', reason: 'Pull request: checks only', target, live: '' };
  if (env.GITHUB_REF !== `refs/heads/${productionBranch}`) throw new Error('Only the canonical production branch may release.');
  if (env.REPORT_SOURCE_SHA && (!shaPattern.test(env.REPORT_SOURCE_SHA) || env.REPORT_SOURCE_SHA !== target)) throw new Error('Invalid immutable report source.');
  git('fetch', '--no-tags', 'origin', `+refs/heads/${productionBranch}:refs/remotes/origin/${productionBranch}`);
  const head = git('rev-parse', `refs/remotes/origin/${productionBranch}`);
  const live = await readHealthyLive(env.LIVE_URL);
  // A legacy release may reference a commit not fetched with the main branch.
  try { git('cat-file', '-e', `${live}^{commit}`); }
  catch { git('fetch', '--no-tags', 'origin', live); }
  const files = git('diff', '--name-only', '--no-renames', live, target).split('\n').filter(Boolean);
  const plan = decideRelease({ target, live, head, ancestor: isAncestor, files, runtimeFiles: runtimeSourceFiles(process.cwd()), force: env.FORCE_DEPLOY === 'true' });
  if (env.REPORT_SOURCE_SHA && plan.mode !== 'none') validateReportDelta(files);
  return { ...plan, target, live, changedFiles: files.length };
}

export function writeOutputs(values, env = process.env) {
  for (const [key, value] of Object.entries(values)) {
    if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const plan = await resolvePlan();
    writeOutputs(plan);
    console.log(JSON.stringify(plan));
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Release decision\n\n${plan.reason}\n\nCandidate: \`${plan.target}\`\n\nLive baseline: \`${plan.live || 'not used for pull requests'}\`\n\n`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
