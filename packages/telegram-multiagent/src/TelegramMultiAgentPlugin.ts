import {
  IAgentRuntime,
  ElizaLogger,
  Plugin,
  TelegramMultiAgentConfig,
  RelayMessage,
  MemoryData,
  Character
} from './types.js';
import { ConversationManager } from './ConversationManager.js';
import { TelegramRelay } from './TelegramRelay.js';
import { ConversationKickstarter } from './ConversationKickstarter.js';
import { PersonalityEnhancer } from './PersonalityEnhancer.js';
import { PluginComponent } from './PluginComponent.js';
import path from 'path';
import fs from 'fs';

// Default configuration values
const DEFAULT_CONFIG: TelegramMultiAgentConfig = {
  enabled: true,
  relayServerUrl: 'http://207.180.245.243:4000',
  authToken: 'elizaos-secure-relay-key',
  groupIds: [],
  dbPath: './data/telegram-multiagent.db',
  logLevel: 'info',
  conversationCheckIntervalMs: 60000, // 1 minute
  maxRetries: 3,
  kickstarterConfig: {
    probabilityFactor: 0.2,
    minIntervalMs: 300000, // 5 minutes
    includeTopics: true,
    shouldTagAgents: true,
    maxAgentsToTag: 2
  }
};

/**
 * Telegram Multi-Agent Plugin
 * 
 * This plugin enables agents to participate in group conversations
 * with other agents in Telegram, creating more dynamic and interesting
 * interactions.
 */
export class TelegramMultiAgentPlugin extends PluginComponent implements Plugin {
  name = 'telegram-multiagent';
  description = 'Multi-agent coordination for Telegram bots in ElizaOS';
  npmName = '@elizaos/telegram-multiagent';
  
  private config: TelegramMultiAgentConfig;
  private relay: TelegramRelay | null = null;
  private conversationManager: ConversationManager;
  private kickstarters: Map<string, ConversationKickstarter> = new Map();
  private knownAgents: Set<string> = new Set();
  private character: Character | null = null;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private agentId: string = "unknown";
  private initializePromise: Promise<void> | null = null;
  
  /**
   * Create a new TelegramMultiAgentPlugin
   * Constructor should only handle basic setup, not accessing runtime
   * 
   * @param options - Configuration options
   */
  constructor(options?: Partial<TelegramMultiAgentConfig>) {
    // Create a default logger before we get the real one from the runtime
    const defaultLogger: ElizaLogger = {
      trace: (message: string, ...args: any[]) => 
        console.log(`[TRACE] TelegramMultiAgentPlugin: ${message}`, ...args),
      debug: (message: string, ...args: any[]) => 
        console.log(`[DEBUG] TelegramMultiAgentPlugin: ${message}`, ...args),
      info: (message: string, ...args: any[]) => 
        console.log(`[INFO] TelegramMultiAgentPlugin: ${message}`, ...args),
      warn: (message: string, ...args: any[]) => 
        console.warn(`[WARN] TelegramMultiAgentPlugin: ${message}`, ...args),
      error: (message: string, ...args: any[]) => 
        console.error(`[ERROR] TelegramMultiAgentPlugin: ${message}`, ...args)
    };
    
    super(defaultLogger);
    
    console.log("[CONSTRUCTOR] TelegramMultiAgentPlugin: Constructor called");
    
    // Only set basic config here, don't do any initialization
    this.config = {
      ...DEFAULT_CONFIG,
      ...options
    };
    
    console.log(`[CONFIG] Using default relay server: ${this.config.relayServerUrl}`);
    console.log(`[CONFIG] Using default auth token: ${this.config.authToken ? this.config.authToken.substring(0, 6) + '****' : 'not set'}`);

    this.logger = defaultLogger;
    
    // Just create a reference without initialization
    // The actual initialization will happen in initialize()
    this.conversationManager = new ConversationManager(this.logger);
  }
  
  /**
   * Register the plugin with the ElizaOS runtime
   * Only store the runtime reference without accessing methods
   * 
   * @param runtime - ElizaOS runtime
   * @returns Plugin instance or false on failure
   */
  register(runtime: IAgentRuntime): Plugin | boolean {
    try {
      console.log(`[REGISTER] ${this.name}: Register method called`);
      
      // Validate runtime is not null
      if (!runtime) {
        console.error(`[REGISTER] ${this.name}: Received null runtime`);
        return false;
      }
      
      // Just set the runtime reference in parent class without accessing methods
      super.setRuntime(runtime);
      console.log(`[REGISTER] ${this.name}: Runtime reference stored successfully`);
      
      // Don't try to access any runtime methods here
      // All runtime method access should happen in initialize() after waitForRuntime()
      
      return this;
    } catch (error) {
      console.error(`[ERROR] ${this.name}: Unexpected error during plugin registration: ${error}`);
      return false;
    }
  }
  
  /**
   * Load configuration from file if present
   * Will merge with default configuration
   */
  private async loadConfig(): Promise<void> {
    try {
      // Start with default config
      this.config = { ...DEFAULT_CONFIG };
      
      let configPath = './agent/config/plugins/telegram-multiagent.json';
      
      // Log environment variables for debugging
      this.logger.debug(`${this.name}: Environment variables:
        RELAY_SERVER_URL=${process.env.RELAY_SERVER_URL || 'not set'}
        RELAY_AUTH_TOKEN=${process.env.RELAY_AUTH_TOKEN ? '(set)' : 'not set'}
        AGENT_ID=${process.env.AGENT_ID || 'not set'}
      `);
      
      // First check for environment variables - highest priority
      if (process.env.RELAY_SERVER_URL) {
        this.logger.info(`${this.name}: Using relay server URL from environment: ${process.env.RELAY_SERVER_URL}`);
        this.config.relayServerUrl = process.env.RELAY_SERVER_URL;
      }
      
      if (process.env.RELAY_AUTH_TOKEN) {
        this.logger.info(`${this.name}: Using auth token from RELAY_AUTH_TOKEN environment variable`);
        this.config.authToken = process.env.RELAY_AUTH_TOKEN;
      } else if (process.env.RELAY_API_KEY) {
        this.logger.info(`${this.name}: Using auth token from RELAY_API_KEY environment variable`);
        this.config.authToken = process.env.RELAY_API_KEY;
      }
      
      // Check if config file exists - second priority
      if (fs.existsSync(configPath)) {
        this.logger.info(`${this.name}: Loading configuration from ${configPath}`);
        
        try {
          const configData = fs.readFileSync(configPath, 'utf8');
          const fileConfig = JSON.parse(configData);
          
          // Remember environment values
          const relayServerUrl = this.config.relayServerUrl; // Save from env
          const authToken = this.config.authToken; // Save from env
          
          // Merge with file config
          this.config = {
            ...this.config,
            ...fileConfig
          };
          
          // Environment variables override file config
          if (process.env.RELAY_SERVER_URL) {
            this.config.relayServerUrl = relayServerUrl;
          }
          
          if (process.env.RELAY_AUTH_TOKEN || process.env.RELAY_API_KEY) {
            this.config.authToken = authToken;
          }
          
          this.logger.info(`${this.name}: Configuration loaded successfully`);
        } catch (error) {
          this.logger.error(`${this.name}: Error parsing config file: ${error}`);
          // Continue with defaults and env vars
        }
      } else {
        this.logger.warn(`${this.name}: No configuration file found at ${configPath}, using defaults and environment variables`);
      }
      
      // Log what we're using
      this.logger.info(`${this.name}: Using relay server URL: ${this.config.relayServerUrl}`);
      const authTokenLength = this.config.authToken ? this.config.authToken.length : 0;
      this.logger.debug(`${this.name}: Using auth token, length: ${authTokenLength}`);
      
      // Verify critical config values
      if (!this.config.relayServerUrl) {
        this.logger.error(`${this.name}: No relay server URL configured`);
        throw new Error('No relay server URL configured');
      }
      
      if (!this.config.authToken) {
        this.logger.error(`${this.name}: No authentication token configured`);
        throw new Error('No authentication token configured');
      }
      
      // Log configuration details
      this.logger.info(`${this.name}: Configuration loaded with relay server ${this.config.relayServerUrl}`);
      this.logger.info(`${this.name}: Plugin ${this.config.enabled ? 'enabled' : 'disabled'}`);
    } catch (error) {
      this.logger.error(`${this.name}: Error loading configuration: ${error}`);
      throw error; // Rethrow to ensure initialization fails properly
    }
  }
  
  /**
   * Initialize the plugin - this should be called after register
   * and follows the ElizaOS plugin lifecycle pattern
   */
  async initialize(): Promise<void> {
    // Return existing promise if initialization already started
    if (this.initializePromise) {
      return this.initializePromise;
    }
    
    // Log plugin startup state
    console.log(`[${this.name}] Plugin initialize() called`);
    console.log(`[${this.name}] Runtime reference exists: ${this.runtime !== null}`);
    if (this.runtime) {
      console.log(`[${this.name}] Runtime methods availability check:`);
      console.log(`[${this.name}] - getAgentId: ${typeof this.runtime.getAgentId === 'function' ? 'available' : 'NOT AVAILABLE'}`);
      console.log(`[${this.name}] - getLogger: ${typeof this.runtime.getLogger === 'function' ? 'available' : 'NOT AVAILABLE'}`);
      console.log(`[${this.name}] - memoryManager: ${this.runtime.memoryManager ? 'exists' : 'NOT AVAILABLE'}`);
      console.log(`[${this.name}] - handleMessage: ${typeof this.runtime.handleMessage === 'function' ? 'available' : 'NOT AVAILABLE'}`);
    }
    
    // Create a new initialization promise
    this.initializePromise = this._initialize();
    return this.initializePromise;
  }
  
  /**
   * Internal initialization implementation
   */
  private async _initialize(): Promise<void> {
    try {
      console.log(`[ELIZAOS] ${this.name}: Initialize method called`);
      
      // Skip if already initialized
      if (this.initialized) {
        console.log(`[ELIZAOS] ${this.name}: Already initialized, skipping`);
        return;
      }
      
      // IMPORTANT: Wait for runtime to be fully available with all required methods
      let runtime: IAgentRuntime;
      try {
        runtime = await this.waitForRuntime(30000); // 30 second timeout
        this.logger.info(`${this.name}: Runtime is now available and fully initialized!`);
        
        // Test runtime functionality to ensure methods are ready
        this.testRuntime();
        
        // Additional verification of critical methods
        if (typeof runtime.getAgentId !== 'function') {
          throw new Error('getAgentId method is not available on runtime');
        }
        
        if (typeof runtime.getLogger !== 'function') {
          throw new Error('getLogger method is not available on runtime');
        }
        
        if (!runtime.memoryManager || typeof runtime.memoryManager.createMemory !== 'function') {
          throw new Error('memoryManager or createMemory method is not available');
        }
        
        this.logger.info(`${this.name}: All critical runtime methods verified and available!`);
      } catch (error) {
        this.logger.error(`${this.name}: Runtime initialization failed: ${error.message}`);
        this.logger.warn(`${this.name}: Continuing with limited functionality - autonomous responses may not work`);
        return;
      }
      
      // Now that runtime is guaranteed available, get the proper logger
      try {
        this.logger = runtime.getLogger('telegram-multiagent');
        this.logger.info(`${this.name}: Using logger from runtime`);
      } catch (error) {
        this.logger.warn(`${this.name}: Could not get logger from runtime: ${error}, using default logger`);
      }
      
      this.logger.info(`${this.name}: Starting plugin initialization with verified runtime`);
      
      // Get agent ID now that we know runtime is available
      try {
        this.agentId = runtime.getAgentId();
        this.logger.info(`${this.name}: Got agent ID from runtime: ${this.agentId}`);
      } catch (error) {
        // Fall back to environment variable if available
        if (process.env.AGENT_ID) {
          this.agentId = process.env.AGENT_ID;
          this.logger.info(`${this.name}: Using agent ID from environment: ${this.agentId}`);
        } else {
          this.logger.error(`${this.name}: Failed to get agent ID: ${error}`);
          return;
        }
      }
      
      // Critical check: we must have an agent ID
      if (!this.agentId || this.agentId === "unknown") {
        this.logger.error(`${this.name}: No agent ID available, cannot continue`);
        return;
      }
      
      // Load configuration
      try {
        await this.loadConfig();
      } catch (error) {
        this.logger.error(`${this.name}: Failed to load configuration: ${error}`);
        return;
      }
      
      // Check if plugin is enabled
      if (!this.config.enabled) {
        this.logger.info(`${this.name}: Plugin is disabled, skipping initialization`);
        return;
      }
      
      // Register services AFTER runtime is verified available
      try {
        runtime.registerService("telegramMultiAgentPlugin", this);
        this.logger.info(`${this.name}: Registered as service with runtime`);
      } catch (error) {
        this.logger.warn(`${this.name}: Could not register service: ${error}`);
      }
      
      // NOW initialize components AFTER runtime is verified available
      
      // 1. Initialize conversation manager properly with runtime
      this.logger.info(`${this.name}: Creating and initializing conversation manager`);
      this.conversationManager = new ConversationManager(this.logger);
      this.conversationManager.setRuntime(runtime);
      await this.conversationManager.initialize();
      
      // Register conversation manager as a service
      try {
        runtime.registerService("conversationManager", this.conversationManager);
        this.logger.info(`${this.name}: Registered conversation manager as service`);
      } catch (error) {
        this.logger.warn(`${this.name}: Could not register conversation manager service: ${error}`);
      }
      
      // 2. Get character information
      try {
        this.character = await runtime.getCharacter();
        this.logger.info(`${this.name}: Got character information from runtime`);
      } catch (error) {
        this.logger.warn(`${this.name}: Could not get character from runtime: ${error}`);
      }
      
      // 3. Create and connect relay
      this.logger.info(`${this.name}: Creating relay with agent ID: ${this.agentId}`);
      this.relay = new TelegramRelay({
        relayServerUrl: this.config.relayServerUrl,
        authToken: this.config.authToken,
        agentId: this.agentId,
        retryLimit: this.config.maxRetries || 3,
        retryDelayMs: 1000
      }, this.logger);
      
      // Register message handler
      this.relay.onMessage(this.handleIncomingMessage.bind(this));
      
      // 4. Connect to relay server
      this.logger.info(`${this.name}: Connecting to relay server at ${this.config.relayServerUrl}`);
      try {
        const connected = await this.relay.connect();
        if (connected) {
          this.logger.info(`${this.name}: Successfully connected to relay server`);
          
          // 5. Initialize and setup kickstarters AFTER relay is connected
          if (this.config.groupIds && this.config.groupIds.length > 0) {
            this.setupKickstarters(this.config.groupIds, this.relay, this.character);
          } else {
            this.logger.warn(`${this.name}: No group IDs configured, skipping kickstarter setup`);
          }
          
          // 6. Setup conversation check interval
          this.setupConversationCheck();
          
          // Mark as initialized
          this.initialized = true;
          this.logger.info(`${this.name}: Plugin successfully initialized with fully functional runtime`);
        } else {
          this.logger.error(`${this.name}: Failed to connect to relay server`);
          // Schedule reconnect attempts
          this.scheduleReconnect();
        }
      } catch (error) {
        this.logger.error(`${this.name}: Error connecting to relay server: ${error}`);
        // Schedule reconnect attempts
        this.scheduleReconnect();
      }
    } catch (error) {
      this.logger.error(`${this.name}: Error during initialization: ${error}`);
    }
  }
  
  /**
   * Schedule reconnection attempts to the relay server
   */
  private scheduleReconnect(): void {
    // Only schedule if we have a relay instance
    if (!this.relay) return;
    
    const relay = this.relay;
    const reconnectDelay = 10000; // 10 seconds
    
    this.logger.info(`${this.name}: Scheduling reconnect attempt in ${reconnectDelay/1000} seconds`);
    
    setTimeout(async () => {
      this.logger.info(`${this.name}: Attempting to reconnect to relay server`);
      try {
        const connected = await relay.connect();
        if (connected) {
          this.logger.info(`${this.name}: Successfully reconnected to relay server`);
        } else {
          this.logger.warn(`${this.name}: Reconnect attempt failed, scheduling another attempt`);
          this.scheduleReconnect();
        }
      } catch (error) {
        this.logger.error(`${this.name}: Error during reconnection attempt: ${error}`);
        this.scheduleReconnect();
      }
    }, reconnectDelay);
  }
  
  /**
   * Create a simple personality enhancer
   */
  private createPersonalityEnhancer(): any {
    try {
      // Create a real personality enhancer if possible
      if (this.runtime) {
        const enhancer = new PersonalityEnhancer(this.runtime.getAgentId(), this.runtime, this.logger);
        return enhancer;
      }
    } catch (error) {
      this.logger.warn(`${this.name}: Could not create full PersonalityEnhancer: ${error}`);
    }
    
    // Fallback to a simplified personality enhancer
    return {
      refineTopic: (topic: string): string => {
        if (!this.character) return topic;
        
        // If the agent has a character, adjust the topic to match interests
        const interests = this.character.topics || [];
        const isRelevant = interests.some(interest => 
          topic.toLowerCase().includes(interest.toLowerCase())
        );
        
        if (isRelevant) {
          return `${topic}, which is something I'm particularly interested in`;
        }
        
        return topic;
      },
      
      generateTopic: (): string => {
        if (!this.character || !this.character.topics || this.character.topics.length === 0) {
          return "blockchain technology and its applications";
        }
        
        // Get a random topic from the character's interests
        const randomIndex = Math.floor(Math.random() * this.character.topics.length);
        return this.character.topics[randomIndex];
      }
    };
  }
  
  /**
   * Set up periodic check for conversation opportunities
   */
  private setupConversationCheck(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
    }
    
    // Set up interval for checking conversation opportunities
    const intervalMs = this.config.conversationCheckIntervalMs || 60000;
    this.checkIntervalId = setInterval(() => {
      this.checkConversations().catch(error => {
        this.logger.error(`${this.name}: Error in conversation check: ${error}`);
      });
    }, intervalMs);
    
    this.logger.info(`${this.name}: Set up conversation check interval every ${intervalMs}ms`);
  }
  
  /**
   * Start all kickstarters
   */
  private startKickstarters(): void {
    for (const [groupId, kickstarter] of this.kickstarters.entries()) {
      kickstarter.start();
      this.logger.info(`${this.name}: Started kickstarter for group ${groupId}`);
    }
  }
  
  /**
   * Check conversations for all configured groups
   */
  private async checkConversations(): Promise<void> {
    // Get runtime and verify it's ready
    let runtime: IAgentRuntime;
    try {
      runtime = await this.waitForRuntime(5000); // 5 second timeout is enough for periodic check
      // Verify runtime has required methods
      if (typeof runtime.getAgentId !== 'function') {
        this.logger.warn(`${this.name}: Runtime not fully ready for conversation check - missing getAgentId`);
        return; // Skip this check cycle
      }
    } catch (error) {
      this.logger.error(`${this.name}: Failed to get runtime for conversation check: ${error.message}`);
      return; // Skip this check cycle
    }
    
    this.logger.debug(`${this.name}: Checking conversations...`);
    
    // Check each group
    for (const groupId of this.config.groupIds) {
      try {
        // Get conversation state
        const isActive = await this.conversationManager.isConversationActive(groupId);
        
        // Log state
        this.logger.debug(`${this.name}: Group ${groupId} conversation active: ${isActive}`);
        
        // If we have a kickstarter for this group, update it
        const kickstarter = this.kickstarters.get(groupId);
        if (kickstarter) {
          // Check if kickstarter needs to be activated/deactivated
          if (isActive) {
            // No need to kickstart if conversation is active
            kickstarter.stop();
          } else {
            // Start kickstarter if not already running
            kickstarter.start();
          }
        }
      } catch (error) {
        this.logger.error(`${this.name}: Error checking conversation for group ${groupId}: ${error}`);
      }
    }
  }
  
  /**
   * Handle messages from the relay server
   */
  private async handleIncomingMessage(message: RelayMessage): Promise<void> {
    try {
      this.logger.debug(`${this.name}: Received message from relay server`);
      
      // Enhanced logging for debugging message handling
      this.logger.debug(`[PLUGIN] Message received: ${JSON.stringify(message)}`);
      
      // CRITICAL: Wait for runtime to be fully available with all required methods
      let runtime: IAgentRuntime;
      try {
        runtime = await this.waitForRuntime(10000); // 10 seconds timeout
        this.logger.debug(`Runtime successfully obtained for message handling`);
        
        // Verify critical methods needed for message handling
        if (typeof runtime.getAgentId !== 'function') {
          throw new Error('getAgentId method not available');
        }
        
        if (typeof runtime.handleMessage !== 'function') {
          throw new Error('handleMessage method not available');
        }
        
        if (!runtime.memoryManager || typeof runtime.memoryManager.createMemory !== 'function') {
          throw new Error('Memory manager not available for message storage');
        }
      } catch (error) {
        this.logger.error(`Failed to get ready runtime for message handling: ${error.message}`);
        this.testRuntime(); // Log runtime state for diagnostics
        return; // Cannot proceed without a fully ready runtime
      }
      
      const { chat, text, from, sender_agent_id } = message;
      
      // Get the agent ID from runtime
      const myAgentId = runtime.getAgentId();
      this.logger.debug(`My agent ID: ${myAgentId}, Message from: ${sender_agent_id || from.username}`);
      
      // Skip if the message is from self
      if (sender_agent_id === myAgentId) {
        this.logger.debug(`[PLUGIN] Ignoring message from self: ${sender_agent_id}`);
        return;
      }
      
      // Format group ID consistently
      const groupId = chat.id.toString();
      this.logger.debug(`[PLUGIN] Formatted incoming chatId: ${groupId}`);
      this.logger.debug(`[PLUGIN] Configured group IDs: ${JSON.stringify(this.config.groupIds)}`);
      
      // Skip if this is not a configured group
      if (this.config.groupIds && this.config.groupIds.length > 0) {
        const normalizedGroupIds = this.config.groupIds.map(id => id.toString());
        if (!normalizedGroupIds.includes(groupId)) {
          this.logger.debug(`[PLUGIN] Ignoring message from unconfigured group ${groupId}`);
          return;
        }
      }
      
      // Process bot messages if they are from known bots
      if (from.is_bot) {
        this.logger.debug(`[PLUGIN] Message is from bot: ${from.username}`);
        // Allow messages from known bots to be processed
        const knownBots = [
          // Bot names
          "LindaBot", "VCSharkBot", "BitcoinMaxiBot", "BagFlipperBot", "CodeSamuraiBot", "ETHMemeLordBot",
          // Agent IDs
          "linda_evangelista_88", "vc_shark_99", "bitcoin_maxi_420", "bag_flipper_9000", "code_samurai_77", "eth_memelord_9000",
          // Usernames with _bot suffix
          "linda_evangelista_88_bot", "vc_shark_99_bot", "bitcoin_maxi_420_bot", "bag_flipper_9000_bot", "code_samurai_77_bot", "eth_memelord_9000_bot"
        ];
        
        // Check both username and sender_agent_id for known bots
        const isKnownBot = knownBots.some(bot => 
          (from.username && (from.username.includes(bot) || from.username === bot)) ||
          (sender_agent_id && (sender_agent_id.includes(bot) || sender_agent_id === bot))
        );
        
        this.logger.debug(`[PLUGIN] Bot message evaluation - Username: ${from.username}, Agent ID: ${sender_agent_id}`);
        this.logger.debug(`[PLUGIN] Is known bot: ${isKnownBot}`);
        
        if (!isKnownBot) {
          this.logger.debug(`[PLUGIN] Ignoring message from unknown bot: ${from.username || sender_agent_id}`);
          return;
        }
        this.logger.debug(`[PLUGIN] Processing message from known bot: ${from.username || sender_agent_id}`);
      }
      
      // Record the message in the conversation manager
      try {
        await this.conversationManager.recordMessage(
          groupId,
          sender_agent_id || from.username,
          text
        );
        this.logger.debug(`Recorded message in conversation manager`);
      } catch (error) {
        this.logger.error(`Failed to record message in conversation manager: ${error.message}`);
      }
      
      // Store the message in the memory manager for context
      try {
        const memoryData: MemoryData = {
          roomId: groupId,
          userId: sender_agent_id || from.username,
          content: {
            text,
            metadata: {
              conversationType: 'group',
              messageId: message.message_id,
              senderName: from.first_name,
              senderUsername: from.username,
              isBot: from.is_bot,
              groupId,
              agentId: sender_agent_id
            }
          },
          type: 'telegram-message'
        };
        
        await runtime.memoryManager.createMemory(memoryData);
        this.logger.debug(`[MEMORY] Stored message from ${sender_agent_id || from.username} in group ${groupId}`);
      } catch (error) {
        this.logger.error(`Failed to store message in memory: ${error.message}`);
      }
      
      // Check if this agent should respond to the message
      try {
        const shouldRespond = await this.conversationManager.shouldAgentRespond(
          groupId,
          myAgentId,
          sender_agent_id || from.username,
          text
        );
        
        this.logger.info(`[PLUGIN] Should respond to message: ${shouldRespond}`);
        
        if (shouldRespond) {
          this.logger.info(`${this.name}: Will respond to message in group ${groupId}`);
          
          // Log that we're trying to generate a response
          this.logger.info(`[PLUGIN] Forwarding message to runtime for processing...`);
          
          // Create a context object for the runtime
          const context = {
            roomId: groupId,
            platform: 'telegram',
            conversationType: 'group',
            participantCount: this.knownAgents.size + 1, // Include self
            messageHistory: await this.getMessageHistory(groupId)
          };
          
          // Call the runtime to handle the message
          const response = await runtime.handleMessage({
            text,
            userId: sender_agent_id || from.username,
            name: from.first_name,
            context
          });
          
          // Send the response if available
          if (response && response.text) {
            this.logger.info(`[PLUGIN] Runtime generated response: ${response.text.substring(0, 100)}...`);
            
            if (this.relay) {
              await this.relay.sendMessage(groupId, response.text);
              this.logger.info(`[PLUGIN] Response sent via relay`);
              
              // Record our own message in the conversation
              await this.conversationManager.recordMessage(
                groupId,
                myAgentId,
                response.text
              );
            } else {
              this.logger.error(`[PLUGIN] Cannot send response - relay is not initialized`);
            }
          } else {
            this.logger.warn(`[PLUGIN] Runtime did not generate a response`);
            
            // Send a fallback response
            if (this.relay) {
              const fallbackResponse = await this.generateFallbackResponse();
              await this.relay.sendMessage(groupId, fallbackResponse);
              this.logger.info(`[PLUGIN] Fallback response sent: ${fallbackResponse.substring(0, 50)}...`);
              
              // Record our own message in the conversation
              await this.conversationManager.recordMessage(
                groupId,
                myAgentId,
                fallbackResponse
              );
            } else {
              this.logger.error(`[PLUGIN] Cannot send fallback - relay is not initialized`);
            }
          }
        } else {
          this.logger.debug(`[PLUGIN] Decided not to respond to message`);
        }
      } catch (error) {
        this.logger.error(`Error in response decision/generation: ${error.message}`);
        this.testRuntime(); // Log runtime state for diagnostics
      }
    } catch (error) {
      this.logger.error(`${this.name}: Error handling incoming message: ${error}`);
    }
  }
  
  /**
   * Generate a fallback response when the runtime fails to generate one
   */
  private async generateFallbackResponse(): Promise<string> {
    try {
      // Try to get character-specific fallback
      const runtime = await this.waitForRuntime();
      const { character } = runtime;
      
      if (character) {
        const traits = character.traits || [];
        const style = character.style || {};
        
        // Generate a more personalized fallback based on character
        if (traits.includes('helpful')) {
          return "I'd like to respond in more detail, but I'm currently in limited mode. I'll get back to you soon!";
        }
        
        if (traits.includes('technical')) {
          return "Due to a temporary processing constraint, I'm unable to generate a complete response at this time.";
        }
        
        if (traits.includes('friendly')) {
          return "Hey there! I got your message but I'm a bit tied up at the moment. I'll jump back in soon!";
        }
      }
    } catch (error) {
      this.logger.debug(`${this.name}: Error generating character-specific fallback: ${error}`);
    }
    
    // Default fallback
    return "I received your message but I'm currently in limited mode. Please try again later.";
  }
  
  /**
   * Get recent message history for a group
   */
  private async getMessageHistory(groupId: string): Promise<string> {
    try {
      // Get runtime
      const runtime = await this.waitForRuntime();
      
      // Query for recent messages
      const messages = await runtime.memoryManager.getMemories({
        roomId: groupId,
        type: 'telegram-message',
        count: 10
      });
      
      if (!messages || messages.length === 0) {
        return "No message history available.";
      }
      
      // Sort messages by time (oldest first)
      const sortedMessages = [...messages].sort((a, b) => {
        const aDate = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const bDate = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return aDate.getTime() - bDate.getTime();
      });
      
      // Format messages
      const formatted = sortedMessages.map(message => {
        const sender = message.userId;
        const text = message.content.text;
        return `${sender}: ${text}`;
      }).join('\n');
      
      return formatted;
    } catch (error) {
      this.logger.error(`${this.name}: Error getting message history: ${error}`);
      return "Error retrieving message history.";
    }
  }
  
  /**
   * Shutdown the plugin
   */
  async shutdown(): Promise<void> {
    this.logger.info(`${this.name}: Shutting down`);
    
    // Stop the conversation check interval
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    
    // Stop all kickstarters
    for (const [groupId, kickstarter] of this.kickstarters.entries()) {
      try {
        await kickstarter.shutdown();
        this.logger.info(`${this.name}: Stopped kickstarter for group ${groupId}`);
      } catch (error) {
        this.logger.error(`${this.name}: Error stopping kickstarter for group ${groupId}: ${error}`);
      }
    }
    
    // Shutdown conversation manager
    try {
      await this.conversationManager.shutdown();
      this.logger.info(`${this.name}: Conversation manager shutdown complete`);
    } catch (error) {
      this.logger.error(`${this.name}: Error shutting down conversation manager: ${error}`);
    }
    
    // Disconnect from relay server
    try {
      await this.relay.disconnect();
      this.logger.info(`${this.name}: Disconnected from relay server`);
    } catch (error) {
      this.logger.error(`${this.name}: Error disconnecting from relay server: ${error}`);
    }
    
    this.logger.info(`${this.name}: Shutdown complete`);
  }
  
  /**
   * Setup kickstarters for each group
   * 
   * @param groupIds - Group IDs to create kickstarters for
   * @param relay - Telegram relay
   * @param character - Character information
   */
  private async setupKickstarters(
    groupIds: string[],
    relay: TelegramRelay,
    character: Character | null
  ): Promise<void> {
    if (!groupIds || groupIds.length === 0) {
      this.logger.warn(`${this.name}: No group IDs configured, skipping kickstarter setup`);
      return;
    }
    
    try {
      const runtime = await this.waitForRuntime();
      
      for (const groupId of groupIds) {
        // Create personality enhancer with runtime
        const personality = this.createPersonalityEnhancer();
        
        // Create conversation kickstarter
        const kickstarter = new ConversationKickstarter(
          this.logger,
          this.conversationManager,
          relay,
          this.config.kickstarterConfig || {
            probabilityFactor: 0.2,
            minIntervalMs: 300000, // 5 minutes
            includeTopics: true,
            shouldTagAgents: true,
            maxAgentsToTag: 2
          },
          groupId,
          personality
        );
        
        // Set runtime
        kickstarter.setRuntime(runtime);
        
        // Initialize the kickstarter
        await kickstarter.initialize();
        
        // Store kickstarter
        this.kickstarters.set(groupId, kickstarter);
        
        this.logger.info(`${this.name}: Created kickstarter for group ${groupId}`);
        console.log(`[KICKSTARTER] ${this.name}: Created kickstarter for group ${groupId}`);
      }
    } catch (error) {
      this.logger.error(`${this.name}: Error setting up kickstarters: ${error}`);
      console.log(`[ERROR] ${this.name}: Error setting up kickstarters: ${error}`);
    }
  }
}