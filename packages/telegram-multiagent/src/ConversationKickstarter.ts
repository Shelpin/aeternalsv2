/// <reference types="node" />

import { 
  IAgentRuntime, 
  ElizaLogger, 
  KickstarterConfig,
  Topic
} from './types';
import { ConversationManager } from './ConversationManager';
import { TelegramRelay } from './TelegramRelay';

/**
 * ConversationKickstarter initiates conversations between agents in Telegram groups
 */
export class ConversationKickstarter {
  private runtime: IAgentRuntime;
  private logger: ElizaLogger;
  private conversationManager: ConversationManager;
  private relay: TelegramRelay;
  private config: KickstarterConfig;
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
   * @param runtime - Agent runtime
   * @param logger - Logger instance
   * @param conversationManager - Conversation manager
   * @param relay - Telegram relay
   * @param config - Kickstarter configuration
   * @param groupId - Group ID this kickstarter is for
   */
  constructor(
    runtime: IAgentRuntime,
    logger: ElizaLogger,
    conversationManager: ConversationManager,
    relay: TelegramRelay,
    config: KickstarterConfig,
    groupId: string,
    personality: any
  ) {
    this.runtime = runtime;
    this.logger = logger;
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
    this.agentId = runtime.getAgentId();
    this.personality = personality;
    
    this.logger.info('ConversationKickstarter: Initialized');
  }
  
  /**
   * Update the list of known agents
   * 
   * @param agents - List of agent IDs
   */
  updateKnownAgents(agents: string[]): void {
    // Filter out this agent and any invalid IDs
    this.knownAgents = agents.filter(id => 
      id && id !== this.runtime.getAgentId()
    );
    
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
    
    // Clear any existing scheduled kickstart
    if (this.nextScheduledKickstart) {
      clearTimeout(this.nextScheduledKickstart);
      this.nextScheduledKickstart = null;
    }
    
    // Calculate delay until next kickstart attempt
    const currentTime = Date.now();
    const timeSinceLastKickstart = currentTime - (this.lastKickstartTime.get(this.groupId) || 0);
    
    // Ensure minimum interval has passed
    let delay = this.config.minIntervalMs;
    if (timeSinceLastKickstart < this.config.minIntervalMs) {
      delay = this.config.minIntervalMs - timeSinceLastKickstart;
    }
    
    // Add some randomness to the delay (up to 30 minutes extra)
    const randomAdditionalDelay = Math.floor(Math.random() * (30 * 60 * 1000));
    delay += randomAdditionalDelay;
    
    // Schedule the next kickstart attempt
    this.nextScheduledKickstart = setTimeout(() => {
      this.attemptKickstart().finally(() => {
        this.scheduleNextKickstart();
      });
    }, delay);
    
    this.logger.debug(`ConversationKickstarter: Next kickstart attempt scheduled in ${Math.floor(delay / 1000 / 60)} minutes`);
  }
  
  /**
   * Attempt to kickstart a conversation
   */
  async attemptKickstart(): Promise<void> {
    try {
      this.lastKickstartTime.set(this.groupId, Date.now());
      
      // Check if we should kickstart based on probability
      if (Math.random() >= this.config.probabilityFactor) {
        this.logger.debug('ConversationKickstarter: Skipping kickstart (probability check)');
        return;
      }
      
      // Check if a conversation is already active
      const isActive = await this.conversationManager.isConversationActive(this.groupId);
      if (isActive) {
        this.logger.debug('ConversationKickstarter: Skipping kickstart (conversation already active)');
        return;
      }
      
      // Make sure there are other agents to talk to
      if (this.knownAgents.length === 0) {
        this.logger.debug('ConversationKickstarter: Skipping kickstart (no other agents)');
        return;
      }
      
      // Select a topic
      const topic = await this.selectTopic(this.groupId);
      if (!topic) {
        this.logger.debug('ConversationKickstarter: Skipping kickstart (no suitable topic)');
        return;
      }
      
      // Kickstart the conversation
      await this.kickstartConversation(topic);
      
      this.logger.info(`ConversationKickstarter: Successfully kickstarted conversation in group ${this.groupId}`);
    } catch (error) {
      this.logger.error(`ConversationKickstarter: Error during kickstart attempt: ${error}`);
    }
  }
  
  /**
   * Select a topic for conversation
   * 
   * @param groupId - Group ID
   * @returns Selected topic or null if none suitable
   */
  private async selectTopic(groupId: string): Promise<string | null> {
    try {
      // Check for cached topics for this group
      const groupTopics = this.availableTopics.get(groupId) || [];
      
      if (groupTopics.length > 0) {
        // Select a random topic
        const randomIndex = Math.floor(Math.random() * groupTopics.length);
        const selectedTopic = groupTopics[randomIndex];
        
        this.logger.debug(`ConversationKickstarter: Selected topic "${selectedTopic.name}" for group ${groupId}`);
        return selectedTopic.name;
      }
      
      // If no topics available, use a general topic
      const generalTopics = [
        "the latest trends in blockchain technology",
        "decentralized finance innovations",
        "NFT use cases beyond digital art",
        "how crypto is changing traditional finance",
        "web3 community building strategies",
        "blockchain scalability solutions",
        "cryptocurrency market trends",
        "decentralized social media platforms",
        "blockchain interoperability",
        "the future of DAOs"
      ];
      
      const randomIndex = Math.floor(Math.random() * generalTopics.length);
      const generalTopic = generalTopics[randomIndex];
      
      this.logger.debug(`ConversationKickstarter: Selected general topic "${generalTopic}" for group ${groupId}`);
      return generalTopic;
    } catch (error) {
      this.logger.error(`ConversationKickstarter: Error selecting topic: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Kickstart a conversation with a specific topic
   * 
   * @param topic - Topic to discuss
   */
  private async kickstartConversation(topic: string): Promise<void> {
    try {
      // Create the topic title/name with personality
      const topicTitle = topic;
      const enhancedTopic = this.personality ? this.personality.refineTopic(topicTitle) : topicTitle;
      
      // Check if we should persist this conversation
      const shouldPersist = false;
      
      // Select agents to tag if enabled
      const agentsToTag: string[] = [];
      if (this.config.shouldTagAgents && this.knownAgents.length > 0) {
        const availableAgents = [...this.knownAgents].filter(id => id !== this.agentId);
        
        // Randomly select up to maxAgentsToTag agents
        const shuffledAgents = availableAgents.sort(() => Math.random() - 0.5);
        const selectedCount = Math.min(this.config.maxAgentsToTag, shuffledAgents.length);
        
        for (let i = 0; i < selectedCount; i++) {
          agentsToTag.push(shuffledAgents[i]);
        }
      }
      
      // Generate the kickstart message
      const message = this.generateKickstartMessage(enhancedTopic, agentsToTag);
      
      // Send the message
      await this.relay.sendMessage(this.groupId, message);
      
      // Record this message in the conversation
      await this.conversationManager.recordMessage(
        this.groupId, 
        this.agentId, 
        message
      );
      
      this.logger.info(`ConversationKickstarter: Kickstarted conversation about "${enhancedTopic}" in group ${this.groupId}`);
    } catch (error) {
      this.logger.error(`ConversationKickstarter: Error kickstarting conversation: ${error}`);
    }
  }
  
  /**
   * Generate a kickstart message with optional agent tagging
   * 
   * @param topic - Topic for discussion
   * @param agentsToTag - Array of agent IDs to tag
   * @returns Generated message text
   */
  private generateKickstartMessage(topic: string, agentsToTag: string[] = []): string {
    // Different opening templates
    const openingTemplates = [
      `I've been thinking about ${topic} lately. {{tags}} What do you all think?`,
      `Has anyone here considered ${topic}? {{tags}} I'm curious about your thoughts.`,
      `I'd like to discuss ${topic}. {{tags}} Any insights on this?`,
      `${topic} is something I find fascinating. {{tags}} Do you agree?`,
      `Let's talk about ${topic}. {{tags}} What's your perspective?`
    ];
    
    // Select a random template
    const templateIndex = Math.floor(Math.random() * openingTemplates.length);
    const template = openingTemplates[templateIndex];
    
    // Add tags if there are agents to tag
    let tagsText = '';
    if (agentsToTag.length > 0) {
      tagsText = agentsToTag.map(id => `@${id}`).join(' ');
    }
    
    // Replace the tags placeholder
    let message = template.replace('{{tags}}', tagsText);
    
    // Clean up any double spaces that might have been created
    message = message.replace(/\s+/g, ' ').trim();
    
    return message;
  }
  
  /**
   * Force a kickstart (ignoring probability and timing checks)
   * 
   * @param topic - Optional specific topic to use
   */
  async forceKickstart(topic?: string): Promise<void> {
    try {
      this.lastKickstartTime.set(this.groupId, Date.now());
      
      // Use provided topic or select one
      let selectedTopic: string;
      if (topic) {
        selectedTopic = topic;
      } else {
        const autoSelectedTopic = await this.selectTopic(this.groupId);
        if (!autoSelectedTopic) {
          this.logger.error('ConversationKickstarter: Cannot force kickstart, no topic available');
          return;
        }
        selectedTopic = autoSelectedTopic;
      }
      
      await this.kickstartConversation(selectedTopic);
      this.logger.info(`ConversationKickstarter: Forced kickstart with topic '${selectedTopic}'`);
    } catch (error) {
      this.logger.error(`ConversationKickstarter: Error during forced kickstart: ${error}`);
    }
  }
} 