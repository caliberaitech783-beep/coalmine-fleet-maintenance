import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const access = readFileSync(new URL("../admin-access.mjs", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/meta-whatsapp-setup.css", import.meta.url), "utf8");

test("Meta API setup is an administrator-only WhatsApp workspace", () => {
  assert.match(source, /\["Meta API setup", Settings\]/);
  assert.match(source, /name !== "Meta API setup" \|\| permissions\.adminLevel !== "Manager"/);
  assert.match(source, /active === "Meta API setup"[\s\S]*<MetaWhatsAppSetup \/>/);
  assert.match(access, /options: \["Meta API setup", "Daily site-wise report"/);
});

test("Meta setup masks tokens and saves credentials through protected APIs", () => {
  assert.match(source, /type="password" autoComplete="new-password"/);
  assert.match(source, /settings\.accessTokenPreview/);
  assert.doesNotMatch(source, /EA[A-Za-z0-9]{20,}/);
  assert.match(source, /fetch\("\/api\/whatsapp\/settings"[\s\S]*method:"PUT"/);
  assert.match(server, /app\.put\('\/api\/whatsapp\/settings',requireSuper,requireWhatsAppAdministrator/);
  assert.match(server, /await metaWhatsAppStatus\(\{env:candidateEnv\}\)/);
  assert.match(server, /submitMetaWhatsAppTemplates\(\{env:candidateEnv\}\)/);
});

test("Meta setup reports recipient phone coverage and remains responsive", () => {
  assert.match(source, /Recipients ready/);
  assert.match(source, /Mobile missing/);
  assert.match(css, /\.meta-whatsapp-overview\s*\{[\s\S]*grid-template-columns/);
  assert.match(css, /@media \(max-width: 760px\)/);
});
