import { sendTelegramDocument, sendTelegramText } from './telegram.mjs';

const OEM_BOT_USERNAME = 'oembd_bot';

function oemBotToken(env) {
  const token = String(env.OEM_TELEGRAM_BOT_TOKEN ?? '').trim();
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error('Set OEM_TELEGRAM_BOT_TOKEN in the server environment.');
  }
  if (token === String(env.TELEGRAM_BOT_TOKEN ?? '').trim()) {
    throw new Error('The OEM and BDMS Telegram bots must use different tokens.');
  }
  return token;
}

export async function verifyOemTelegramBot({ env = process.env, fetchImpl = fetch } = {}) {
  const result = await oemTelegramRequest('getMe', {}, { env, fetchImpl });
  const username = result?.username;
  if (username?.toLowerCase() !== OEM_BOT_USERNAME) {
    throw new Error('Telegram did not verify the configured token for @OEMBD_BOT.');
  }
  return { username };
}

export async function oemTelegramRequest(method, payload, { env = process.env, fetchImpl = fetch } = {}) {
  const token = oemBotToken(env);
  let response;
  try {
    response = await fetchImpl(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error('Could not reach the Telegram Bot API.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(`OEM Telegram ${method} failed (HTTP ${response.status}).`);
  }
  return body.result;
}

async function sendToPrivateOemChat(send, delivery, options) {
  const { chatId } = delivery;
  const target = String(chatId ?? '').trim();
  if (!/^[1-9]\d*$/.test(target)) {
    throw new Error('A linked private Telegram chat is required for OEM delivery.');
  }
  const env = options.env ?? process.env;
  await verifyOemTelegramBot({ ...options, env });
  try {
    return await send({ ...delivery, chatId: target, privateChat: true }, {
      ...options,
      fetchImpl: (url, init) => (options.fetchImpl ?? fetch)(url, { ...init, signal: AbortSignal.timeout(10000) }),
      env: { ...env, TELEGRAM_BOT_TOKEN: oemBotToken(env), TELEGRAM_DEFAULT_CHAT_ID: target },
    });
  } catch (error) {
    throw new Error(error.status ? `OEM Telegram send failed (HTTP ${error.status}).` : 'OEM Telegram send failed before confirmation.');
  }
}

export function sendOemTelegramText(delivery, options = {}) {
  return sendToPrivateOemChat(sendTelegramText, delivery, options);
}

export function sendOemTelegramPdf(delivery, options = {}) {
  return sendToPrivateOemChat(sendTelegramDocument, delivery, options);
}
