import { ElizaLogger, IAgentRuntime, Plugin } from './types';
import { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
import { TelegramRelay } from './TelegramRelay';
import { ConversationManager } from './ConversationManager';
import { PersonalityEnhancer } from './PersonalityEnhancer';
import { TelegramMultiAgentPluginConfig } from './index';
import { SqliteDatabaseAdapter } from './SqliteAdapterProxy';
import { ConversationKickstarter } from './ConversationKickstarter';

// Define types locally to avoid import issues
interface KickstarterConfig {
  minInterval: number;
  maxInterval: number;
  probabilityFactor: number;
  maxActiveConversationsPerGroup: number;
  shouldTagAgents: boolean;
  maxAgentsToTag: number;
  persistConversations: boolean;
}

// Add type declarations to existing classes
declare module './TelegramRelay' {
  interface TelegramRelay {
    onMessage(handler: (message: any) => void): void;
  }
}

declare module './ConversationManager' {
  interface ConversationManager {
    getCurrentConversation(): any;
  }
}

// Add type declarations to existing interface
declare module './types' {
  interface Character {
    clientConfig?: {
      telegram?: {
        shouldIgnoreBotMessages?: boolean;
        shouldIgnoreDirectMessages?: boolean;
        shouldRespondOnlyToMentions?: boolean;
        allowedGroupIds?: string[];
        [key: string]: any;
      };
      [key: string]: any;
    };
  }
  
  interface IAgentRuntime {
    clients?: any[];
    logger?: ElizaLogger;
  }
}

/**
 * TelegramMultiAgentPlugin enables multi-agent coordination in Telegram groups
 */
export class TelegramMultiAgentPlugin implements Plugin {
  // Required Plugin properties
  public name: string = 'TelegramMultiAgentPlugin';
  public description: string = 'Enables multi-agent coordination in Telegram groups';
  public npmName: string = '@elizaos/telegram-multiagent';
  
  private config: any;
  private logger: ElizaLogger;
  private isInitialized = false;
  private relay: TelegramRelay | null = null;
  private runtime: IAgentRuntime | null = null;
  private agentId: string = '';
  private coordinationAdapter: TelegramCoordinationAdapter | null = null;
  private conversationManagers: Map<number, ConversationManager> = new Map();
  private conversationKickstarters: Map<number, any> = new Map();
  private dbAdapter: SqliteDatabaseAdapter | null = null;
  private personalityEnhancers: Map<number, PersonalityEnhancer> = new Map();
  private checkIntervalId: NodeJS.Timeout | null = null;
  private ConversationKickstarter: any = null;
  private telegramGroupIds: string[] = [];

  /**
   * Create a new TelegramMultiAgentPlugin
   * 
   * @param config - Plugin configuration
   */
  constructor(config: any) {
    // Use console.log directly to ensure messages are captured
    console.log('[CONSTRUCTOR] TelegramMultiAgentPlugin: Constructor called directly');
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: Plugin name is '${this.name}'`);
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: Plugin description is '${this.description}'`);
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: Plugin npmName is '${this.npmName}'`);
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: typeof this=${typeof this}, constructor=${this.constructor.name}`);
    
    // Debug the plugin interface properties
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: has initialize=${typeof this.initialize === 'function'}`);
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: has shutdown=${typeof this.shutdown === 'function'}`);
    
    this.config = {
      conversationCheckIntervalMs: 60000, // 1 minute default
      enabled: true,
      useSqliteAdapter: true,  // Enable SQLite adapter by default
      dbPath: ':memory:',      // Use in-memory SQLite by default
      kickstarterConfig: {},   // Default kickstarter config
      ...config
    };
    
    // Debug the config
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: config=${JSON.stringify(this.config)}`);
    
    // Create a default logger that uses console directly
    this.logger = {
      debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      warn: (msg: string) => console.log(`[WARN] ${msg}`),
      error: (msg: string) => console.log(`[ERROR] ${msg}`)
    };
    
    // Try to dynamically load the ConversationKickstarter class
    try {
      this.ConversationKickstarter = require('./ConversationKickstarter').ConversationKickstarter;
    } catch (error) {
      console.warn('[CONSTRUCTOR] TelegramMultiAgentPlugin: Could not load ConversationKickstarter', error);
      // Create a dummy implementation
      this.ConversationKickstarter = class {
        constructor() {}
        start() {}
        stop() {}
        updateKnownAgents() {}
        updateAvailableTopics() {}
        forceKickstart() { return Promise.resolve(); }
      };
    }
  }

  /**
   * Register the plugin with the agent runtime
   * This method is called by the agent runtime when the plugin is registered
   * 
   * @param runtime - Agent runtime instance
   */
  registerWithRuntime(runtime: IAgentRuntime): void {
    console.log('[REGISTER] TelegramMultiAgentPlugin: Registering with runtime');
    this.runtime = runtime;
    this.agentId = runtime.getAgentId();
    console.log(`[REGISTER] TelegramMultiAgentPlugin: Agent ID set to ${this.agentId}`);
    
    // Use the runtime's logger if available
    if (runtime.logger) {
      this.logger = runtime.logger;
      console.log('[REGISTER] TelegramMultiAgentPlugin: Using runtime logger');
    }
  }

  // Override toString method to make debugging easier
  toString(): string {
    return `[TelegramMultiAgentPlugin name=${this.name} description=${this.description} npmName=${this.npmName}]`;
  }

  /**
   * Load configuration from environment or config file
   */
  private loadConfig(): TelegramMultiAgentPluginConfig {
    // Get agent ID from environment or config
    this.agentId = process.env.AGENT_ID || this.config.agentId || '';
    
    if (!this.agentId) {
      console.log('[ERROR] TelegramMultiAgentPlugin: No agent ID provided');
      console.log('[DEBUG] TelegramMultiAgentPlugin: config=', JSON.stringify(this.config, null, 2));
      throw new Error('No agent ID provided');
    }
    
    // Try to load config from file
    let fileConfig = {};
    try {
      const configPath = process.env.CONFIG_PATH || '/root/eliza/agent/config/plugins/telegram-multiagent.json';
      console.log(`[CONFIG] TelegramMultiAgentPlugin: Attempting to load config from ${configPath}`);
      const fs = require('fs');
      const configContent = fs.readFileSync(configPath, 'utf8');
      fileConfig = JSON.parse(configContent);
      console.log(`[CONFIG] TelegramMultiAgentPlugin: Successfully loaded config from file: ${JSON.stringify(fileConfig, null, 2)}`);
    } catch (error) {
      console.warn(`[CONFIG] TelegramMultiAgentPlugin: Failed to load config from file: ${error.message}`);
      console.warn('[CONFIG] TelegramMultiAgentPlugin: Using default config or environment variables');
    }
    
    // Merge configs with precedence: ENV > fileConfig > this.config
    const mergedConfig = { ...this.config, ...fileConfig };
    
    // Initialize relay with environment variables
    const relayServerUrl = process.env.RELAY_SERVER_URL || mergedConfig.relayServerUrl || 'http://localhost:4000';
    const authToken = process.env.RELAY_AUTH_TOKEN || mergedConfig.authToken || 'elizaos-secure-relay-key';
    
    // Initialize SQLite settings
    const useSqliteAdapter = process.env.USE_SQLITE === 'true' || mergedConfig.useSqliteAdapter === true;
    const dbPath = process.env.SQLITE_DB_PATH || mergedConfig.dbPath || ':memory:';
    
    // Kickstarter config
    const kickstarterConfig = {
      ...(mergedConfig.kickstarterConfig || {}),
      persistConversations: useSqliteAdapter // Only persist if SQLite is enabled
    };

    // Get group IDs from environment variables or config
    let groupIds: number[] = [];
    
    // First check environment variables
    if (process.env.TELEGRAM_GROUP_IDS) {
      try {
        console.log(`[CONFIG] TelegramMultiAgentPlugin: Found TELEGRAM_GROUP_IDS environment variable: ${process.env.TELEGRAM_GROUP_IDS}`);
        groupIds = process.env.TELEGRAM_GROUP_IDS.split(',').map(id => parseInt(id.trim(), 10));
        console.log(`[CONFIG] TelegramMultiAgentPlugin: Parsed ${groupIds.length} group IDs from environment: ${JSON.stringify(groupIds)}`);
      } catch (error) {
        console.warn(`[CONFIG] TelegramMultiAgentPlugin: Failed to parse group IDs from environment: ${error.message}`);
      }
    }
    
    // If no group IDs from environment, try config file
    if (groupIds.length === 0 && mergedConfig.groupIds && Array.isArray(mergedConfig.groupIds)) {
      groupIds = mergedConfig.groupIds;
      console.log(`[CONFIG] TelegramMultiAgentPlugin: Loaded ${groupIds.length} group IDs from config: ${JSON.stringify(groupIds)}`);
    }
    
    // Last resort: hard-coded fallback
    if (groupIds.length === 0) {
      groupIds = [-1002550618173];
      console.warn(`[CONFIG] TelegramMultiAgentPlugin: No group IDs found in environment or config, using fallback: ${JSON.stringify(groupIds)}`);
    }
    
    // Create the final config
    const finalConfig = {
      relayServerUrl,
      authToken,
      groupIds,
      conversationCheckIntervalMs: mergedConfig.conversationCheckIntervalMs || 60000,
      enabled: mergedConfig.enabled !== false,
      useSqliteAdapter,
      dbPath,
      kickstarterConfig
    } as TelegramMultiAgentPluginConfig;
    
    console.log(`[CONFIG] TelegramMultiAgentPlugin: Final config: ${JSON.stringify(finalConfig, null, 2)}`);
    
    return finalConfig;
  }

  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    try {
      console.log('[INITIALIZE] TelegramMultiAgentPlugin: initialize() method called');
      
      if (this.isInitialized) {
        console.log('[INITIALIZE] TelegramMultiAgentPlugin: Already initialized, skipping');
        return;
      }

      console.log('[INITIALIZE] TelegramMultiAgentPlugin: Starting initialization');
      console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Runtime is ${this.runtime ? 'available' : 'null or undefined'}`);
      console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Agent ID is ${this.agentId || 'not set'}`);
      
      // Check if runtime is available
      if (!this.runtime) {
        console.error('[INITIALIZE] TelegramMultiAgentPlugin: No runtime available, cannot initialize');
        console.log('[INITIALIZE] TelegramMultiAgentPlugin: Will try to proceed without runtime, but expect errors');
      } else {
        // Get agent ID from runtime if not already set
        if (!this.agentId) {
          try {
            this.agentId = this.runtime.getAgentId();
            console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Set agent ID from runtime: ${this.agentId}`);
          } catch (error) {
            console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Error getting agent ID from runtime: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      
      // Load configuration from environment or config file
      console.log('[INITIALIZE] TelegramMultiAgentPlugin: Loading configuration');
      let config;
      try {
        config = this.loadConfig();
        console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Loaded config with relay URL: ${config.relayServerUrl}`);
        console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Config groupIds: ${JSON.stringify(config.groupIds || [])}`);
      } catch (error) {
        console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Error loading config: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
      
      if (!config.enabled) {
        console.log('[INITIALIZE] TelegramMultiAgentPlugin: Plugin is disabled in config, skipping initialization');
        return;
      }

      // Initialize SQLite adapter if enabled
      if (config.useSqliteAdapter) {
        try {
          console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Initializing SQLite adapter with db path: ${config.dbPath}`);
          this.dbAdapter = new SqliteDatabaseAdapter(config.dbPath);
          console.log('[INITIALIZE] TelegramMultiAgentPlugin: SQLite adapter initialized successfully');
        } catch (error) {
          console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Failed to initialize SQLite adapter: ${error instanceof Error ? error.message : String(error)}`);
          console.error(`[INITIALIZE] TelegramMultiAgentPlugin: SQLite adapter error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
          console.warn('[INITIALIZE] TelegramMultiAgentPlugin: Continuing without SQLite adapter');
        }
      }

      // Use manual group ID fallback if needed
      if (!config.groupIds || config.groupIds.length === 0) {
        console.warn('[INITIALIZE] TelegramMultiAgentPlugin: No group IDs in config, using default group ID');
        config.groupIds = [-1002550618173]; // Hardcoded fallback group ID from config file
        console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Using fallback group IDs: ${JSON.stringify(config.groupIds)}`);
      }

      // Create the logger if not already available
      if (!this.logger) {
        this.logger = {
          debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
          info: (msg: string) => console.log(`[INFO] ${msg}`),
          warn: (msg: string) => console.log(`[WARN] ${msg}`),
          error: (msg: string) => console.log(`[ERROR] ${msg}`)
        };
      }

      // Initialize the relay client
      try {
        console.log('[INITIALIZE] TelegramMultiAgentPlugin: Initializing TelegramRelay');
        this.relay = new TelegramRelay({
          relayServerUrl: config.relayServerUrl,
          authToken: config.authToken,
          agentId: this.agentId
        }, this.logger);

        // Connect to relay server
        await this.relay.connect();
        console.log('[INITIALIZE] TelegramMultiAgentPlugin: Connected to relay server');

        // Register message handler
        this.relay.onMessage((message) => {
          console.log(`[MESSAGE] TelegramMultiAgentPlugin: Received message: ${JSON.stringify(message)}`);
          this.handleIncomingMessage(message);
        });
      } catch (error) {
        console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Failed to initialize relay: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Relay initialization error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
        throw error;
      }

      // Initialize the coordination adapter
      try {
        console.log('[INITIALIZE] TelegramMultiAgentPlugin: Initializing coordination adapter');
        this.coordinationAdapter = new TelegramCoordinationAdapter(
          this.agentId,
          this.runtime,
          this.logger,
          this.dbAdapter
        );
        console.log('[INITIALIZE] TelegramMultiAgentPlugin: Coordination adapter initialized');
      } catch (error) {
        console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Failed to initialize coordination adapter: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Coordination adapter error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
        throw error;
      }

      // Create personality enhancer
      let personality: PersonalityEnhancer;
      try {
        console.log('[INITIALIZE] TelegramMultiAgentPlugin: Initializing personality enhancer');
        personality = new PersonalityEnhancer(this.agentId, this.runtime, this.logger);
        console.log('[INITIALIZE] TelegramMultiAgentPlugin: Personality enhancer initialized');
      } catch (error) {
        console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Failed to initialize personality enhancer: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Personality enhancer error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
        // Continue with a minimal fallback implementation
        // Note: This is not ideal and may cause issues, but allows initialization to continue
        const minimalPersonality = new PersonalityEnhancer({
          agentId: this.agentId,
          primary: [],
          secondary: [],
          interests: []
        });
        personality = minimalPersonality;
      }

      // Initialize conversation managers and kickstarters for each group
      try {
        for (const groupId of config.groupIds) {
          const groupIdStr = groupId.toString();
          console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Setting up conversation manager for group ${groupId}`);
          
          // Create conversation manager
          const manager = new ConversationManager(
            this.coordinationAdapter,
            this.relay,
            personality,
            this.agentId,
            groupId,
            this.logger
          );
          this.conversationManagers.set(groupId, manager);
          
          // Create conversation kickstarter
          console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Setting up conversation kickstarter for group ${groupId}`);
          const kickstarter = new ConversationKickstarter(
            this.coordinationAdapter,
            this.relay,
            personality,
            manager,
            this.agentId,
            groupIdStr,
            this.runtime,
            this.logger,
            config.kickstarterConfig
          );
          
          this.conversationKickstarters.set(groupId, kickstarter);
        }
      } catch (error) {
        console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Failed to initialize conversation managers: ${error instanceof Error ? error.message : String(error)}`);
        console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Conversation manager initialization error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      }

      // Initialize telegramGroupIds from config
      this.telegramGroupIds = this.config.groupIds?.map(id => id.toString()) || [];
      
      // If no group IDs are in the config, try to get them from environment
      if (this.telegramGroupIds.length === 0 && process.env.TELEGRAM_GROUP_IDS) {
        this.telegramGroupIds = process.env.TELEGRAM_GROUP_IDS.split(',').map(id => id.trim());
      }
      
      console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Using telegram group IDs: ${JSON.stringify(this.telegramGroupIds)}`);

      // Set initialization complete
      this.isInitialized = true;
      console.log('[INITIALIZE] TelegramMultiAgentPlugin: Initialization complete');
      
      // Set up interval to check conversations periodically
      this.checkIntervalId = setInterval(() => {
        this.checkConversations().catch(error => {
          console.error(`[CHECK] TelegramMultiAgentPlugin: Error in conversation check: ${error instanceof Error ? error.message : String(error)}`);
        });
      }, config.conversationCheckIntervalMs);
      console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Set up conversation check interval (${config.conversationCheckIntervalMs}ms)`);
    } catch (error) {
      console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      throw error;
    }
  }

  /**
   * Check conversations periodically and update kickstarters if needed
   */
  private async checkConversations(): Promise<void> {
    try {
      if (this.logger) {
        this.logger.debug('TelegramMultiAgentPlugin: Checking conversations');
      } else {
        console.log('[DEBUG] TelegramMultiAgentPlugin: Checking conversations');
      }
      
      if (!this.coordinationAdapter) {
        if (this.logger) {
          this.logger.debug('TelegramMultiAgentPlugin: No coordination adapter available, skipping conversation check');
        } else {
          console.log('[DEBUG] TelegramMultiAgentPlugin: No coordination adapter available, skipping conversation check');
        }
        return;
      }
      
      // Update the known agents
      // We need to get a specific groupId, using the first available group
      const groupId = this.telegramGroupIds && this.telegramGroupIds.length > 0 
        ? parseInt(this.telegramGroupIds[0], 10)
        : 0;
      
      this.logger.debug(`TelegramMultiAgentPlugin: Getting available agents for groupId ${groupId}`);
      const availableAgents = await this.coordinationAdapter.getAvailableAgents(groupId);
      
      // No need to transform since we know getAvailableAgents returns string[]
      const agentIds = availableAgents;
      
      // Update each kickstarter with known agents
      for (const [groupId, kickstarter] of this.conversationKickstarters.entries()) {
        if (kickstarter && kickstarter.updateKnownAgents) {
          kickstarter.updateKnownAgents(agentIds);
        }
      }
      
      // Get conversation topics
      const topics = await this.coordinationAdapter.getRelevantTopics(this.agentId);
      
      // Update each kickstarter with recent topics
      for (const [groupId, kickstarter] of this.conversationKickstarters.entries()) {
        if (kickstarter && kickstarter.updateAvailableTopics) {
          // Filter topics for this group
          const groupTopics = topics.filter(t => !t.groupId || t.groupId === groupId.toString());
          kickstarter.updateAvailableTopics(groupTopics);
        }
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error(`TelegramMultiAgentPlugin: Error checking conversations: ${error}`);
      } else {
        console.error(`TelegramMultiAgentPlugin: Error checking conversations: ${error}`);
      }
    }
  }

  /**
   * Handle an incoming message
   * 
   * @param message - Incoming message
   */
  private async handleIncomingMessage(message: any): Promise<void> {
    this.logger.debug(`TelegramMultiAgentPlugin: handleIncomingMessage called with message: ${JSON.stringify(message, null, 2)}`);
    try {
      // Check if it's a valid message
      if (!message || !message.content) {
        this.logger.debug('TelegramMultiAgentPlugin: Invalid message received, skipping.');
        return;
      }

      // Check if it's an admin command
      if (message.content.startsWith('/kickstart')) {
        this.logger.debug('TelegramMultiAgentPlugin: Received kickstart command');
        // Extract topic if provided (format: /kickstart [topic])
        const topic = message.content.split(' ').slice(1).join(' ') || undefined;
        const kickstarter = this.conversationKickstarters.get(message.chat_id);
        if (kickstarter) {
          await kickstarter.forceKickstart(topic);
          this.logger.debug(`TelegramMultiAgentPlugin: Forced kickstart with topic: ${topic || 'none'}`);
        } else {
          this.logger.debug(`TelegramMultiAgentPlugin: No kickstarter found for chat_id: ${message.chat_id}`);
        }
        return;
      }

      // Process normal message
      this.logger.debug('TelegramMultiAgentPlugin: Processing normal message');
      
      // Check if it's from a bot and if we should ignore bot messages
      const conversationManager = this.conversationManagers.get(message.chat_id);
      if (!conversationManager) {
        this.logger.debug(`TelegramMultiAgentPlugin: No conversation manager found for chat_id: ${message.chat_id}`);
        return;
      }

      // Get current character config
      const currentCharacter = this.runtime?.getCharacter();
      this.logger.debug(`TelegramMultiAgentPlugin: Current character: ${currentCharacter?.name || 'unknown'}`);
      
      // Check if we should ignore bot messages
      const shouldIgnoreBotMessages = currentCharacter?.clientConfig?.telegram?.shouldIgnoreBotMessages ?? false;
      this.logger.debug(`TelegramMultiAgentPlugin: shouldIgnoreBotMessages setting: ${shouldIgnoreBotMessages}`);
      
      if (message.from?.is_bot && shouldIgnoreBotMessages) {
        this.logger.debug('TelegramMultiAgentPlugin: Ignoring message from bot as per config');
        return;
      }

      // Update conversation with the message
      this.logger.debug('TelegramMultiAgentPlugin: Updating conversation with message');
      const conversation = conversationManager.getCurrentConversation();
      if (conversation) {
        conversation.addMessage(message);
        this.logger.debug('TelegramMultiAgentPlugin: Message added to conversation');
      } else {
        this.logger.debug('TelegramMultiAgentPlugin: No active conversation to add message to');
      }

      // Check if we should respond
      if (this.shouldRespondToMessage(message, this.agentId)) {
        this.logger.debug('TelegramMultiAgentPlugin: Should respond to message, processing with runtime');
        await this.processMessageWithRuntime(message);
      } else {
        this.logger.debug('TelegramMultiAgentPlugin: Should not respond to message, ignoring');
      }
    } catch (error) {
      this.logger.error(`TelegramMultiAgentPlugin: Error handling incoming message: ${error}`);
    }
  }
  
  /**
   * Process a message using the agent runtime
   * 
   * @param formattedMessage - Formatted message to process
   */
  private async processMessageWithRuntime(formattedMessage: any): Promise<void> {
    if (!this.runtime) {
      this.logger.debug('TelegramMultiAgentPlugin: No runtime available to process message');
      return;
    }

    try {
      // Find the telegram client in the runtime's clients
      const telegramClient = this.runtime.clients?.find(client => 
        client && typeof client === 'object' && 'processMessage' in client && client.type === 'telegram'
      );

      if (telegramClient && typeof telegramClient.processMessage === 'function') {
        this.logger.debug('TelegramMultiAgentPlugin: Found telegram client, processing message');
        await telegramClient.processMessage(formattedMessage);
      } else {
        this.logger.warn('TelegramMultiAgentPlugin: No suitable telegram client found in runtime');
      }
    } catch (error) {
      this.logger.error(`TelegramMultiAgentPlugin: Error processing message with runtime: ${error}`);
    }
  }
  
  /**
   * Extract a potential topic from a message
   * 
   * @param content - Message content
   * @returns Potential topic or undefined
   */
  private extractTopic(content: string): string | undefined {
    // Simple implementation - extract first sentence or first N words if short
    if (!content) return undefined;
    
    // Try to get first sentence
    const sentenceMatch = content.match(/^.*?[.!?](?:\s|$)/);
    if (sentenceMatch && sentenceMatch[0].length > 5) {
      return sentenceMatch[0].trim();
    }
    
    // If no sentence or too short, use first 8 words
    const words = content.split(/\s+/).slice(0, 8).join(' ');
    return words || undefined;
  }
  
  /**
   * Determine if we should respond to a message
   * 
   * @param message - The message
   * @param agentId - This agent's ID
   * @returns Whether to respond
   */
  private shouldRespondToMessage(message: any, agentId: string): boolean {
    this.logger.debug(`TelegramMultiAgentPlugin: Checking if should respond to message for agent ${agentId}`);

    // If message is null or doesn't have content, don't respond
    if (!message || !message.content) {
      return false;
    }

    // Check for direct mentions of this agent (improved mention detection)
    // This handles both full agent ID mentions and partial matches
    const agentIdLower = agentId.toLowerCase();
    const contentLower = message.content.toLowerCase();
    
    // Check for various mention formats
    const isDirectlyMentioned = 
      contentLower.includes(`@${agentIdLower}`) || 
      contentLower.includes(`@${agentIdLower}_bot`) ||
      contentLower.includes(agentIdLower.replace('_', '')) ||
      // Handle more flexible variants of agent names
      (agentId.includes('_') && contentLower.includes(agentIdLower.split('_')[0])) ||
      // Handle any version of the agent's name with @ symbol (for Telegram mentions)
      contentLower.includes(`@${agentIdLower.replace(/_/g, '')}`) ||
      // For agents like "LindAEvangelista88" looking for "linda" or "linda_evangelista"
      (agentId.toLowerCase().includes('linda') && (
        contentLower.includes('@linda') || 
        contentLower.includes('linda') || 
        contentLower.includes('lindaevangelista') ||
        contentLower.includes('linda_evangelista')
      ));

    if (isDirectlyMentioned) {
      this.logger.debug(`TelegramMultiAgentPlugin: Agent ${agentId} is directly mentioned, will respond`);
      return true;
    }
    
    // Check if this is from another agent/bot - increase response probability to inter-agent messages
    if (message.from?.is_bot || (message.sender_agent_id && message.sender_agent_id !== agentId)) {
      this.logger.debug(`TelegramMultiAgentPlugin: Message is from another agent/bot, increasing response probability`);
      // 30% chance to respond to other agents' messages to encourage conversation
      return Math.random() < 0.3;
    }

    // For regular messages (not from bots/agents and not direct mentions)
    // Calculate a probability based on message length (longer messages have higher chance)
    const contentLength = message.content.length;
    // Lower base probability to avoid too much chatter for regular messages
    const baseProbability = contentLength > 200 ? 0.15 : contentLength > 100 ? 0.08 : 0.03;
    
    // Random chance to respond
    const shouldRespond = Math.random() < baseProbability;
    this.logger.debug(`TelegramMultiAgentPlugin: Random response chance: ${shouldRespond ? 'yes' : 'no'} (${baseProbability})`);

    return shouldRespond;
  }

  /**
   * Shutdown the plugin
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }
    
    this.logger.info('TelegramMultiAgentPlugin: Shutting down');
    
    // Clear interval
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    
    // Stop all kickstarters
    for (const kickstarter of this.conversationKickstarters.values()) {
      if (kickstarter && typeof kickstarter.stop === 'function') {
        kickstarter.stop();
      }
    }
    
    // Disconnect from relay server
    if (this.relay) {
      await this.relay.disconnect();
    }
    
    // Close coordination adapter
    if (this.coordinationAdapter) {
      await this.coordinationAdapter.close();
    }
    
    // Close database connection
    if (this.dbAdapter) {
      try {
        await this.dbAdapter.close();
      } catch (error) {
        this.logger.error(`Error closing database: ${error.message}`);
      }
    }
    
    this.isInitialized = false;
    this.logger.info('TelegramMultiAgentPlugin: Shutdown complete');
  }
} 