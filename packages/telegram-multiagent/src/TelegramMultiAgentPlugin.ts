import { ElizaLogger, IAgentRuntime, Plugin } from './types';
import { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
import { TelegramRelay } from './TelegramRelay';
import { ConversationManager } from './ConversationManager';
import { PersonalityEnhancer } from './PersonalityEnhancer';
import { TelegramMultiAgentPluginConfig } from './index';
import { SqliteDatabaseAdapter } from './SqliteDatabaseAdapter';
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
      const availableAgents = await this.coordinationAdapter.getAvailableAgents();
      const agentIds = availableAgents.map(agent => 
        typeof agent === 'object' && agent !== null
          ? (agent.agentId || agent.id || agent.toString()) 
          : (agent || '').toString()
      );
      
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
    try {
      if (!message || !message.content || !message.groupId) {
        return;
      }
      
      const groupId = parseInt(message.groupId);
      if (isNaN(groupId)) {
        return;
      }
      
      // Check if we have a conversation kickstarter for this group
      const kickstarter = this.conversationKickstarters.get(groupId);
      const conversationManager = this.conversationManagers.get(groupId);
      
      if (!kickstarter || !conversationManager) {
        return;
      }
      
      // Check for admin commands
      if (message.content.startsWith('/kickstart')) {
        // Extract a topic if provided
        const match = message.content.match(/\/kickstart\s+(.+)/);
        const topic = match ? match[1] : undefined;
        
        // Force kickstart
        await kickstarter.forceKickstart(topic);
        return;
      }
      
      // Handle normal message
      // Here you would implement logic to decide whether to respond
      // and how to manage the conversation
    } catch (error) {
      this.logger.error(`TelegramMultiAgentPlugin: Error handling message: ${error}`);
    }
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