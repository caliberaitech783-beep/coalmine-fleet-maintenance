import test from "node:test";
import assert from "node:assert/strict";
import {access, readFile} from "node:fs/promises";
import {userGuideForRole, userGuideStorageKey, userGuideVideo, userGuidesForRoles} from "../src/help-training.mjs";

test("role users receive only their department guide", () => {
  assert.equal(userGuideForRole("Production User")?.english, "/user-guides/production-user-guide-english.mp4");
  assert.equal(userGuideForRole("Maintenance User")?.hindi, "/user-guides/maintenance-user-guide-hindi.mp4");
  assert.equal(userGuideForRole("MIS User")?.english, "/user-guides/mis-user-guide-english.mp4");
  assert.equal(userGuideForRole("Admin"), null);
});

test("language selection resolves the matching video", () => {
  const guide = userGuideForRole("Production User");
  assert.equal(userGuideVideo(guide, "en"), guide.english);
  assert.equal(userGuideVideo(guide, "hi"), guide.hindi);
  assert.equal(userGuideStorageKey(guide.role), "nerve-center:user-guide-seen:production-user");
});

test("department managers receive their manager guides", () => {
  assert.equal(userGuideForRole("Production Manager")?.english, "/user-guides/production-manager-guide-english.mp4");
  assert.equal(userGuideForRole("Maintenance Manager")?.hindi, "/user-guides/maintenance-manager-guide-hindi.mp4");
  assert.equal(userGuideForRole("MIS Manager")?.english, "/user-guides/mis-manager-guide-english.mp4");
  assert.equal(userGuideForRole("Project Manager"), null);
  assert.equal(userGuideForRole("Director"), null);
  assert.equal(userGuideForRole("Super Admin"), null);
});

test("multi-role managers receive each applicable guide once", () => {
  const guides = userGuidesForRoles(["Production Manager", "MIS Manager", "Production Manager"]);
  assert.deepEqual(guides.map((guide) => guide.role), ["Production Manager", "MIS Manager"]);
});

test("all deployed role guide videos exist", async () => {
  const paths = ["production", "maintenance", "mis"].flatMap((role) => [
    `public/user-guides/${role}-user-guide-english.mp4`,
    `public/user-guides/${role}-user-guide-hindi.mp4`,
    `public/user-guides/${role}-manager-guide-english.mp4`,
    `public/user-guides/${role}-manager-guide-hindi.mp4`,
  ]);
  await Promise.all(paths.map((path) => access(path)));
});

test("normal user header renders Help and Training", async () => {
  const source = await readFile("src/main.jsx", "utf8");
  assert.match(source, /<HelpTraining role=\{mobileRole\} \/>/);
});

test("operational user header displays the Help and Training control as an icon only", async () => {
  const styles = await readFile("src/help-training.css", "utf8");
  assert.match(styles, /\.normal>header \.help-training-trigger>span\{display:none\}/);
  assert.match(styles, /\.normal>header \.help-training-trigger\{width:39px;/);
});

test("manager header renders Help and Training only for manager accounts", async () => {
  const source = await readFile("src/main.jsx", "utf8");
  assert.match(source, /adminPermissions\.adminLevel === "Manager" && <HelpTraining roles=\{adminPermissions\.managerRoles\} \/>/);
});

