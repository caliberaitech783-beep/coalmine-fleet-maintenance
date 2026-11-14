import { verifyOemTelegramBot } from '../oem-telegram.mjs';

try {
  const { username } = await verifyOemTelegramBot();
  console.log(`Verified @${username}.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
