import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/production-release.yml',import.meta.url),'utf8');
const planner=readFileSync(new URL('../.github/scripts/release-plan.mjs',import.meta.url),'utf8');

test('staging can disable every scheduled background job',()=>{
  assert.match(server,/DISABLE_SCHEDULED_JOBS/);
  assert.match(server,/if\(scheduledJobsEnabled\)\{[\s\S]*setInterval/);
  assert.match(server,/Scheduled background jobs are disabled for this deployment slot/);
});

test('health exposes the exact deployment commit and staging job state',()=>{
  assert.match(server,/DEPLOYMENT_SHA/);
  assert.match(server,/commit:deploymentSha,scheduledJobsEnabled/);
});

test('deployment validates staging, swaps, and automatically rolls back',()=>{
  assert.match(workflow,/az webapp deploy/);
  assert.match(workflow,/--slot staging/);
  assert.match(workflow,/--src-path packages\/current\/node-app\.zip/);
  assert.match(workflow,/for attempt in 1 2 3/);
  assert.match(workflow,/for health_attempt in \{1\.\.12\}/);
  assert.match(workflow,/deploy-recovery=\$\{DEPLOY_SHA\}/);
  assert.match(workflow,/staging verified the exact commit/);
  assert.match(workflow,/Staging ZIP deployment failed after/);
  assert.match(workflow,/scheduledJobsEnabled!==false/);
  assert.match(workflow,/deployment slot swap/);
  assert.match(workflow,/Production verification failed; restoring the previous production package/);
  assert.match(workflow,/scheduledJobsEnabled!==true/);
});

test('report-only deployments validate an immutable report delta and protect newer production changes',()=>{
  assert.ok(workflow.includes('ref: ${{ inputs.report_source_sha || github.sha }}'));
  assert.ok(planner.includes('shaPattern.test(env.REPORT_SOURCE_SHA)'));
  assert.ok(planner.includes("git('merge-base', '--is-ancestor', base, target)"));
  assert.ok(planner.includes("['department-reports.mjs', 'test/department-reports.test.mjs']"));
  assert.ok(planner.includes('Report-only release contains an unrelated file'));
  assert.ok(workflow.includes('npm test'));
  assert.ok(workflow.includes('APP_VERSION_SOURCE:'));
  assert.ok(workflow.includes('DEPLOY_SHA: ${{ needs.build.outputs.source_sha }}'));
  assert.ok(workflow.includes('readHealthyLive(process.env.LIVE_URL)!==process.env.PREVIOUS_SHA'));
  assert.ok(workflow.includes('refusing to replace newer changes'));
});

test('deployment restores and verifies Front Door-only origin access after every swap',()=>{
  assert.match(workflow,/Enforce Front Door-only production origin/);
  assert.match(workflow,/if: always\(\)/);
  assert.match(workflow,/AzureFrontDoor\.Backend/);
  assert.match(workflow,/x-azure-fdid/);
  assert.match(workflow,/direct origin returned \$\{origin_status\}/);
  assert.match(workflow,/\[ "\$origin_status" = "403" \]/);
});
