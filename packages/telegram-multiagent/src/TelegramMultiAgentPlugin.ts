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
      authToken: 'elizaos-secure-relay-key',
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
   * Register the plugin with the agent runtime
   * 
   * @param runtime - Agent runtime
   * @returns Plugin instance or false if registration failed
   */
  register(runtime: IAgentRuntime): Plugin | boolean {
    try {
      this.runtime = runtime;
      
      // Get or create logger
      const loggerService = runtime.getService('logger');
      if (loggerService) {
        this.logger = loggerService;
      } else {
        // Create a simple default logger
        this.logger = {
          trace: (message: string, ...args: any[]) => console.log(`[TRACE] ${message}`, ...args),
          debug: (message: string, ...args: any[]) => console.debug(`[DEBUG] ${message}`, ...args),
          info: (message: string, ...args: any[]) => console.info(`[INFO] ${message}`, ...args),
          warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${message}`, ...args),
          error: (message: string, ...args: any[]) => console.error(`[ERROR] ${message}`, ...args)
        };
      }
      
      this.logger.info(`${this.name}: Plugin registered`);
      return this;
    } catch (error) {
      console.error(`Failed to register ${this.name} plugin:`, error);
      return false;
    }
  }
  
  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    try {
      if (this.initialized) {
        this.logger.warn(`${this.name}: Plugin already initialized`);
        return;
      }
      
      this.logger.info(`${this.name}: Initializing plugin`);
      
      // Load configuration
      await this.loadConfig();
      
      // Check if the plugin is enabled
      if (!this.config.enabled) {
        this.logger.info(`${this.name}: Plugin is disabled in configuration`);
        return;
      }
      
      // Check required parameters
      if (!this.checkRequirements()) {
        this.logger.error(`${this.name}: Missing required configuration parameters`);
        return;
      }
      
      // Get character information if available
      if (this.runtime.getCharacter) {
        this.character = this.runtime.getCharacter();
      }
      
      // Initialize components
      await this.initializeComponents();
      
      // Register message handler with the runtime
      if (this.runtime.registerService) {
        this.runtime.registerService('telegramMultiAgent', this);
      }
      
      // Set up periodic check for conversation opportunities
      this.setupConversationCheck();
      
      this.initialized = true;
      this.logger.info(`${this.name}: Plugin initialized successfully`);
    } catch (error) {
      this.logger.error(`${this.name}: Failed to initialize plugin: ${error}`);
      throw error;
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
      
      // Check for agent-specific configuration
      if (this.runtime.agent && this.runtime.agent.plugins && this.runtime.agent.plugins[this.name]) {
        const agentConfig = this.runtime.agent.plugins[this.name];
        
        // Merge configuration from agent settings
        this.config = {
          ...this.config,
          ...agentConfig
        };
      }
      
      // Add environmental variables (they override agent config)
      this.config = {
        ...this.config,
        ...envConfig
      };
      
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
      // Create conversation manager
      this.conversationManager = new ConversationManager(
        this.runtime,
        this.logger
      );
      
      // Initialize conversation manager
      await this.conversationManager.initialize();
      
      // Create relay client
      this.relay = new TelegramRelay({
        relayServerUrl: this.config.relayServerUrl,
        authToken: this.config.authToken,
        agentId: this.runtime.getAgentId(),
        retryLimit: this.config.maxRetries || 3,
        retryDelayMs: 1000
      }, this.logger);
      
      // Register message handler
      this.relay.onMessage(this.handleMessage.bind(this));
      
      // Register agent update handler
      this.relay.onAgentUpdate(this.handleAgentUpdate.bind(this));
      
      // Create kickstarters for each group
      if (this.config.groupIds && this.config.groupIds.length > 0) {
        for (const groupId of this.config.groupIds) {
          // Create personality enhancer (simplified version)
          const personality = this.createPersonalityEnhancer();
          
          // Create conversation kickstarter
          const kickstarter = new ConversationKickstarter(
            this.runtime,
            this.logger,
            this.conversationManager,
            this.relay,
            this.config.kickstarterConfig,
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
  private async handleMessage(message: RelayMessage): Promise<void> {
    try {
      const { chat, text, from, sender_agent_id } = message;
      
      // Skip if the message is from self
      if (sender_agent_id === this.runtime.getAgentId()) {
        return;
      }
      
      // Format group ID consistently
      const groupId = chat.id.toString();
      
      // Skip if this is not a configured group
      if (this.config.groupIds && this.config.groupIds.length > 0) {
        if (!this.config.groupIds.includes(groupId)) {
          this.logger.debug(`${this.name}: Ignoring message from unconfigured group ${groupId}`);
          return;
        }
      }
      
      // Record the message in the conversation manager
      await this.conversationManager.recordMessage(
        groupId,
        sender_agent_id || from.username,
        text
      );
      
      // Store the message in the memory manager for context
      if (this.runtime.memoryManager) {
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
        this.runtime.getAgentId(),
        sender_agent_id || from.username
      );
      
      if (shouldRespond) {
        this.logger.info(`${this.name}: Will respond to message in group ${groupId}`);
        
        // If handleMessage is available, use it to generate a response
        if (this.runtime.handleMessage) {
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
            await this.relay.sendMessage(groupId, response.text);
            
            // Record our own message in the conversation
            await this.conversationManager.recordMessage(
              groupId,
              this.runtime.getAgentId(),
              response.text
            );
          }
        }
      } else {
        this.logger.debug(`${this.name}: Decided not to respond to message in group ${groupId}`);
      }
    } catch (error) {
      this.logger.error(`${this.name}: Error handling message: ${error}`);
    }
  }
  
  /**
   * Handle agent update from the relay
   * 
   * @param agents - Array of agent IDs
   */
  private handleAgentUpdate(agents: string[]): void {
    try {
      // Filter out own agent ID
      const agentId = this.runtime.getAgentId();
      const otherAgents = agents.filter(id => id !== agentId);
      
      // Update the set of known agents
      this.knownAgents = new Set(otherAgents);
      
      this.logger.info(`${this.name}: Updated known agents, ${otherAgents.length} others found`);
      
      // Update all kickstarters with the latest agent list
      for (const kickstarter of this.kickstarters.values()) {
        kickstarter.updateKnownAgents(otherAgents);
      }
    } catch (error) {
      this.logger.error(`${this.name}: Error handling agent update: ${error}`);
    }
  }
  
  /**
   * Get message history for a group
   * 
   * @param groupId - Group ID
   * @returns Array of recent messages
   */
  private async getMessageHistory(groupId: string): Promise<Array<{ sender: string, text: string }>> {
    try {
      if (!this.runtime.memoryManager) {
        return [];
      }
      
      // Query memory for recent messages
      const memories = await this.runtime.memoryManager.getMemories({
        roomId: groupId,
        type: 'telegram-message',
        count: 10
      });
      
      // Format messages
      return memories.map(memory => ({
        sender: memory.userId,
        text: memory.content.text
      }));
    } catch (error) {
      this.logger.error(`${this.name}: Error getting message history: ${error}`);
      return [];
    }
  }
}

// Export default plugin creator function
export default function createPlugin(): Plugin {
  return new TelegramMultiAgentPlugin();
}