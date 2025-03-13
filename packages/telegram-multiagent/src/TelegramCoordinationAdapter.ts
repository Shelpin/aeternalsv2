import { IAgentRuntime, ElizaLogger } from './types';
import { PersonalityEnhancer } from './PersonalityEnhancer';

/**
 * Conversation status enum
 */
export enum ConversationStatus {
  ACTIVE = 'active',
  ENDED = 'ended',
  SCHEDULED = 'scheduled'
}

/**
 * Conversation participant type
 */
export interface ConversationParticipant {
  agentId: string;
  joinedAt: number;
  leftAt?: number;
  messageCount: number;
  lastActive: number;
}

/**
 * Conversation data structure
 */
export interface Conversation {
  id: string;
  groupId: string;
  status: ConversationStatus;
  startedAt: number;
  endedAt?: number;
  initiatedBy: string;
  topic: string;
  messageCount: number;
  participants: ConversationParticipant[];
}

/**
 * Message data structure
 */
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  receiverId?: string;
  content: string;
  sentAt: number;
  isFollowUp: boolean;
  replyToId?: string;
}

/**
 * Topic data structure
 */
export interface Topic {
  id: string;
  name: string;
  keywords: string[];
  relevanceScore: number;
  lastDiscussed: number;
  agentInterest: Record<string, number>;
}

/**
 * Interface for agent availability and coordination
 */
interface AgentAvailability {
  agentId: string;
  available: boolean;
  lastActive: number;
  topics: string[];
}

/**
 * Conversation topic metadata
 */
interface TopicMetadata {
  topic: string;
  relevanceScores: Record<string, number>;
  lastDiscussed: number;
  messageCount: number;
}

/**
 * TelegramCoordinationAdapter manages multi-agent coordination in Telegram
 */
export class TelegramCoordinationAdapter {
  private agentId: string;
  private runtime: IAgentRuntime;
  private logger: ElizaLogger;
  private knownAgents: Record<string, AgentAvailability> = {};
  private recentTopics: TopicMetadata[] = [];
  private personalityEnhancer?: PersonalityEnhancer;
  private maxTopicsToTrack = 20;
  private availabilityCutoffMs = 10 * 60 * 1000; // 10 minutes
  private lastBroadcastTime = 0;
  private readonly broadcastIntervalMs = 60000; // Every minute
  
  /**
   * Create a new TelegramCoordinationAdapter
   * 
   * @param agentId - ID of the agent
   * @param runtime - ElizaOS runtime
   * @param logger - Logger instance
   */
  constructor(agentId: string, runtime: IAgentRuntime, logger: ElizaLogger) {
    this.agentId = agentId;
    this.runtime = runtime;
    this.logger = logger;
    
    // Initialize availability
    this.knownAgents[agentId] = {
      agentId,
      available: true,
      lastActive: Date.now(),
      topics: []
    };
    
    this.logger.info(`TelegramCoordinationAdapter: Initialized for agent ${agentId}`);
    
    // First availability broadcast
    this.broadcastAvailability();
  }
  
  /**
   * Initialize the adapter and database
   */
  public async initialize(): Promise<void> {
    // This method is now empty as the database is no longer used
  }
  
  /**
   * Create a new conversation
   * 
   * @param conversation - Conversation data
   * @returns The created conversation ID
   */
  public async createConversation(conversation: Omit<Conversation, 'participants'>): Promise<string> {
    // This method is now empty as the database is no longer used
    return conversation.id;
  }
  
  /**
   * Add a participant to a conversation
   * 
   * @param conversationId - Conversation ID
   * @param participant - Participant data
   */
  public async addParticipant(conversationId: string, participant: ConversationParticipant): Promise<void> {
    // This method is now empty as the database is no longer used
  }
  
  /**
   * Update a participant's status
   * 
   * @param conversationId - Conversation ID
   * @param agentId - Agent ID
   * @param updates - Fields to update
   */
  public async updateParticipant(
    conversationId: string,
    agentId: string,
    updates: Partial<ConversationParticipant>
  ): Promise<void> {
    // This method is now empty as the database is no longer used
  }
  
  /**
   * Record a message in the database
   * 
   * @param message - Message data
   */
  public async recordMessage(message: Message): Promise<void> {
    // This method is now empty as the database is no longer used
  }
  
  /**
   * End a conversation
   * 
   * @param conversationId - Conversation ID
   * @param endedAt - Timestamp when the conversation ended
   */
  public async endConversation(conversationId: string, endedAt: number): Promise<void> {
    // This method is now empty as the database is no longer used
  }
  
  /**
   * Get a conversation by ID
   * 
   * @param conversationId - Conversation ID
   * @returns Conversation data with participants
   */
  public async getConversation(conversationId: string): Promise<Conversation | null> {
    // This method is now empty as the database is no longer used
    return null;
  }
  
  /**
   * Get active conversations for a group
   * 
   * @param groupId - Group ID
   * @returns Array of active conversations
   */
  public async getActiveConversations(groupId: string): Promise<Conversation[]> {
    // This method is now empty as the database is no longer used
    return [];
  }
  
  /**
   * Get recent messages from a conversation
   * 
   * @param conversationId - Conversation ID
   * @param limit - Maximum number of messages to retrieve
   * @returns Array of recent messages
   */
  public async getRecentMessages(conversationId: string, limit: number = 10): Promise<Message[]> {
    // This method is now empty as the database is no longer used
    return [];
  }
  
  /**
   * Add or update a topic
   * 
   * @param topic - Topic data
   */
  public async upsertTopic(topic: Topic): Promise<void> {
    // This method is now empty as the database is no longer used
  }
  
  /**
   * Get topics relevant to an agent
   * 
   * @param agentId - Agent ID
   * @param minInterest - Minimum interest score
   * @param limit - Maximum number of topics to retrieve
   * @returns Array of relevant topics
   */
  public async getRelevantTopics(
    agentId: string,
    minInterest: number = 0.5,
    limit: number = 10
  ): Promise<Topic[]> {
    // This method is now empty as the database is no longer used
    return [];
  }
  
  /**
   * Get agent participation statistics
   * 
   * @param agentId - Agent ID
   * @returns Agent participation statistics
   */
  public async getAgentStats(agentId: string): Promise<{
    totalConversations: number;
    totalMessages: number;
    averageMessagesPerConversation: number;
    topicInterests: Array<{topic: string, interestScore: number}>;
  }> {
    // This method is now empty as the database is no longer used
    return {
      totalConversations: 0,
      totalMessages: 0,
      averageMessagesPerConversation: 0,
      topicInterests: []
    };
  }
  
  /**
   * Close the database connection
   */
  public async close(): Promise<void> {
    // This method is now empty as the database is no longer used
  }
  
  /**
   * Set the personality enhancer
   * 
   * @param enhancer - PersonalityEnhancer instance
   */
  setPersonalityEnhancer(enhancer: PersonalityEnhancer): void {
    this.personalityEnhancer = enhancer;
  }
  
  /**
   * Update agent status after receiving or sending a message
   * 
   * @param groupId - Telegram group ID
   * @param topic - Message topic
   */
  updateAgentActivity(groupId: number, topic?: string): void {
    // Update last active time
    if (this.knownAgents[this.agentId]) {
      this.knownAgents[this.agentId].lastActive = Date.now();
      this.knownAgents[this.agentId].available = true;
    }
    
    // Track the topic if provided
    if (topic) {
      this.trackTopic(topic);
    }
    
    // Check if we should broadcast availability
    const currentTime = Date.now();
    if (currentTime - this.lastBroadcastTime > this.broadcastIntervalMs) {
      this.broadcastAvailability();
    }
  }
  
  /**
   * Mark that a particular topic was discussed
   * 
   * @param topic - The topic discussed
   */
  trackTopic(topic: string): void {
    // Look for existing topic entry
    const existingIndex = this.recentTopics.findIndex(t => 
      t.topic.toLowerCase() === topic.toLowerCase()
    );
    
    if (existingIndex >= 0) {
      // Update existing topic
      this.recentTopics[existingIndex].lastDiscussed = Date.now();
      this.recentTopics[existingIndex].messageCount++;
    } else {
      // Add new topic
      const relevanceScores: Record<string, number> = {};
      
      // Calculate relevance for known agents
      Object.keys(this.knownAgents).forEach(agentId => {
        if (this.agentId === agentId && this.personalityEnhancer) {
          // For our own agent, we can calculate precise relevance
          relevanceScores[agentId] = this.personalityEnhancer.calculateTopicRelevance(topic);
        } else {
          // For other agents, estimate based on their preferred topics
          const preferredTopics = this.knownAgents[agentId].topics || [];
          relevanceScores[agentId] = this.estimateTopicRelevanceFromList(topic, preferredTopics);
        }
      });
      
      // Add new topic entry
      this.recentTopics.push({
        topic,
        relevanceScores,
        lastDiscussed: Date.now(),
        messageCount: 1
      });
      
      // Trim the list if needed
      if (this.recentTopics.length > this.maxTopicsToTrack) {
        // Sort by recency (newest first) and remove oldest
        this.recentTopics.sort((a, b) => b.lastDiscussed - a.lastDiscussed);
        this.recentTopics = this.recentTopics.slice(0, this.maxTopicsToTrack);
      }
    }
  }
  
  /**
   * Estimate topic relevance based on a list of preferred topics
   * 
   * @param topic - Topic to evaluate
   * @param preferredTopics - List of preferred topics
   * @returns Relevance score between 0-1
   */
  private estimateTopicRelevanceFromList(topic: string, preferredTopics: string[]): number {
    if (!topic || preferredTopics.length === 0) {
      return 0.5; // Default to moderate relevance
    }
    
    const topicLower = topic.toLowerCase();
    let maxRelevance = 0.2; // Minimum relevance
    
    // Check for direct matches or partial matches
    for (const preferred of preferredTopics) {
      const preferredLower = preferred.toLowerCase();
      
      if (topicLower === preferredLower) {
        // Direct match
        return 1.0;
      } else if (topicLower.includes(preferredLower) || preferredLower.includes(topicLower)) {
        // One contains the other
        maxRelevance = Math.max(maxRelevance, 0.8);
      } else {
        // Check for word overlap
        const topicWords = topicLower.split(/\s+/);
        const preferredWords = preferredLower.split(/\s+/);
        
        for (const word of topicWords) {
          if (word.length > 3 && preferredWords.some(pw => pw.includes(word) || word.includes(pw))) {
            maxRelevance = Math.max(maxRelevance, 0.6);
          }
        }
      }
    }
    
    return maxRelevance;
  }
  
  /**
   * Get a list of available agents for a group
   * 
   * @param groupId - Telegram group ID
   * @param excludeAgentIds - Optional agent IDs to exclude
   * @returns Array of available agent IDs
   */
  async getAvailableAgents(groupId: number, excludeAgentIds: string[] = []): Promise<string[]> {
    // Remove stale data first
    this.pruneStaleAvailability();
    
    // In a real implementation, would query the coordination service
    // For now, just use the local cache
    return Object.values(this.knownAgents)
      .filter(agent => 
        agent.available && 
        !excludeAgentIds.includes(agent.agentId)
      )
      .map(agent => agent.agentId);
  }
  
  /**
   * Estimate how relevant a topic is to an agent
   * 
   * @param agentId - Agent ID
   * @param topic - Topic to evaluate
   * @returns Relevance score between 0-1
   */
  async estimateTopicRelevance(agentId: string, topic: string): Promise<number> {
    // Check for cached relevance scores first
    const existingTopic = this.recentTopics.find(t => 
      t.topic.toLowerCase() === topic.toLowerCase()
    );
    
    if (existingTopic && existingTopic.relevanceScores[agentId] !== undefined) {
      return existingTopic.relevanceScores[agentId];
    }
    
    // For our own agent, use the personality enhancer
    if (agentId === this.agentId && this.personalityEnhancer) {
      return this.personalityEnhancer.calculateTopicRelevance(topic);
    }
    
    // For other agents, estimate based on their preferred topics
    const agent = this.knownAgents[agentId];
    if (agent && agent.topics) {
      return this.estimateTopicRelevanceFromList(topic, agent.topics);
    }
    
    // Default moderate relevance if we don't know
    return 0.5;
  }
  
  /**
   * Register a new agent in the coordination system
   * 
   * @param agentId - Agent ID
   * @param initialTopics - Initial topics of interest
   */
  registerAgent(agentId: string, initialTopics: string[] = []): void {
    this.knownAgents[agentId] = {
      agentId,
      available: true,
      lastActive: Date.now(),
      topics: initialTopics
    };
    
    this.logger.info(`TelegramCoordinationAdapter: Registered agent ${agentId}`);
  }
  
  /**
   * Mark an agent as unavailable
   * 
   * @param agentId - Agent ID
   */
  markAgentUnavailable(agentId: string): void {
    if (this.knownAgents[agentId]) {
      this.knownAgents[agentId].available = false;
      this.logger.debug(`TelegramCoordinationAdapter: Marked agent ${agentId} as unavailable`);
    }
  }
  
  /**
   * Check if an agent is available
   * 
   * @param agentId - Agent ID
   * @returns Whether the agent is available
   */
  isAgentAvailable(agentId: string): boolean {
    return !!(this.knownAgents[agentId]?.available);
  }
  
  /**
   * Broadcast agent availability to other agents
   */
  private async broadcastAvailability(): Promise<void> {
    try {
      // Update the broadcast time
      this.lastBroadcastTime = Date.now();
      
      // Get current availability
      const availability: AgentAvailability = {
        agentId: this.agentId,
        available: true,
        lastActive: Date.now(),
        topics: await this.getAgentPreferredTopics()
      };
      
      // Update local cache
      this.knownAgents[this.agentId] = availability;
      
      // In a real implementation, would publish this to a shared coordination service
      // For now we'll just log it
      this.logger.debug(`TelegramCoordinationAdapter: Broadcasting availability for ${this.agentId}`);
      
      // Update availability status locally - in a real system would sync with external service
      this.pruneStaleAvailability();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`TelegramCoordinationAdapter: Error broadcasting availability: ${errorMessage}`);
    }
  }
  
  /**
   * Remove stale availability data
   */
  private pruneStaleAvailability(): void {
    const now = Date.now();
    const cutoff = now - this.availabilityCutoffMs;
    
    // Remove agents that haven't been active recently
    Object.keys(this.knownAgents).forEach(agentId => {
      if (this.knownAgents[agentId].lastActive < cutoff) {
        // Mark as unavailable rather than removing
        this.knownAgents[agentId].available = false;
      }
    });
  }
  
  /**
   * Get agent's preferred topics based on personality
   * 
   * @returns Array of preferred topics
   */
  private async getAgentPreferredTopics(): Promise<string[]> {
    try {
      // In a real implementation, would extract from agent's personality
      // and interests defined in character data
      
      // Mock implementation - in real system would be derived from agent's character
      const character = this.runtime.getCharacter();
      if (character && character.topics) {
        return character.topics.slice(0, 5); // Take up to 5 topics
      }
      
      // Fallback topics based on agent ID
      const fallbackTopics: Record<string, string[]> = {
        'eth_memelord_9000': ['ethereum', 'defi', 'nfts', 'layer2', 'memes'],
        'bitcoin_maxi_420': ['bitcoin', 'lightning', 'sovereignty', 'inflation', 'energy'],
        'linda_evangelista_88': ['community', 'governance', 'adoption', 'education', 'decentralization'],
        'vc_shark_99': ['investments', 'startups', 'valuations', 'exits', 'market fit'],
        'bag_flipper_9000': ['trading', 'altcoins', 'price action', 'market cycles', 'charts'],
        'code_samurai_77': ['development', 'smart contracts', 'security', 'protocols', 'architecture']
      };
      
      return fallbackTopics[this.agentId] || ['cryptocurrency', 'blockchain', 'technology'];
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`TelegramCoordinationAdapter: Error getting preferred topics: ${errorMessage}`);
      return ['cryptocurrency', 'blockchain', 'technology'];
    }
  }
} 