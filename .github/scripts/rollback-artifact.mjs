import { pathToFileURL } from 'node:url';
import { writeOutputs } from './release-plan.mjs';

export function eligibleArtifact(artifact, run, live) {
  return !artifact.expired && artifact.workflow_run?.head_sha === live && run.head_sha === live
    && run.status === 'completed' && run.conclusion === 'success'
    && ['push', 'workflow_dispatch'].includes(run.event)
    && ['azure-hosting-1.0', 'azure-hosting'].includes(run.head_branch)
    && ['.github/workflows/production-release.yml', '.github/workflows/fast-ui-deploy.yml', '.github/workflows/azure-hosting_coalmine-fleet-azure-783.yml'].includes(run.path);
}

export function hasVerifiedPromotion(jobs) {
  const steps = new Set([
    'Publish and verify UI package',
    'Swap staging into production with automatic rollback',
    'Deploy complete UI package and health-check production',
  ]);
  return jobs.some(job => job.status === 'completed' && job.conclusion === 'success'
    && job.steps?.some(step => steps.has(step.name) && step.status === 'completed' && step.conclusion === 'success'));
}

export async function findRollbackArtifact(env = process.env, fetcher = fetch) {
  if (!/^[0-9a-f]{40}$/.test(env.LIVE_SHA || '')) throw new Error('Invalid rollback identity.');
  const api = `${env.GITHUB_API_URL || 'https://api.github.com'}/repos/${env.GITHUB_REPOSITORY}`;
  const get = async suffix => {
    const response = await fetcher(`${api}${suffix}`, {
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`Artifact metadata unavailable (${response.status})`);
    return response.json();
  };
  for (const prefix of ['bdms-release', 'fast-ui-current', 'node-app']) {
    const name = `${prefix}-${env.LIVE_SHA}`;
    const { artifacts = [] } = await get(`/actions/artifacts?name=${encodeURIComponent(name)}&per_page=100`);
    for (const artifact of artifacts) {
      if (artifact.name !== name || artifact.expired || artifact.workflow_run?.head_sha !== env.LIVE_SHA) continue;
      const run = await get(`/actions/runs/${artifact.workflow_run.id}`);
      if (!eligibleArtifact(artifact, run, env.LIVE_SHA)) continue;
      const { jobs = [] } = await get(`/actions/runs/${run.id}/jobs?per_page=100`);
      // A validation-only or superseded run can succeed for this exact SHA
      // without ever publishing its artifact. Reuse only an actual promotion.
      if (hasVerifiedPromotion(jobs)) return { mode: 'ui', artifact_id: artifact.id, run_id: run.id };
    }
  }
  return { mode: 'backend', reason: 'No retained successful live artifact; use staging and slot rollback instead.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = await findRollbackArtifact(); writeOutputs(result); console.log(JSON.stringify(result)); }
  catch (error) {
    // Missing artifact access must never permit a direct deployment with no rollback.
    console.log(`${error.message}; falling back to staging.`);
    writeOutputs({ mode: 'backend' });
  }
}
