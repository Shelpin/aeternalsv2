try {
  const telegramClient = require('@elizaos/client-telegram');
  globalThis.__elizaTelegramClient = telegramClient;
  console.log('✅ Telegram client statically loaded');
} catch (err) {
  console.error('❌ Failed to statically load Telegram client:', err.message);
} 