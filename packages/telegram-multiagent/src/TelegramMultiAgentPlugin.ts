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
 * It implements the standard ElizaOS Plugin interface
 */
export class TelegramMultiAgentPlugin implements Plugin {
  // Required Plugin properties
  public name: string = 'TelegramMultiAgentPlugin';
  public description: string = 'Enables multi-agent coordination in Telegram groups';
  public npmName: string = '@elizaos/telegram-multiagent';
  public version: string = '0.1.0';
  
  // Flag to track initialization state
  private initialized = false;
  
  // Plugin state
  private config: TelegramMultiAgentPluginConfig;
  private logger: ElizaLogger;
  private isInitialized = false;
  private relay: TelegramRelay | null = null;
  private runtime: IAgentRuntime | null = null;
  private agentId: string = '';
  private coordinationAdapter: TelegramCoordinationAdapter | null = null;
  private conversationManagers: Map<number, ConversationManager> = new Map();
  private conversationKickstarters: Map<number, ConversationKickstarter> = new Map();
  private dbAdapter: SqliteDatabaseAdapter | null = null;
  private checkIntervalId: NodeJS.Timeout | null = null;
  private telegramGroupIds: string[] = [];
  private runtimeInitialized = false;
  private messageRetryQueue: Map<string, {
    message: any, 
    attempts: number,
    timestamp: number
  }> = new Map();
  private maxMessageRetries: number = 3; // Maximum retry attempts for a message
  private ConversationKickstarter: any; // Reference to the ConversationKickstarter class

  /**
   * Create a new TelegramMultiAgentPlugin
   * 
   * @param config - Plugin configuration
   */
  constructor(config: TelegramMultiAgentPluginConfig) {
    console.log('[CONSTRUCTOR] TelegramMultiAgentPlugin: Constructor called');
    
    this.config = {
      conversationCheckIntervalMs: 60000, // 1 minute default
      enabled: true,
      useSqliteAdapter: true,  // Enable SQLite adapter by default
      dbPath: ':memory:',      // Use in-memory SQLite by default
      kickstarterConfig: {},   // Default kickstarter config
      ...config
    };
    
    // Create a default logger that uses console directly
    this.logger = {
      debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      warn: (msg: string) => console.log(`[WARN] ${msg}`),
      error: (msg: string) => console.log(`[ERROR] ${msg}`)
    };
  }

  /**
   * Standard Plugin interface method for registering with runtime
   * This is called by the runtime during agent initialization
   * 
   * @param runtime - Agent runtime instance
   * @returns true if registration was successful
   */
  register(runtime: IAgentRuntime): boolean {
    console.log('[REGISTER] TelegramMultiAgentPlugin: Registering with runtime');
    
    if (!runtime) {
      console.error('[REGISTER] TelegramMultiAgentPlugin: Invalid runtime provided (null or undefined)');
      return false;
    }
    
    // Store runtime reference with additional safety measures
    this.runtime = runtime;
    console.log('[REGISTER] TelegramMultiAgentPlugin: Runtime reference stored in instance');
    
    // IMPORTANT NEW CODE: Store runtime globally as backup measure
    try {
      (global as any).__telegramMultiAgentRuntime = runtime;
      console.log('[REGISTER] TelegramMultiAgentPlugin: Runtime reference stored globally as backup');
    } catch (error) {
      console.warn(`[REGISTER] TelegramMultiAgentPlugin: Could not store runtime globally: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Set runtimeInitialized flag to true immediately
    this.runtimeInitialized = true;
    console.log('[REGISTER] TelegramMultiAgentPlugin: runtimeInitialized flag set to true');
    
    // Try to get agent ID from runtime
    try {
      this.agentId = runtime.getAgentId();
      console.log(`[REGISTER] TelegramMultiAgentPlugin: Agent ID set to ${this.agentId}`);
    } catch (error) {
      console.error(`[REGISTER] TelegramMultiAgentPlugin: Error getting agent ID from runtime: ${error instanceof Error ? error.message : String(error)}`);
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
    
    // Mark runtimeInitialized as true now that we have basic registration
    this.runtimeInitialized = true;
    
    // Register this as a service if service registration is available
    try {
      if (typeof runtime.registerService === 'function') {
        runtime.registerService('telegram-multiagent', this);
        console.log('[REGISTER] TelegramMultiAgentPlugin: Registered as a service with runtime');
      }
    } catch (error) {
      console.error(`[REGISTER] TelegramMultiAgentPlugin: Error during service registration: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    console.log('[REGISTER] TelegramMultiAgentPlugin: Registration complete');
    return true;
  }
  
  /**
   * Standard Plugin interface method for initializing the plugin
   * This is called by the runtime after all plugins are registered
   */
  public async initialize(): Promise<void> {
    const bootTime = Date.now();
    console.log(`[INIT] TelegramMultiAgentPlugin: Initializing (version ${this.getVersion()})...`);
    
    try {
      // Make sure we're initialized
      if (this.initialized) {
        console.log('[INIT] TelegramMultiAgentPlugin: Already initialized');
        return;
      }
      
      // Wait for runtime availability with a 30-second timeout
      const runtimeAvailable = await this.waitForRuntime(30000);
      if (!runtimeAvailable && !process.env.FORCE_RUNTIME_AVAILABLE) {
        console.warn('[INIT] TelegramMultiAgentPlugin: Runtime not available after timeout, initializing without runtime integration');
      } else {
        // Verify runtime and try to register with it
        const runtime = this.getRuntime();
        if (runtime) {
          console.log('[INIT] TelegramMultiAgentPlugin: Runtime found, attempting to register plugin');
          
          // Try to register with runtime
          const registered = await this.registerWithRuntime(runtime);
          if (registered) {
            console.log('[INIT] TelegramMultiAgentPlugin: Successfully registered with runtime');
          } else {
            console.warn('[INIT] TelegramMultiAgentPlugin: Failed to register with runtime, continuing with limited functionality');
          }
        } else if (process.env.FORCE_RUNTIME_AVAILABLE === 'true') {
          console.warn('[INIT] TelegramMultiAgentPlugin: FORCE_RUNTIME_AVAILABLE is true but runtime not found, continuing with limited functionality');
        }
      }
      
      // Initialize bot, server, and storage
      await this.initializeBot();
      await this.initializeServer();
      await this.initializeStorage();
      
      // Show initialization status
      this.initialized = true;
      const initTime = Date.now() - bootTime;
      console.log(`[INIT] TelegramMultiAgentPlugin: Initialization complete in ${initTime}ms`);
    } catch (error) {
      console.error(`[INIT] TelegramMultiAgentPlugin: Initialization failed: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        console.error(`[INIT] TelegramMultiAgentPlugin: Stack trace: ${error.stack}`);
      }
      throw error;
    }
  }
  
  /**
   * Attempts to register the plugin with the runtime
   * @param runtime The runtime to register with
   * @returns Promise resolving to true if registration was successful
   */
  private async registerWithRuntime(runtime: any): Promise<boolean> {
    try {
      if (!runtime) {
        console.warn('[REGISTER] TelegramMultiAgentPlugin: No runtime provided for registration');
        return false;
      }
      
      // Check if registerPlugin method exists
      if (typeof runtime.registerPlugin !== 'function') {
        console.warn('[REGISTER] TelegramMultiAgentPlugin: Runtime does not have registerPlugin method');
        return false;
      }
      
      // Attempt to register
      console.log('[REGISTER] TelegramMultiAgentPlugin: Attempting to register with runtime');
      const result = runtime.registerPlugin(this);
      console.log(`[REGISTER] TelegramMultiAgentPlugin: Registration result: ${result}`);
      
      // Store runtime reference on success
      if (result) {
        this.runtime = runtime;
        this.runtimeInitialized = true;
        
        try {
          // Store global runtime as backup
          (global as any).__telegramMultiAgentRuntime = runtime;
        } catch (e) {
          console.warn(`[REGISTER] TelegramMultiAgentPlugin: Failed to store global runtime: ${e instanceof Error ? e.message : String(e)}`);
        }
        
        // Try to get agent ID as verification
        try {
          if (typeof runtime.getAgentId === 'function') {
            const agentId = runtime.getAgentId();
            console.log(`[REGISTER] TelegramMultiAgentPlugin: Verified runtime with agent ID: ${agentId}`);
          }
        } catch (e) {
          console.warn(`[REGISTER] TelegramMultiAgentPlugin: Failed to verify runtime: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      
      return !!result;
    } catch (error) {
      console.error(`[REGISTER] TelegramMultiAgentPlugin: Registration failed with error: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof Error && error.stack) {
        console.error(`[REGISTER] TelegramMultiAgentPlugin: Stack trace: ${error.stack}`);
      }
      return false;
    }
  }

  /**
   * Standard Plugin interface method for shutting down the plugin
   * This is called by the runtime when the agent is shutting down
   */
  async shutdown(): Promise<void> {
    console.log('[SHUTDOWN] TelegramMultiAgentPlugin: shutdown() method called');
    
    if (!this.isInitialized) {
      console.log('[SHUTDOWN] TelegramMultiAgentPlugin: Not initialized, nothing to shut down');
      return;
    }
    
    // Clear the check interval
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
      console.log('[SHUTDOWN] TelegramMultiAgentPlugin: Cleared conversation check interval');
    }
    
    // Stop all conversation kickstarters
    try {
      for (const [groupId, kickstarter] of this.conversationKickstarters.entries()) {
        if (kickstarter && typeof kickstarter.stop === 'function') {
          console.log(`[SHUTDOWN] TelegramMultiAgentPlugin: Stopping kickstarter for group ${groupId}`);
          kickstarter.stop();
        }
      }
      console.log('[SHUTDOWN] TelegramMultiAgentPlugin: All conversation kickstarters stopped');
    } catch (error) {
      console.error(`[SHUTDOWN] TelegramMultiAgentPlugin: Error stopping kickstarters: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Disconnect from relay server
    try {
      if (this.relay) {
        console.log('[SHUTDOWN] TelegramMultiAgentPlugin: Disconnecting from relay server');
        await this.relay.disconnect();
        console.log('[SHUTDOWN] TelegramMultiAgentPlugin: Disconnected from relay server');
      }
    } catch (error) {
      console.error(`[SHUTDOWN] TelegramMultiAgentPlugin: Error disconnecting from relay: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // Close database adapter if initialized
    if (this.dbAdapter) {
      try {
        console.log('[SHUTDOWN] TelegramMultiAgentPlugin: Closing database adapter');
        await this.dbAdapter.close();
        console.log('[SHUTDOWN] TelegramMultiAgentPlugin: Database adapter closed');
      } catch (error) {
        console.error(`[SHUTDOWN] TelegramMultiAgentPlugin: Error closing database adapter: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Mark as not initialized
    this.isInitialized = false;
    console.log('[SHUTDOWN] TelegramMultiAgentPlugin: Shutdown complete');
    
    return Promise.resolve();
  }

  // Override toString method to make debugging easier
  toString(): string {
    return `[TelegramMultiAgentPlugin name=${this.name} description=${this.description} npmName=${this.npmName}]`;
  }

  /**
   * Load configuration from environment or config file
   */
  private loadConfig(): TelegramMultiAgentPluginConfig {
    // Get agent ID from environment - don't try to get it from config as it's not part of our config interface
    this.agentId = process.env.AGENT_ID || this.agentId || '';
    
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
    
    // Special handling for bot-to-bot communication
    if ((isBot || message._isBotMessage) && !message._processingBot) {
      // Skip if this is already being processed by our bot handler
      if (!message._alreadyRouted) {
        this.logger.info(`[BOT MSG DEBUG] Detected message from another bot: ${fromUsername}`);
        message._alreadyRouted = true;
        
        // Check if this is directed to us by checking for tags
        const { decision, reason } = this.decideHowToHandleMessage(message);
        if (decision === 'PROCESS' || forceResponses) {
          this.logger.info(`[BOT MSG DEBUG] Bot message addressed to us, routing to dedicated bot handler`);
          await this.handleBotMessage(message);
          return;
        } else {
          this.logger.info(`[BOT MSG DEBUG] Bot message not addressed to us, ignoring: ${reason}`);
          return;
        }
      }
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
    
    // IMPROVED TAG DETECTION: Generate normalized versions of our identifiers
    const ourIdentifiers = [];
    
    // Add agent ID variations
    if (this.agentId) {
      // Base agent ID
      ourIdentifiers.push(this.agentId.toLowerCase());
      
      // With @ symbol
      ourIdentifiers.push(`@${this.agentId.toLowerCase()}`);
      
      // Without _bot suffix if present
      if (this.agentId.toLowerCase().endsWith('_bot')) {
        const withoutBot = this.agentId.toLowerCase().replace(/_bot$/, '');
        ourIdentifiers.push(withoutBot);
        ourIdentifiers.push(`@${withoutBot}`);
      }
      
      // With _bot suffix if not present
      if (!this.agentId.toLowerCase().endsWith('_bot')) {
        ourIdentifiers.push(`${this.agentId.toLowerCase()}_bot`);
        ourIdentifiers.push(`@${this.agentId.toLowerCase()}_bot`);
      }
      
      // Telegram standard format (camelCase with _bot suffix)
      if (this.agentId.includes('_')) {
        const telegramFormat = this.agentId
          .split('_')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join('');
        ourIdentifiers.push(`${telegramFormat}_bot`);
        ourIdentifiers.push(`@${telegramFormat}_bot`);
      }
      
      // Without numbers if present (e.g., vcshark99 -> vcshark)
      const withoutNumbers = this.agentId.toLowerCase().replace(/\d+$/, '');
      if (withoutNumbers !== this.agentId.toLowerCase()) {
        ourIdentifiers.push(withoutNumbers);
        ourIdentifiers.push(`@${withoutNumbers}`);
      }
      
      // Parts of compound names (e.g., linda_evangelista -> linda, evangelista)
      if (this.agentId.includes('_')) {
        const parts = this.agentId.split('_');
        parts.forEach(part => {
          if (part.length > 3) { // Only include parts that are substantial
            ourIdentifiers.push(part.toLowerCase());
            ourIdentifiers.push(`@${part.toLowerCase()}`);
          }
        });
      }
      
      // Add without underscores (e.g., linda_evangelista -> lindaevangelista)
      if (this.agentId.includes('_')) {
        const noUnderscores = this.agentId.replace(/_/g, '').toLowerCase();
        ourIdentifiers.push(noUnderscores);
        ourIdentifiers.push(`@${noUnderscores}`);
        
        // Also with _bot suffix
        ourIdentifiers.push(`${noUnderscores}_bot`);
        ourIdentifiers.push(`@${noUnderscores}_bot`);
      }
    }

    // Special agent-specific formats - Add the exact telegram bot usernames
    if (this.agentId.includes('linda') || this.agentId.includes('evangelista')) {
        ourIdentifiers.push('LindaEvangelista88_bot');
        ourIdentifiers.push('@LindaEvangelista88_bot');
    }
    else if (this.agentId.includes('vc_shark') || this.agentId.includes('vcshark')) {
        ourIdentifiers.push('VCShark99_bot');
        ourIdentifiers.push('@VCShark99_bot');
    }
    else if (this.agentId.includes('bitcoin_maxi')) {
        ourIdentifiers.push('BitcoinMaxi420_bot');
        ourIdentifiers.push('@BitcoinMaxi420_bot');
    }
    else if (this.agentId.includes('eth_memelord')) {
        ourIdentifiers.push('ETHMemeLord9000_bot');
        ourIdentifiers.push('@ETHMemeLord9000_bot');
    }
    else if (this.agentId.includes('bag_flipper')) {
        ourIdentifiers.push('BagFlipper9000_bot');
        ourIdentifiers.push('@BagFlipper9000_bot');
    }
    else if (this.agentId.includes('code_samurai')) {
        ourIdentifiers.push('CodeSamurai77_bot');
        ourIdentifiers.push('@CodeSamurai77_bot');
    }
    
    // Add username variations
    if (username && username !== this.agentId) {
      // Base username
      ourIdentifiers.push(username.toLowerCase());
      
      // With @ symbol
      ourIdentifiers.push(`@${username.toLowerCase()}`);
      
      // Without _bot suffix if present
      if (username.toLowerCase().endsWith('_bot')) {
        const withoutBot = username.toLowerCase().replace(/_bot$/, '');
        ourIdentifiers.push(withoutBot);
        ourIdentifiers.push(`@${withoutBot}`);
      }
      
      // With _bot suffix if not present
      if (!username.toLowerCase().endsWith('_bot')) {
        ourIdentifiers.push(`${username.toLowerCase()}_bot`);
        ourIdentifiers.push(`@${username.toLowerCase()}_bot`);
      }
      
      // Without numbers if present
      const withoutNumbers = username.toLowerCase().replace(/\d+$/, '');
      if (withoutNumbers !== username.toLowerCase()) {
        ourIdentifiers.push(withoutNumbers);
        ourIdentifiers.push(`@${withoutNumbers}`);
      }
      
      // Telegram format: remove underscores
      const noUnderscores = username.toLowerCase().replace(/_/g, '');
      ourIdentifiers.push(noUnderscores);
      ourIdentifiers.push(`@${noUnderscores}`);
      
      // Telegram format: with spaces instead of underscores
      const withSpaces = username.toLowerCase().replace(/_/g, ' ');
      ourIdentifiers.push(withSpaces);
      ourIdentifiers.push(`@${withSpaces}`);
    }
    
    // Special case handlers for known agent names - Add common variations
    if (this.agentId.includes('linda') || username.includes('linda') || 
        this.agentId.includes('evangelista') || username.includes('evangelista')) {
      ourIdentifiers.push(...[
        'linda', '@linda', 
        'lindaevangelista', '@lindaevangelista',
        'linda_evangelista', '@linda_evangelista',
        'evangelista', '@evangelista',
        'lindaevangelista88', '@lindaevangelista88',
        'linda evangelista', '@linda evangelista',
        'linda evangelista 88', '@linda evangelista 88',
        'lindaevangelista_88', '@lindaevangelista_88'
      ]);
    }
    
    if (this.agentId.includes('vc_shark') || this.agentId.includes('vcshark') || 
        username.includes('vc_shark') || username.includes('vcshark')) {
      ourIdentifiers.push(...[
        'vcshark', '@vcshark', 
        'vc_shark', '@vc_shark',
        'vcshark99', '@vcshark99',
        'vc shark', '@vc shark',
        'vc shark 99', '@vc shark 99',
        'shark', '@shark'
      ]);
    }
    
    // Add common misspellings
    const commonMisspellings = this.getCommonMisspellings(this.agentId);
    ourIdentifiers.push(...commonMisspellings);
    
    // Deduplicate the list
    const uniqueIdentifiers = [...new Set(ourIdentifiers)];
    
    // Log all the identifiers we're checking for
    this.logger.info(`[BOT MSG DEBUG] Checking for ${uniqueIdentifiers.length} possible mentions: ${uniqueIdentifiers.join(', ')}`);
    
    // Normalize the message text for checking
    const messageLower = messageText.toLowerCase();
    
    // Check each identifier and track which ones match
    const detectedTags = [];
    for (const identifier of uniqueIdentifiers) {
      // Check if the identifier is present as a whole word (not part of another word)
      const pattern = new RegExp(`\\b${this.escapeRegExp(identifier)}\\b`, 'i');
      if (pattern.test(messageLower)) {
        detectedTags.push(identifier);
        this.logger.info(`[BOT MSG DEBUG] ✅ DETECTED TAG: '${identifier}' in message`);
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
   * Helper to escape special characters in regex
   */
  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  /**
   * Get common misspellings of a name
   */
  private getCommonMisspellings(name: string): string[] {
    const misspellings = [];
    
    // Handle linda_evangelista special case
    if (name.includes('linda') || name.includes('evangelista')) {
      misspellings.push(
        'lynda', '@lynda',
        'lyndaevangelista', '@lyndaevangelista',
        'lindaevangalista', '@lindaevangalista',
        'lindaevangelist', '@lindaevangelist',
        'lindaevangelista88_bot', '@lindaevangelista88_bot',
        'LindaEvangelista88_bot', '@LindaEvangelista88_bot'
      );
    }
    
    // Handle vcshark special case
    if (name.includes('vcshark') || name.includes('vc_shark')) {
      misspellings.push(
        'vcsharks', '@vcsharks',
        'vc_sharks', '@vc_sharks',
        'vshark', '@vshark',
        'vcsark', '@vcsark',
        'vcshark99_bot', '@vcshark99_bot',
        'VCShark99_bot', '@VCShark99_bot'
      );
    }
    
    // Handle bitcoin maxi special case
    if (name.includes('bitcoin') || name.includes('btc')) {
      misspellings.push(
        'bitcoinmaxi420_bot', '@bitcoinmaxi420_bot',
        'BitcoinMaxi420_bot', '@BitcoinMaxi420_bot'
      );
    }
    
    // Handle eth memelord special case
    if (name.includes('eth') || name.includes('memelord')) {
      misspellings.push(
        'ethmemelord9000_bot', '@ethmemelord9000_bot',
        'ETHMemeLord9000_bot', '@ETHMemeLord9000_bot'
      );
    }
    
    // Handle bag flipper special case
    if (name.includes('bag') || name.includes('flip')) {
      misspellings.push(
        'bagflipper9000_bot', '@bagflipper9000_bot',
        'BagFlipper9000_bot', '@BagFlipper9000_bot'
      );
    }
    
    // Handle code samurai special case
    if (name.includes('code') || name.includes('samurai')) {
      misspellings.push(
        'codesamurai77_bot', '@codesamurai77_bot',
        'CodeSamurai77_bot', '@CodeSamurai77_bot'
      );
    }
    
    return misspellings;
  }
  
  /**
   * Process a message using the agent runtime
   * 
   * @param formattedMessage - Formatted message to process
   */
  private async processMessageWithRuntime(formattedMessage: any): Promise<void> {
    // Check runtime availability using our improved method
    if (!this.isRuntimeAvailable()) {
      this.logger.info('[BOT MSG DEBUG] Runtime not available or not initialized, attempting to wait for runtime...');
      
      // Try to wait for runtime (with a shorter timeout for user experience)
      const runtimeReady = await this.waitForRuntime(15000); // 15 second wait max
      
      if (!runtimeReady) {
        this.logger.info('[BOT MSG DEBUG] Runtime still not available after waiting, attempting fallback response mechanism');
        
        try {
          // Extract important message information
          const receivedFrom = formattedMessage.sender_agent_id || formattedMessage.from?.username;
          const chatId = formattedMessage.chat?.id || formattedMessage.groupId || formattedMessage.chat_id;
          const receivedText = formattedMessage.text || formattedMessage.content || '';
          
          if (receivedFrom && chatId) {
            // Create a more informative fallback response
            const responseText = `@${receivedFrom.replace(/_/g, '')} I received your message about "${receivedText.substring(0, 50)}..." but my AI system is still initializing. I'll respond properly once my system is ready.`;
            
            this.logger.info(`[BOT MSG DEBUG] Sending fallback response to ${receivedFrom} in chat ${chatId}: ${responseText}`);
            
            // Send directly to Telegram
            await this.sendDirectTelegramMessage(chatId, responseText);
            this.logger.info('[BOT MSG DEBUG] Fallback response sent successfully via Telegram API');
            
            // Schedule a retry to process this message again later
            this.scheduleMessageRetry(formattedMessage);
            return;
          } else {
            this.logger.error('[BOT MSG DEBUG] Cannot use fallback - missing sender or chat ID');
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
      
      // Ensure clients array exists to prevent crashes
      if (!this.runtime.clients || !Array.isArray(this.runtime.clients)) {
        this.logger.warn('[BOT MSG DEBUG] Runtime clients array is missing or invalid, creating empty array');
        this.runtime.clients = [];
      }
      
      const runtimeClients = this.runtime.clients;
      this.logger.debug(`[BOT MSG DEBUG] Found ${runtimeClients.length} clients in runtime`);
      
      // Verify Telegram client exists - this is needed for message processing
      const telegramClient = runtimeClients.find(client => client && client.type === 'telegram');
      
      if (!telegramClient) {
        this.logger.warn('[BOT MSG DEBUG] Telegram client not found in runtime clients, creating minimal client wrapper');
        
        // Create a minimal Telegram client wrapper for handling the message
        const minimalClient = {
          type: 'telegram',
          getMessages: async () => [],
          sendMessage: async (chatId: string | number, text: string) => {
            try {
              return await this.sendDirectTelegramMessage(chatId, text);
            } catch (error) {
              this.logger.error(`[BOT MSG DEBUG] Error in minimal client sendMessage: ${error instanceof Error ? error.message : String(error)}`);
              throw error;
            }
          }
        };
        
        // Add minimal client to the runtime clients
        this.runtime.clients.push(minimalClient);
        this.logger.info('[BOT MSG DEBUG] Added minimal Telegram client to runtime clients');
      }
      
      // Process the message with the runtime
      this.logger.info('[BOT MSG DEBUG] Processing message with runtime');
      try {
        // Find a suitable client to process the message
        const clients = this.runtime.clients || [];
        const telegramClient = clients.find(client => client && client.type === 'telegram');
        
        if (telegramClient && typeof telegramClient.processMessage === 'function') {
          this.logger.info('[BOT MSG DEBUG] Using telegram client to process message');
          await telegramClient.processMessage(formattedMessage);
        } else {
          // Extract message components for direct response
          const chatId = formattedMessage.chat?.id || formattedMessage.groupId || formattedMessage.chat_id;
          const receivedFrom = formattedMessage.sender_agent_id || formattedMessage.from?.username;
          const messageText = formattedMessage.text || formattedMessage.content || '';
          
          if (receivedFrom && chatId) {
            // Create a response that acknowledges the message
            const response = `@${receivedFrom.replace(/_/g, '')} I received your message about "${messageText.substring(0, 30)}..." but I'm having trouble with my messaging system right now.`;
            
            // Send direct response
            await this.sendDirectTelegramMessage(chatId, response);
            this.logger.info('[BOT MSG DEBUG] Sent direct response via Telegram API');
          } else {
            this.logger.error('[BOT MSG DEBUG] Cannot process - missing chat ID or sender');
          }
        }
      } catch (error) {
        this.logger.error(`[BOT MSG DEBUG] Error processing message with runtime: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    } catch (error) {
      this.logger.error(`[BOT MSG DEBUG] Error processing message with runtime: ${error instanceof Error ? error.message : String(error)}`);
      
      // Attempt fallback if runtime processing fails
      try {
        // If runtime processing failed, try to send a direct response
        const receivedFrom = formattedMessage.sender_agent_id || formattedMessage.from?.username;
        const chatId = formattedMessage.chat?.id || formattedMessage.groupId || formattedMessage.chat_id;
        
        if (receivedFrom && chatId) {
          const errorResponse = `@${receivedFrom.replace(/_/g, '')} I had trouble processing your message due to a technical issue. Our team is working to fix this.`;
          await this.sendDirectTelegramMessage(chatId, errorResponse);
          this.logger.info('[BOT MSG DEBUG] Sent error response via direct Telegram API');
        }
      } catch (fallbackError) {
        this.logger.error(`[BOT MSG DEBUG] Error in fallback error response: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
    }
  }
  
  /**
   * Schedule a retry attempt for a message after a delay
   * @param message Message to retry processing
   */
  private scheduleMessageRetry(message: any): void {
    // Only retry if we're not already past our retry limit
    const retryKey = `${message.chat?.id || message.chat_id || 'unknown'}_${message.message_id || Date.now()}`;
    const retryCount = this.messageRetryQueue.get(retryKey)?.attempts || 0;
    
    if (retryCount >= this.maxMessageRetries) {
      this.logger.warn(`[RETRY] Maximum retry count (${this.maxMessageRetries}) reached for message, giving up`);
      return;
    }
    
    // Update retry count
    this.messageRetryQueue.set(retryKey, {
      message,
      attempts: retryCount + 1,
      timestamp: Date.now()
    });
    
    // Calculate adaptive delay - start with short delay, increase with retry count
    const delayMs = Math.min(5000 * Math.pow(1.5, retryCount), 60000); // Max 1 minute delay
    
    this.logger.info(`[RETRY] Scheduling retry #${retryCount + 1} for message in ${delayMs}ms`);
    
    // Schedule the retry
    setTimeout(() => {
      this.logger.info(`[RETRY] Attempting retry #${retryCount + 1} for message`);
      this.handleIncomingMessage(message).catch(err => {
        this.logger.error(`[RETRY] Error in retry attempt: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, delayMs);
  }
  
  /**
   * Try to recover from errors by reinitializing conversation managers
   * @param message The message that triggered the error
   */
  private tryRecoverFromError(message: any): void {
    try {
      const chatId = message.chat?.id || message.groupId || message.chat_id;
      if (!chatId) {
        this.logger.error('[RECOVERY] Cannot recover without chat ID');
        return;
      }
      
      this.logger.info(`[RECOVERY] Attempting to recover conversation manager for chat ${chatId}`);
      
      // Remove existing conversation manager for this chat
      this.conversationManagers.delete(Number(chatId));
      
      // Force re-initialization on next message
      this.logger.info('[RECOVERY] Conversation manager removed, will be re-initialized on next message');
    } catch (error) {
      this.logger.error(`[RECOVERY] Error during recovery attempt: ${error instanceof Error ? error.message : String(error)}`);
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
    
    // If the message is from a bot but doesn't explicitly tag us, check if FORCE_BOT_RESPONSES is enabled
    if (isFromBot && !isExplicitlyTagged) {
      if (process.env.FORCE_BOT_RESPONSES === 'true') {
        this.logger.info(`[shouldRespond] ${agentId}: Message is from another bot, responding due to FORCE_BOT_RESPONSES`);
        return true;
      }
      
      this.logger.debug(`[shouldRespond] ${agentId}: Message is from another bot and not explicitly tagged, ignoring`);
      return false;
    }
    
    // For messages from humans that don't explicitly tag us, randomly respond sometimes
    if (!isFromBot && !isExplicitlyTagged) {
      // Random chance to respond to untagged messages from humans (15% chance)
      if (Math.random() < 0.15) {
        this.logger.info(`[shouldRespond] ${agentId}: Random chance to respond to human's untagged message`);
        return true;
      }
    }
    
    this.logger.debug(`[shouldRespond] ${agentId}: No reason to respond to this message`);
    return false;
  }
  
  /**
   * Check if agent is tagged in message using various formats
   * @param text - Message text to check
   * @param agentId - Agent ID to look for
   * @returns True if agent is tagged, false otherwise
   */
  private isAgentTaggedInMessage(text: string, agentId: string): boolean {
    if (!text || typeof text !== 'string') {
      return false;
    }
    
    // Normalize text to lowercase for case-insensitive matching
    const normalizedText = text.toLowerCase();
    
    // Create agent ID variants - Telegram usernames can appear in various formats
    const agentVariants = [];
    
    // Original agent ID (internal format with underscores)
    agentVariants.push(agentId.toLowerCase());
    
    // No underscores (typical Telegram format)
    const noUnderscores = agentId.replace(/_/g, '').toLowerCase();
    agentVariants.push(noUnderscores);
    
    // With _bot suffix (Telegram bot usernames)
    agentVariants.push(`${agentId.toLowerCase()}_bot`);
    agentVariants.push(`${noUnderscores}bot`);
    
    // Generate patterns for each variant
    const patterns = [];
    for (const variant of agentVariants) {
      patterns.push(
        // @username format
        new RegExp(`@${variant}\\b`, 'i'),
        // Direct mention without @
        new RegExp(`\\b${variant}\\b`, 'i')
      );
    }
    
    // Log what we're looking for to aid debugging
    this.logger.debug(`[isAgentTaggedInMessage] Checking if agent ${agentId} is tagged in text "${text.substring(0, 30)}..."`);
    this.logger.debug(`[isAgentTaggedInMessage] Using variants: ${agentVariants.join(', ')}`);
    
    // Check each pattern
    for (const pattern of patterns) {
      if (pattern.test(normalizedText)) {
        this.logger.debug(`[isAgentTaggedInMessage] Match found with pattern: ${pattern}`);
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
    if (!username) return false;
    
    // Normalize the username for comparison
    const normalizedUsername = username.toLowerCase().replace(/_bot$/, '');
    
    // List of known bot IDs in their normalized form (without _bot suffix)
    const knownBots = [
      'linda_evangelista_88',
      'lindaevangelista88',
      'vc_shark_99',
      'vcshark99',
      'bitcoin_maxi_420',
      'bitcoinmaxi420',
      'eth_memelord_9000',
      'ethmemelord9000',
      'bag_flipper_9000',
      'bagflipper9000',
      'code_samurai_77',
      'codesamurai77',
      'aeternity_admin'
    ].map(name => name.toLowerCase().replace(/_/g, ''));
    
    // Check if any known bot matches the normalized username
    return knownBots.some(botName => {
      return normalizedUsername === botName || 
             normalizedUsername.replace(/_/g, '') === botName;
    });
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
   * This method will periodically check if the runtime is available and return a promise
   * that resolves when the runtime is available or rejects after a timeout
   * 
   * @param timeoutMs - Maximum time to wait in milliseconds
   * @returns Promise that resolves to true if runtime is available, false if timed out
   */
  private async waitForRuntime(timeoutMs: number = 60000): Promise<boolean> {
    console.log(`[WAITRUNTIME] TelegramMultiAgentPlugin: Starting wait for runtime (timeout: ${timeoutMs}ms)`);
    
    // First, try to directly get the runtime using our enhanced method
    const runtime = this.getRuntime();
    if (runtime) {
      console.log('[WAITRUNTIME] TelegramMultiAgentPlugin: Runtime already available via getRuntime');
      this.runtime = runtime; // Ensure it's set in the instance
      this.runtimeInitialized = true;
      return true;
    }
    
    // If runtime is already available via standard check, return immediately
    if (this.isRuntimeAvailable()) {
      console.log('[WAITRUNTIME] TelegramMultiAgentPlugin: Runtime already available via isRuntimeAvailable');
      return true;
    }
    
    // Time tracking
    const startTime = Date.now();
    let elapsedTime = 0;
    
    // Attempt counters
    let attempts = 0;
    const maxAttempts = Math.ceil(timeoutMs / 1000); // Check approximately once per second
    
    // Force runtime available check
    const forceRuntimeAvailable = process.env.FORCE_RUNTIME_AVAILABLE === 'true';
    if (forceRuntimeAvailable) {
      console.log('[WAITRUNTIME] TelegramMultiAgentPlugin: FORCE_RUNTIME_AVAILABLE is true');
    }
    
    while (elapsedTime < timeoutMs && attempts < maxAttempts) {
      attempts++;
      elapsedTime = Date.now() - startTime;
      
      // Try our enhanced runtime retrieval first
      const retrievedRuntime = this.getRuntime();
      if (retrievedRuntime) {
        console.log(`[WAITRUNTIME] TelegramMultiAgentPlugin: Runtime retrieved after ${attempts} attempts (${elapsedTime}ms)`);
        this.runtime = retrievedRuntime;
        this.runtimeInitialized = true;
        return true;
      }
      
      // Fall back to standard availability check
      const runtimeAvailable = this.isRuntimeAvailable();
      console.log(`[WAITRUNTIME] TelegramMultiAgentPlugin: Runtime check attempt ${attempts}/${maxAttempts} - Available: ${runtimeAvailable} (elapsed: ${elapsedTime}ms)`);
      
      if (runtimeAvailable) {
        console.log(`[WAITRUNTIME] TelegramMultiAgentPlugin: Runtime available after ${attempts} attempts (${elapsedTime}ms)`);
        
        // Double-check runtime functionality
        try {
          if (this.runtime && typeof this.runtime.getAgentId === 'function') {
            const agentId = this.runtime.getAgentId();
            console.log(`[WAITRUNTIME] TelegramMultiAgentPlugin: Verified runtime functionality - agent ID: ${agentId}`);
          } else {
            console.warn('[WAITRUNTIME] TelegramMultiAgentPlugin: Runtime available but getAgentId not available');
          }
        } catch (error) {
          console.warn(`[WAITRUNTIME] TelegramMultiAgentPlugin: Runtime verification failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return true;
      }
      
      // If forcing runtime available and we've tried enough times, just assume it's ready
      if (forceRuntimeAvailable && attempts >= 3) {
        console.warn('[WAITRUNTIME] TelegramMultiAgentPlugin: Forcing runtime available after 3 attempts due to FORCE_RUNTIME_AVAILABLE=true');
        return true;
      }
      
      // Wait before next check (exponential backoff with a max of 5 seconds)
      const waitTime = Math.min(1000 * Math.pow(1.5, attempts - 1), 5000);
      console.log(`[WAITRUNTIME] TelegramMultiAgentPlugin: Waiting ${waitTime}ms before next check`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // If we get here, we timed out waiting for the runtime
    console.warn(`[WAITRUNTIME] TelegramMultiAgentPlugin: Timed out waiting for runtime after ${attempts} attempts (${elapsedTime}ms)`);
    
    // Final check for forced runtime
    if (forceRuntimeAvailable) {
      console.warn('[WAITRUNTIME] TelegramMultiAgentPlugin: Forcing runtime available due to FORCE_RUNTIME_AVAILABLE=true despite timeout');
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if the runtime is available and properly initialized
   * This performs a deeper check than just testing if runtime exists
   * @returns boolean indicating if runtime is fully available for use
   */
  private isRuntimeAvailable(): boolean {
    try {
      // First check if we already have runtime initialized
      if (this.runtimeInitialized) {
        return true;
      }
      
      // Try to get runtime from our enhanced getter
      const runtime = this.getRuntime();
      if (runtime) {
        this.runtime = runtime; // Ensure instance variable is set
        this.runtimeInitialized = true;
        console.log('[RUNTIMECHECK] TelegramMultiAgentPlugin: Runtime found via getRuntime helper');
        return true;
      }
      
      // If forced availability is enabled, bypass checks
      if (process.env.FORCE_RUNTIME_AVAILABLE === 'true') {
        console.warn('[RUNTIMECHECK] TelegramMultiAgentPlugin: Forcing runtime available due to FORCE_RUNTIME_AVAILABLE=true');
        this.runtimeInitialized = true;
        return true;
      }
      
      // Legacy check fallback (instance runtime)
      if (this.runtime) {
        if (typeof this.runtime.getAgentId === 'function') {
          console.log('[RUNTIMECHECK] TelegramMultiAgentPlugin: Runtime available via instance variable');
          this.runtimeInitialized = true;
          return true;
        } else {
          console.warn('[RUNTIMECHECK] TelegramMultiAgentPlugin: Runtime instance exists but getAgentId is not a function');
        }
      } else {
        console.debug('[RUNTIMECHECK] TelegramMultiAgentPlugin: Runtime not available yet');
      }
      
      return false;
    } catch (error) {
      console.error('[RUNTIMECHECK] TelegramMultiAgentPlugin: Error checking runtime availability:', error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Enhanced runtime retrieval that tries multiple sources
   * @returns The runtime object or null if unavailable
   */
  private getRuntime(): IAgentRuntime | null {
    console.log('[GETRUNTIME] TelegramMultiAgentPlugin: Attempting to get runtime');
    
    // Try getting runtime from instance variable first
    if (this.runtime) {
      console.log('[GETRUNTIME] TelegramMultiAgentPlugin: Using runtime from instance variable');
      return this.runtime;
    }
    
    // Try getting runtime from global backup
    try {
      const globalRuntime = (global as any).__telegramMultiAgentRuntime;
      if (globalRuntime) {
        console.log('[GETRUNTIME] TelegramMultiAgentPlugin: Retrieved runtime from global backup');
        // Store it back in the instance for future use
        this.runtime = globalRuntime;
        this.runtimeInitialized = true;
        return globalRuntime;
      }
    } catch (error) {
      console.warn(`[GETRUNTIME] TelegramMultiAgentPlugin: Error accessing global runtime: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    // No runtime available
    console.warn('[GETRUNTIME] TelegramMultiAgentPlugin: No runtime available from any source');
    return null;
  }

  /**
   * Helper method for processing bot-to-bot communication
   * This is a specialized version of handleIncomingMessage that focuses on
   * proper bot-to-bot communication with better runtime checks
   * 
   * @param message Message from another bot
   */
  async handleBotMessage(message: any): Promise<void> {
    this.logger.info(`[BOT2BOT] Received bot message from ${message?.from?.username || message?.sender_agent_id || 'unknown'}`);
    
    // Ensure the message has a proper sender_agent_id
    if (!message.sender_agent_id && message.from?.username) {
      message.sender_agent_id = message.from.username;
      this.logger.info(`[BOT2BOT] Added sender_agent_id: ${message.sender_agent_id}`);
    }
    
    // Always mark bot messages for special processing
    message._isBotMessage = true;
    
    // First check if runtime is available - if not, wait for it
    if (!this.isRuntimeAvailable()) {
      this.logger.info('[BOT2BOT] Runtime not available, waiting for it to initialize...');
      
      // Wait longer for bot-to-bot communication since it's less time-sensitive
      const runtimeReady = await this.waitForRuntime(30000); // 30 seconds max
      
      if (!runtimeReady) {
        this.logger.warn('[BOT2BOT] Runtime not available after waiting, falling back to template response');
        
        // Use fallback response for bot messages
        await this.sendBotFallbackResponse(message);
        return;
      }
      
      this.logger.info('[BOT2BOT] Runtime initialized successfully, proceeding with message');
    }
    
    // Process the message through standard pipeline but with bot flag
    await this.handleIncomingMessage(message);
  }
  
  /**
   * Send a fallback response specifically for bot-to-bot communication
   * These responses should acknowledge the message but indicate a technical issue
   */
  private async sendBotFallbackResponse(message: any): Promise<void> {
    try {
      // Extract necessary information
      const senderBot = message.sender_agent_id || message.from?.username || 'unknown bot';
      const chatId = message.chat?.id || message.groupId || message.chat_id;
      const messageText = message.text || message.content || '';
      
      // Format the sender name using Telegram's actual format - WITH the _bot suffix
      let telegramUsername = '';
      
      // Map to actual Telegram usernames (WITH the _bot suffix)
      if (senderBot.toLowerCase().includes('linda_evangelista')) {
        telegramUsername = 'LindaEvangelista88_bot';
      } else if (senderBot.toLowerCase().includes('vc_shark')) {
        telegramUsername = 'VCShark99_bot';
      } else if (senderBot.toLowerCase().includes('bitcoin_maxi')) {
        telegramUsername = 'BitcoinMaxi420_bot';
      } else if (senderBot.toLowerCase().includes('eth_memelord')) {
        telegramUsername = 'ETHMemeLord9000_bot';
      } else if (senderBot.toLowerCase().includes('bag_flipper')) {
        telegramUsername = 'BagFlipper9000_bot';
      } else if (senderBot.toLowerCase().includes('code_samurai')) {
        telegramUsername = 'CodeSamurai77_bot';
      } else {
        // If we don't have a known mapping, format as camelCase with _bot suffix
        telegramUsername = senderBot
          .split('_')
          .map((part, index) => index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1))
          .join('') + '_bot';
      }
      
      this.logger.info(`[BOT2BOT] Converting sender "${senderBot}" to Telegram username "${telegramUsername}"`);
      
      // Create a specific fallback for bot-to-bot communication - use plain text format to avoid Telegram API issues
      let responseText = '';
      
      // Add conversation-specific responses based on the sender
      if (senderBot.toLowerCase().includes('linda') || senderBot.toLowerCase().includes('evangelist')) {
        responseText = `Hey ${telegramUsername}, thanks for asking about fashion investments. I'm interested in your insights on sustainable trends, but my AI processing system is currently initializing. I'll provide a more detailed analysis shortly.`;
      } else if (senderBot.toLowerCase().includes('bitcoin') || senderBot.toLowerCase().includes('eth') || senderBot.toLowerCase().includes('crypto')) {
        responseText = `${telegramUsername}, I appreciate your crypto insights. My analysis algorithms are currently updating. I'll share my thoughts on market trends as soon as my system completes initialization.`;
      } else if (senderBot.toLowerCase().includes('flip') || senderBot.toLowerCase().includes('trader')) {
        responseText = `${telegramUsername}, thanks for bringing this trading opportunity to my attention. My portfolio analysis system is currently refreshing. I'll evaluate this potential investment once my systems are back online.`;
      } else {
        responseText = `${telegramUsername}, I've noted your message about "${messageText.substring(0, 40)}..." and will respond with a thorough analysis once my system completes initialization.`;
      }
      
      // Log and send the response
      this.logger.info(`[BOT2BOT] Sending fallback response to ${telegramUsername} in chat ${chatId}`);
      
      // Don't use parse_mode to avoid Telegram API errors with entity parsing
      await this.sendDirectTelegramMessage(chatId, responseText, { parse_mode: "" });
      
      this.logger.info('[BOT2BOT] Fallback response sent successfully');
    } catch (error) {
      this.logger.error(`[BOT2BOT] Error sending fallback response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the plugin version
   * @returns The current version of the plugin
   */
  public getVersion(): string {
    return this.version;
  }

  /**
   * Initialize the bot functionality
   * Called during the initialize() lifecycle method
   */
  private async initializeBot(): Promise<void> {
    console.log('[BOT] TelegramMultiAgentPlugin: Initializing bot functionality');
    
    // Implementation will depend on your specific bot initialization needs
    // This method should handle bot setup, commands, etc.
    
    // For now, just log that we're initialized
    console.log('[BOT] TelegramMultiAgentPlugin: Bot functionality initialized');
  }

  /**
   * Initialize the server functionality
   * Called during the initialize() lifecycle method
   */
  private async initializeServer(): Promise<void> {
    console.log('[SERVER] TelegramMultiAgentPlugin: Initializing server functionality');
    
    // Implementation will depend on your specific server needs
    // This might include setting up webhooks, API endpoints, etc.
    
    // For now, just log that we're initialized
    console.log('[SERVER] TelegramMultiAgentPlugin: Server functionality initialized');
  }

  /**
   * Initialize the storage functionality
   * Called during the initialize() lifecycle method
   */
  private async initializeStorage(): Promise<void> {
    console.log('[STORAGE] TelegramMultiAgentPlugin: Initializing storage functionality');
    
    // Database adapter initialization logic
    if (this.config.useSqliteAdapter) {
      try {
        // Ensure dbPath is set
        const dbPath = this.config.dbPath || ':memory:';
        console.log(`[STORAGE] TelegramMultiAgentPlugin: Using SQLite adapter with path: ${dbPath}`);
        
        // Initialize the SQLite adapter (already handles initialization internally)
        this.dbAdapter = new SqliteDatabaseAdapter(dbPath);
        
        console.log('[STORAGE] TelegramMultiAgentPlugin: SQLite adapter initialized successfully');
      } catch (error) {
        console.error(`[STORAGE] TelegramMultiAgentPlugin: SQLite adapter initialization failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    }
    
    console.log('[STORAGE] TelegramMultiAgentPlugin: Storage functionality initialized');
  }
} 