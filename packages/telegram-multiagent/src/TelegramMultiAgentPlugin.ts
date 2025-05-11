import { IAgentRuntime, Plugin, RelayMessage, TelegramMultiAgentConfig, TelegramRelayConfig, ElizaLogger } from './types.js';
import { PluginComponent } from './PluginComponent.js';
import { TelegramRelay } from './TelegramRelay.js';
import { ConversationManager } from './ConversationManager.js';

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
  private conversationManager: ConversationManager;

  constructor(options?: Partial<TelegramMultiAgentConfig>) {
    const logger: ElizaLogger = {
      trace: (message, ...args) => console.trace(`[TG_PLUGIN_TRACE] ${message}`, ...args),
      debug: (message, ...args) => console.debug(`[TG_PLUGIN_DEBUG] ${message}`, ...args),
      info: (message, ...args) => console.log(`[TG_PLUGIN_INFO] ${message}`, ...args),
      warn: (message, ...args) => console.warn(`[TG_PLUGIN_WARN] ${message}`, ...args),
      error: (message, ...args) => console.error(`[TG_PLUGIN_ERROR] ${message}`, ...args),
    };
    super(logger);
    this.config = { ...DEFAULT_CONFIG, ...(options || {}) };
    this.conversationManager = new ConversationManager(this.logger);
  }

  register(runtime: IAgentRuntime): Plugin | boolean {
    this.setRuntime(runtime);
    this.logger.info(`[TG_PLUGIN_REGISTER] Register method called for ${this.name}. Runtime set. Initialization will be handled by AgentRuntime.`);
    this.conversationManager.setRuntime(runtime);
    return this;
  }

  public async initialize(): Promise<void> {
    // Wait for the ElizaOS runtime
    await this.waitForRuntime(10000);

    this.telegramClient = (this.runtime?.clients as any)?.telegram;
    if (!this.telegramClient || typeof this.telegramClient.sendMessage !== 'function') {
      throw new Error('Telegram client not available during plugin initialization.');
    }
    this.logger.info('✅ Telegram client successfully assigned and validated in initialize.');

    this.telegramClient.on('message', (msg: RelayMessage) => {
      this.handleDirectTelegramMessage(msg).catch(e => this.logger.error(`Handle direct TG msg error: ${e}`));
    });

    const agentIdFromRuntime = this.runtime?.getAgentId?.() || 'unknown'; // Get agentId from runtime

    // >>> MODIFIED LOGIC TO GET AUTH TOKEN FROM PATCHED RUNTIME <<<
    let authoritativeAuthToken = this.config.authToken; // Default to constructor/options config
    const globalRuntime = globalThis.__elizaRuntime as any;

    // Check directly on globalRuntime.relayConfig
    if (globalRuntime?.relayConfig?.authToken) {
      authoritativeAuthToken = globalRuntime.relayConfig.authToken;
      this.logger.info(`[PLUGIN_AUTH_PATCH] Successfully retrieved authToken from globalRuntime.relayConfig: [${authoritativeAuthToken?.substring(0, 6)}****]`);
    } else {
      this.logger.warn('[PLUGIN_AUTH_PATCH] Could not retrieve authToken from globalRuntime.relayConfig. Falling back to plugin config.');
      this.logger.warn(`[PLUGIN_AUTH_PATCH] globalRuntime exists: ${!!globalRuntime}`);
      if (globalRuntime) {
        this.logger.warn(`[PLUGIN_AUTH_PATCH] globalRuntime.relayConfig exists: ${!!globalRuntime.relayConfig}`);
        if (globalRuntime.relayConfig) {
          this.logger.warn(`[PLUGIN_AUTH_PATCH] authToken in globalRuntime.relayConfig: [${globalRuntime.relayConfig.authToken}]`);
        }
      }
    }
    // >>> END MODIFIED LOGIC <<<

    // >>> NEW: Get agentId from globalRuntime.relayConfig if available, otherwise use agentIdFromRuntime <<<
    const finalAgentId = globalRuntime?.relayConfig?.agentId || agentIdFromRuntime;
    if (globalRuntime?.relayConfig?.agentId) {
      this.logger.info(`[PLUGIN_AGENT_ID_PATCH] Using agentId from globalRuntime.relayConfig: [${finalAgentId}]`);
    } else {
      this.logger.info(`[PLUGIN_AGENT_ID_PATCH] Using agentId from runtime.getAgentId(): [${finalAgentId}]`);
    }
    // >>> END NEW <<<

    const relayCfg: TelegramRelayConfig = {
      relayServerUrl: this.config.relayServerUrl,
      authToken: authoritativeAuthToken, // Use the potentially patched token
      agentId: finalAgentId, // Use the potentially patched agentId
      retryLimit: this.config.maxRetries,
      retryDelayMs: this.config.conversationCheckIntervalMs
    };

    this.logger.debug(`[PLUGIN_INIT_DEBUG] Config being used for TelegramRelay: ${JSON.stringify(relayCfg)}`);
    if (relayCfg) {
      this.logger.debug(`[PLUGIN_INIT_DEBUG] AuthToken in relayCfg for TelegramRelay: [${relayCfg.authToken}]`);
      this.logger.debug(`[PLUGIN_INIT_DEBUG] AgentId in relayCfg for TelegramRelay: [${relayCfg.agentId}]`);
    }

    this.relay = new TelegramRelay(relayCfg, this.logger);
    await this.relay.connect();
    this.logger.info('✅ Relay connection established');

    this.relay.registerMessageHandler((message: RelayMessage) => {
      this.handleRelayMessage(message).catch(e => this.logger.error(`Handle relay msg error: ${e.message || e}`));
    });

    setInterval(async () => {
      try {
        const agents = await this.relay.getAvailableAgents();
        this.logger.debug(`[RELAY] Current available agents: ${agents.join(', ') || 'None'}`);
      } catch (e) {
        this.logger.warn('[RELAY] Failed to get agent list');
      }
    }, 60000);
  }

  private async handleDirectTelegramMessage(msg: RelayMessage): Promise<void> {
    this.logger.debug(`[TG_PLUGIN] Received direct message from Telegram: ${JSON.stringify(msg)}`);

    if (!this.runtime?.handleMessage) {
      this.logger.warn('[TG_PLUGIN] runtime.handleMessage is not available. Ignoring direct message.');
      return;
    }

    // It's important that the runtime handles the message and decides on any Telegram responses
    // or relaying. The plugin's role is to pass the message to the runtime.
    try {
      // Pass the original message object from Telegram directly to the runtime.
      // The runtime will be responsible for:
      // 1. Generating a response (e.g., via LLM).
      // 2. Sending that response back to the original chat via the Telegram client (available on the runtime).
      // 3. Forwarding the message (or its response) to the relay if other agents need to see it (via forwardToRelay).
      await this.runtime.handleMessage(msg);
      this.logger.info(`[TG_PLUGIN] Direct message processed by runtime.handleMessage. ChatID: ${msg.chat.id}`);
    } catch (e) {
      this.logger.error(`[TG_PLUGIN] Error during runtime.handleMessage for direct message: ${e}`);
    }
  }

  private async handleRelayMessage(message: any): Promise<void> {
    this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] Raw message from relay: ${JSON.stringify(message, null, 2)}`);

    const actualMessageContent = message.message || message; // Accommodate relay message structure
    const senderAgentId = actualMessageContent.sender_agent_id;
    const currentAgentId = this.runtime?.getAgentId?.();
    const groupId = actualMessageContent.chat?.id?.toString();

    this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] Relay msg sender_agent_id: ${senderAgentId}, Current agentId: ${currentAgentId}, GroupID: ${groupId}`);

    if (senderAgentId && senderAgentId === currentAgentId) {
      this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] Message from relay is from self (${senderAgentId}), IGNORING.`);
      return;
    }

    if (!groupId) {
      this.logger.warn('[TG_PLUGIN_RELAY_HANDLER] Could not determine groupId from message, IGNORING to prevent issues with ConversationManager.');
      return;
    }

    // Consult ConversationManager
    const agentShouldRespond = await this.conversationManager.shouldAgentRespond(
      groupId,
      currentAgentId || 'unknown_current_agent',
      senderAgentId || null,
      actualMessageContent.text
    );

    if (!agentShouldRespond) {
      this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] ConversationManager determined agent ${currentAgentId} should NOT respond or delay is active. Aborting response.`);
      return;
    }

    this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] Message from other agent (${senderAgentId}), passing to runtime.handleMessage.`);

    if (this.runtime && typeof this.runtime.handleMessage === 'function') {
      try {
        // Pass the actual message content that includes sender_agent_id etc.
        await this.runtime.handleMessage(actualMessageContent);
        this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] runtime.handleMessage completed for relayed message from ${senderAgentId}.`);
        // Record that this agent has responded (or attempted to)
        this.conversationManager.recordMessage(groupId, currentAgentId || 'unknown_current_agent', actualMessageContent.text || '');
        // NO FURTHER ACTION HERE - runtime.handleMessage will send its own response to Telegram
        // and the main handleTelegramMessage (or this revised handleRelayMessage if it were to send)
        // would be responsible for relaying *new* responses if needed.
      } catch (error) {
        this.logger.error(`[TG_PLUGIN_RELAY_HANDLER] Error in runtime.handleMessage for relayed message: ${error.message}`, { error });
      }
    } else {
      this.logger.warn("[TG_PLUGIN_RELAY_HANDLER] Runtime or handleMessage not available for relayed message.");
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

  // This method will be called by the runtime patch
  public async forwardToRelay(chatId: string, text: string, originalMessage?: any): Promise<void> {
    const currentAgentId = this.runtime?.getAgentId?.();
    if (!currentAgentId) {
      this.logger.error('[PLUGIN_FORWARD_TO_RELAY] Cannot forward message: currentAgentId is not available from runtime.');
      return;
    }
    if (this.relay) {
      this.logger.info(`[PLUGIN_FORWARD_TO_RELAY] Plugin forwarding message from agent ${currentAgentId} to relay. ChatID: ${chatId}, Text: ${text.substring(0, 50)}...`);
      // The currentAgentId is implicitly used by the this.relay instance as it was configured with it.
      // The originalMessage is not directly supported by the current relay.sendMessage signature.
      // If originalMessage context is vital for the relay server, the relay's sendMessage or its underlying HTTP call needs adjustment.
      await this.relay.sendMessage(chatId.toString(), text);
      this.logger.info(`[PLUGIN_FORWARD_TO_RELAY] Call to this.relay.sendMessage successful for chatID ${chatId}.`);

      // After successfully forwarding to relay, also record this message send time for the ConversationManager
      // This ensures that this agent's own relayed messages also respect the delay for its *next* potential response.
      this.conversationManager.recordMessage(chatId.toString(), currentAgentId, text || '');

    } else {
      this.logger.warn('[PLUGIN_FORWARD_TO_RELAY] Relay client not available in plugin, cannot forward message.');
    }
  }
}