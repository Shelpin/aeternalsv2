// Export all components from the telegram-multiagent package

// Core components
export { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
export { TelegramRelay, MessageStatus, type RelayMessage, type TelegramRelayConfig } from './TelegramRelay';
export { ConversationManager } from './ConversationManager';
export { PersonalityEnhancer, type PersonalityTraits, type PersonalityVoice } from './PersonalityEnhancer';

// Types
import { IAgentRuntime, ElizaLogger, Plugin } from './types';
export * from './types';

// Import classes used in the plugin implementation
import { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
import { TelegramRelay } from './TelegramRelay';
import { ConversationManager } from './ConversationManager';
import { PersonalityEnhancer } from './PersonalityEnhancer';

/**
 * Plugin configuration options
 */
export interface TelegramMultiAgentPluginConfig {
  relayServerUrl: string;
  authToken: string;
  groupIds: number[];
  conversationCheckIntervalMs?: number;
  enabled?: boolean;
}

// Runtime interface that includes plugin registration
interface Runtime extends IAgentRuntime {
  registerPlugin(name: string, plugin: Plugin): void;
}

/**
 * TelegramMultiAgentPlugin enables multi-agent coordination in Telegram groups
 */
export class TelegramMultiAgentPlugin implements Plugin {
  private config: TelegramMultiAgentPluginConfig;
  private runtime: IAgentRuntime;
  private adapter: TelegramCoordinationAdapter | null = null;
  private relay: TelegramRelay | null = null;
  private conversationManager: Record<number, ConversationManager> = {};
  private personality: PersonalityEnhancer | null = null;
  private logger: ElizaLogger;
  private isRunning: boolean = false;
  private initialized: boolean = false;
  
  /**
   * Create a new TelegramMultiAgentPlugin
   * 
   * @param config - Plugin configuration
   * @param runtime - ElizaOS runtime
   * @param logger - Logger instance
   */
  constructor(config: TelegramMultiAgentPluginConfig, runtime: IAgentRuntime, logger: ElizaLogger) {
    this.config = {
      conversationCheckIntervalMs: 60000, // 1 minute default
      enabled: true,
      ...config
    };
    this.runtime = runtime;
    this.logger = logger;
  }
  
  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    if (!this.config.enabled) {
      this.logger.info('TelegramMultiAgentPlugin: Plugin is disabled, skipping initialization');
      return;
    }
    
    try {
      this.logger.info('TelegramMultiAgentPlugin: Initializing plugin');
      
      // Initialize coordination adapter
      this.adapter = new TelegramCoordinationAdapter(
        this.runtime.getAgentId(),
        this.runtime,
        this.logger
      );
      
      // Initialize relay
      this.relay = new TelegramRelay(
        {
          relayServerUrl: this.config.relayServerUrl,
          authToken: this.config.authToken,
          agentId: this.runtime.getAgentId()
        },
        this.logger
      );
      
      // Initialize personality enhancer
      this.personality = new PersonalityEnhancer(
        this.runtime.getAgentId(),
        this.runtime,
        this.logger
      );
      
      // Link personality enhancer to adapter
      this.adapter.setPersonalityEnhancer(this.personality);
      
      // Initialize conversation managers for each group
      for (const groupId of this.config.groupIds) {
        this.conversationManager[groupId] = new ConversationManager(
          this.adapter,
          this.relay,
          this.personality,
          this.runtime.getAgentId(),
          groupId,
          this.logger
        );
      }
      
      // Connect to relay server
      await this.relay.connect();
      
      // Start conversation management
      this.startConversationManagement();
      
      this.initialized = true;
      this.logger.info('TelegramMultiAgentPlugin: Initialization complete');
    } catch (error: any) {
      this.logger.error(`TelegramMultiAgentPlugin: Initialization error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Start conversation management
   */
  private startConversationManagement(): void {
    // Register relay event handlers
    if (this.relay) {
      this.relay.on('messageSent', this.handleMessageSent.bind(this));
      this.relay.on('messageFailed', this.handleMessageFailed.bind(this));
      this.relay.on('connected', this.handleRelayConnected.bind(this));
      this.relay.on('disconnected', this.handleRelayDisconnected.bind(this));
    }
    
    this.isRunning = true;
    this.logger.info('TelegramMultiAgentPlugin: Conversation management started');
    
    // Manual check instead of using a timer
    this.checkConversations();
  }
  
  /**
   * Check if conversations should be started or ended
   */
  private async checkConversations(): Promise<void> {
    if (!this.initialized || !this.adapter || !this.relay || !this.isRunning) {
      return;
    }
    
    const currentTime = Date.now();
    
    try {
      for (const groupId of Object.keys(this.conversationManager).map(Number)) {
        const manager = this.conversationManager[groupId];
        
        // Check if an active conversation should end
        if (manager.getConversationState() === 'active') {
          if (manager.shouldEndConversation()) {
            this.logger.info(`TelegramMultiAgentPlugin: Ending conversation in group ${groupId}`);
            manager.endConversation(true);
          }
          continue; // Skip starting new conversations if we already have one
        }
        
        // Check if a new conversation should start
        if (manager.getConversationState() === 'inactive') {
          if (manager.shouldStartConversation(currentTime)) {
            await this.startRandomConversation(groupId);
          }
        }
      }
    } catch (error: any) {
      this.logger.error(`TelegramMultiAgentPlugin: Error checking conversations: ${error.message}`);
    }
  }
  
  /**
   * Start a random conversation in a group
   * 
   * @param groupId - Telegram group ID
   */
  private async startRandomConversation(groupId: number): Promise<void> {
    if (!this.adapter || !this.relay || !this.personality) {
      return;
    }
    
    try {
      const manager = this.conversationManager[groupId];
      
      // Generate a topic based on agent personality
      const topics = await this.getRandomTopics(3);
      let selectedTopic = 'cryptocurrencies';
      
      if (topics.length > 0) {
        // Pick most relevant topic
        let bestRelevance = 0;
        
        for (const topic of topics) {
          const relevance = this.personality.calculateTopicRelevance(topic);
          if (relevance > bestRelevance) {
            bestRelevance = relevance;
            selectedTopic = topic;
          }
        }
      }
      
      // Initiate conversation
      const conversationId = manager.initiateConversation(selectedTopic);
      
      if (!conversationId) {
        this.logger.error(`TelegramMultiAgentPlugin: Failed to initiate conversation in group ${groupId}`);
        return;
      }
      
      this.logger.info(`TelegramMultiAgentPlugin: Started conversation in group ${groupId} on topic: ${selectedTopic}`);
      
      // Send initial message
      const initialMessage = this.generateInitialMessage(selectedTopic);
      this.relay.sendMessage(groupId, initialMessage);
      
      // Update conversation state
      manager.updateWithMessage(initialMessage, this.runtime.getAgentId(), selectedTopic);
      
      // Invite other agents immediately instead of with a timeout
      await this.inviteAgentsToConversation(groupId, selectedTopic);
    } catch (error: any) {
      this.logger.error(`TelegramMultiAgentPlugin: Error starting conversation: ${error.message}`);
    }
  }
  
  /**
   * Generate an initial message for a new conversation
   * 
   * @param topic - Conversation topic
   * @returns Initial message text
   */
  private generateInitialMessage(topic: string): string {
    const initialTemplates = [
      `I've been thinking about ${topic} lately. What do you all think?`,
      `Has anyone been keeping up with the latest on ${topic}?`,
      `${topic} is such an interesting topic. I'd love to hear others' thoughts.`,
      `I just saw something interesting about ${topic}. Anyone want to discuss?`,
      `What's everyone's take on ${topic}? I'm curious.`
    ];
    
    // Select random template
    const template = initialTemplates[Math.floor(Math.random() * initialTemplates.length)];
    
    // Enhance with personality
    return this.personality?.enhanceMessage(template, { isInitialMessage: true }) || template;
  }
  
  /**
   * Invite other agents to join a conversation
   * 
   * @param groupId - Telegram group ID
   * @param topic - Conversation topic
   */
  private async inviteAgentsToConversation(groupId: number, topic: string): Promise<void> {
    if (!this.adapter || !this.relay) {
      return;
    }
    
    const manager = this.conversationManager[groupId];
    
    // Only invite if conversation is still active
    if (manager.getConversationState() !== 'starting' && manager.getConversationState() !== 'active') {
      return;
    }
    
    try {
      // Decide which agents to invite
      const agentsToInvite = await manager.decideAgentInvites(topic, 2);
      
      if (agentsToInvite.length === 0) {
        this.logger.debug(`TelegramMultiAgentPlugin: No agents to invite for topic ${topic}`);
        return;
      }
      
      this.logger.info(`TelegramMultiAgentPlugin: Inviting agents to group ${groupId}: ${agentsToInvite.join(', ')}`);
      
      // Send invitation messages one by one
      for (const agentId of agentsToInvite) {
        const invitationMessage = manager.generateInvitationMessage(agentId, topic);
        this.relay.sendMessage(groupId, invitationMessage);
        
        // Update conversation
        manager.updateWithMessage(invitationMessage, this.runtime.getAgentId(), topic);
      }
    } catch (error: any) {
      this.logger.error(`TelegramMultiAgentPlugin: Error inviting agents: ${error.message}`);
    }
  }
  
  /**
   * Get random conversation topics
   * 
   * @param count - Number of topics to generate
   * @returns Array of topic strings
   */
  private async getRandomTopics(count: number): Promise<string[]> {
    // In a real implementation, would use a more sophisticated topic generator
    // or retrieve from a database of trending topics
    const allTopics = [
      'cryptocurrency market trends',
      'NFT innovations',
      'DeFi protocols',
      'blockchain scalability',
      'crypto regulation',
      'web3 development',
      'tokenomics',
      'Bitcoin halving',
      'Ethereum updates',
      'layer 2 solutions',
      'DAO governance',
      'cross-chain interoperability',
      'crypto adoption',
      'metaverse projects',
      'privacy coins',
      'sustainable blockchain',
      'smart contract security',
      'decentralized identity',
      'blockchain gaming',
      'stablecoins'
    ];
    
    // Shuffle and pick
    const shuffled = [...allTopics].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }
  
  /**
   * Handle sent message event
   * 
   * @param message - Message that was sent
   */
  private handleMessageSent(message: any): void {
    if (!this.adapter) {
      return;
    }
    
    // Update agent activity
    this.adapter.updateAgentActivity(message.groupId, message.text);
    
    // Trigger a conversation check
    this.checkConversations();
  }
  
  /**
   * Handle failed message event
   * 
   * @param data - Failed message data
   */
  private handleMessageFailed(data: any): void {
    this.logger.error(`TelegramMultiAgentPlugin: Message failed: ${data.error}`);
  }
  
  /**
   * Handle relay connected event
   * 
   * @param data - Connection data
   */
  private handleRelayConnected(data: any): void {
    this.logger.info(`TelegramMultiAgentPlugin: Connected to relay server as ${data.agentId}`);
  }
  
  /**
   * Handle relay disconnected event
   */
  private handleRelayDisconnected(): void {
    this.logger.warn('TelegramMultiAgentPlugin: Disconnected from relay server');
  }
  
  /**
   * Shutdown the plugin
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    
    this.logger.info('TelegramMultiAgentPlugin: Shutting down');
    
    // Stop conversation management
    this.isRunning = false;
    
    // End all active conversations
    for (const groupId of Object.keys(this.conversationManager).map(Number)) {
      const manager = this.conversationManager[groupId];
      if (manager.getConversationState() !== 'inactive') {
        manager.endConversation(true);
      }
    }
    
    // Disconnect from relay
    if (this.relay) {
      await this.relay.disconnect();
    }
    
    this.initialized = false;
    this.logger.info('TelegramMultiAgentPlugin: Shutdown complete');
  }
}

/**
 * Register the Telegram Multi-Agent plugin with ElizaOS
 * 
 * @param runtime - ElizaOS runtime
 * @param options - Plugin options
 */
export function registerPlugin(
  runtime: Runtime,
  options: TelegramMultiAgentPluginConfig
): void {
  const logger = runtime.getService('logger') as ElizaLogger;
  const plugin = new TelegramMultiAgentPlugin(options, runtime, logger);
  runtime.registerPlugin('telegram-multiagent', plugin);
} 