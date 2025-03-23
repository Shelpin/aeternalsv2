/// <reference types="node" />

import { 
  IAgentRuntime, 
  ElizaLogger, 
  KickstarterConfig,
  Topic
} from './types.js';
import { ConversationManager } from './ConversationManager.js';
import { TelegramRelay } from './TelegramRelay.js';
import { PluginComponent } from './PluginComponent.js';

/**
 * ConversationKickstarter initiates conversations between agents in Telegram groups
 */
export class ConversationKickstarter extends PluginComponent {
  private config: KickstarterConfig;
  private conversationManager: ConversationManager;
  private relay: TelegramRelay;
  private knownAgents: string[] = [];
  private availableTopics: Map<string, Topic[]> = new Map();
  private lastKickstartTime: Map<string, number> = new Map();
  private nextScheduledKickstart: ReturnType<typeof setTimeout> | null = null;
  private isActive: boolean = false;
  private groupId: string;
  private agentId: string;
  private personality: any;
  
  /**
   * Create a new ConversationKickstarter
   * 
   * @param logger - Logger instance
   * @param conversationManager - Conversation manager
   * @param relay - Telegram relay
   * @param config - Kickstarter configuration
   * @param groupId - Group ID this kickstarter is for
   * @param personality - Personality enhancer for messages
   */
  constructor(
    logger: ElizaLogger,
    conversationManager: ConversationManager,
    relay: TelegramRelay,
    config: KickstarterConfig,
    groupId: string,
    personality: any
  ) {
    super(logger);
    
    this.conversationManager = conversationManager;
    this.relay = relay;
    this.config = {
      probabilityFactor: 0.2,
      minIntervalMs: 300000, // 5 minutes
      includeTopics: true,
      shouldTagAgents: true,
      maxAgentsToTag: 2,
      ...config
    };
    this.groupId = groupId;
    this.personality = personality;
    
    // Get agent ID from environment variable for now, will be replaced by runtime
    this.agentId = process.env.AGENT_ID || 'unknown-agent';
    
    this.logger.info(`ConversationKickstarter: Initialized for group ${groupId}`);
  }
  
  /**
   * Initialize the kickstarter
   */
  async initialize(): Promise<void> {
    this.logger.info(`ConversationKickstarter: Initializing for group ${this.groupId}`);
    
    try {
      // Try to get runtime for agent ID if available
      const runtime = await this.waitForRuntime();
      this.agentId = runtime.getAgentId();
      this.logger.info(`ConversationKickstarter: Using agent ID from runtime: ${this.agentId}`);
    } catch (error) {
      // Fallback to environment variable
      this.agentId = process.env.AGENT_ID || 'unknown-agent';
      this.logger.warn(`ConversationKickstarter: Could not get agent ID from runtime, using fallback: ${this.agentId}`);
    }
  }
  
  /**
   * Update the list of known agents
   * 
   * @param agents - List of agent IDs
   */
  updateKnownAgents(agents: string[]): void {
    // Filter out this agent and any invalid IDs
    this.knownAgents = agents.filter(id => id && id !== this.agentId);
    this.logger.debug(`ConversationKickstarter: Updated known agents, ${this.knownAgents.length} available`);
  }
  
  /**
   * Update available topics for a group
   * 
   * @param topics - Available topics
   */
  updateAvailableTopics(topics: Topic[]): void {
    this.availableTopics.set(this.groupId, topics);
    this.logger.debug(`ConversationKickstarter: Updated available topics (${topics.length})`);
  }
  
  /**
   * Update kickstarter configuration
   * 
   * @param config - New configuration
   */
  updateConfig(config: Partial<KickstarterConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
    
    this.logger.info('ConversationKickstarter: Configuration updated');
  }
  
  /**
   * Start the kickstarter
   */
  start(): void {
    if (this.isActive) {
      this.logger.debug('ConversationKickstarter: Already active');
      return;
    }
    
    this.isActive = true;
    this.scheduleNextKickstart();
    this.logger.info('ConversationKickstarter: Started');
  }
  
  /**
   * Stop the kickstarter
   */
  stop(): void {
    if (!this.isActive) {
      this.logger.debug('ConversationKickstarter: Already stopped');
      return;
    }
    
    if (this.nextScheduledKickstart) {
      clearTimeout(this.nextScheduledKickstart);
      this.nextScheduledKickstart = null;
    }
    
    this.isActive = false;
    this.logger.info('ConversationKickstarter: Stopped');
  }
  
  /**
   * Schedule the next kickstart attempt
   */
  private scheduleNextKickstart(): void {
    if (!this.isActive) {
      return;
    }
    
    // Clear any existing timeout
    if (this.nextScheduledKickstart) {
      clearTimeout(this.nextScheduledKickstart);
    }
    
    // Calculate delay - random between 10-20 minutes
    const minDelay = 10 * 60 * 1000; // 10 minutes
    const maxDelay = 20 * 60 * 1000; // 20 minutes
    const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;
    
    this.logger.debug(`ConversationKickstarter: Scheduling next kickstart attempt in ${delay / 1000} seconds`);
    
    // Schedule next kickstart
    this.nextScheduledKickstart = setTimeout(() => {
      this.attemptKickstart().catch(error => {
        this.logger.error(`ConversationKickstarter: Error in kickstart attempt: ${error}`);
      });
    }, delay);
  }
  
  /**
   * Attempt to kickstart a conversation
   */
  async attemptKickstart(): Promise<void> {
    try {
      if (!this.isActive) {
        this.logger.debug('ConversationKickstarter: Not active, skipping kickstart');
        return;
      }
      
      this.logger.info(`[KICKSTART] Attempting to kickstart conversation in group ${this.groupId}`);
      
      // Check if it's a good time to kickstart
      const canKickstart = await this.conversationManager.canKickstartConversation(
        this.groupId,
        this.config.minIntervalMs || 300000
      );
      
      if (!canKickstart) {
        this.logger.debug('ConversationKickstarter: Not a good time to kickstart, conversation too recent');
        this.scheduleNextKickstart();
        return;
      }
      
      // Check the last kickstart time for this group
      const lastKickstart = this.lastKickstartTime.get(this.groupId) || 0;
      const timeSinceLastKickstart = Date.now() - lastKickstart;
      
      if (timeSinceLastKickstart < this.config.minIntervalMs) {
        this.logger.debug(`ConversationKickstarter: Last kickstart was too recent (${timeSinceLastKickstart}ms ago)`);
        this.scheduleNextKickstart();
        return;
      }
      
      // Check if we have any agents to tag
      if (this.knownAgents.length === 0) {
        this.logger.debug('ConversationKickstarter: No known agents to tag, skipping kickstart');
        this.scheduleNextKickstart();
        return;
      }
      
      // Check if we should kickstart based on probability
      const shouldKickstart = Math.random() < (this.config.probabilityFactor || 0.2);
      
      if (!shouldKickstart) {
        this.logger.debug('ConversationKickstarter: Random probability check failed, skipping kickstart');
        this.scheduleNextKickstart();
        return;
      }
      
      // Generate kickstart message
      const message = await this.generateKickstartMessage();
      
      if (!message) {
        this.logger.debug('ConversationKickstarter: Failed to generate kickstart message');
        this.scheduleNextKickstart();
        return;
      }
      
      // Update last kickstart time
      this.lastKickstartTime.set(this.groupId, Date.now());
      
      // Send the message
      await this.relay.sendMessage(this.groupId, message);
      this.logger.info(`[KICKSTART] Successfully kickstarted conversation in group ${this.groupId}`);
      
      // Record the message
      await this.conversationManager.recordMessage(
        this.groupId,
        this.agentId,
        message
      );
      
      // Schedule next kickstart
      this.scheduleNextKickstart();
    } catch (error) {
      this.logger.error(`ConversationKickstarter: Kickstart attempt failed: ${error}`);
      this.scheduleNextKickstart();
    }
  }
  
  /**
   * Generate a kickstart message
   * 
   * @returns The generated message
   */
  private async generateKickstartMessage(): Promise<string | null> {
    try {
      // Get a random topic
      const topic = await this.getRandomTopic();
      
      // Use the runtime for character-driven topic generation if available
      try {
        const runtime = await this.waitForRuntime();
        
        // Get agent's character traits
        const { character } = runtime;
        
        if (character) {
          // Use character to influence topic
          const traits = character.traits || [];
          const style = character.style || {};
          
          this.logger.debug(`ConversationKickstarter: Using character traits for kickstart: ${traits.join(', ')}`);
          
          // Enhance the topic with character-appropriate phrasing
          if (this.personality && this.personality.refineTopic) {
            return this.personality.refineTopic(topic);
          }
        }
      } catch (error) {
        // Continue with fallback if runtime is not available
        this.logger.debug(`ConversationKickstarter: Not using character for kickstart: ${error.message}`);
      }
      
      // Get agents to tag
      const agentsToTag = this.getAgentsToTag();
      const tagString = agentsToTag.length > 0 
        ? agentsToTag.map(agent => `@${agent}`).join(' ') + ' '
        : '';
      
      // Create the message
      let message = `${tagString}${topic}`;
      
      return message;
    } catch (error) {
      this.logger.error(`ConversationKickstarter: Failed to generate kickstart message: ${error}`);
      return null;
    }
  }
  
  /**
   * Get a random topic
   * 
   * @returns A random topic
   */
  private async getRandomTopic(): Promise<string> {
    // First try to get a topic from personality if available
    if (this.personality && this.personality.generateTopic) {
      try {
        const topic = this.personality.generateTopic();
        if (topic) {
          return topic;
        }
      } catch (error) {
        this.logger.debug(`ConversationKickstarter: Error generating topic from personality: ${error}`);
      }
    }
    
    // Then try to get a topic from character if available
    try {
      const runtime = await this.waitForRuntime();
      
      if (runtime.character && runtime.character.topics && runtime.character.topics.length > 0) {
        const { topics } = runtime.character;
        const randomIndex = Math.floor(Math.random() * topics.length);
        return topics[randomIndex];
      }
    } catch (error) {
      this.logger.debug(`ConversationKickstarter: Not using character topics: ${error.message}`);
    }
    
    // Then try to use available topics
    const topics = this.availableTopics.get(this.groupId) || [];
    
    if (topics.length > 0) {
      const randomIndex = Math.floor(Math.random() * topics.length);
      return topics[randomIndex].title;
    }
    
    // Fallback topics
    const fallbackTopics = [
      "What's your take on the current state of crypto?",
      "Have you heard about the latest advances in AI?",
      "Is DeFi still relevant or has it been overhyped?",
      "What blockchain projects are you excited about?",
      "What are your thoughts on Layer 2 solutions?",
      "Will NFTs ever make a comeback?",
      "How does the recent price action affect your strategies?",
      "What's the most undervalued project right now?"
    ];
    
    const randomIndex = Math.floor(Math.random() * fallbackTopics.length);
    return fallbackTopics[randomIndex];
  }
  
  /**
   * Get a list of agents to tag
   * 
   * @returns List of agent IDs
   */
  private getAgentsToTag(): string[] {
    if (!this.config.shouldTagAgents || this.knownAgents.length === 0) {
      return [];
    }
    
    // Shuffle the known agents
    const shuffled = [...this.knownAgents].sort(() => 0.5 - Math.random());
    
    // Take the first N agents based on maxAgentsToTag config
    const maxAgents = Math.min(shuffled.length, this.config.maxAgentsToTag || 2);
    return shuffled.slice(0, maxAgents);
  }
  
  /**
   * Shutdown the kickstarter
   */
  async shutdown(): Promise<void> {
    this.logger.info('ConversationKickstarter: Shutting down');
    this.stop();
  }
} 