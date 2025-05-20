import { IAgentRuntime, Plugin, RelayMessage, TelegramMultiAgentConfig, TelegramRelayConfig, ElizaLogger } from './types.js';
import { PluginComponent } from './PluginComponent.js';
import { TelegramRelay } from './TelegramRelay.js';
import { ConversationManager } from './ConversationManager.js';
import { PersonalityEnhancer } from './PersonalityEnhancer.js';
import { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter.js';
import { SqliteDatabaseAdapter } from './SqliteAdapterProxy.js';
import path from 'path';
import fs from 'fs';

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
  private personalityEnhancer: PersonalityEnhancer;
  private coordinationAdapter: TelegramCoordinationAdapter | null = null;
  private dbAdapter: SqliteDatabaseAdapter | null = null;

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
    this.conversationManager = new ConversationManager(this.logger, null);
    this.personalityEnhancer = new PersonalityEnhancer('initial_placeholder_agent_id', null, this.logger);
  }

  register(runtime: IAgentRuntime): Plugin | boolean {
    this.setRuntime(runtime);

    // Determine the most reliable agent ID to use
    const globalRuntime = globalThis.__elizaRuntime as any;
    const runtimeAgentId = runtime.getAgentId?.() || 'unknown_agent_id_at_register';
    const globalConfigAgentId = globalRuntime?.relayConfig?.agentId;
    const effectiveAgentId = globalConfigAgentId || runtimeAgentId;

    this.logger.info(`[TG_PLUGIN_REGISTER] Register method called for ${this.name}. Runtime agent ID: ${runtimeAgentId}, Global config agent ID: ${globalConfigAgentId}, Using: ${effectiveAgentId}`);

    // Initialize database adapter
    try {
      // Get database path from environment or config
      const dbPath = this.getDatabasePath();

      // Create database directory if it doesn't exist
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Initialize SQLite adapter
      this.dbAdapter = new SqliteDatabaseAdapter(dbPath);
      this.logger.info(`[TG_PLUGIN_REGISTER] SQLite adapter initialized with database path: ${dbPath}`);

      // Create coordination adapter
      this.coordinationAdapter = new TelegramCoordinationAdapter(
        effectiveAgentId,
        runtime,
        this.logger,
        this.dbAdapter
      );
      this.logger.info(`[TG_PLUGIN_REGISTER] TelegramCoordinationAdapter created for agent ${effectiveAgentId}`);

      // Set the coordination adapter in the conversation manager
      this.conversationManager.setCoordinationAdapter(this.coordinationAdapter);
      this.logger.info(`[TG_PLUGIN_REGISTER] ConversationManager configured with TelegramCoordinationAdapter`);
    } catch (error) {
      this.logger.error(`[TG_PLUGIN_REGISTER] Error initializing database adapters:`, error);
    }

    // Pass runtime to ConversationManager for shared database access
    this.conversationManager.setRuntime(runtime);
    this.logger.info(`[SHARED_DB] ConversationManager runtime set for agent ${effectiveAgentId} using SHARED database`);

    // Create a new PersonalityEnhancer with the effective agent ID
    if (this.personalityEnhancer['agentId'] === 'initial_placeholder_agent_id' || this.personalityEnhancer['agentId'] === 'unknown_agent_id_at_register') {
      this.logger.info(`[TG_PLUGIN_REGISTER] Reinitializing PersonalityEnhancer with effective agent ID: ${effectiveAgentId}`);
      this.personalityEnhancer = new PersonalityEnhancer(effectiveAgentId, runtime, this.logger);
    } else {
      this.logger.info(`[TG_PLUGIN_REGISTER] Keeping existing PersonalityEnhancer with agent ID: ${this.personalityEnhancer['agentId']}`);
      this.personalityEnhancer.setRuntime(runtime);
    }

    // Register the coordination adapter in the plugin context for other components to access
    if (typeof runtime.registerPluginContext === 'function') {
      runtime.registerPluginContext('telegramCoordinationAdapter', this.coordinationAdapter);
      this.logger.info(`[TG_PLUGIN_REGISTER] Registered TelegramCoordinationAdapter in plugin context`);
    }

    return this;
  }

  /**
   * Get the database path from environment variables or config
   */
  private getDatabasePath(): string {
    // Try environment variables first
    if (process.env.DATABASE_PATH) {
      return process.env.DATABASE_PATH;
    }

    if (process.env.SQLITE_FILE) {
      return process.env.SQLITE_FILE;
    }

    // Then try config
    if (this.config.dbPath) {
      return this.config.dbPath;
    }

    // Default path
    return path.resolve('./data/telegram-multiagent.db');
  }

  public async initialize(): Promise<void> {
    await this.waitForRuntime(10000);

    this.telegramClient = (this.runtime?.clients as any)?.telegram;
    if (!this.telegramClient || typeof this.telegramClient.sendMessage !== 'function') {
      throw new Error('Telegram client not available during plugin initialization.');
    }
    this.logger.info('✅ Telegram client successfully assigned and validated in initialize.');

    this.telegramClient.on('message', (msg: RelayMessage) => {
      this.handleDirectTelegramMessage(msg).catch(e => this.logger.error(`Handle direct TG msg error: ${e}`));
    });

    // Initialize coordination adapter if available
    if (this.coordinationAdapter) {
      try {
        await this.coordinationAdapter.initialize();
        this.logger.info('✅ TelegramCoordinationAdapter initialized successfully');
      } catch (error) {
        this.logger.error('❌ Failed to initialize TelegramCoordinationAdapter:', error);
      }
    }

    // Initialize conversation manager
    await this.conversationManager.initialize();
    this.logger.info('✅ ConversationManager initialized');

    // Determine the most reliable agent ID to use
    const globalRuntime = globalThis.__elizaRuntime as any;
    const runtimeAgentId = this.runtime?.getAgentId?.() || 'unknown';
    const globalConfigAgentId = globalRuntime?.relayConfig?.agentId;
    const finalAgentId = globalConfigAgentId || runtimeAgentId;

    this.logger.info(`[PLUGIN_AGENT_ID] Initialize determined agent ID: ${finalAgentId} (from runtime: ${runtimeAgentId}, from global config: ${globalConfigAgentId || 'not available'})`);

    let authoritativeAuthToken = this.config.authToken;

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

    this.logger.info(`[PLUGIN_AGENT_ID_CONFIRMED] Using finalAgentId [${finalAgentId}] for TelegramRelay and all interactions`);

    const relayCfg: TelegramRelayConfig = {
      relayServerUrl: this.config.relayServerUrl,
      authToken: authoritativeAuthToken,
      agentId: finalAgentId,
      retryLimit: this.config.maxRetries,
      retryDelayMs: this.config.conversationCheckIntervalMs
    };

    this.logger.debug(`[PLUGIN_INIT_DEBUG] Config being used for TelegramRelay: ${JSON.stringify(relayCfg)}`);
    this.logger.debug(`[PLUGIN_INIT_DEBUG] AuthToken in relayCfg for TelegramRelay: [${relayCfg.authToken?.substring(0, 6)}****]`);
    this.logger.debug(`[PLUGIN_INIT_DEBUG] AgentId in relayCfg for TelegramRelay: [${relayCfg.agentId}]`);

    this.relay = new TelegramRelay(relayCfg, this.logger);
    await this.relay.connect();
    this.logger.info('✅ Relay connection established');

    if (typeof this.personalityEnhancer.initialize === 'function') {
      try {
        await this.personalityEnhancer.initialize();
        this.logger.info('✅ PersonalityEnhancer initialized successfully.');
      } catch (error: any) {
        this.logger.error(`Error initializing PersonalityEnhancer: ${error.message || error}`);
      }
    }

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

    // Get the agent ID from runtime or global config, ensuring we have a proper agent ID
    const globalRuntime = globalThis.__elizaRuntime as any;
    const runtimeAgentId = this.runtime?.getAgentId?.();
    const globalConfigAgentId = globalRuntime?.relayConfig?.agentId;
    const currentAgentId = globalConfigAgentId || runtimeAgentId || 'unknown';

    // Log what agent ID we're using to help debug
    this.logger.info(`[TG_PLUGIN][DIRECT] Using agent ID: ${currentAgentId} (from runtime: ${runtimeAgentId}, from global config: ${globalConfigAgentId})`);

    const groupId = msg.chat?.id?.toString();

    if (!groupId) {
      this.logger.warn('[TG_PLUGIN][DIRECT] Could not determine groupId from message, cannot process with ConversationManager robustly.');
      // Optionally, could still pass to runtime.handleMessage if group context isn't strictly needed for it.
      // For now, we'll be strict as per conversation plan.
      return;
    }

    // Get coordinationAdapter if not already available
    if (!this.coordinationAdapter) {
      if (this.runtime && typeof this.runtime.getPluginContext === 'function') {
        this.coordinationAdapter = this.runtime.getPluginContext('telegramCoordinationAdapter') as TelegramCoordinationAdapter;
        if (!this.coordinationAdapter) {
          this.logger.warn('[TG_PLUGIN][DIRECT] TelegramCoordinationAdapter not available in plugin context');
        }
      } else {
        this.logger.warn('[TG_PLUGIN][DIRECT] runtime.getPluginContext is not available');
      }
    }

    // 1. Update/get conversation state using the new handleMessage
    const conversationState = await this.conversationManager.handleMessage(msg, currentAgentId);
    if (!conversationState) {
      this.logger.warn(`[TG_PLUGIN][DIRECT] ConversationManager.handleMessage for group ${groupId} did not return a state. Aborting.`);
      return;
    }
    this.logger.info(`[TG_PLUGIN][DIRECT] Group ${groupId} state after handleMessage. Last speaker: ${conversationState.lastSpeakerId}, Participants: ${conversationState.participants.join(', ')}`);

    // For direct messages, the agent is usually expected to respond if it's a command or direct interaction.
    // The `shouldAgentRespond` logic in ConversationManager is more for group dynamics (turn-taking).
    // Here, we might bypass complex turn-taking if it's a direct interaction to the bot itself.
    // However, to maintain consistency and allow CM to manage even 1-on-1 flows (e.g. preventing self-reply loops):

    const senderId = msg.from?.username || msg.from?.id?.toString();
    const agentShouldRespond = await this.conversationManager.shouldAgentRespond(
      groupId,
      currentAgentId,
      senderId, // Sender of the direct message
      msg.text,
      msg // Pass the full message object
    );

    if (!agentShouldRespond) {
      this.logger.info(`[TG_PLUGIN][DIRECT] ConversationManager determined agent ${currentAgentId} should NOT respond to direct message in group ${groupId}.`);
      return;
    }

    if (!this.runtime?.handleMessage) {
      this.logger.warn('[TG_PLUGIN][DIRECT] runtime.handleMessage is not available. Ignoring direct message despite CM approval.');

      // Clear responding status since we're not going to respond
      if (this.coordinationAdapter) {
        await this.coordinationAdapter.clearRespondingAgent(groupId, currentAgentId);
        this.logger.info(`[TG_PLUGIN][DIRECT] Cleared responding status for agent ${currentAgentId} in group ${groupId} due to missing runtime.handleMessage.`);
      }

      return;
    }

    try {
      await this.runtime.handleMessage(msg); // Let runtime generate and send response
      this.logger.info(`[TG_PLUGIN][DIRECT] Direct message processed by runtime.handleMessage. ChatID: ${msg.chat.id}`);
      // If the runtime handled it and presumably sent a message, record this agent as the last speaker.
      if (currentAgentId && msg.text) { // Ensure there was text to respond to
        await this.conversationManager.recordMessage(groupId, currentAgentId, "<agent_responded_to_direct_message>"); // Record agent's action
      }

      // Clear responding status now that we've sent a message
      if (this.coordinationAdapter) {
        await this.coordinationAdapter.clearRespondingAgent(groupId, currentAgentId);
        this.logger.info(`[TG_PLUGIN][DIRECT] Cleared responding status for agent ${currentAgentId} in group ${groupId} after sending response.`);
      }
    } catch (e: any) {
      this.logger.error(`[TG_PLUGIN][DIRECT] Error during runtime.handleMessage for direct message: ${e.message || e}`);

      // Clear responding status since we encountered an error
      if (this.coordinationAdapter) {
        await this.coordinationAdapter.clearRespondingAgent(groupId, currentAgentId);
        this.logger.info(`[TG_PLUGIN][DIRECT] Cleared responding status for agent ${currentAgentId} in group ${groupId} due to error.`);
      }
    }
  }

  private async handleRelayMessage(message: any): Promise<void> {
    this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] Raw message from relay: ${JSON.stringify(message, null, 2)}`);

    const actualMessageContent: RelayMessage = message.message || message; // Accommodate relay message structure
    const senderAgentId = actualMessageContent.sender_agent_id;

    // Get the agent ID from runtime or global config, ensuring we have a proper agent ID
    const globalRuntime = globalThis.__elizaRuntime as any;
    const runtimeAgentId = this.runtime?.getAgentId?.();
    const globalConfigAgentId = globalRuntime?.relayConfig?.agentId;
    const currentAgentId = globalConfigAgentId || runtimeAgentId || 'unknown';

    // Log what agent ID we're using to help debug
    this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] Using agent ID: ${currentAgentId} (from runtime: ${runtimeAgentId}, from global config: ${globalConfigAgentId})`);

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

    // Get coordinationAdapter if not already available
    if (!this.coordinationAdapter) {
      if (this.runtime && typeof this.runtime.getPluginContext === 'function') {
        this.coordinationAdapter = this.runtime.getPluginContext('telegramCoordinationAdapter') as TelegramCoordinationAdapter;
        if (!this.coordinationAdapter) {
          this.logger.warn('[TG_PLUGIN_RELAY_HANDLER] TelegramCoordinationAdapter not available in plugin context');
        }
      } else {
        this.logger.warn('[TG_PLUGIN_RELAY_HANDLER] runtime.getPluginContext is not available');
      }
    }

    // 1. Update/get conversation state using the new handleMessage
    // Pass currentAgentId so it can be added to participants if not already there
    const conversationState = await this.conversationManager.handleMessage(actualMessageContent, currentAgentId);
    if (!conversationState) {
      this.logger.warn(`[TG_PLUGIN_RELAY_HANDLER] ConversationManager.handleMessage for group ${groupId} did not return a state. Aborting.`);
      return;
    }
    this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] Group ${groupId} state after handleMessage. Last speaker: ${conversationState.lastSpeakerId}, Participants: ${conversationState.participants.join(', ')}`);

    // 2. Consult ConversationManager with potentially updated state to see if this agent should respond
    const agentShouldRespond = await this.conversationManager.shouldAgentRespond(
      groupId,
      currentAgentId,
      senderAgentId || null, // Sender of the relay message
      actualMessageContent.text,
      actualMessageContent // Pass the full message object
    );

    if (!agentShouldRespond) {
      this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] ConversationManager determined agent ${currentAgentId} should NOT respond or delay is active. Aborting response.`);
      return;
    }

    this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] Agent ${currentAgentId} WILL attempt to respond to message from ${senderAgentId}. Passing to runtime.handleMessage.`);

    if (this.runtime && typeof this.runtime.handleMessage === 'function') {
      try {
        // Pass the actual message content that includes sender_agent_id etc.
        await this.runtime.handleMessage(actualMessageContent);
        this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] runtime.handleMessage completed for relayed message from ${senderAgentId}.`);

        // 3. Record that this agent has responded (or attempted to) via runtime.
        // This explicitly marks currentAgentId as the last speaker for its *own* message.
        // The text recorded here could be the actual response text if available, or a placeholder.
        if (currentAgentId && actualMessageContent.text) { // ensure there was text to respond to
          await this.conversationManager.recordMessage(groupId, currentAgentId, "<agent_responded_to_relay_message>");
        }

        // Clear responding status now that we've sent a message
        if (this.coordinationAdapter) {
          await this.coordinationAdapter.clearRespondingAgent(groupId.toString(), currentAgentId);
          this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] Cleared responding status for agent ${currentAgentId} in group ${groupId} after sending response.`);
        }

      } catch (error: any) {
        this.logger.error(`[TG_PLUGIN_RELAY_HANDLER] Error in runtime.handleMessage for relayed message: ${error.message}`, { error });

        // Clear responding status since we encountered an error
        if (this.coordinationAdapter) {
          await this.coordinationAdapter.clearRespondingAgent(groupId.toString(), currentAgentId);
          this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] Cleared responding status for agent ${currentAgentId} in group ${groupId} due to error.`);
        }
      }
    } else {
      this.logger.warn("[TG_PLUGIN_RELAY_HANDLER] Runtime or handleMessage not available for relayed message.");

      // Clear responding status since we can't respond
      if (this.coordinationAdapter) {
        await this.coordinationAdapter.clearRespondingAgent(groupId.toString(), currentAgentId);
        this.logger.info(`[TG_PLUGIN_RELAY_HANDLER] Cleared responding status for agent ${currentAgentId} in group ${groupId} due to missing runtime.handleMessage.`);
      }
    }
  }

  public async shutdown(): Promise<void> {
    this.logger.info('[TG_PLUGIN] Shutting down TelegramMultiAgentPlugin...');
    await this.relay?.disconnect();
    this.logger.info('[TG_PLUGIN] Relay disconnected.');

    try {
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

  public async forwardToRelay(chatId: string, text: string, originalMessage?: any): Promise<void> {
    // Determine the most reliable agent ID to use
    const globalRuntime = globalThis.__elizaRuntime as any;
    const runtimeAgentId = this.runtime?.getAgentId?.();
    const globalConfigAgentId = globalRuntime?.relayConfig?.agentId;
    const currentAgentId = globalConfigAgentId || runtimeAgentId;

    if (!currentAgentId) {
      this.logger.error('[PLUGIN_FORWARD_TO_RELAY] Cannot forward message: currentAgentId is not available from runtime or global config.');
      return;
    }

    if (this.relay) {
      this.logger.info(`[PLUGIN_FORWARD_TO_RELAY] Plugin forwarding message from agent ${currentAgentId} to relay. ChatID: ${chatId}, Text: ${text.substring(0, 50)}...`);
      await this.relay.sendMessage(chatId.toString(), text);
      this.logger.info(`[PLUGIN_FORWARD_TO_RELAY] Call to this.relay.sendMessage successful for chatID ${chatId}.`);

      // Record in conversation database that this agent has spoken
      await this.conversationManager.recordMessage(chatId.toString(), currentAgentId, text || '');
    } else {
      this.logger.warn('[PLUGIN_FORWARD_TO_RELAY] Relay client not available in plugin, cannot forward message.');
    }
  }
}