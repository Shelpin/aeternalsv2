import {
  IAgentRuntime,
  ElizaLogger,
  Plugin,
  TelegramMultiAgentConfig,
  RelayMessage,
  MemoryData,
  Character
} from './types';
import { ConversationManager } from './ConversationManager';
import { TelegramRelay } from './TelegramRelay';
import { ConversationKickstarter } from './ConversationKickstarter';
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
export class TelegramMultiAgentPlugin implements Plugin {
  name = 'telegram-multiagent';
  description = 'Multi-agent coordination for Telegram bots in ElizaOS';
  npmName = '@elizaos/telegram-multiagent';
  
  private config: TelegramMultiAgentConfig;
  private runtime: IAgentRuntime;
  private logger: ElizaLogger;
  private relay: TelegramRelay;
  private conversationManager: ConversationManager;
  private kickstarters: Map<string, ConversationKickstarter> = new Map();
  private knownAgents: Set<string> = new Set();
  private character: Character | null = null;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  
  constructor(options?: Partial<TelegramMultiAgentConfig>) {
    console.log("[CONSTRUCTOR] TelegramMultiAgentPlugin: Constructor called");
    
    this.config = {
      enabled: true,
      relayServerUrl: 'http://207.180.245.243:4000',
      authToken: '',
      groupIds: [],
      ...options
    };

    this.logger = {
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
  }
  
  /**
   * Register the plugin
   */
  register(runtime: IAgentRuntime): Plugin | boolean {
    try {
      this.runtime = runtime;
      this.logger = runtime.getLogger();
      
      // Log plugin registration
      this.logger.info(`${this.name}: Registering plugin with runtime`);
      this.logger.debug(`${this.name}: Agent ID ${runtime.getAgentId()}`);
      
      console.log(`[REGISTER] ${this.name}: Registering plugin with runtime. Agent ID: ${runtime.getAgentId()}`);
      
      return this;
    } catch (error) {
      console.error(`[ERROR] ${this.name}: Error during plugin registration: ${error}`);
      return false;
    }
  }
  
  /**
   * Initialize the plugin - this should be called after register
   * and follows the ElizaOS plugin lifecycle pattern
   */
  async initialize(): Promise<void> {
    try {
      // Direct console.log for debugging - bypasses any logger issues
      console.log(`[ELIZAOS] TelegramMultiAgentPlugin: initialize method called for agent ${this.runtime?.getAgentId()}`);
      
      // Log initialization start
      if (this.logger) {
        this.logger.info(`${this.name}: Initializing plugin`);
      }
      
      // Load configuration
      await this.loadConfig();
      
      // Check if plugin is enabled
      if (!this.config.enabled) {
        console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Plugin is disabled, skipping initialization`);
        if (this.logger) {
          this.logger.info(`${this.name}: Plugin is disabled, skipping initialization`);
        }
        return; // Return without error even if disabled
      }
      
      // Check requirements
      if (!this.checkRequirements()) {
        console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Requirements check failed, cannot initialize`);
        if (this.logger) {
          this.logger.error(`${this.name}: Requirements check failed, cannot initialize`);
        }
        return; // Return without error
      }
      
      // Initialize components
      await this.initializeComponents();
      
      if (this.logger) {
        this.logger.info(`${this.name}: Plugin initialized successfully`);
      }
      console.log(`[ELIZAOS] TelegramMultiAgentPlugin: Plugin initialized successfully`);
    } catch (error) {
      console.error(`[ELIZAOS] TelegramMultiAgentPlugin: Error during initialization:`, error);
      if (this.logger) {
        this.logger.error(`${this.name}: Error during plugin initialization: ${error}`);
      }
      // Don't throw the error, just log it
    }
  }
  
  /**
   * Shutdown the plugin
   */
  async shutdown(): Promise<void> {
    try {
      this.logger.info(`${this.name}: Shutting down plugin`);
      
      // Clear the conversation check interval
      if (this.checkIntervalId) {
        clearInterval(this.checkIntervalId);
        this.checkIntervalId = null;
      }
      
      // Stop all kickstarters
      for (const kickstarter of this.kickstarters.values()) {
        kickstarter.stop();
      }
      
      // Disconnect from relay server
      if (this.relay) {
        await this.relay.disconnect();
      }
      
      this.initialized = false;
      this.logger.info(`${this.name}: Plugin shutdown complete`);
    } catch (error) {
      this.logger.error(`${this.name}: Error during plugin shutdown: ${error}`);
      throw error;
    }
  }
  
  /**
   * Load plugin configuration
   */
  private async loadConfig(): Promise<void> {
    try {
      // Start with default configuration
      this.config = { ...DEFAULT_CONFIG };
      
      // Check for environmental variables
      const envConfig: Partial<TelegramMultiAgentConfig> = {};
      
      if (process.env.TELEGRAM_MULTIAGENT_ENABLED) {
        envConfig.enabled = process.env.TELEGRAM_MULTIAGENT_ENABLED === 'true';
      }
      
      if (process.env.TELEGRAM_RELAY_SERVER_URL) {
        envConfig.relayServerUrl = process.env.TELEGRAM_RELAY_SERVER_URL;
      }
      
      if (process.env.TELEGRAM_AUTH_TOKEN) {
        envConfig.authToken = process.env.TELEGRAM_AUTH_TOKEN;
      } else if (process.env.RELAY_AUTH_TOKEN) {
        // Fallback to generic relay token if specific one not provided
        envConfig.authToken = process.env.RELAY_AUTH_TOKEN;
      }
      
      if (process.env.TELEGRAM_GROUP_IDS) {
        envConfig.groupIds = process.env.TELEGRAM_GROUP_IDS.split(',');
      }
      
      if (process.env.TELEGRAM_DB_PATH) {
        envConfig.dbPath = process.env.TELEGRAM_DB_PATH;
      }
      
      if (process.env.TELEGRAM_LOG_LEVEL) {
        envConfig.logLevel = process.env.TELEGRAM_LOG_LEVEL;
      }
      
      // Override with environment variables
      this.config = {
        ...this.config,
        ...envConfig
      };
      
      // Set default auth token if not provided
      if (!this.config.authToken) {
        this.config.authToken = 'elizaos-secure-relay-key';
        this.logger.info(`${this.name}: Using default auth token`);
      }
      
      // Set default relay server URL if not provided
      if (!this.config.relayServerUrl) {
        this.config.relayServerUrl = 'http://207.180.245.243:4000';
        this.logger.info(`${this.name}: Using default relay server URL: ${this.config.relayServerUrl}`);
      }
      
      this.logger.debug(`${this.name}: Configuration loaded`);
    } catch (error) {
      this.logger.error(`${this.name}: Error loading configuration: ${error}`);
      throw error;
    }
  }
  
  /**
   * Check if required configuration parameters are present
   */
  private checkRequirements(): boolean {
    if (!this.config.relayServerUrl) {
      this.logger.error(`${this.name}: Missing relay server URL in configuration`);
      return false;
    }
    
    if (!this.config.authToken) {
      this.logger.error(`${this.name}: Missing auth token in configuration`);
      return false;
    }
    
    if (!this.config.groupIds || this.config.groupIds.length === 0) {
      this.logger.warn(`${this.name}: No group IDs specified in configuration`);
      // Not returning false as it's not a critical error
    }
    
    return true;
  }
  
  /**
   * Initialize plugin components
   */
  private async initializeComponents(): Promise<void> {
    try {
      // Get agent ID from runtime or use a fallback
      let agentId: string;
      if (this.runtime) {
        try {
          agentId = this.runtime.getAgentId();
          this.logger.info(`${this.name}: Using agent ID from runtime: ${agentId}`);
        } catch (error) {
          // Fallback to environment variable or default
          agentId = process.env.AGENT_ID || 'unknown-agent';
          this.logger.warn(`${this.name}: Could not get agent ID from runtime, using fallback: ${agentId}`);
        }
      } else {
        // Fallback to environment variable or default
        agentId = process.env.AGENT_ID || 'unknown-agent';
        this.logger.warn(`${this.name}: Runtime not available, using fallback agent ID: ${agentId}`);
      }
      
      // Create conversation manager
      this.conversationManager = new ConversationManager(
        this.runtime || null,  // Pass null if runtime is undefined
        this.logger
      );
      
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
      
      // Try to get character from runtime if available
      if (this.runtime && this.runtime.getCharacter) {
        try {
          this.character = await this.runtime.getCharacter();
          this.logger.info(`${this.name}: Got character information from runtime`);
        } catch (error) {
          this.logger.warn(`${this.name}: Could not get character from runtime: ${error}`);
        }
      }
      
      // Create kickstarters for each group
      if (this.config.groupIds && this.config.groupIds.length > 0) {
        // Skip creating kickstarters if runtime is not available to avoid issues
        if (!this.runtime) {
          this.logger.warn(`${this.name}: Skipping conversation kickstarters - runtime not available`);
        } else {
          for (const groupId of this.config.groupIds) {
            // Create personality enhancer (simplified version)
            const personality = this.createPersonalityEnhancer();
            
            // Create conversation kickstarter
            const kickstarter = new ConversationKickstarter(
              this.runtime,
              this.logger,
              this.conversationManager,
              this.relay,
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
            
            // Store kickstarter
            this.kickstarters.set(groupId, kickstarter);
            
            // Start kickstarter
            kickstarter.start();
            
            this.logger.info(`${this.name}: Created kickstarter for group ${groupId}`);
          }
        }
      }
      
      // Connect to relay server
      await this.relay.connect();
      
      this.logger.info(`${this.name}: All components initialized`);
    } catch (error) {
      this.logger.error(`${this.name}: Error initializing components: ${error}`);
      throw error;
    }
  }
  
  /**
   * Create a simple personality enhancer
   */
  private createPersonalityEnhancer(): any {
    // This is a simplified personality enhancer for the kickstarter
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
      this.checkConversationOpportunities();
    }, intervalMs);
    
    this.logger.info(`${this.name}: Set up conversation check interval every ${intervalMs}ms`);
  }
  
  /**
   * Check for opportunities to start or continue conversations
   */
  private async checkConversationOpportunities(): Promise<void> {
    try {
      // Skip if no kickstarters
      if (this.kickstarters.size === 0) {
        return;
      }
      
      // Skip if no other agents known
      if (this.knownAgents.size === 0) {
        return;
      }
      
      this.logger.debug(`${this.name}: Checking for conversation opportunities`);
      
      // Each kickstarter will internally decide whether to start a conversation
      // based on its own logic and probability calculations
      const checkPromises = [...this.kickstarters.values()].map(kickstarter => {
        // Each kickstarter has its own internal timing, this is just a trigger
        // that lets it know it's time to consider starting a conversation
        return kickstarter.attemptKickstart().catch(error => {
          this.logger.error(`${this.name}: Error in kickstarter: ${error}`);
        });
      });
      
      await Promise.all(checkPromises);
    } catch (error) {
      this.logger.error(`${this.name}: Error checking conversation opportunities: ${error}`);
    }
  }
  
  /**
   * Handle incoming message from the relay
   * 
   * @param message - Telegram message from relay
   */
  private async handleIncomingMessage(message: RelayMessage): Promise<void> {
    try {
      const { chat, text, from, sender_agent_id } = message;
      
      // Enhanced logging for debugging message handling
      console.log("[PLUGIN] Message received:", JSON.stringify(message));
      
      // Get the agent ID if runtime is available, otherwise use a fallback
      const myAgentId = this.runtime ? this.runtime.getAgentId() : 
        process.env.AGENT_ID || 'unknown_agent';
      
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
      if (this.runtime?.memoryManager) {
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
        
        await this.runtime.memoryManager.createMemory(memoryData);
      }
      
      // Check if this agent should respond to the message
      const shouldRespond = await this.conversationManager.shouldAgentRespond(
        groupId,
        myAgentId,
        sender_agent_id || from.username
      );
      
      console.log(`[PLUGIN] Should respond to message: ${shouldRespond}`);
      
      if (shouldRespond) {
        this.logger.info(`${this.name}: Will respond to message in group ${groupId}`);
        console.log(`[PLUGIN] Forwarding message to runtime...`);
        
        // If runtime and handleMessage are available, use it to generate a response
        if (this.runtime?.handleMessage) {
          // Create a context object for the runtime
          const context = {
            roomId: groupId,
            platform: 'telegram',
            conversationType: 'group',
            participantCount: this.knownAgents.size + 1, // Include self
            messageHistory: await this.getMessageHistory(groupId)
          };
          
          // Call the runtime to handle the message
          const response = await this.runtime.handleMessage({
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
          }
        } else {
          console.log(`[PLUGIN] Runtime or handleMessage is not available, sending fallback response`);
          // Send a fallback response
          const fallbackResponse = `I received your message but I'm currently in limited mode. Please try again later.`;
          await this.relay.sendMessage(groupId, fallbackResponse);
          
          // Record our own message in the conversation
          await this.conversationManager.recordMessage(
            groupId,
            myAgentId,
            fallbackResponse
          );
        }
      } else {
        this.logger.debug(`${this.name}: Decided not to respond to message in group ${groupId}`);
      }
    } catch (error) {
      console.error(`[PLUGIN] Error handling message:`, error);
      this.logger.error(`${this.name}: Error handling message: ${error}`);
    }
  }
  
  /**
   * Handle agent update from the relay
   * 
   * @param agentId - Updated agent ID
   */
  private async handleAgentUpdate(agentId: string): Promise<void> {
    try {
      this.logger.info(`${this.name}: Agent update received. New agent ID: ${agentId}`);
      
      // Add the new agent to the known agents set
      this.knownAgents.add(agentId);
    } catch (error) {
      this.logger.error(`${this.name}: Error handling agent update: ${error}`);
    }
  }
  
  /**
   * Get message history for a group
   * 
   * @param groupId - Group ID
   * @returns Message history for the group
   */
  private async getMessageHistory(groupId: string): Promise<RelayMessage[]> {
    try {
      // Implementation of getMessageHistory method
      // This is a placeholder and should be replaced with the actual implementation
      return [];
    } catch (error) {
      this.logger.error(`${this.name}: Error getting message history: ${error}`);
      throw error;
    }
  }
}