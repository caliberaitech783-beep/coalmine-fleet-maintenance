import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { telegramConfiguration, telegramPurposeEnabled, telegramPlainText, sendTelegramText, sendTelegramDocument, telegramStatus } from "../telegram.mjs";
import { normalizeWhatsAppReportSettings } from "../whatsapp-report-settings.mjs";

const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const env = { TELEGRAM_BOT_TOKEN: "123:secret-token", TELEGRAM_DEFAULT_CHAT_ID: "-5550689740" };

function recordingFetch(result = { message_id: 7 }) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, json: async () => ({ ok: true, result }) };
  };
  return { calls, fetchImpl };
}

test("Telegram needs both a bot token and a numeric chat id", () => {
  assert.equal(telegramConfiguration({}).configured, false);
  assert.equal(telegramConfiguration({ TELEGRAM_BOT_TOKEN: "x" }).configured, false);
  assert.equal(telegramConfiguration({ ...env, TELEGRAM_DEFAULT_CHAT_ID: "group" }).configured, false);
  assert.equal(telegramConfiguration(env).configured, true);
  assert.equal(telegramConfiguration({ ...env, TELEGRAM_DELIVERY_PAUSED: "true" }).paused, true);
});

test("Telegram text is sent as plain text to the configured group", async () => {
  const { calls, fetchImpl } = recordingFetch();
  const result = await sendTelegramText({ message: "*SITE: Sasti II*\nBreakdown opened" }, { env, fetchImpl });
  assert.equal(result.sent, true);
  assert.equal(calls[0].url, "https://api.telegram.org/bot123:secret-token/sendMessage");
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.chat_id, "-5550689740");
  assert.equal(body.text, "SITE: Sasti II\nBreakdown opened");
  assert.equal(body.parse_mode, undefined);
});

test("Telegram documents upload a PDF with a caption", async () => {
  const { calls, fetchImpl } = recordingFetch();
  await sendTelegramDocument({ buffer: Buffer.from("%PDF"), filename: "a/b.pdf", caption: "Report" }, { env, fetchImpl });
  assert.match(calls[0].url, /\/sendDocument$/);
  const form = calls[0].options.body;
  assert.equal(form.get("chat_id"), "-5550689740");
  assert.equal(form.get("caption"), "Report");
  assert.equal(form.get("document").name, "a-b.pdf");
});

test("Telegram errors never expose the bot token", async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ ok: false, description: "Bad Request: chat not found" }) });
  await assert.rejects(sendTelegramText({ message: "hi" }, { env, fetchImpl }), (error) => {
    assert.match(error.message, /chat not found/);
    assert.doesNotMatch(error.message, /secret-token/);
    return true;
  });
});

test("Telegram skips unconfigured, paused and private deliveries without calling the API", async () => {
  const { calls, fetchImpl } = recordingFetch();
  await assert.rejects(sendTelegramText({ message: "hi" }, { env: {}, fetchImpl }), { code: "TELEGRAM_NOT_CONFIGURED" });
  await assert.rejects(sendTelegramText({ message: "hi" }, { env: { ...env, TELEGRAM_DELIVERY_PAUSED: "on" }, fetchImpl }), { code: "TELEGRAM_POLICY_PAUSED" });
  await assert.rejects(sendTelegramText({ message: "123456", purpose: "passwordResetOtp" }, { env, fetchImpl }), { code: "TELEGRAM_POLICY_PAUSED" });
  assert.equal(calls.length, 0);
});

test("Telegram follows per-event report settings but not the global WhatsApp switch", () => {
  const settings = normalizeWhatsAppReportSettings();
  assert.equal(telegramPurposeEnabled({ ...settings, enabled: false }, "requestClosed"), true);
  assert.equal(telegramPurposeEnabled(settings, "passwordResetOtp"), false);
  assert.equal(telegramPlainText("*a* and *b*"), "a and b");
});

test("Telegram status reports the bot and group names", async () => {
  const fetchImpl = async (url) => ({ ok: true, status: 200, json: async () => ({ ok: true, result: url.endsWith("/getMe") ? { username: "CALIBERBDMSBOT" } : { title: "CMLL Fleet Alerts" } }) });
  assert.deepEqual(await telegramStatus({ env, fetchImpl }), { configured: true, connected: true, paused: false, botUsername: "CALIBERBDMSBOT", chatTitle: "CMLL Fleet Alerts", chatId: "-5550689740" });
  assert.deepEqual(await telegramStatus({ env: {}, fetchImpl }), { configured: false, connected: false, paused: false });
});

test("Server mirrors each alert once to the Telegram group", () => {
  assert.match(server, /if\(telegram\)mirrorToTelegramGroup\(/);
  assert.match(server, /purpose,telegram:false\}\);/);
  assert.match(server, /\[idle\?'idle_repeat':'offroad_escalation',request\.ref,TELEGRAM_GROUP_LOGIN,slotKey\]/);
  assert.match(server, /app\.post\('\/api\/telegram\/test',requireSuper,requireWhatsAppAdministrator/);
  assert.match(server, /app\.get\('\/api\/telegram\/status',requireSuper,requireWhatsAppAdministrator/);
});

test("WhatsApp setup page offers a Telegram test button", () => {
  assert.match(source, /Telegram group alerts/);
  assert.match(source, /fetch\("\/api\/telegram\/test", \{method:"POST"/);
  assert.match(source, /Send Telegram test/);
});
