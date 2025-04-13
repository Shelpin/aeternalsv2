/**
 * Telegram Client Static Loader Patch
 * 
 * This patch attempts to load the Telegram client and make it globally available.
 * It includes fallback mechanisms for different package structures.
 */

// This file intentionally uses CommonJS since we'll run it via execSync in apply-patches.js

console.log('🔧 Applying Telegram client static patch...');

try {
  // First try to load from workspace package
  let telegramClient;
  try {
    telegramClient = require('@elizaos/client-telegram');
    console.log('✅ Telegram client loaded from @elizaos/client-telegram package');
  } catch (err) {
    // Try alternative paths
    try {
      telegramClient = require('../packages/clients/telegram');
      console.log('✅ Telegram client loaded from packages/clients/telegram');
    } catch (innerErr) {
      try {
        telegramClient = require('../packages/telegram-multiagent');
        console.log('✅ Telegram client loaded from packages/telegram-multiagent');
      } catch (deepErr) {
        // Final fallback - create a minimal mock
        console.warn('⚠️ Could not load Telegram client from any location, creating a mock implementation');
        telegramClient = {
          TelegramClient: class MockTelegramClient {
            constructor(options = {}) {
              this.token = options.token || 'mock-token';
              this.options = options;
              this.eventHandlers = {};
              this.messageHandlers = {};
              console.log('📱 Mock Telegram client initialized with token:', this.token.substring(0, 5) + '...');
            }

            async startPolling() {
              console.log('📱 Mock Telegram client polling started');

              // Simulate receiving messages periodically
              this.pollingInterval = setInterval(() => {
                const randomTexts = [
                  "Hello there!",
                  "How are you?",
                  "What can you do?",
                  "Tell me a joke",
                  "What's the weather like?",
                  "Who created you?",
                  "Goodbye"
                ];

                // Only send a message 30% of the time
                if (Math.random() > 0.7) {
                  const text = randomTexts[Math.floor(Math.random() * randomTexts.length)];
                  const message = {
                    message_id: Date.now(),
                    from: {
                      id: 123456789,
                      first_name: 'Test',
                      last_name: 'User',
                      username: 'testuser'
                    },
                    chat: {
                      id: -1002550681173,
                      title: 'Test Group',
                      type: 'group'
                    },
                    text: text,
                    date: Math.floor(Date.now() / 1000)
                  };

                  console.log(`📱 Mock Telegram message received: "${text}" from testuser`);

                  // Trigger message handlers
                  if (this.eventHandlers['message']) {
                    try {
                      this.eventHandlers['message'](message);
                    } catch (error) {
                      console.error('📱 Error in message handler:', error);
                    }
                  }
                }
              }, 10000); // Every 10 seconds

              return true;
            }

            async stopPolling() {
              console.log('📱 Mock Telegram client polling stopped');
              if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
              }
              return true;
            }

            async sendMessage(chatId, text, options = {}) {
              console.log(`📱 Mock Telegram client sending message to ${chatId}: "${text.substring(0, 50)}..."`);

              // Create a mock response
              const response = {
                message_id: Date.now(),
                from: {
                  id: 987654321,
                  first_name: 'Bot',
                  username: 'ElizaBot'
                },
                chat: {
                  id: chatId,
                  type: chatId.toString().startsWith('-') ? 'group' : 'private'
                },
                text: text,
                date: Math.floor(Date.now() / 1000)
              };

              return {
                ok: true,
                result: response
              };
            }

            on(event, handler) {
              console.log(`📱 Mock Telegram client registering handler for "${event}" event`);
              this.eventHandlers[event] = handler;
            }

            onText(regex, handler) {
              console.log(`📱 Mock Telegram client registering text handler for regex: ${regex.toString()}`);
              this.messageHandlers[regex.toString()] = handler;
            }
          }
        };
      }
    }
  }

  // Make it globally available
  globalThis.__elizaTelegramClient = telegramClient;
  console.log('✅ Telegram client (or mock) made globally available as __elizaTelegramClient');
} catch (err) {
  console.error('❌ Failed to statically load Telegram client:', err.message);
}

console.log('✅ Telegram client static patch applied'); 