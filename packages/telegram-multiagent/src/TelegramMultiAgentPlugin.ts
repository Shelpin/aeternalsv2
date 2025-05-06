import { IAgentRuntime, Plugin, RelayMessage, TelegramMultiAgentConfig, TelegramRelayConfig, ElizaLogger } from './types.js';
import { PluginComponent } from './PluginComponent.js';
import { TelegramRelay } from './TelegramRelay.js';

// Default configuration values
const DEFAULT_CONFIG: TelegramMultiAgentConfig = {
  enabled: true,
  relayServerUrl: 'http://localhost:4000',
  authToken: '',
  botToken: '',
  groupIds: [],
  dbPath: '',
  logLevel: 'info',
  conversationCheckIntervalMs: 60000,
  maxRetries: 3,
  disablePolling: false,
  kickstarterConfig: {
    probabilityFactor: 0.1,
    minIntervalMs: 300000,
    includeTopics: false,
    shouldTagAgents: false,
    maxAgentsToTag: 1
  }
};

export class TelegramMultiAgentPlugin extends PluginComponent implements Plugin {
  name = 'telegram-multiagent';
  description = 'Multi-agent Telegram plugin for ElizaOS';

  private config: TelegramMultiAgentConfig;

  constructor(options?: Partial<TelegramMultiAgentConfig>) {
    const logger: ElizaLogger = {
      trace: (...args) => console.trace(...args),
      debug: (...args) => console.debug(...args),
      info: (...args) => console.info(...args),
      warn: (...args) => console.warn(...args),
      error: (...args) => console.error(...args),
    };
    super(logger);
    this.config = { ...DEFAULT_CONFIG, ...(options || {}) };
  }

  register(runtime: IAgentRuntime): Plugin | boolean {
    this.setRuntime(runtime);
    this.initialize().catch(err => this.logger.error(`Initialization error: ${err}`));
    return this;
  }

  public async initialize(): Promise<void> {
    // Wait for the ElizaOS runtime
    await this.waitForRuntime(10000);

    // Acquire Telegram client from runtime using type assertion
    const client = (this.runtime.clients as any)?.telegram;
    if (client && typeof client.sendMessage === 'function') {
      this.logger.info('✅ Telegram client found in runtime');
    } else {
      this.logger.error('❌ Telegram client missing in runtime');
      const id = this.runtime.getAgentId?.() || 'unknown';
      throw new Error(`Telegram client not found for agent ${id}`);
    }

    // Listen for incoming Telegram messages
    client.on('message', (msg: RelayMessage) => {
      this.handleIncomingMessage(msg).catch(e => this.logger.error(`Handle msg error: ${e}`));
    });

    // Initialize the relay server for multi-agent forwarding
    const agentId = this.runtime.getAgentId?.() || 'unknown';
    const relayCfg: TelegramRelayConfig = {
      relayServerUrl: this.config.relayServerUrl,
      authToken: this.config.authToken,
      agentId,
      retryLimit: this.config.maxRetries,
      retryDelayMs: this.config.conversationCheckIntervalMs
    };
    const relay = new TelegramRelay(relayCfg, this.logger);
    await relay.connect();
    this.logger.info('✅ Relay connection established');
  }

  private async handleIncomingMessage(msg: RelayMessage): Promise<void> {
    try {
      // Acquire Telegram client from runtime using type assertion
      const client = (this.runtime.clients as any)?.telegram;
      // Add a check here since we used optional chaining
      if (!client) {
        this.logger.error('❌ Telegram client became unavailable during handleIncomingMessage');
        return;
      }
      const chatId = msg.chat.id;
      const text = msg.text || '';
      const response = `Echo: ${text}`;
      await client.sendMessage(chatId, response);
      this.logger.info(`Replied to chat ${chatId}`);
    } catch (err) {
      this.logger.error(`Send error: ${err}`);
    }
  }
}