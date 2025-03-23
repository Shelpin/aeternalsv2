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
  authToken: '',
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
  private initializeCalled: boolean = false;
  
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
    
    // Just create the conversation manager without initialization
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
      console.log(`[REGISTER] TelegramMultiAgentPlugin: Register method called`);
      
      // Just set the runtime reference in parent class, don't try to access methods yet
      super.setRuntime(runtime);
      
      // Setup listeners for runtime events if available
      if (runtime.on && typeof runtime.on === 'function') {
        try {
          console.log(`[REGISTER] ${this.name}: Setting up runtime event listeners`);
          runtime.on('ready', () => {
            console.log(`[REGISTER] ${this.name}: Runtime ready event received!`);
            this.onRuntimeReady(runtime);
          });
        } catch (error) {
          console.warn(`[REGISTER] ${this.name}: Could not setup runtime event listeners: ${error}`);
        }
      } else {
        console.log(`[REGISTER] ${this.name}: Runtime does not support events, will use polling`);
      }
      
      // Get a logger from the runtime if available, but don't fail if not
      try {
        this.logger = runtime.getLogger();
        this.logger.info(`[REGISTER] ${this.name}: Registered with runtime`);
      } catch (error) {
        console.warn(`[REGISTER] ${this.name}: Could not get logger yet, will retry during initialization`);
      }
        
      // Register this plugin as a service so other plugins can access it
      try {
        runtime.registerService("telegramMultiAgentPlugin", this);
      } catch (error) {
        console.warn(`[REGISTER] ${this.name}: Could not register service yet: ${error}`);
      }
        
      return this;
    } catch (error) {
      console.error(`[ERROR] ${this.name}: Unexpected error during plugin registration: ${error}`);
      return false;
    }
  }
  
  /**
   * Called when the runtime is ready
   * This is our opportunity to initialize properly
   */
  private onRuntimeReady(runtime: IAgentRuntime): void {
    console.log(`[RUNTIME] ${this.name}: Runtime ready event received, proceeding with initialization`);
    
    // Check if we're already initialized
    if (this.initialized) {
      console.log(`[RUNTIME] ${this.name}: Already initialized, skipping`);
      return;
    }
    
    // Update the logger
    try {
      this.logger = runtime.getLogger();
      this.logger.info(`[RUNTIME] ${this.name}: Got logger from ready runtime`);
    } catch (error) {
      console.warn(`[RUNTIME] ${this.name}: Could not get logger from ready runtime: ${error}`);
    }
    
    // Get agent ID
    try {
      this.agentId = runtime.getAgentId();
      console.log(`[RUNTIME] ${this.name}: Got agent ID from ready runtime: ${this.agentId}`);
    } catch (error) {
      console.warn(`[RUNTIME] ${this.name}: Could not get agent ID from ready runtime: ${error}`);
    }
    
    // Register service again just in case
    try {
      runtime.registerService("telegramMultiAgentPlugin", this);
    } catch (error) {
      console.warn(`[RUNTIME] ${this.name}: Could not register service with ready runtime: ${error}`);
    }
    
    // Continue with initialization via the initialize method
    // We'll try the initialize method from the event if not called directly
    if (!this.initializeCalled) {
      console.log(`[RUNTIME] ${this.name}: Calling initialize from runtime ready event`);
      this.initialize().catch(error => {
        console.error(`[RUNTIME] ${this.name}: Error initializing from ready event: ${error}`);
      });
    }
  }
  
  /**
   * Load configuration from file if present
   * Will merge with default configuration
   */
  private async loadConfig(): Promise<void> {
    try {
      const runtime = await this.waitForRuntime();
      
      // Get the config path from the runtime
      let configPath = './config/plugins/telegram-multiagent.json';
      try {
        // Try to use the runtime's config path
        const configDir = runtime.getConfigDir ? runtime.getConfigDir() : './config';
        configPath = path.join(configDir, 'plugins', 'telegram-multiagent.json');
      } catch (error) {
        this.logger.warn(`${this.name}: Could not get config directory from runtime: ${error}`);
      }
      
      // Check if config file exists
      if (fs.existsSync(configPath)) {
        this.logger.info(`${this.name}: Loading configuration from ${configPath}`);
        
        try {
          const configData = fs.readFileSync(configPath, 'utf8');
          const fileConfig = JSON.parse(configData);
          
          // Merge with defaults and any constructor options
          this.config = {
            ...DEFAULT_CONFIG,
            ...fileConfig
          };
          
          this.logger.info(`${this.name}: Configuration loaded successfully`);
          this.logger.debug(`${this.name}: Using relay server: ${this.config.relayServerUrl}`);
        } catch (error) {
          this.logger.error(`${this.name}: Error parsing config file: ${error}`);
          throw new Error(`Failed to parse config: ${error.message}`);
        }
      } else {
        this.logger.warn(`${this.name}: No configuration file found at ${configPath}, using defaults`);
      }
      
      // Verify critical config values
      if (!this.config.relayServerUrl) {
        this.logger.error(`${this.name}: No relay server URL configured`);
        throw new Error('No relay server URL configured');
      }
      
      if (!this.config.authToken) {
        this.logger.error(`${this.name}: No authentication token configured`);
        throw new Error('No authentication token configured');
      }
      
      // Check if relayServerUrl is localhost and needs to be fixed
      if (this.config.relayServerUrl.includes('localhost')) {
        this.logger.warn(`${this.name}: Relay server URL contains localhost, which may not work for external connections`);
        this.logger.info(`${this.name}: Consider using the public IP or hostname instead`);
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
   * Initialize the conversation manager
   */
  private async initializeConversationManager(): Promise<void> {
    try {
      const runtime = await this.waitForRuntime();
      
      // Update logger
      this.logger = runtime.getLogger();
      
      // Set conversation manager runtime
      this.conversationManager.setRuntime(runtime);
      
      // Initialize the conversation manager
      await this.conversationManager.initialize();
      
      // Register it as a service
      runtime.registerService("conversationManager", this.conversationManager);
      
      this.logger.info(`${this.name}: Conversation manager initialized`);
    } catch (error) {
      this.logger.error(`${this.name}: Failed to initialize conversation manager: ${error}`);
      throw error;
    }
  }
  
  /**
   * Initialize the plugin - this should be called after register
   * and follows the ElizaOS plugin lifecycle pattern
   */
  async initialize(): Promise<void> {
    this.initializeCalled = true;
    
    try {
      console.log(`[ELIZAOS] TelegramMultiAgentPlugin: initialize method called`);
      
      // Add a delay to ensure runtime is fully initialized
      console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Waiting for runtime initialization...`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
      console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Continuing initialization after delay`);
      
      // Skip the rest of initialization if already initialized or in progress
      if (this.initialized) {
        console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Already initialized, skipping`);
        return;
      }
      
      // Use a direct runtime reference and skip waitForRuntime if possible
      if (this.runtime) {
        try {
          // Try to access a method to check if runtime is ready
          const agentId = this.runtime.getAgentId();
          console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Runtime verified with agent ID: ${agentId}`);
          this.agentId = agentId;
          
          // Update logger
          this.logger = this.runtime.getLogger();
          this.logger.info(`${this.name}: Starting plugin initialization`);
          
          // Continue with initialization process
          await this.completeInitialization(this.runtime);
          return;
        } catch (error) {
          console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Runtime exists but is not ready: ${error}`);
          // Fall back to waitForRuntime below
        }
      }
      
      // Get runtime by waiting for it to be fully available
      let runtime;
      try {
        runtime = await this.waitForRuntime();
      } catch (error) {
        console.error(`[ELIZAOS] TelegramMultiAgentPlugin: Runtime wait failed: ${error}`);
        console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Will try to initialize when runtime emits ready event`);
        // We'll retry when runtime emits ready event
        return;
      }
      
      // Complete initialization with the obtained runtime
      await this.completeInitialization(runtime);
      
    } catch (error) {
      this.logger.error(`${this.name}: Error during plugin initialization: ${error}`);
      console.error(`[ELIZAOS] TelegramMultiAgentPlugin: Error during initialize: ${error}`);
      // We don't rethrow here to allow ElizaOS to continue without our plugin
    }
  }
  
  /**
   * Complete the initialization process once we have a valid runtime
   */
  private async completeInitialization(runtime: IAgentRuntime): Promise<void> {
    try {
      // Update logger
      this.logger = runtime.getLogger();
      
      // Get agent ID if not already set
      if (!this.agentId || this.agentId === "unknown") {
        this.agentId = runtime.getAgentId();
      }
      
      this.logger.info(`${this.name}: Using agent ID: ${this.agentId}`);
      
      // Load configuration
      await this.loadConfig();
      
      // Check if plugin is enabled
      if (!this.config.enabled) {
        this.logger.info(`${this.name}: Plugin is disabled, skipping initialization`);
        return; // Return without error even if disabled
      }
      
      // Initialize conversation manager
      await this.initializeConversationManager();
      
      // Initialize components
      await this.initializeComponents();
      
      // Setup conversation check interval
      this.setupConversationCheck();
      
      // Mark as initialized
      this.initialized = true;
      
      this.logger.info(`${this.name}: Plugin initialized successfully`);
    } catch (error) {
      this.logger.error(`${this.name}: Error during plugin initialization: ${error}`);
      throw error; // Rethrow to allow caller to handle
    }
  }
  
  /**
   * Initialize plugin components
   */
  private async initializeComponents(): Promise<void> {
    try {
      // Get runtime - we already know it's available
      const runtime = this.runtime!;
      
      // Try to get character from runtime
      try {
        this.character = await runtime.getCharacter();
        this.logger.info(`${this.name}: Got character information from runtime`);
      } catch (error) {
        this.logger.warn(`${this.name}: Could not get character from runtime: ${error}`);
      }
      
      // Create relay with the agent ID
      this.relay = new TelegramRelay({
        relayServerUrl: this.config.relayServerUrl,
        authToken: this.config.authToken,
        agentId: this.agentId,
        retryLimit: this.config.maxRetries || 3,
        retryDelayMs: 1000
      }, this.logger);
      
      // Register message handler
      this.relay.onMessage(this.handleIncomingMessage.bind(this));
      
      // Add kickstarters for each group
      this.setupKickstarters(
        this.config.groupIds || [],
        this.relay,
        this.character
      );
      
      // Connect to relay server
      try {
        const connected = await this.relay.connect();
        if (connected) {
          this.logger.info(`${this.name}: Connected to relay server`);
          console.log(`[RELAY] ${this.name}: Connected to relay server at ${this.config.relayServerUrl}`);
        } else {
          this.logger.error(`${this.name}: Failed to connect to relay server`);
          console.log(`[ERROR] ${this.name}: Failed to connect to relay server`);
          
          // Schedule reconnect attempts
          this.scheduleReconnect();
        }
      } catch (error) {
        this.logger.error(`${this.name}: Error connecting to relay server: ${error}`);
        console.log(`[ERROR] ${this.name}: Error connecting to relay server: ${error}`);
        
        // Schedule reconnect attempts
        this.scheduleReconnect();
      }
      
      this.logger.info(`${this.name}: All components initialized`);
    } catch (error) {
      this.logger.error(`${this.name}: Error initializing components: ${error}`);
      throw error;
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
    // Get runtime
    const runtime = await this.waitForRuntime();
    
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
      const runtime = await this.waitForRuntime();
      const { chat, text, from, sender_agent_id } = message;
      
      // Enhanced logging for debugging message handling
      console.log("[PLUGIN] Message received:", JSON.stringify(message));
      
      // Get the agent ID from runtime
      const myAgentId = runtime.getAgentId();
      
      // Skip if the message is from self
      if (sender_agent_id === myAgentId) {
        console.log(`[PLUGIN] Ignoring message from self: ${sender_agent_id}`);
        return;
      }
      
      // Format group ID consistently
      const groupId = chat.id.toString();
      console.log(`[PLUGIN] Formatted incoming chatId: ${groupId}`);
      console.log(`[PLUGIN] Configured group IDs:`, this.config.groupIds);
      
      // Skip if this is not a configured group
      if (this.config.groupIds && this.config.groupIds.length > 0) {
        const normalizedGroupIds = this.config.groupIds.map(id => id.toString());
        if (!normalizedGroupIds.includes(groupId)) {
          console.log(`[PLUGIN] Ignoring message from unconfigured group ${groupId}`);
          this.logger.debug(`${this.name}: Ignoring message from unconfigured group ${groupId}`);
          return;
        }
      }
      
      // Process bot messages if they are from known bots
      if (from.is_bot) {
        console.log(`[PLUGIN] Message is from bot: ${from.username}`);
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
        
        console.log(`[PLUGIN] Bot message evaluation - Username: ${from.username}, Agent ID: ${sender_agent_id}`);
        console.log(`[PLUGIN] Is known bot: ${isKnownBot}`);
        
        if (!isKnownBot) {
          console.log(`[PLUGIN] Ignoring message from unknown bot: ${from.username || sender_agent_id}`);
          return;
        }
        console.log(`[PLUGIN] Processing message from known bot: ${from.username || sender_agent_id}`);
      }
      
      // Record the message in the conversation manager
      await this.conversationManager.recordMessage(
        groupId,
        sender_agent_id || from.username,
        text
      );
      
      // Store the message in the memory manager for context
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
      
      // Check if this agent should respond to the message
      const shouldRespond = await this.conversationManager.shouldAgentRespond(
        groupId,
        myAgentId,
        sender_agent_id || from.username,
        text
      );
      
      console.log(`[PLUGIN] Should respond to message: ${shouldRespond}`);
      
      if (shouldRespond) {
        this.logger.info(`${this.name}: Will respond to message in group ${groupId}`);
        console.log(`[PLUGIN] Forwarding message to runtime...`);
        
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
          console.log(`[PLUGIN] Runtime generated response: ${response.text.substring(0, 50)}...`);
          await this.relay.sendMessage(groupId, response.text);
          
          // Record our own message in the conversation
          await this.conversationManager.recordMessage(
            groupId,
            myAgentId,
            response.text
          );
        } else {
          console.log(`[PLUGIN] Runtime did not generate a response`);
          
          // Send a fallback response
          const fallbackResponse = await this.generateFallbackResponse();
          await this.relay.sendMessage(groupId, fallbackResponse);
          
          // Record our own message in the conversation
          await this.conversationManager.recordMessage(
            groupId,
            myAgentId,
            fallbackResponse
          );
        }
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