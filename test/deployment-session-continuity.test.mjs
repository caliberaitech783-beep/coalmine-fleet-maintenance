import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildSite, resolveAppVersion } from "../build-site.mjs";

const currentSha = "a".repeat(40);
const previousSha = "b".repeat(40);

test("application versions are stable for the same deployment source", async () => {
  assert.equal(await resolveAppVersion({ env: { GITHUB_SHA: currentSha } }), currentSha);
  assert.equal(await resolveAppVersion({ env: { GITHUB_SHA: currentSha } }), currentSha);
  assert.equal(
    await resolveAppVersion({ env: { GITHUB_SHA: currentSha, PREVIOUS_SHA: previousSha } }),
    previousSha,
    "the rollback package must identify the source it actually builds",
  );
});

test("source fallback is deterministic and ignores the generated version module", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "bdms-version-source-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(path.join(cwd, "src"), { recursive: true });
  await writeFile(path.join(cwd, "index.html"), "<main></main>");
  await writeFile(path.join(cwd, "package.json"), "{}");
  await writeFile(path.join(cwd, "src", "main.jsx"), "export default 'first';");
  await writeFile(path.join(cwd, "src", "app-version.js"), "export const APP_VERSION = 'old';");

  const first = await resolveAppVersion({ env: {}, cwd, gitHead: "" });
  await writeFile(path.join(cwd, "src", "app-version.js"), "export const APP_VERSION = 'generated';");
  assert.equal(await resolveAppVersion({ env: {}, cwd, gitHead: "" }), first);

  await writeFile(path.join(cwd, "src", "main.jsx"), "export default 'second';");
  assert.notEqual(await resolveAppVersion({ env: {}, cwd, gitHead: "" }), first);
});

test("building embeds the stable version without dirtying the tracked source module", async (t) => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "bdms-version-build-"));
  t.after(() => rm(cwd, { recursive: true, force: true }));
  await mkdir(path.join(cwd, "src"), { recursive: true });
  const versionModule = path.join(cwd, "src", "app-version.js");
  const original = "export const APP_VERSION = 'tracked-placeholder';\n";
  await writeFile(versionModule, original);
  let embeddedVersion = "";

  const builtVersion = await buildSite({
    cwd,
    env: { GITHUB_SHA: currentSha },
    buildClient: async () => {
      embeddedVersion = await readFile(versionModule, "utf8");
    },
  });

  assert.equal(builtVersion, currentSha);
  assert.match(embeddedVersion, new RegExp(currentSha));
  assert.equal(await readFile(versionModule, "utf8"), original);
  assert.equal(await readFile(path.join(cwd, "dist", "app-version.txt"), "utf8"), currentSha);
});

test("a UI version change preserves active sessions while password changes still revoke their user", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  const versionStart = server.indexOf("SELECT value FROM app_metadata WHERE key='ui_version' FOR UPDATE");
  const versionEnd = server.indexOf("const {rows:repairSeed}", versionStart);
  assert.ok(versionStart >= 0 && versionEnd > versionStart, "expected the UI version migration block");
  const versionMigration = server.slice(versionStart, versionEnd);

  assert.doesNotMatch(versionMigration, /DELETE FROM auth_sessions/);
  assert.match(versionMigration, /INSERT INTO app_metadata \(key,value,updated_at\)/);
  assert.match(server, /DELETE FROM auth_sessions WHERE lower\(login_name\)=\$1/);
  assert.match(server, /DELETE FROM auth_sessions WHERE lower\(login_name\)=lower\(\$1\)/);
});

test("user and privilege changes revoke only the affected accounts", async () => {
  const server = await readFile(new URL("../server.mjs", import.meta.url), "utf8");
  const revoker = server.slice(server.indexOf("async function revokeAuthorizationSessions"), server.indexOf("function maskedSecret"));
  const masterRoutes = server.slice(server.indexOf("app.post('/api/masters/:master'"), server.indexOf("app.use(express.static"));
  const postRoute = masterRoutes.slice(0, masterRoutes.indexOf("app.post('/api/masters/:master/:id/password'"));
  const equipmentPost = postRoute.slice(postRoute.indexOf("master==='Equipment master'"), postRoute.indexOf("master==='Privilege'"));
  const privilegeStart = postRoute.indexOf("master==='Privilege'");
  const privilegePost = postRoute.slice(privilegeStart, postRoute.indexOf("const saved=rows.map", privilegeStart));

  assert.match(revoker, /DELETE FROM auth_sessions WHERE lower\(login_name\)=ANY\(\$1::text\[\]\)/);
  assert.match(revoker, /DELETE FROM password_change_sessions AS pending[\s\S]*pending\.master_record_id=users\.id/);
  assert.match(masterRoutes, /prepared\.flatMap\(record=>userLoginCandidates\(record\)\).*revokeAuthorizationSessions\(client,affectedLogins\)/s);
  assert.match(privilegePost, /prepared\.map\(record=>String\(record\.username\|\|''\).*revokeAuthorizationSessions\(client,affectedLogins\)/s);
  assert.doesNotMatch(equipmentPost, /revokeAuthorizationSessions|record\.username/);
  assert.match(masterRoutes, /\.\.\.userLoginCandidates\(previousRecord\),\.\.\.userLoginCandidates\(storedRecord\).*revokeAuthorizationSessions\(client,affectedLogins\)/s);
  assert.match(masterRoutes, /userLoginCandidates\(deletedRecord\).*revokeAuthorizationSessions\(client,affectedLogins\)/s);
  assert.match(masterRoutes, /lower\(record_data->>'username'\) AS login.*revokeAuthorizationSessions\(client,affectedLogins\)/s);
  assert.ok((masterRoutes.match(/revokeAuthorizationSessions\(/g) || []).length >= 7);
  assert.doesNotMatch(masterRoutes, /DELETE FROM auth_sessions(?! WHERE)/);
});
