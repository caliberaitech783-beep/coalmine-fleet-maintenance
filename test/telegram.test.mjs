import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { telegramConfiguration, telegramPurposeEnabled, telegramPlainText, sendTelegramText, sendTelegramDocument, telegramStatus, telegramWebhookSecret, newTelegramLinkToken, parseTelegramUpdate, ensureTelegramWebhook } from "../telegram.mjs";
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
  assert.ok(server.includes("if(telegramGroup)mirrorToTelegramGroup("));
  assert.ok(server.includes("purpose,telegramGroup:false,telegramMessage:reminderText});"));
  assert.ok(server.includes("[idle?'idle_repeat':'offroad_escalation',request.ref,TELEGRAM_GROUP_LOGIN,slotKey]"));
  assert.ok(server.includes("app.post('/api/telegram/test',requireSuper,requireWhatsAppAdministrator"));
  assert.ok(server.includes("app.get('/api/telegram/status',requireSuper,requireWhatsAppAdministrator"));
});

test("WhatsApp setup page offers a Telegram test button", () => {
  assert.ok(source.includes("Telegram group alerts"));
  assert.ok(source.includes('fetch("/api/telegram/test", {method:"POST"'));
  assert.ok(source.includes("Send Telegram test"));
});

test("Link tokens fit Telegram's start parameter and the webhook secret is stable", () => {
  const token = newTelegramLinkToken();
  assert.match(token, /^[A-Za-z0-9_-]{24}$/);
  assert.notEqual(token, newTelegramLinkToken());
  assert.equal(telegramWebhookSecret(env), telegramWebhookSecret(env));
  assert.match(telegramWebhookSecret(env), /^[a-f0-9]{48}$/);
  assert.equal(telegramWebhookSecret({}), "");
  assert.doesNotMatch(telegramWebhookSecret(env), /secret-token/);
});

test("Webhook updates are parsed for private start, stop and block events only", () => {
  const privateMessage = (text) => ({ message: { chat: { id: 42, type: "private" }, from: { username: "anoop" }, text } });
  assert.deepEqual(parseTelegramUpdate(privateMessage("/start abcdefghijklmnopqrstuvwx")), { kind: "start", chatId: "42", token: "abcdefghijklmnopqrstuvwx", username: "anoop" });
  assert.equal(parseTelegramUpdate(privateMessage("/start")).token, "");
  assert.equal(parseTelegramUpdate(privateMessage("/start bad token!")).token, "");
  assert.equal(parseTelegramUpdate(privateMessage("/stop")).kind, "stop");
  assert.equal(parseTelegramUpdate(privateMessage("hello")).kind, "text");
  assert.equal(parseTelegramUpdate({ message: { chat: { id: -5, type: "group" }, text: "/start abcdefghijklmnopqrstuvwx" } }).kind, "ignored");
  assert.deepEqual(parseTelegramUpdate({ my_chat_member: { chat: { id: 42, type: "private" }, new_chat_member: { status: "kicked" } } }), { kind: "blocked", chatId: "42" });
});

test("The webhook is registered once with its secret and only over https", async () => {
  const calls = [];
  let current = "", updates = [];
  const fetchImpl = async (url, options) => {
    const method = url.split("/").pop(), body = JSON.parse(options.body);
    calls.push({ method, body });
    if (method === "setWebhook") { current = body.url; updates = body.allowed_updates; }
    return { ok: true, status: 200, json: async () => ({ ok: true, result: method === "getWebhookInfo" ? { url: current, allowed_updates: updates } : true }) };
  };
  assert.deepEqual(await ensureTelegramWebhook("http://localhost:3000", { env, fetchImpl }), { registered: false });
  await ensureTelegramWebhook("https://bdms.cmll.in/", { env, fetchImpl });
  await ensureTelegramWebhook("https://bdms.cmll.in", { env, fetchImpl });
  const sets = calls.filter((call) => call.method === "setWebhook");
  assert.equal(sets.length, 1);
  assert.equal(sets[0].body.url, "https://bdms.cmll.in/api/telegram/webhook");
  assert.equal(sets[0].body.secret_token, telegramWebhookSecret(env));
});

test("Server links accounts through one-time tokens and a secret-checked webhook", () => {
  assert.match(server, /app\.post\('\/api\/telegram\/webhook',async\(req,res\)=>\{\s*req\.audit=false;/);
  assert.ok(server.includes("req.get('x-telegram-bot-api-secret-token')!==secret)return res.sendStatus(401)"));
  assert.ok(server.includes("DELETE FROM telegram_link_tokens WHERE token=$1 AND expires_at>NOW() RETURNING login"));
  assert.ok(server.includes("INTERVAL '15 minutes'"));
  assert.ok(server.includes("app.post('/api/telegram/link',requireSession"));
  assert.ok(server.includes("app.get('/api/telegram/links',requireSuper,requireWhatsAppAdministrator"));
  assert.ok(server.includes("CREATE TABLE IF NOT EXISTS telegram_user_links"));
});

test("Personal Telegram copies follow WhatsApp recipients and hierarchy reports", () => {
  assert.ok(server.includes("mirrorToTelegramUsers({logins:eligibleLogins,message:telegramText"));
  assert.ok(server.includes("const telegramSent=telegramChat?await sendReportToTelegram(telegramChat,delivery.message,'consolidatedRequestReport'):false;"));
  assert.ok(server.includes("const telegramSent=telegramChat?await sendReportToTelegram(telegramChat,delivery.message,'consolidatedTicketReport'):false;"));
  assert.ok(server.includes("const telegramChat=await telegramChatForPhone(recipientPhone).catch(()=>'');"));
  assert.ok(server.includes("ignoreSwitches:!whatsappReminder"));
  assert.ok(server.includes("Number(error.status)===403)await disconnectTelegramChat(chatId)"));
});

test("Every user can connect Telegram from the profile panel", () => {
  const profile = readFileSync(new URL("../src/user-profile.jsx", import.meta.url), "utf8");
  assert.ok(profile.includes("<TelegramConnect token={apiToken} />"));
  assert.equal((source.match(/apiToken={authToken}/g) || []).length, 2);
  assert.ok(profile.includes("fetch(\"/api/telegram/link\", { method: \"POST\", headers })"));
  assert.match(profile, /Connect Telegram/);
  assert.match(source, /Users connected to Telegram/);
});

test("Password reset OTPs reach only a person's private chat, never a group", async () => {
  const { calls, fetchImpl } = recordingFetch();
  await sendTelegramText({ message: "OTP 123456", purpose: "passwordResetOtp", chatId: "987654321", privateChat: true }, { env, fetchImpl });
  assert.equal(JSON.parse(calls[0].options.body).chat_id, "987654321");
  await assert.rejects(sendTelegramText({ message: "OTP", purpose: "passwordResetOtp", chatId: "-5550689740", privateChat: true }, { env, fetchImpl }), { code: "TELEGRAM_POLICY_PAUSED" });
  await assert.rejects(sendTelegramText({ message: "OTP", purpose: "passwordResetOtp" }, { env, fetchImpl }), { code: "TELEGRAM_POLICY_PAUSED" });
  assert.equal(calls.length, 1);
});

test("A personal chat id works without a default group configured", async () => {
  const { calls, fetchImpl } = recordingFetch();
  await sendTelegramText({ message: "Alert", chatId: "42" }, { env: { TELEGRAM_BOT_TOKEN: "123:secret-token" }, fetchImpl });
  assert.equal(JSON.parse(calls[0].options.body).chat_id, "42");
});

test("Telegram keeps full messaging and is saved on the user's profile record", () => {
  assert.ok(server.includes("async function deliverToTelegramUsers({logins,message,purpose,reportType='System notification',target=''})"));
  assert.ok(server.includes("await sendTelegramText({message,purpose,chatId})"));
  assert.ok(server.includes("if(!whatsappReminder)mirrorToTelegramUsers({logins:recipients,message:reminderText,purpose,target:request.ref});"));
  assert.ok(server.includes("telegramChatId:previousRecord.telegramChatId,"));
  assert.ok(server.includes("const user=await saveTelegramOnUserRecord(rows[0].login,{chatId:update.chatId,username:update.username})||{};"));
  assert.ok(server.includes("await saveTelegramOnUserRecord(sessionLogin(req),null);"));
  assert.ok(server.includes("const telegramChat=await linkedTelegramChat(user.record_data.login);"));
  assert.ok(server.includes("if(telegramOtp){status=`Sent by Telegram only. WhatsApp: ${status}`;paused=false}"));
});

test("Telegram can be required at login, with exempt users", async () => {
  const { normalizeTelegramRequirement, telegramRequiredFor } = await import("../telegram.mjs");
  assert.deepEqual(normalizeTelegramRequirement(), { enabled: false, exemptLogins: [] });
  assert.deepEqual(normalizeTelegramRequirement({ enabled: true, exemptLogins: [" Director ", "director", "", "oem1"] }), { enabled: true, exemptLogins: ["director", "oem1"] });
  const rule = { enabled: true, exemptLogins: ["director"] };
  assert.equal(telegramRequiredFor(rule, "ANOOP"), true);
  assert.equal(telegramRequiredFor(rule, " DIRECTOR "), false);
  assert.equal(telegramRequiredFor({ ...rule, enabled: false }, "anoop"), false);
  assert.equal(telegramRequiredFor(rule, "anoop", { botConfigured: false }), false);
  assert.equal(telegramRequiredFor(rule, ""), false);
});

test("The login gate blocks unconnected users and admins manage exemptions", () => {
  const gate = readFileSync(new URL("../src/telegram-gate.jsx", import.meta.url), "utf8");
  assert.match(gate, /const blocking = Boolean\(state\?\.required && !state\?\.linked\);/);
  assert.match(gate, /Connect Telegram to continue/);
  assert.match(gate, /play\.google\.com\/store\/apps\/details\?id=org\.telegram\.messenger/);
  assert.match(gate, /web\.telegram\.org/);
  assert.match(gate, /onClick=\{logout\}/);
  assert.equal((source.match(/<TelegramGate token=\{authToken\} logout=\{logout\} \/>/g) || []).length, 2);
  assert.ok(server.includes("required:telegramRequiredFor(requirement,sessionLogin(req),{botConfigured:available})"));
  assert.ok(server.includes("app.put('/api/telegram/settings',requireSuper,requireWhatsAppAdministrator"));
  assert.ok(server.includes("action:'Save Telegram login requirement'"));
  assert.match(source, /Require Telegram at login/);
  assert.match(source, /toggleTelegramExempt\(user\.login\)/);
});

test("Join requests and group upgrades are parsed from webhook updates", () => {
  assert.deepEqual(parseTelegramUpdate({ chat_join_request: { chat: { id: -5550689740 }, from: { id: 42 }, user_chat_id: 42 } }), { kind: "joinRequest", groupChatId: "-5550689740", userId: "42", userChatId: "42" });
  assert.deepEqual(parseTelegramUpdate({ message: { chat: { id: -5550689740, type: "group" }, migrate_to_chat_id: -1009876543210 } }), { kind: "migrated", groupChatId: "-5550689740", newChatId: "-1009876543210" });
});

test("The webhook subscribes to join requests and re-registers when the list changes", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const method = url.split("/").pop();
    calls.push({ method, body: JSON.parse(options.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true, result: method === "getWebhookInfo" ? { url: "https://bdms.cmll.in/api/telegram/webhook", allowed_updates: ["message", "my_chat_member"] } : true }) };
  };
  await ensureTelegramWebhook("https://bdms.cmll.in", { env, fetchImpl });
  const set = calls.find((call) => call.method === "setWebhook");
  assert.deepEqual(set.body.allowed_updates, ["message", "my_chat_member", "chat_join_request"]);
});

test("Only BDMS administrators are invited to and admitted into the admin group", () => {
  assert.ok(server.includes("return profile.sessionRole==='super'&&['admin','super admin'].includes("));
  assert.ok(server.includes("if(isBdmsAdministrator(user))await inviteAdministratorToTelegramGroup(rows[0].login,update.chatId)"));
  assert.ok(server.includes("const approved=users.some(user=>user&&isBdmsAdministrator(user));"));
  assert.ok(server.includes("await answerTelegramJoinRequest(update.groupChatId,update.userId,approved);"));
  assert.ok(server.includes("if(update.groupChatId!==group.chatId)return;"));
  assert.ok(server.includes("app.post('/api/telegram/admin-group/invite',requireSuper,requireWhatsAppAdministrator"));
  assert.ok(server.includes("await followTelegramGroupMigration(chatId,error.migrateToChatId);"));
  assert.match(source, /Invite all admins to the group/);
});
