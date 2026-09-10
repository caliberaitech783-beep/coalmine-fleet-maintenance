import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const workflow = read('.github/workflows/production-release.yml');
const verifier = read('.github/scripts/verify-release.sh');

test('one canonical pipeline owns production; both old workflows are inert', () => {
  for (const file of ['azure-hosting_coalmine-fleet-azure-783.yml', 'fast-ui-deploy.yml']) {
    const retired = read(`.github/workflows/${file}`);
    assert.doesNotMatch(retired, /az webapp|id-token: write|\n  push:/);
    assert.match(retired, /production-release.yml/);
  }
  assert.match(workflow, /branches: \[azure-hosting-1.0\]/);
  assert.doesNotMatch(workflow, /^concurrency:/m);
  assert.match(workflow, /deploy:[\s\S]*concurrency:[\s\S]*group: coalmine-fleet-production/);
  assert.match(workflow, /queue: max\n      cancel-in-progress: false/);
});
test('all checks including isolated PostgreSQL run before the deployment lock', () => {
  const build = workflow.slice(workflow.indexOf('  build:'), workflow.indexOf('  deploy:'));
  assert.doesNotMatch(build, /concurrency:|id-token: write/);
  assert.match(build, /AUTH_SESSION_TEST_DATABASE_URL: postgresql:\/\/session_test/);
  assert.match(build, /image: postgres:16/);
  assert.match(build, /npm test/);
  assert.match(workflow, /github.event_name != 'pull_request'/);
  assert.match(workflow, /inputs.validate_only != true/);
});
test('after waiting, recheck production and reuse a verified live artifact rather than rebuilding a parent commit', () => {
  assert.equal((workflow.match(/node \.github\/scripts\/release-plan.mjs/g) || []).length, 2);
  assert.match(workflow, /rollback-artifact.mjs/);
  assert.match(workflow, /digest-mismatch: error/);
  assert.match(workflow, /unzip -p "\$rollback_path" DEPLOYMENT_SHA/);
  assert.match(workflow, /"\$PREVIOUS_SHA"/);
  assert.doesNotMatch(workflow, /git archive|github.event.before|Build previous-version/);
});
test('UI failures restore the actual previous live package and remain failures', () => {
  assert.match(workflow, /steps.ui.outcome == 'failure'/);
  assert.match(workflow, /--src-path "\$ROLLBACK_PACKAGE"/);
  assert.match(workflow, /verify-release.sh "\$LIVE_URL" "\$PREVIOUS_SHA" true/);
  assert.match(workflow, /Mark unsuccessful UI release/);
  assert.match(verifier, /h.commit!==process.env.EXPECTED_COMMIT/);
  assert.match(verifier, /h.scheduledJobsEnabled!==/);
  assert.match(verifier, /"\$\{url\}\$\{asset\}"/);
});
test('no second unconditional restart is inserted between staging deployment and verification', () => {
  const verification = workflow.slice(workflow.indexOf('      - name: Verify staging without'), workflow.indexOf('      - name: Swap staging'));
  assert.doesNotMatch(verification, /az webapp restart/);
  assert.match(verification, /scheduledJobsEnabled!==false/);
});
