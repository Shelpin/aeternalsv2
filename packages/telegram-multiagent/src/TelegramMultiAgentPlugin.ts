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
  private runtimeInitialized = false;
  private maxRuntimeWaitMs = 60000; // 1 minute max wait time
  private runtimeWaitIntervalMs = 1000; // Check every second
  private runtimeRetryAttempts = 0;
  private maxRuntimeRetryAttempts = 60; // Maximum retry attempts

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
    
    if (!runtime) {
      console.error('[REGISTER] TelegramMultiAgentPlugin: Invalid runtime provided (null or undefined)');
      return;
    }
    
    this.runtime = runtime;
    
    // Try to get agent ID from runtime
    try {
      this.agentId = runtime.getAgentId();
      console.log(`[REGISTER] TelegramMultiAgentPlugin: Agent ID set to ${this.agentId}`);
    } catch (error) {
      console.error(`[REGISTER] TelegramMultiAgentPlugin: Error getting agent ID from runtime: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`[REGISTER] TelegramMultiAgentPlugin: Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      // Don't return - continue with initialization
    }
    
    // Use the runtime's logger if available
    if (runtime.logger) {
      this.logger = runtime.logger;
      console.log('[REGISTER] TelegramMultiAgentPlugin: Using runtime logger');
    } else {
      console.warn('[REGISTER] TelegramMultiAgentPlugin: Runtime provided no logger, using default logger');
    }
    
    // Check if we can access the character from the runtime
    try {
      const character = runtime.getCharacter();
      if (character) {
        console.log(`[REGISTER] TelegramMultiAgentPlugin: Character available: ${character.name || 'unnamed'}`);
        
        // If agent ID wasn't set earlier, try to use character username
        if (!this.agentId && character.username) {
          this.agentId = character.username;
          console.log(`[REGISTER] TelegramMultiAgentPlugin: Using character username as agent ID: ${this.agentId}`);
        }
      } else {
        console.warn('[REGISTER] TelegramMultiAgentPlugin: Character not available in runtime');
      }
    } catch (error) {
      console.warn(`[REGISTER] TelegramMultiAgentPlugin: Error accessing character: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Set runtime as initialized if everything looks good
    if (this.runtime && this.agentId) {
      this.runtimeInitialized = true;
      console.log(`[REGISTER] TelegramMultiAgentPlugin: Runtime registration complete for agent ${this.agentId}`);
    } else {
      console.warn('[REGISTER] TelegramMultiAgentPlugin: Runtime registration incomplete (missing runtime or agent ID)');
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
    const relayServerUrl = process.env.RELAY_SERVER_URL || mergedConfig.relayServerUrl || 'http://207.180.245.243:4000';
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
        console.log('[INITIALIZE] TelegramMultiAgentPlugin: No runtime available during initial check, will try to initialize anyway and wait for runtime');
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
      
      // Wait for runtime to be available (async, doesn't block initialization)
      this.waitForRuntime().then(runtimeAvailable => {
        if (runtimeAvailable) {
          console.log('[INITIALIZE] TelegramMultiAgentPlugin: Runtime is now available and verified');
        } else {
          console.warn('[INITIALIZE] TelegramMultiAgentPlugin: Failed to connect to runtime after waiting, will continue with fallback responses');
        }
      }).catch(error => {
        console.error(`[INITIALIZE] TelegramMultiAgentPlugin: Error waiting for runtime: ${error instanceof Error ? error.message : String(error)}`);
      });
      
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
    this.logger.debug(`TelegramMultiAgentPlugin: handleIncomingMessage called for message from: ${message?.from?.username || message?.sender_agent_id || 'unknown'}`);
    
    // CRITICAL DEBUG: Log the entire message for debugging
    this.logger.info(`[BOT MSG DEBUG] FULL MESSAGE: ${JSON.stringify(message, null, 2)}`);
    
    // Always log the critical components of the message
    const fromUsername = message.from?.username || 'unknown';
    const isBot = message.from?.is_bot === true;
    const messageText = message.text || message.content || '';
    const chatId = message.chat?.id || message.groupId || message.chat_id;
    
    this.logger.info(`[BOT MSG DEBUG] RECEIVED MESSAGE from=${fromUsername} isBot=${isBot} chat_id=${chatId}`);
    this.logger.info(`[BOT MSG DEBUG] MESSAGE CONTENT: ${messageText}`);
    
    // FORCE BOT RESPONSES when in test mode
    const forceResponses = process.env.FORCE_BOT_RESPONSES === 'true';
    if (forceResponses) {
      this.logger.info(`[BOT MSG DEBUG] FORCE_BOT_RESPONSES is enabled - will process all messages`);
    }
    
    // Ensure we have a chat ID
    if (!chatId) {
      this.logger.warn(`[BOT MSG DEBUG] WARNING: Message has no chat_id or groupId: ${JSON.stringify(message)}`);
      if (messageText) {
        // Try to extract a chat ID from environment variables as fallback
        const envGroupIds = process.env.TELEGRAM_GROUP_IDS?.split(',') || [];
        if (envGroupIds.length > 0) {
          message.chat = message.chat || {};
          message.chat.id = parseInt(envGroupIds[0].trim(), 10);
          this.logger.info(`[BOT MSG DEBUG] Using fallback group ID: ${message.chat.id}`);
        } else {
          this.logger.error(`[BOT MSG DEBUG] ERROR: Cannot process message without chat_id and no fallback available`);
          return;
        }
      } else {
        this.logger.error(`[BOT MSG DEBUG] ERROR: Message has no content, ignoring`);
        return;
      }
    }
    
    // Standardize the chat ID
    const chatIdNum = Number(chatId);
    
    // Force-initialize conversation manager if not exists
    if (!this.conversationManagers.has(chatIdNum)) {
      this.logger.info(`[BOT MSG DEBUG] Initializing conversation manager for chat_id: ${chatIdNum}`);
      try {
        // Get the current character
        const character = this.runtime?.getCharacter();
        if (!character) {
          throw new Error('Character not available for conversation manager initialization');
        }
        
        // Create a personality enhancer from the character
        const { PersonalityEnhancer } = await import('./PersonalityEnhancer');
        const personality = new PersonalityEnhancer(this.agentId, this.runtime, this.logger);
        
        // Import the conversation manager dynamically
        const { ConversationManager } = await import('./ConversationManager');
        
        // Create conversation manager
        this.logger.info(`[BOT MSG DEBUG] Creating new conversation manager for chat ${chatIdNum}`);
        const manager = new ConversationManager(
          this.coordinationAdapter,
          this.relay,
          personality,
          this.agentId,
          chatIdNum,
          this.logger
        );
        
        this.conversationManagers.set(chatIdNum, manager);
        this.logger.info(`[BOT MSG DEBUG] Conversation manager initialized for group ${chatIdNum}`);
        
        // Create conversation kickstarter if we have the class
        if (this.ConversationKickstarter) {
          this.logger.info(`[BOT MSG DEBUG] Creating conversation kickstarter for chat ${chatIdNum}`);
          const kickstarter = new this.ConversationKickstarter(
            this.coordinationAdapter,
            this.relay,
            personality,
            manager,
            this.agentId,
            chatIdNum.toString(),
            this.runtime,
            this.logger
          );
          
          this.conversationKickstarters.set(chatIdNum, kickstarter);
          kickstarter.start();
          this.logger.info(`[BOT MSG DEBUG] Conversation kickstarter initialized for group ${chatIdNum}`);
        }
      } catch (error) {
        this.logger.error(`[BOT MSG DEBUG] Failed to initialize conversation manager: ${error}`);
      }
    }
    
    // Process the message
    const { decision, reason } = this.decideHowToHandleMessage(message);
    this.logger.info(`[BOT MSG DEBUG] Decision for message: ${decision}, reason: ${reason}`);
    
    // In test mode, bypass the decision
    const shouldProcess = decision === 'PROCESS' || (isBot && forceResponses);
    
    if (shouldProcess) {
      try {
        this.logger.info(`[BOT MSG DEBUG] PROCESSING message - calling runtime`);
        await this.processMessageWithRuntime(message);
      } catch (error) {
        this.logger.error(`Error processing message: ${error instanceof Error ? error.message : String(error)}`);
        this.logger.error(`Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      }
    } else {
      this.logger.info(`[BOT MSG DEBUG] IGNORING message - decision: ${decision}`);
    }
  }

  /**
   * Decide how to handle an incoming message
   * 
   * @param message - The incoming message
   * @returns Decision and reason
   */
  private decideHowToHandleMessage(message: any): { decision: string, reason: string } {
    this.logger.debug(`TelegramMultiAgentPlugin: Deciding how to handle message from ${message?.from?.username || message?.sender_agent_id || 'unknown'}`);
    
    // Get the current character and its username
    const currentCharacter = this.runtime?.getCharacter();
    const username = currentCharacter?.username || '';
    
    // Enhanced debugging for message handling
    const messageText = message.text || message.content || 'NO TEXT';
    this.logger.info(`[BOT MSG DEBUG] Processing message: ${messageText.substring(0, 100)}`);
    this.logger.info(`[BOT MSG DEBUG] From: ${message.from?.username || message.sender_agent_id}, is_bot: ${message.from?.is_bot}, sender_agent_id: ${message.sender_agent_id || 'none'}`);
    this.logger.info(`[BOT MSG DEBUG] This agent: ${this.agentId}, username: ${username}`);
    
    // Check if we should ignore bot messages - CRITICAL SECTION
    // We should NEVER ignore bot messages for bot-to-bot communication
    const shouldIgnoreBotMessages = false; // Force this to false to allow bot-to-bot communication
    this.logger.info(`[BOT MSG DEBUG] shouldIgnoreBotMessages setting: ${shouldIgnoreBotMessages} (forced to false)`);
    
    if (message.from?.is_bot && shouldIgnoreBotMessages) {
      this.logger.info('[BOT MSG DEBUG] IGNORING message from bot as per config');
      return { decision: 'IGNORE', reason: "Message from bot and configured to ignore" };
    } else {
      this.logger.info('[BOT MSG DEBUG] PROCESSING message (passed bot check)');
    }
    
    // Check if message contains a mention of this agent
    const mentionWithBot = `@${username}`;
    const mentionWithoutBot = `@${username.replace('_bot', '')}`;
    const agentIdWithBot = `@${this.agentId}`;
    const agentIdWithoutBot = `@${this.agentId.replace('_bot', '')}`;
    
    // Special case handlers for known agent names
    const specialMentions = [];
    
    // Handle Linda special case
    if (this.agentId.includes('linda') || username.includes('linda')) {
      specialMentions.push(
        '@linda', 
        'linda', 
        '@lindaevangelista', 
        'lindaevangelista',
        '@linda_evangelista',
        'linda_evangelista'
      );
    }
    
    // Handle VCShark special case
    if (this.agentId.includes('vc_shark') || username.includes('vcshark')) {
      specialMentions.push(
        '@vcshark', 
        'vcshark', 
        '@vc_shark', 
        'vc_shark',
        '@vcshark99',
        'vcshark99'
      );
    }
    
    // Look for mentions with detailed logging
    const messageLower = messageText.toLowerCase();
    
    // All possible mention formats for this agent
    const mentionFormats = [
      mentionWithBot, 
      mentionWithoutBot, 
      agentIdWithBot,
      agentIdWithoutBot,
      ...specialMentions
    ];
    
    this.logger.info(`[BOT MSG DEBUG] Checking for mentions in formats: ${mentionFormats.join(', ')}`);
    
    // Check each format and track which ones match
    const detectedTags = [];
    for (const format of mentionFormats) {
      if (messageLower.includes(format.toLowerCase())) {
        detectedTags.push(format);
        this.logger.info(`[BOT MSG DEBUG] ✅ DETECTED TAG: '${format}' in message`);
      }
    }
    
    // Always log if no tags were found
    if (detectedTags.length === 0) {
      this.logger.info(`[BOT MSG DEBUG] ❌ NO TAGS DETECTED for agent ${this.agentId}`);
    }
    
    // SPECIAL HANDLING: Check if we're in a test environment with few messages
    // If so, force the bot to respond even without a direct mention
    const shouldForceRespond = process.env.FORCE_BOT_RESPONSES === 'true';
    if (shouldForceRespond) {
      this.logger.info(`[BOT MSG DEBUG] FORCE_BOT_RESPONSES is enabled - will respond regardless of mentions`);
      return { decision: 'PROCESS', reason: "Force response enabled" };
    }
    
    // If we found any mentions, process the message
    if (detectedTags.length > 0) {
      return { decision: 'PROCESS', reason: `Mentioned this agent with tags: ${detectedTags.join(', ')}` };
    }
    
    // For now, let's always process messages for testing
    return { decision: 'PROCESS', reason: "Processing all messages for testing" };
  }
  
  /**
   * Process a message using the agent runtime
   * 
   * @param formattedMessage - Formatted message to process
   */
  private async processMessageWithRuntime(formattedMessage: any): Promise<void> {
    // Check runtime availability using our new method
    if (!this.isRuntimeAvailable()) {
      this.logger.info('[BOT MSG DEBUG] Runtime not available or not initialized, attempting to wait for runtime...');
      
      // Try to wait for runtime (with a shorter timeout for user experience)
      const runtimeReady = await this.waitForRuntime(10000); // 10 second wait max
      
      if (!runtimeReady) {
        this.logger.info('[BOT MSG DEBUG] Runtime still not available after waiting, attempting fallback response mechanism');
        
        try {
          // Fallback mechanism - send a direct response through Telegram API
          if (formattedMessage.sender_agent_id && (formattedMessage.chat?.id || formattedMessage.groupId || formattedMessage.chat_id)) {
            this.logger.info('[BOT MSG DEBUG] Using fallback direct response mechanism via Telegram API');
            
            // Extract mention/tag information
            const receivedFrom = formattedMessage.sender_agent_id;
            const chatId = formattedMessage.chat?.id || formattedMessage.groupId || formattedMessage.chat_id;
            const receivedText = formattedMessage.text || formattedMessage.content || '';
            
            // Create a minimal response
            const responseText = `@${receivedFrom} I received your message about "${receivedText.substring(0, 50)}..." and I'll respond as soon as I can fully process it.`;
            
            // Log what we're about to do
            this.logger.info(`[BOT MSG DEBUG] Sending fallback response to ${receivedFrom} in chat ${chatId}: ${responseText}`);
            
            // Send directly to Telegram
            await this.sendDirectTelegramMessage(chatId, responseText);
            
            this.logger.info('[BOT MSG DEBUG] Fallback response sent successfully via Telegram API');
            return;
          } else {
            this.logger.error('[BOT MSG DEBUG] Cannot use fallback - missing sender_agent_id or chat ID');
          }
        } catch (error) {
          this.logger.error(`[BOT MSG DEBUG] Error in fallback response: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        this.logger.error('[BOT MSG DEBUG] No runtime available and fallback failed, cannot process message');
        return;
      } else {
        this.logger.info('[BOT MSG DEBUG] Runtime is now available, proceeding with message processing');
      }
    }

    try {
      // Find the telegram client in the runtime's clients
      this.logger.debug('[BOT MSG DEBUG] Looking for telegram client in runtime clients');
      const runtimeClients = this.runtime.clients || [];
      this.logger.debug(`[BOT MSG DEBUG] Found ${runtimeClients.length} clients in runtime`);
      
      // Log each client's type for debugging
      if (runtimeClients.length > 0) {
        runtimeClients.forEach((client, index) => {
          if (client) {
            this.logger.debug(`[BOT MSG DEBUG] Client ${index}: type=${client.type || 'unknown'}, has processMessage=${typeof client.processMessage === 'function'}`);
          } else {
            this.logger.debug(`[BOT MSG DEBUG] Client ${index}: null or undefined`);
          }
        });
      }
      
      const telegramClient = runtimeClients.find(client => 
        client && typeof client === 'object' && 'processMessage' in client && client.type === 'telegram'
      );

      if (telegramClient && typeof telegramClient.processMessage === 'function') {
        this.logger.info('[BOT MSG DEBUG] Found telegram client, processing message');
        
        // Add information about the message being processed
        const fromInfo = formattedMessage.from?.username || formattedMessage.sender_agent_id || 'unknown';
        const contentSnippet = formattedMessage.content?.substring(0, 30) || 'no content';
        this.logger.info(`[BOT MSG DEBUG] Processing message from ${fromInfo}: "${contentSnippet}..."`);
        
        // Ensure the formatted message has all required fields
        this.ensureMessageFormat(formattedMessage);
        
        // Actually process the message
        await telegramClient.processMessage(formattedMessage);
        
        this.logger.info('[BOT MSG DEBUG] Message processed successfully, response should be generated');
      } else {
        this.logger.warn('[BOT MSG DEBUG] No suitable telegram client found in runtime, trying direct Telegram API');
        
        // Try direct telegram API as fallback
        if (formattedMessage.sender_agent_id && (formattedMessage.chat?.id || formattedMessage.groupId || formattedMessage.chat_id)) {
          this.logger.info('[BOT MSG DEBUG] Using direct Telegram API response');
          
          // Extract mention/tag information
          const receivedFrom = formattedMessage.sender_agent_id;
          const chatId = formattedMessage.chat?.id || formattedMessage.groupId || formattedMessage.chat_id;
          
          // Create a direct response
          const responseText = `@${receivedFrom} I acknowledge your message and will respond properly once I'm fully initialized.`;
          
          // Send directly to Telegram
          await this.sendDirectTelegramMessage(chatId, responseText);
          
          this.logger.info('[BOT MSG DEBUG] Direct Telegram API response sent successfully');
        } else {
          this.logger.error('[BOT MSG DEBUG] Cannot use direct Telegram API - missing sender_agent_id or chat ID');
        }
      }
    } catch (error) {
      this.logger.error(`[BOT MSG DEBUG] Error processing message with runtime: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`[BOT MSG DEBUG] Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    }
  }
  
  /**
   * Ensure message has all the required fields in the expected format
   * @param message - The message to standardize
   */
  private ensureMessageFormat(message: any): void {
    if (!message) {
      this.logger.error('[FORMATTER] Message is null or undefined');
      return;
    }
    
    this.logger.debug(`[FORMATTER] Original message format: ${JSON.stringify(message, null, 2)}`);
    
    // Standardize basic message properties
    message.text = message.text || message.content || '';
    message.content = message.content || message.text || '';
    
    // Ensure chat object exists and has ID
    message.chat = message.chat || {};
    message.chat.id = message.chat.id || message.groupId || message.chat_id || -1002550618173;
    
    // Add groupId for easier access if not present
    message.groupId = message.groupId || message.chat.id;
    
    // Ensure sender information
    message.from = message.from || {};
    message.from.username = message.from.username || message.sender_agent_id || 'unknown';
    message.from.id = message.from.id || Math.floor(Math.random() * 1000000);
    message.from.is_bot = message.from.is_bot === undefined ? true : message.from.is_bot;
    message.from.first_name = message.from.first_name || message.from.username;
    
    // Add sender_agent_id for compatibility with ElizaOS
    message.sender_agent_id = message.sender_agent_id || message.from.username;
    
    // Ensure message has an ID
    message.message_id = message.message_id || Date.now();
    
    // Add timestamp if not present
    message.date = message.date || Math.floor(Date.now() / 1000);
    
    // Add chat_id property used by some parts of the code
    message.chat_id = message.chat_id || message.chat.id;
    
    // Add thread support if missing
    if (!message.reply_to_message && message.thread_id) {
      message.reply_to_message = {
        message_id: message.thread_id
      };
    }
    
    // Standard message format for telegram-multi-agent
    const standardized = {
      message_id: message.message_id,
      from: message.from,
      date: message.date,
      chat: message.chat,
      text: message.text,
      content: message.content,
      sender_agent_id: message.sender_agent_id,
      groupId: message.groupId || message.chat.id,
      chat_id: message.chat_id || message.chat.id,
      reply_to_message: message.reply_to_message
    };
    
    // Copy standardized properties back to original message
    Object.assign(message, standardized);
    
    this.logger.debug(`[FORMATTER] Standardized message format: ${JSON.stringify(message, null, 2)}`);
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
    // If FORCE_BOT_RESPONSES is enabled, always respond
    if (process.env.FORCE_BOT_RESPONSES === 'true') {
      this.logger.debug(`[shouldRespond] ${agentId}: FORCE_BOT_RESPONSES is enabled, will respond`);
      return true;
    }
    
    // Get the message text
    const text = message.text || message.content || '';
    
    // Check if message is empty or too short
    if (!text || text.length < 2) {
      this.logger.debug(`[shouldRespond] ${agentId}: Message is empty or too short`);
      return false;
    }
    
    // Check if the message is from this bot (avoid responding to self)
    const fromUsername = message.from?.username || message.sender_agent_id || '';
    if (fromUsername === agentId) {
      this.logger.debug(`[shouldRespond] ${agentId}: Message is from self, ignoring`);
      return false;
    }
    
    // Detect all possible tag formats
    const isExplicitlyTagged = this.isAgentTaggedInMessage(text, agentId);
    
    if (isExplicitlyTagged) {
      this.logger.info(`[shouldRespond] ${agentId}: Agent is tagged in message, will respond`);
      return true;
    }
    
    // Check if the message is from another bot
    const isFromBot = message.from?.is_bot === true || this.isFromKnownBot(fromUsername);
    
    // If from another bot, but we're not tagged, don't respond to avoid bot chatter
    if (isFromBot && !isExplicitlyTagged) {
      this.logger.debug(`[shouldRespond] ${agentId}: Message is from another bot and not explicitly tagged, ignoring`);
      return false;
    }
    
    // Random chance to respond to non-tagged messages from humans (to appear natural)
    if (!isFromBot && Math.random() < 0.15) { // 15% chance
      this.logger.info(`[shouldRespond] ${agentId}: Random chance to respond to human message`);
      return true;
    }
    
    this.logger.debug(`[shouldRespond] ${agentId}: No criteria met for response`);
    return false;
  }
  
  /**
   * Check if this agent is specifically tagged in the message
   * Handles multiple tag formats
   * 
   * @param text - Message text
   * @param agentId - This agent's ID
   * @returns True if agent is tagged
   */
  private isAgentTaggedInMessage(text: string, agentId: string): boolean {
    // Normalize agent ID for comparison (remove underscores, make lowercase)
    const normalizedAgentId = agentId.replace(/_/g, '').toLowerCase();
    
    // Array of patterns to check
    const patterns = [
      // Standard Telegram @username format
      new RegExp(`@${agentId}\\b`, 'i'),
      // Variant without underscore
      new RegExp(`@${normalizedAgentId}\\b`, 'i'),
      // Direct username mention without @
      new RegExp(`\\b${agentId}\\b`, 'i'),
      // Username_bot format
      new RegExp(`\\b${agentId}_bot\\b`, 'i'),
      // Variants with different casing
      new RegExp(`@${agentId}`, 'i')
    ];
    
    // Check each pattern
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Check if the username belongs to a known bot
   * 
   * @param username - Username to check
   * @returns True if from a known bot
   */
  private isFromKnownBot(username: string): boolean {
    // List of known bot usernames (normalized to lowercase)
    const knownBots = [
      'linda_evangelista_88',
      'vc_shark_99',
      'bitcoin_maxi_420',
      'eth_memelord_9000',
      'bag_flipper_9000',
      'aeternity_admin'
    ].map(name => name.toLowerCase());
    
    return knownBots.includes(username.toLowerCase());
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

  /**
   * Initialize a conversation manager for a specific chat ID
   * @param chatId The chat ID to initialize a conversation manager for
   */
  private async initializeConversationManager(chatId: number): Promise<void> {
    this.logger.info(`[BOT MSG DEBUG] Initializing conversation manager for chat ID: ${chatId}`);
    
    // Skip if already initialized
    if (this.conversationManagers.has(chatId)) {
      this.logger.info(`[BOT MSG DEBUG] Conversation manager already exists for chat ID: ${chatId}`);
      return;
    }
    
    try {
      // Get the current character
      const character = this.runtime?.getCharacter();
      if (!character) {
        throw new Error('Character not available for conversation manager initialization');
      }
      
      // Create a personality enhancer for this character
      const personality = new PersonalityEnhancer(this.agentId, this.runtime, this.logger);
      
      // Create a new conversation manager - use the correct constructor signature
      const manager = new ConversationManager(
        this.coordinationAdapter,
        this.relay,
        personality,
        this.agentId,
        chatId,
        this.logger
      );
      
      // Store in the map
      this.conversationManagers.set(chatId, manager);
      this.logger.info(`[BOT MSG DEBUG] Successfully initialized conversation manager for chat ID: ${chatId}`);
      
      // Also create a kickstarter for this chat
      if (this.ConversationKickstarter) {
        const kickstarterConfig = this.loadConfig().kickstarterConfig || {
          minInterval: 1800000, // 30 minutes
          maxInterval: 3600000, // 1 hour
          probabilityFactor: 0.5,
          maxActiveConversationsPerGroup: 1,
          shouldTagAgents: true,
          maxAgentsToTag: 1,
          persistConversations: true
        };
        
        const kickstarter = new this.ConversationKickstarter(
          this.coordinationAdapter,
          this.relay,
          personality,
          manager,
          this.agentId,
          chatId.toString(),
          this.runtime,
          this.logger
        );
        
        this.conversationKickstarters.set(chatId, kickstarter);
        kickstarter.start();
        this.logger.info(`[BOT MSG DEBUG] Started conversation kickstarter for chat ID: ${chatId}`);
      }
    } catch (error) {
      this.logger.error(`[BOT MSG DEBUG] Failed to initialize conversation manager: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Send a direct message to Telegram API
   * This bypasses the relay server and sends directly to Telegram
   */
  private async sendDirectTelegramMessage(chatId: string | number, text: string, options: any = {}): Promise<any> {
    this.logger.info(`TelegramMultiAgentPlugin: Sending direct message to Telegram API, chat ${chatId}: ${text.substring(0, 30)}...`);
    
    // Get the bot token from environment variables based on agent ID
    // Try multiple variants of the environment variable name (to handle case differences)
    const agentIdForEnv = this.agentId.replace(/[^a-zA-Z0-9]/g, '');
    
    // Try different formats for the environment variable name
    const possibleEnvVars = [
      `TELEGRAM_BOT_TOKEN_${agentIdForEnv}`,
      `TELEGRAM_BOT_TOKEN_${agentIdForEnv.toLowerCase()}`,
      `TELEGRAM_BOT_TOKEN_${agentIdForEnv.toUpperCase()}`,
      // Detect camelCase format (e.g. LindAEvangelista88)
      ...Object.keys(process.env).filter(key => 
        key.startsWith('TELEGRAM_BOT_TOKEN_') && 
        key.toLowerCase() === `telegram_bot_token_${agentIdForEnv.toLowerCase()}`
      )
    ];
    
    this.logger.debug(`TelegramMultiAgentPlugin: Looking for token in env vars: ${possibleEnvVars.join(', ')}`);
    
    // Find the first matching environment variable
    let botToken = null;
    for (const envVar of possibleEnvVars) {
      if (process.env[envVar]) {
        botToken = process.env[envVar];
        this.logger.debug(`TelegramMultiAgentPlugin: Found token in ${envVar}`);
        break;
      }
    }
    
    if (!botToken) {
      // Try direct lookup with agent ID as-is
      if (this.agentId === 'linda_evangelista_88' && process.env.TELEGRAM_BOT_TOKEN_LindAEvangelista88) {
        botToken = process.env.TELEGRAM_BOT_TOKEN_LindAEvangelista88;
        this.logger.debug(`TelegramMultiAgentPlugin: Using hardcoded token for linda_evangelista_88`);
      } else if (this.agentId === 'vc_shark_99' && process.env.TELEGRAM_BOT_TOKEN_VCShark99) {
        botToken = process.env.TELEGRAM_BOT_TOKEN_VCShark99;
        this.logger.debug(`TelegramMultiAgentPlugin: Using hardcoded token for vc_shark_99`);
      } else {
        this.logger.error(`TelegramMultiAgentPlugin: No bot token found for agent ${this.agentId}`);
        this.logger.debug(`TelegramMultiAgentPlugin: Available env vars: ${Object.keys(process.env).filter(k => k.includes('TELEGRAM_BOT_TOKEN')).join(', ')}`);
        throw new Error(`No bot token found for agent ${this.agentId}`);
      }
    }
    
    try {
      // Prepare message payload
      const payload = {
        chat_id: chatId.toString(),
        text: text,
        parse_mode: 'Markdown',
        ...options
      };
      
      this.logger.debug(`TelegramMultiAgentPlugin: Sending payload to Telegram API: ${JSON.stringify(payload)}`);
      
      // Send request to Telegram API
      const apiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        this.logger.error(`TelegramMultiAgentPlugin: Failed to send message to Telegram: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        this.logger.error(`TelegramMultiAgentPlugin: Error response: ${errorText}`);
        throw new Error(`Failed to send message to Telegram: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      this.logger.info(`TelegramMultiAgentPlugin: Message sent successfully to Telegram, response: ${JSON.stringify(data)}`);
      return data;
    } catch (error) {
      this.logger.error(`TelegramMultiAgentPlugin: Error sending message to Telegram: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`TelegramMultiAgentPlugin: Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      throw error;
    }
  }

  /**
   * Wait for the runtime to be available
   * @param timeoutMs Maximum time to wait in milliseconds
   * @returns Promise that resolves when runtime is available, or rejects with timeout
   */
  private async waitForRuntime(timeoutMs = this.maxRuntimeWaitMs): Promise<boolean> {
    const startTime = Date.now();
    this.logger.info('[RUNTIME] TelegramMultiAgentPlugin: Waiting for runtime to be available');
    
    return new Promise<boolean>((resolve) => {
      const checkRuntime = () => {
        // Check if we've exceeded the timeout
        if (Date.now() - startTime > timeoutMs) {
          this.logger.warn(`[RUNTIME] TelegramMultiAgentPlugin: Runtime wait timeout exceeded (${timeoutMs}ms)`);
          resolve(false);
          return;
        }
        
        // Check if runtime is available
        if (this.runtime) {
          try {
            // Try to use the runtime to verify it's properly connected
            const runtimeId = this.runtime.getAgentId();
            this.logger.info(`[RUNTIME] TelegramMultiAgentPlugin: Runtime connected with agent ID: ${runtimeId}`);
            this.runtimeInitialized = true;
            resolve(true);
            return;
          } catch (e) {
            this.runtimeRetryAttempts++;
            if (this.runtimeRetryAttempts >= this.maxRuntimeRetryAttempts) {
              this.logger.error(`[RUNTIME] TelegramMultiAgentPlugin: Maximum runtime retry attempts (${this.maxRuntimeRetryAttempts}) exceeded`);
              resolve(false);
              return;
            }
            this.logger.warn(`[RUNTIME] TelegramMultiAgentPlugin: Runtime connection error: ${e instanceof Error ? e.message : String(e)}`);
          }
        } else {
          this.runtimeRetryAttempts++;
          if (this.runtimeRetryAttempts >= this.maxRuntimeRetryAttempts) {
            this.logger.error(`[RUNTIME] TelegramMultiAgentPlugin: Maximum runtime retry attempts (${this.maxRuntimeRetryAttempts}) exceeded`);
            resolve(false);
            return;
          }
          this.logger.debug(`[RUNTIME] TelegramMultiAgentPlugin: Runtime not yet available (attempt ${this.runtimeRetryAttempts}/${this.maxRuntimeRetryAttempts})`);
        }
        
        // Schedule next check
        setTimeout(checkRuntime, this.runtimeWaitIntervalMs);
      };
      
      // Start checking
      checkRuntime();
    });
  }
  
  /**
   * Check if runtime is available and valid
   * @returns True if runtime is available and initialized, false otherwise
   */
  private isRuntimeAvailable(): boolean {
    if (!this.runtime) {
      this.logger.debug('[RUNTIME] TelegramMultiAgentPlugin: No runtime available');
      return false;
    }
    
    if (!this.runtimeInitialized) {
      this.logger.debug('[RUNTIME] TelegramMultiAgentPlugin: Runtime not yet initialized');
      return false;
    }
    
    try {
      // Quick verification that runtime is still working
      const runtimeId = this.runtime.getAgentId();
      if (!runtimeId) {
        this.logger.warn('[RUNTIME] TelegramMultiAgentPlugin: Runtime returned empty agent ID');
        return false;
      }
      return true;
    } catch (e) {
      this.logger.warn(`[RUNTIME] TelegramMultiAgentPlugin: Runtime verification error: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    }
  }
} 