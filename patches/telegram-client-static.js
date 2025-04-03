import telegramClient from '@elizaos/client-telegram';

try {
  globalThis.__elizaTelegramClient = telegramClient;
  console.log('✅ Telegram client statically loaded');
} catch (error) {
  console.error('❌ Telegram client load failed:', error.message);
} 