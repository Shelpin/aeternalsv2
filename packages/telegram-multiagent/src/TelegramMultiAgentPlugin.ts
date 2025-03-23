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
  private relay: TelegramRelay;
  private conversationManager: ConversationManager;
  private kickstarters: Map<string, ConversationKickstarter> = new Map();
  private knownAgents: Set<string> = new Set();
  private character: Character | null = null;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  
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
    
    this.config = {
      enabled: true,
      relayServerUrl: 'http://207.180.245.243:4000',
      authToken: 'elizaos-secure-relay-key',
      groupIds: [],
      ...options
    };
    
    console.log("[CONSTRUCTOR] TelegramMultiAgentPlugin: Constructor called");
    console.log(`[CONFIG] Using relay server: ${this.config.relayServerUrl}`);
    console.log(`[CONFIG] Using default auth token: ${this.config.authToken.substring(0, 6)}****`);

    this.logger = defaultLogger;
    
    // Create conversation manager
    this.conversationManager = new ConversationManager(this.logger);
  }
  
  /**
   * Register the plugin with the ElizaOS runtime
   * 
   * @param runtime - ElizaOS runtime
   * @returns True on success
   */
  register(runtime: IAgentRuntime): Plugin | boolean {
    try {
      console.log(`[REGISTER] TelegramMultiAgentPlugin: Register method called`);
      
      // Try to get agent ID - might not be available yet
      let agentId = "unknown";
      try {
        agentId = runtime.getAgentId();
        console.log(`[REGISTER] TelegramMultiAgentPlugin: Agent ID from runtime: ${agentId}`);
      } catch (error) {
        console.log(`[REGISTER] TelegramMultiAgentPlugin: Could not get agentId yet, will retry later: ${error}`);
      }
      
      // Set runtime in parent class
      super.setRuntime(runtime);
      
      // Get a logger from the runtime
      try {
        this.logger = runtime.getLogger();
        this.logger.info(`[REGISTER] ${this.name}: Registering plugin with runtime`);
        
        if (agentId !== "unknown") {
          this.logger.debug(`[REGISTER] ${this.name}: Agent ID ${agentId}`);
        }
        
        console.log(`[REGISTER] ${this.name}: Registering plugin with runtime. Agent ID: ${agentId}`);
        
        // Register this plugin as a service so other plugins can access it
        runtime.registerService("telegramMultiAgentPlugin", this);
        
        return this;
      } catch (error) {
        console.error(`[ERROR] ${this.name}: Error during plugin registration: ${error}`);
        return false;
      }
    } catch (error) {
      console.error(`[ERROR] ${this.name}: Unexpected error during plugin registration: ${error}`);
      return false;
    }
  }
  
  /**
   * Initialize the conversation manager
   */
  private async initializeConversationManager(): Promise<void> {
    const runtime = await this.waitForRuntime();
    
    // Update logger
    try {
      this.logger = runtime.getLogger();
    } catch (error) {
      console.error(`[ERROR] ${this.name}: Error getting logger from runtime: ${error}`);
    }
    
    // Set conversation manager runtime
    this.conversationManager.setRuntime(runtime);
    
    // Register it as a service
    runtime.registerService("conversationManager", this.conversationManager);
  }
  
  /**
   * Initialize the plugin - this should be called after register
   * and follows the ElizaOS plugin lifecycle pattern
   */
  async initialize(): Promise<void> {
    try {
      console.log(`[ELIZAOS] TelegramMultiAgentPlugin: initialize method called for agent ${this.runtime?.getAgentId() || 'undefined'}`);
      
      // Additional debug logs
      console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Runtime available: ${!!this.runtime}`);
      console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Config available: ${!!this.config}`);
      
      // Get runtime by waiting for it to be available
      const runtime = await this.waitForRuntime();
      
      // Load configuration
      await this.loadConfig();
      
      // Update logger from runtime
      this.logger = runtime.getLogger();
      
      // Check if plugin is enabled
      if (!this.config?.enabled) {
        console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Plugin is disabled, skipping initialization`);
        if (this.logger) {
          this.logger.info(`${this.name}: Plugin is disabled, skipping initialization`);
        }
        return; // Return without error even if disabled
      }
      
      // Check requirements
      if (!runtime || !this.config.relayServerUrl || !this.config.authToken) {
        console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Requirements check failed, cannot initialize`);
        console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Runtime: ${!!runtime}, RelayURL: ${!!this.config.relayServerUrl}, AuthToken: ${!!this.config.authToken}`);
        return;
      }
      
      // Additional debug logs
      console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Starting initialization with relay server ${this.config.relayServerUrl}`);
      
      // Log initialization start
      this.logger.info(`${this.name}: Initializing plugin`);
      
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
    }
  }
  
  /**
   * Initialize plugin components
   */
  private async initializeComponents(): Promise<void> {
    try {
      // Get agent ID from runtime
      const runtime = await this.waitForRuntime();
      
      // Retry getting agent ID - should be available now
      let agentId = "unknown";
      try {
        agentId = runtime.getAgentId();
        this.logger.info(`${this.name}: Using agent ID from runtime: ${agentId}`);
      } catch (error) {
        this.logger.error(`${this.name}: Could not get agent ID from runtime: ${error}`);
        console.log(`[ERROR] ${this.name}: Could not get agent ID from runtime: ${error}`);
        // Continue with unknown agent ID
      }
      
      // Initialize conversation manager
      await this.conversationManager.initialize();
      
      // Create relay with the agent ID
      this.relay = new TelegramRelay({
        relayServerUrl: this.config.relayServerUrl,
        authToken: this.config.authToken,
        agentId: agentId,
        retryLimit: this.config.maxRetries || 3,
        retryDelayMs: 1000
      }, this.logger);
      
      // Register message handler
      this.relay.onMessage(this.handleIncomingMessage.bind(this));
      
      // Try to get character from runtime
      try {
        this.character = await runtime.getCharacter();
        this.logger.info(`${this.name}: Got character information from runtime`);
      } catch (error) {
        this.logger.warn(`${this.name}: Could not get character from runtime: ${error}`);
      }
      
      // Add kickstarters for each group
      this.setupKickstarters(
        this.config.groupIds || [],
        this.relay,
        this.character
      );
      
      // Connect to relay server
      try {
        await this.relay.connect();
        this.logger.info(`${this.name}: Connected to relay server`);
        console.log(`[RELAY] ${this.name}: Connected to relay server at ${this.config.relayServerUrl}`);
      } catch (error) {
        this.logger.error(`${this.name}: Failed to connect to relay server: ${error}`);
        console.log(`[ERROR] ${this.name}: Failed to connect to relay server: ${error}`);
      }
      
      this.logger.info(`${this.name}: All components initialized`);
    } catch (error) {
      this.logger.error(`${this.name}: Error initializing components: ${error}`);
      console.log(`[ERROR] ${this.name}: Error initializing components: ${error}`);
    }
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
   * Load configuration from environment and settings
   */
  private async loadConfig(): Promise<void> {
    try {
      // Get runtime for accessing settings
      const runtime = await this.waitForRuntime();
      
      // Merge default config with options from constructor
      this.config = {
        ...DEFAULT_CONFIG,
        ...this.config
      };
      
      // Check for plugin-specific settings in runtime
      const pluginSettings = runtime.getSetting('telegram-multiagent');
      if (pluginSettings) {
        this.config = {
          ...this.config,
          ...pluginSettings
        };
      }
      
      // Check for relay URL in environment
      const relayUrl = process.env.TELEGRAM_RELAY_URL;
      if (relayUrl) {
        this.config.relayServerUrl = relayUrl;
      }
      
      // Check for auth token in environment
      const authToken = process.env.RELAY_API_KEY || process.env.TELEGRAM_RELAY_TOKEN;
      if (authToken) {
        this.config.authToken = authToken;
      }
      
      // Check for group IDs in environment
      const groupIdsString = process.env.TELEGRAM_GROUP_IDS;
      if (groupIdsString) {
        // Split comma-separated list and trim each ID
        const groupIds = groupIdsString.split(',').map(id => id.trim());
        
        // Only use if there's at least one valid ID
        if (groupIds.length > 0 && groupIds[0]) {
          this.config.groupIds = groupIds;
        }
      }
      
      // Log loaded configuration
      this.logger.info(`${this.name}: Loaded configuration with ${this.config.groupIds.length} groups`);
      this.logger.debug(`${this.name}: Relay server URL: ${this.config.relayServerUrl}`);
      this.logger.debug(`${this.name}: Group IDs: ${this.config.groupIds.join(', ')}`);
    } catch (error) {
      this.logger.error(`${this.name}: Error loading configuration: ${error}`);
      // Use existing config
    }
  }
  
  /**
   * Check if all requirements are met
   */
  private checkRequirements(): boolean {
    // Check for required configuration
    if (!this.config.relayServerUrl) {
      this.logger.error(`${this.name}: Missing relay server URL`);
      return false;
    }
    
    if (!this.config.authToken) {
      this.logger.error(`${this.name}: Missing relay server auth token`);
      return false;
    }
    
    if (!this.config.groupIds || this.config.groupIds.length === 0) {
      this.logger.error(`${this.name}: No group IDs configured`);
      return false;
    }
    
    return true;
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