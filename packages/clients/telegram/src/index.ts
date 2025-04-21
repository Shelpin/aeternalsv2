import TelegramBot from 'node-telegram-bot-api.js';

// VALHALLA FIX: Add type declaration for global runtime
declare global {
  var __elizaRuntime: {
    clients?: {
      telegram?: any;
      [key: string]: any;
    };
    [key: string]: any;
  };
}

/**
 * Telegram client for ElizaOS
 * 
 * This client provides a wrapper around the node-telegram-bot-api
 * with methods for sending and receiving messages.
 */
class TelegramClient {
  private bot: TelegramBot | null = null;
  private token: string = '';
  private messageHandlers: Array<(message: any) => void> = [];
  private botInfo: any = null;

  /**
   * Initialize the Telegram client with a bot token
   */
  constructor(token?: string) {
    if (token) {
      this.initialize(token);
    }
  }

  /**
   * Initialize the client with a token
   */
  initialize(token: string, runtime?: any): void {
    if (!token) {
      console.error('[TELEGRAM] No token provided for Telegram client');
      return;
    }

    try {
      this.token = token;
      this.bot = new TelegramBot(token, { polling: true });
      
      // Set up message handler
      this.bot.on('message', (message) => {
        console.log(`[TELEGRAM] Received message: ${JSON.stringify(message, null, 2)}`);
        
        // Notify all registered handlers
        this.messageHandlers.forEach(handler => {
          try {
            handler(message);
          } catch (error) {
            console.error(`[TELEGRAM] Error in message handler: ${error}`);
          }
        });
      });

      // Get bot info
      this.bot.getMe().then(info => {
        this.botInfo = info;
        console.log(`[TELEGRAM] Bot initialized: ${info.username}`);
      }).catch(error => {
        console.error(`[TELEGRAM] Error getting bot info: ${error}`);
      });

      console.log(`[TELEGRAM] Client initialized with token: ${token.substring(0, 5)}...`);
      
      // VALHALLA FIX: Ensure the client is injected into the runtime
      if (runtime) {
        // Ensure clients object exists
        runtime.clients = runtime.clients || {};
        // Inject telegram client
        runtime.clients.telegram = this;
        // Add debug logging
        console.log('[VALHALLA] Telegram client mounted to runtime:', !!runtime.clients?.telegram);
      } else if (globalThis.__elizaRuntime) {
        // Try to inject into global runtime if runtime parameter wasn't provided
        globalThis.__elizaRuntime.clients = globalThis.__elizaRuntime.clients || {};
        globalThis.__elizaRuntime.clients.telegram = this;
        console.log('[VALHALLA] Telegram client mounted to global runtime:', !!globalThis.__elizaRuntime.clients?.telegram);
      }
    } catch (error) {
      console.error(`[TELEGRAM] Error initializing Telegram bot: ${error}`);
      this.bot = null;
    }
  }

  /**
   * Register a handler for incoming messages
   */
  on(event: string, handler: (message: any) => void): void {
    if (event === 'message') {
      this.messageHandlers.push(handler);
      console.log(`[TELEGRAM] Registered message handler`);
    } else {
      console.warn(`[TELEGRAM] Unsupported event: ${event}`);
    }
  }

  /**
   * Send a message to a chat
   */
  async sendMessage(chatId: number | string, text: string, options: any = {}): Promise<any> {
    if (!this.bot) {
      console.error('[TELEGRAM] Bot not initialized');
      return { ok: false, error: 'Bot not initialized' };
    }

    try {
      console.log(`[TELEGRAM] Sending message to ${chatId}: ${text.substring(0, 50)}...`);
      const result = await this.bot.sendMessage(chatId, text, options);
      return { ok: true, result };
    } catch (error) {
      console.error(`[TELEGRAM] Error sending message: ${error}`);
      return { ok: false, error };
    }
  }

  /**
   * Get information about a chat
   */
  async getChat(chatId: number | string): Promise<any> {
    if (!this.bot) {
      console.error('[TELEGRAM] Bot not initialized');
      return { ok: false, error: 'Bot not initialized' };
    }

    try {
      const chat = await this.bot.getChat(chatId);
      return chat;
    } catch (error) {
      console.error(`[TELEGRAM] Error getting chat: ${error}`);
      return { ok: false, error };
    }
  }

  /**
   * Get the bot information
   */
  get getBotInfo(): any {
    return this.botInfo;
  }
}

// Export a singleton instance
const telegramClient = new TelegramClient();

// Also export the class for direct instantiation
export { TelegramClient };

// VALHALLA FIX: Check if we have a runtime and inject the client
if (globalThis.__elizaRuntime) {
  console.log('[VALHALLA] Found global runtime, injecting Telegram client');
  globalThis.__elizaRuntime.clients = globalThis.__elizaRuntime.clients || {};
  globalThis.__elizaRuntime.clients.telegram = telegramClient;
  console.log('[VALHALLA] Telegram client mounted to runtime:', !!globalThis.__elizaRuntime.clients?.telegram);
}

// Default export is the singleton instance
export default telegramClient; 