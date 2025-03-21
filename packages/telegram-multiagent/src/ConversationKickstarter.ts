/// <reference types="node" />

import { ElizaLogger, IAgentRuntime } from './types';
import { TelegramCoordinationAdapter, ConversationStatus, Topic } from './TelegramCoordinationAdapter';
import { TelegramRelay } from './TelegramRelay';
import { PersonalityEnhancer } from './PersonalityEnhancer';
import { ConversationManager } from './ConversationManager';
import { v4 as uuidv4 } from 'uuid';

/**
 * Kickstarter configuration
 */
export interface KickstarterConfig {
  // Minimum interval between kickstarting conversations (in ms)
  minInterval: number;
  
  // Maximum interval between kickstarting conversations (in ms)
  maxInterval: number;
  
  // Probability factor (0-1) that affects how likely a kickstart is to happen
  probabilityFactor: number;
  
  // Maximum number of active conversations per group
  maxActiveConversationsPerGroup: number;
  
  // Whether to tag specific agents in kickstarted conversations
  shouldTagAgents: boolean;
  
  // Maximum number of agents to tag in a kickstarted conversation
  maxAgentsToTag: number;
  
  // Whether to persist conversation records to database
  persistConversations: boolean;
}

/**
 * Default kickstarter configuration
 */
const DEFAULT_KICKSTARTER_CONFIG: KickstarterConfig = {
  minInterval: 30 * 60 * 1000, // 30 minutes
  maxInterval: 4 * 60 * 60 * 1000, // 4 hours
  probabilityFactor: 0.7, // 70% chance when conditions are right
  maxActiveConversationsPerGroup: 2,
  shouldTagAgents: true,
  maxAgentsToTag: 2,
  persistConversations: true
};

/**
 * ConversationKickstarter is responsible for initiating conversations
 * in Telegram groups to create a more engaging, human-like experience.
 * It considers agent personalities, group context, and optimal timing to
 * start natural-feeling conversations.
 */
export class ConversationKickstarter {
  private adapter: TelegramCoordinationAdapter;
  private relay: TelegramRelay;
  private personality: PersonalityEnhancer;
  private agentId: string;
  private groupId: string;
  private logger: ElizaLogger;
  private runtime: IAgentRuntime;
  private conversationManager: ConversationManager;
  private config: KickstarterConfig;
  private lastKickstartTime: number = 0;
  private nextScheduledKickstart: NodeJS.Timeout | null = null;
  private isActive: boolean = false;
  private availableTopics: Topic[] = [];
  private knownAgents: Set<string> = new Set();
  
  /**
   * Create a new ConversationKickstarter
   * 
   * @param adapter - Telegram coordination adapter
   * @param relay - Telegram relay service
   * @param personality - Personality enhancer
   * @param conversationManager - Conversation manager
   * @param agentId - ID of the agent
   * @param groupId - Telegram group ID
   * @param runtime - ElizaOS runtime
   * @param logger - Logger instance
   * @param config - Optional kickstarter configuration
   */
  constructor(
    adapter: TelegramCoordinationAdapter,
    relay: TelegramRelay,
    personality: PersonalityEnhancer,
    conversationManager: ConversationManager,
    agentId: string,
    groupId: string,
    runtime: IAgentRuntime,
    logger: ElizaLogger,
    config?: Partial<KickstarterConfig>
  ) {
    this.adapter = adapter;
    this.relay = relay;
    this.personality = personality;
    this.conversationManager = conversationManager;
    this.agentId = agentId;
    this.groupId = groupId;
    this.runtime = runtime;
    this.logger = logger;
    this.config = { ...DEFAULT_KICKSTARTER_CONFIG, ...config };
    
    this.logger.info(`ConversationKickstarter: Initialized for agent ${agentId} in group ${groupId}`);
  }
  
  /**
   * Start the kickstarter service
   */
  start(): void {
    if (this.isActive) {
      this.logger.warn('ConversationKickstarter: Already active');
      return;
    }
    
    this.isActive = true;
    this.scheduleNextKickstart();
    this.logger.info('ConversationKickstarter: Started');
  }
  
  /**
   * Stop the kickstarter service
   */
  stop(): void {
    if (!this.isActive) {
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
   * Update available topics
   * 
   * @param topics - Array of available topics
   */
  updateAvailableTopics(topics: Topic[]): void {
    this.availableTopics = [...topics];
    this.logger.debug(`ConversationKickstarter: Updated available topics (${topics.length})`);
  }
  
  /**
   * Update known agents
   * 
   * @param agentIds - Array of agent IDs
   */
  updateKnownAgents(agentIds: string[]): void {
    // Filter out our own agent ID and any empty strings
    const filteredAgentIds = agentIds.filter(id => id && id !== this.agentId);
    
    // Update the set of known agents
    this.knownAgents = new Set(filteredAgentIds);
    
    // More detailed logging for debugging
    this.logger.debug(`ConversationKickstarter: Updated known agents (${filteredAgentIds.length})`);
    
    if (filteredAgentIds.length > 0) {
      this.logger.debug(`ConversationKickstarter: Known agents list: ${Array.from(this.knownAgents).join(', ')}`);
    } else {
      this.logger.warn(`ConversationKickstarter: No other agents detected! This will prevent multi-agent conversations.`);
    }
  }
  
  /**
   * Schedule the next conversation kickstart
   */
  private scheduleNextKickstart(): void {
    if (!this.isActive) {
      return;
    }
    
    // Clear any existing scheduled kickstart
    if (this.nextScheduledKickstart) {
      clearTimeout(this.nextScheduledKickstart);
    }
    
    // Calculate delay until next kickstart attempt
    const currentTime = Date.now();
    const timeSinceLastKickstart = currentTime - this.lastKickstartTime;
    
    // Ensure minimum interval has passed
    let delay: number;
    if (timeSinceLastKickstart < this.config.minInterval) {
      delay = this.config.minInterval - timeSinceLastKickstart;
    } else {
      // Random delay between min and max interval
      delay = Math.floor(
        Math.random() * (this.config.maxInterval - this.config.minInterval) + this.config.minInterval
      );
    }
    
    // Schedule next kickstart
    this.nextScheduledKickstart = setTimeout(() => this.attemptKickstart(), delay) as unknown as NodeJS.Timeout;
    
    const nextAttemptTime = new Date(currentTime + delay);
    this.logger.debug(`ConversationKickstarter: Next kickstart attempt scheduled for ${nextAttemptTime.toISOString()}`);
  }
  
  /**
   * Attempt to kickstart a conversation
   */
  async attemptKickstart(): Promise<void> {
    try {
      this.lastKickstartTime = Date.now();
      
      // Check if we should kickstart based on probability
      if (Math.random() > this.config.probabilityFactor) {
        this.logger.debug('ConversationKickstarter: Skipping kickstart (probability check)');
        this.scheduleNextKickstart();
        return;
      }
      
      // Check current active conversations
      const activeConversations = await this.adapter.getActiveConversations(this.groupId);
      if (activeConversations.length >= this.config.maxActiveConversationsPerGroup) {
        this.logger.debug('ConversationKickstarter: Skipping kickstart (max active conversations reached)');
        this.scheduleNextKickstart();
        return;
      }
      
      // Select a topic
      const topic = this.selectTopic();
      if (!topic) {
        this.logger.debug('ConversationKickstarter: Skipping kickstart (no suitable topic)');
        this.scheduleNextKickstart();
        return;
      }
      
      // Kickstart the conversation
      await this.kickstartConversation(topic);
      
      // Schedule next kickstart
      this.scheduleNextKickstart();
    } catch (error) {
      this.logger.error(`ConversationKickstarter: Error during kickstart attempt: ${error}`);
      this.scheduleNextKickstart();
    }
  }
  
  /**
   * Select a topic for conversation
   * 
   * @returns Selected topic or null if none suitable
   */
  private selectTopic(): Topic | null {
    // First try to find a suitable topic from available topics
    if (this.availableTopics.length > 0) {
      // Sort topics by relevance to agent's interests
      const sortedTopics = [...this.availableTopics].sort((a, b) => {
        const relevanceA = a.agentInterest[this.agentId] || 0;
        const relevanceB = b.agentInterest[this.agentId] || 0;
        return relevanceB - relevanceA; // Descending order
      });
      
      // Add some randomness to topic selection (don't always pick the most relevant)
      const topIndex = Math.min(3, sortedTopics.length - 1);
      const selectedIndex = Math.floor(Math.random() * (topIndex + 1));
      
      // Use one of the top relevant topics
      return sortedTopics[selectedIndex];
    }
    
    // If no topics available, generate a new one based on personality
    return {
      id: uuidv4(),
      name: this.personality.generateTopic(),
      keywords: [],
      lastDiscussed: 0,
      agentInterest: { [this.agentId]: 0.8 }, // High interest since it's self-generated
      groupId: this.groupId,
      title: this.personality.generateTopic()
    };
  }
  
  /**
   * Kickstart a conversation with a selected topic
   * 
   * @param topic - Topic to discuss
   */
  private async kickstartConversation(topic: Topic): Promise<void> {
    try {
      // Create the topic title/name with personality
      const topicTitle = topic.title || topic.name;
      const enhancedTopic = this.personality.refineTopic(topicTitle);
      
      // Create conversation record if persisting is enabled
      let conversationId: string;
      if (this.config.persistConversations) {
        conversationId = await this.adapter.createConversation({
          id: uuidv4(),
          groupId: this.groupId,
          status: ConversationStatus.ACTIVE,
          startedAt: Date.now(),
          initiatedBy: this.agentId,
          topic: enhancedTopic,
          messageCount: 0
        });
      } else {
        conversationId = uuidv4();
      }
      
      // Select agents to tag if enabled
      const agentsToTag: string[] = [];
      if (this.config.shouldTagAgents && this.knownAgents.size > 0) {
        const availableAgents = [...this.knownAgents].filter(id => id !== this.agentId);
        
        // Determine how many agents to tag (randomized but limited by config)
        const maxToTag = Math.min(this.config.maxAgentsToTag, availableAgents.length);
        const numToTag = Math.floor(Math.random() * (maxToTag + 1)); // 0 to maxToTag
        
        // Randomly select agents
        for (let i = 0; i < numToTag && availableAgents.length > 0; i++) {
          const randomIndex = Math.floor(Math.random() * availableAgents.length);
          agentsToTag.push(availableAgents[randomIndex]);
          availableAgents.splice(randomIndex, 1);
        }
      }
      
      // Create opening message
      let openingMessage = this.createOpeningMessage(enhancedTopic, agentsToTag);
      
      // Apply personality to the message
      openingMessage = this.personality.enhanceMessage(openingMessage);
      
      // Log kickstarted conversation
      this.logger.info(`ConversationKickstarter: Starting conversation ${conversationId} on topic '${enhancedTopic}'`);
      
      // Send the message to the group
      const numericGroupId = parseInt(this.groupId);
      if (!isNaN(numericGroupId)) {
        this.relay.sendMessage(numericGroupId, openingMessage);
      } else {
        this.logger.error(`ConversationKickstarter: Invalid group ID format: ${this.groupId}`);
      }
      
      // Update conversation state
      this.conversationManager.initiateConversation(enhancedTopic);
      
      // Record the message
      if (this.config.persistConversations) {
        await this.adapter.recordMessage({
          id: uuidv4(),
          conversationId,
          senderId: this.agentId,
          content: openingMessage,
          sentAt: Date.now(),
          isFollowUp: false
        });
        
        // For each tagged agent, add them as participants
        for (const agentId of agentsToTag) {
          await this.adapter.addParticipant(conversationId, {
            agentId,
            joinedAt: Date.now(),
            messageCount: 0,
            lastActive: Date.now()
          });
        }
        
        // Add self as participant
        await this.adapter.addParticipant(conversationId, {
          agentId: this.agentId,
          joinedAt: Date.now(),
          messageCount: 1, // Already sent the opening message
          lastActive: Date.now()
        });
      }
    } catch (error) {
      this.logger.error(`ConversationKickstarter: Failed to kickstart conversation: ${error}`);
    }
  }
  
  /**
   * Create an opening message for a conversation
   * 
   * @param topic - Topic to discuss
   * @param agentsToTag - Array of agent IDs to tag
   * @returns Opening message text
   */
  private createOpeningMessage(topic: string, agentsToTag: string[]): string {
    // Different opening templates
    const openingTemplates = [
      `I've been thinking about {{topic}} lately. {{tags}} What do you all think?`,
      `Has anyone here considered {{topic}}? {{tags}} I'm curious about your thoughts.`,
      `I'd like to discuss {{topic}}. {{tags}} Any insights on this?`,
      `{{topic}} is something I find fascinating. {{tags}} Do you agree?`,
      `Let's talk about {{topic}}. {{tags}} What's your perspective?`
    ];
    
    // Select random template
    const template = openingTemplates[Math.floor(Math.random() * openingTemplates.length)];
    
    // Create tags section if agents to tag
    let tagsText = '';
    if (agentsToTag.length > 0) {
      tagsText = agentsToTag.map(id => `@${id}`).join(' ');
    }
    
    // Fill in template
    return template
      .replace('{{topic}}', topic)
      .replace('{{tags}}', tagsText);
  }
  
  /**
   * Force an immediate kickstart (for testing or admin commands)
   * 
   * @param topic - Optional specific topic to discuss
   */
  async forceKickstart(topic?: string): Promise<void> {
    try {
      this.lastKickstartTime = Date.now();
      
      // Use provided topic or select one
      let selectedTopic: Topic;
      if (topic) {
        selectedTopic = {
          id: uuidv4(),
          name: topic,
          keywords: [],
          lastDiscussed: 0,
          agentInterest: { [this.agentId]: 1.0 }, // Max interest since it's explicitly provided
          groupId: this.groupId,
          title: topic
        };
      } else {
        const autoSelectedTopic = this.selectTopic();
        if (!autoSelectedTopic) {
          this.logger.error('ConversationKickstarter: Cannot force kickstart, no topic available');
          return;
        }
        selectedTopic = autoSelectedTopic;
      }
      
      await this.kickstartConversation(selectedTopic);
      this.logger.info(`ConversationKickstarter: Forced kickstart with topic '${selectedTopic.title || selectedTopic.name}'`);
    } catch (error) {
      this.logger.error(`ConversationKickstarter: Error during forced kickstart: ${error}`);
    }
  }
} 