import test from "node:test";
import assert from "node:assert/strict";
import {access, readFile} from "node:fs/promises";
import {userGuideForRole, userGuideStorageKey, userGuideVideo} from "../src/help-training.mjs";

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

test("all deployed role guide videos exist", async () => {
  const paths = ["production", "maintenance", "mis"].flatMap((role) => [
    `public/user-guides/${role}-user-guide-english.mp4`,
    `public/user-guides/${role}-user-guide-hindi.mp4`,
  ]);
  await Promise.all(paths.map((path) => access(path)));
});

test("normal user header renders Help and Training", async () => {
  const source = await readFile("src/main.jsx", "utf8");
  assert.match(source, /<HelpTraining role=\{mobileRole\} \/>/);
});

