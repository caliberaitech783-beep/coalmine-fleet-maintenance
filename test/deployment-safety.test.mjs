import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const server=readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
const workflow=readFileSync(new URL('../.github/workflows/azure-hosting_coalmine-fleet-azure-783.yml',import.meta.url),'utf8');

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
  assert.match(workflow,/scheduledJobsEnabled!==false/);
  assert.match(workflow,/deployment slot swap/);
  assert.match(workflow,/Production verification failed; restoring the previous production package/);
  assert.match(workflow,/scheduledJobsEnabled!==true/);
});

test('deployment restores and verifies Front Door-only origin access after every swap',()=>{
  assert.match(workflow,/Enforce Front Door-only production origin/);
  assert.match(workflow,/if: always\(\)/);
  assert.match(workflow,/AzureFrontDoor\.Backend/);
  assert.match(workflow,/x-azure-fdid/);
  assert.match(workflow,/direct origin returned \$\{origin_status\}/);
  assert.match(workflow,/\[ "\$origin_status" = "403" \]/);
});
