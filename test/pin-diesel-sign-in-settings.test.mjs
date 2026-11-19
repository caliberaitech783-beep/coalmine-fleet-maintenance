import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const secret = 'S'.repeat(43);
const setting = (name, value, slotSetting) => ({ name, value, slotSetting });
const both = pinned => [setting('DIESEL_SSO_CLIENT_SECRET', secret, pinned), setting('DIESEL_SSO_ENABLED', '1', pinned)];

// A stand-in Azure CLI: lists the given slot settings and records each write without its values.
function run({ production, staging }) {
  const dir = mkdtempSync(join(tmpdir(), 'pin-diesel-'));
  try {
    writeFileSync(join(dir, 'production.json'), JSON.stringify(production));
    writeFileSync(join(dir, 'staging.json'), JSON.stringify(staging));
    writeFileSync(join(dir, 'az'), `#!/usr/bin/env bash
slot=production; [[ " $* " == *" --slot staging "* ]] && slot=staging
if [[ "$*" == *"appsettings list"* ]]; then cat "${dir}/$slot.json"; exit 0; fi
if [[ "$*" == *"appsettings set"* ]]; then
  file="$(printf '%s\\n' "$@" | grep '^@' | cut -c2-)"
  echo "$slot $(jq -c 'keys' "$file") $([[ "$*" == *"--slot-settings"* ]] && echo pinned)" >> "${dir}/writes"; exit 0; fi
exit 1
`);
    writeFileSync(join(dir, 'curl'), '#!/usr/bin/env bash\necho \'{"status":"ok","database":"connected"}\'\n');
    chmodSync(join(dir, 'az'), 0o755);
    chmodSync(join(dir, 'curl'), 0o755);
    const result = spawnSync('bash', ['scripts/pin-diesel-sign-in-settings.sh'], { encoding: 'utf8', env: { ...process.env,
      PATH: dir + ':' + process.env.PATH, AZURE_RESOURCE_GROUP: 'rg', AZURE_WEBAPP_NAME: 'app', LIVE_URL: 'https://pulse.test' } });
    let writes = [];
    try { writes = readFileSync(join(dir, 'writes'), 'utf8').trim().split('\n'); } catch {}
    return { ...result, writes, output: result.stdout + result.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('Diesel sign-in settings are pinned on both slots without printing the secret', { skip: spawnSync('jq', ['--version']).status !== 0 }, () => {
  const pin = 'DIESEL_SSO_CLIENT_SECRET","DIESEL_SSO_ENABLED"] pinned';
  const unpinned = run({ production: both(false), staging: [] });
  assert.equal(unpinned.status, 0, unpinned.output);
  assert.deepEqual(unpinned.writes, ['staging ["' + pin, 'production ["' + pin]);
  assert.doesNotMatch(unpinned.output, new RegExp(secret));

  const swappedAway = run({ production: [], staging: both(false) });
  assert.equal(swappedAway.status, 0, swappedAway.output);
  assert.match(swappedAway.output, /held by the staging slot/);
  assert.equal(swappedAway.writes.length, 2);

  const settled = run({ production: both(true), staging: both(true) });
  assert.equal(settled.status, 0, settled.output);
  assert.deepEqual(settled.writes, [], 'a settled app is not written to or restarted');

  const stale = run({ production: both(true), staging: [setting('DIESEL_SSO_CLIENT_SECRET', 'x'.repeat(43), true), setting('DIESEL_SSO_ENABLED', '1', true)] });
  assert.deepEqual(stale.writes, ['staging ["' + pin]);

  const missing = run({ production: [], staging: [] });
  assert.equal(missing.status, 0);
  assert.match(missing.output, /nothing to pin/);
  assert.deepEqual(missing.writes, []);
});
