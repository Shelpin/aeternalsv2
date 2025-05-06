import { IAgentRuntime, Plugin, RelayMessage, TelegramMultiAgentConfig, TelegramRelayConfig, ElizaLogger } from './types.js';
import { PluginComponent } from './PluginComponent.js';
import { TelegramRelay } from './TelegramRelay.js';

// Default configuration values
const DEFAULT_CONFIG: TelegramMultiAgentConfig = {
  enabled: true,
  relayServerUrl: 'http://localhost:4000',
  authToken: '',
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
    shouldTagAgents: true,
    maxAgentsToTag: 3
  }
};

export class TelegramMultiAgentPlugin extends PluginComponent implements Plugin {
  name = 'telegram-multiagent';
  description = 'Multi-agent Telegram plugin for ElizaOS';

  private config: TelegramMultiAgentConfig;
  private relay: TelegramRelay | null = null;
  private telegramClient: any; // Added for Step 2 of "Final Ascent" plan

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

    // STEP 2 from "Final Ascent" plan: Direct assignment and check for telegramClient
    this.telegramClient = (this.runtime?.clients as any)?.telegram;
    if (!this.telegramClient || typeof this.telegramClient.sendMessage !== 'function') {
      // Optional: Add more specific logging about what was missing if desired
      // if (!this.telegramClient) this.logger.error('[PLUGIN_INIT] this.telegramClient is null/undefined.');
      // else this.logger.error('[PLUGIN_INIT] this.telegramClient.sendMessage is not a function.');
      throw new Error('Telegram client not available during plugin initialization.');
    }
    this.logger.info('✅ Telegram client successfully assigned and validated in initialize.');

    // Listen for incoming Telegram messages (from actual Telegram client)
    // Now use this.telegramClient
    this.telegramClient.on('message', (msg: RelayMessage) => {
      this.handleDirectTelegramMessage(msg).catch(e => this.logger.error(`Handle direct TG msg error: ${e}`));
    });

    // Initialize the relay server for multi-agent forwarding
    const agentId = this.runtime?.getAgentId?.() || 'unknown'; // Reverted this line in previous step to fix build
    const relayCfg: TelegramRelayConfig = {
      relayServerUrl: this.config.relayServerUrl,
      authToken: this.config.authToken,
      agentId,
      retryLimit: this.config.maxRetries,
      retryDelayMs: this.config.conversationCheckIntervalMs
    };
    this.relay = new TelegramRelay(relayCfg, this.logger);
    await this.relay.connect();
    this.logger.info('✅ Relay connection established');

    // Register handler for messages received from the relay server (from other bots)
    this.relay.registerMessageHandler((message: RelayMessage) => {
      this.handleRelayMessage(message).catch(e => this.logger.error(`Handle relay msg error: ${e}`));
    });
  }

  private async handleDirectTelegramMessage(msg: RelayMessage): Promise<void> {
    this.logger.debug(`[TG_PLUGIN] Received direct message from Telegram: ${JSON.stringify(msg)}`);
    // Use the class member this.telegramClient, already validated in initialize()
    if (!this.telegramClient || typeof this.telegramClient.sendMessage !== 'function') {
      this.logger.warn('Message ignored: telegramClient not ready.');
      return;
    }

    const chatId = msg.chat.id.toString();
    const text = msg.text || '';
    const fromUsername = msg.from.username;
    const thisAgentId = this.runtime.getAgentId?.();

    if (!msg.from.is_bot || fromUsername === thisAgentId) {
      if (this.relay) {
        this.logger.debug(`[TG_PLUGIN] Relaying direct message from ${fromUsername} to relay server.`);
        await this.relay.sendMessage(chatId, text);
      } else {
        this.logger.warn('[TG_PLUGIN] Relay not available to send direct message.');
      }
    }

    let agentResponse: any;
    if (this.runtime.handleMessage) {
      try {
        agentResponse = await this.runtime.handleMessage(msg);
      } catch (e) {
        this.logger.error(`[TG_PLUGIN] Error from runtime.handleMessage for direct message: ${e}`);
        return;
      }
    } else {
      this.logger.warn('[TG_PLUGIN] runtime.handleMessage is not available.');
      return;
    }

    const agentResponseText = agentResponse?.text || agentResponse?.message?.text || (typeof agentResponse === 'string' ? agentResponse : null);

    if (agentResponseText && typeof agentResponseText === 'string' && agentResponseText.trim() !== '') {
      this.logger.debug(`[TG_PLUGIN] Agent core responded to direct message with: "${agentResponseText}"`);
      try {
        await this.telegramClient.sendMessage(msg.chat.id, agentResponseText);
        this.logger.info(`[TG_PLUGIN] Sent agent response to Telegram chat ${msg.chat.id}`);

        if (this.relay) {
          this.logger.debug(`[TG_PLUGIN] Relaying agent's own response to relay server.`);
          await this.relay.sendMessage(chatId, agentResponseText);
        } else {
          this.logger.warn('[TG_PLUGIN] Relay not available to send agent response.');
        }
      } catch (e) {
        this.logger.error(`[TG_PLUGIN] Error sending agent response to Telegram or relay: ${e}`);
      }
    } else {
      this.logger.debug('[TG_PLUGIN] Agent core did not provide a text response to direct message.');
    }
  }

  private async handleRelayMessage(msg: RelayMessage): Promise<void> {
    this.logger.debug(`[TG_PLUGIN] Received message from Relay: ${JSON.stringify(msg)}`);
    // Use the class member this.telegramClient, already validated in initialize()
    if (!this.telegramClient || typeof this.telegramClient.sendMessage !== 'function') {
      this.logger.warn('Message ignored: telegramClient not ready.');
      return;
    }

    const chatId = msg.chat.id.toString();
    const thisAgentId = this.runtime.getAgentId?.();

    if (msg.sender_agent_id && msg.sender_agent_id === thisAgentId) {
      this.logger.debug(`[TG_PLUGIN] Ignoring relay message from self (agent: ${thisAgentId}).`);
      return;
    }

    let agentResponse: any;
    if (this.runtime.handleMessage) {
      try {
        const messageFromRelay = { ...msg, isFromRelay: true };
        agentResponse = await this.runtime.handleMessage(messageFromRelay);
      } catch (e) {
        this.logger.error(`[TG_PLUGIN] Error from runtime.handleMessage for relay message: ${e}`);
        return;
      }
    } else {
      this.logger.warn('[TG_PLUGIN] runtime.handleMessage is not available.');
      return;
    }

    const agentResponseText = agentResponse?.text || agentResponse?.message?.text || (typeof agentResponse === 'string' ? agentResponse : null);

    if (agentResponseText && typeof agentResponseText === 'string' && agentResponseText.trim() !== '') {
      this.logger.debug(`[TG_PLUGIN] Agent core responded to relay message with: "${agentResponseText}"`);
      try {
        await this.telegramClient.sendMessage(msg.chat.id, agentResponseText);
        this.logger.info(`[TG_PLUGIN] Sent agent response (to relay message) to Telegram chat ${msg.chat.id}`);

        if (this.relay) {
          this.logger.debug(`[TG_PLUGIN] Relaying agent's own response (to relay message) to relay server.`);
          await this.relay.sendMessage(chatId, agentResponseText);
        } else {
          this.logger.warn('[TG_PLUGIN] Relay not available to send agent response (to relay message).');
        }
      } catch (e) {
        this.logger.error(`[TG_PLUGIN] Error sending agent response (to relay message) to Telegram or relay: ${e}`);
      }
    } else {
      this.logger.debug('[TG_PLUGIN] Agent core did not provide a text response to relay message.');
    }
  }

  public async shutdown(): Promise<void> {
    this.logger.info('[TG_PLUGIN] Shutting down TelegramMultiAgentPlugin...');
    await this.relay?.disconnect();
    this.logger.info('[TG_PLUGIN] Relay disconnected.');

    try {
      // Use the class member this.telegramClient
      if (this.telegramClient && typeof this.telegramClient.stop === 'function') {
        await this.telegramClient.stop();
        this.logger.info('[TG_PLUGIN] Telegram client stopped.');
      } else if (this.telegramClient) {
        this.logger.warn('[TG_PLUGIN] Telegram client does not have a callable stop() method.');
      } else {
        this.logger.warn('[TG_PLUGIN] Telegram client was not available during shutdown.');
      }
    } catch (error) {
      this.logger.error(`[TG_PLUGIN] Error stopping Telegram client: ${error}`);
    }
    this.logger.info('[TG_PLUGIN] Shutdown complete.');
  }
}