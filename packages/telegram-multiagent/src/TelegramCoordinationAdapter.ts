import { IAgentRuntime, ElizaLogger } from './types';
import { PersonalityEnhancer } from './PersonalityEnhancer';
import { SqliteDatabaseAdapter } from './SqliteAdapterProxy';
import { telegramMultiAgentSchema } from './schema';
import { v4 as uuidv4 } from 'uuid';

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
  id?: string;
  name: string;
  keywords: string[];
  lastDiscussed: number;
  agentInterest: Record<string, number>;
  
  // Additional fields for database storage
  groupId?: string;
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  scheduledFor?: number;
  initiatorId?: string;
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
  private db: SqliteDatabaseAdapter | null = null;
  
  /**
   * Create a new TelegramCoordinationAdapter
   * 
   * @param agentId - ID of the agent
   * @param runtime - ElizaOS runtime
   * @param logger - Logger instance
   * @param dbAdapter - Optional SQLite database adapter
   */
  constructor(
    agentId: string,
    runtime: IAgentRuntime,
    logger: ElizaLogger,
    dbAdapter?: SqliteDatabaseAdapter
  ) {
    this.agentId = agentId;
    this.runtime = runtime;
    this.logger = logger;
    this.db = dbAdapter || null;
    
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
   * Helper method to safely execute SQL queries
   * @param sql SQL query string with placeholders
   * @param params Parameters for the SQL query
   * @returns Query result
   */
  private execSQL<T>(sql: string, params: any[] = []): T | undefined {
    if (!this.db) return undefined;
    
    try {
      const stmt = (this.db as any).db.prepare(sql);
      // We'll use a typed function that accepts a spread of parameters
      // This avoids the "Expected 1 arguments, but got 2" error
      return stmt.get(...params) as T;
    } catch (error) {
      this.logger.error(`SQL Error: ${error.toString()}, SQL: ${sql}, Params: ${JSON.stringify(params)}`);
      return undefined;
    }
  }

  /**
   * Helper method to safely execute SQL queries that return multiple rows
   * @param sql SQL query string with placeholders
   * @param params Parameters for the SQL query
   * @returns Array of query results
   */
  private execSQLAll<T>(sql: string, params: any[] = []): T[] {
    if (!this.db) return [];
    
    try {
      const stmt = (this.db as any).db.prepare(sql);
      // We'll use a typed function that accepts a spread of parameters
      return stmt.all(...params) as T[];
    } catch (error) {
      this.logger.error(`SQL Error: ${error.toString()}, SQL: ${sql}, Params: ${JSON.stringify(params)}`);
      return [];
    }
  }

  /**
   * Helper method to safely execute SQL queries with no return value
   * @param sql SQL query string with placeholders
   * @param params Parameters for the SQL query
   * @returns Query result
   */
  private execSQLRun(sql: string, params: any[] = []): { changes: number } {
    if (!this.db) return { changes: 0 };
    
    try {
      const stmt = (this.db as any).db.prepare(sql);
      // We'll use a typed function that accepts a spread of parameters
      return stmt.run(...params);
    } catch (error) {
      this.logger.error(`SQL Error: ${error.toString()}, SQL: ${sql}, Params: ${JSON.stringify(params)}`);
      return { changes: 0 };
    }
  }
  
  /**
   * Initialize the adapter and database
   */
  public async initialize(): Promise<void> {
    if (this.db) {
      try {
        // Initialize the database with Telegram-specific schema
        (this.db as any).db.exec(telegramMultiAgentSchema);
        this.logger.info('TelegramCoordinationAdapter: Database initialized successfully');
      } catch (error) {
        this.logger.error('TelegramCoordinationAdapter: Failed to initialize database', error);
        throw error;
      }
    } else {
      this.logger.warn('TelegramCoordinationAdapter: No database adapter provided, operating in memory-only mode');
    }
  }
  
  /**
   * Create a new conversation
   * 
   * @param conversation - Conversation data
   * @returns The created conversation ID
   */
  public async createConversation(conversation: Omit<Conversation, 'participants'>): Promise<string> {
    if (!this.db) {
      return conversation.id;
    }
    
    try {
      const conversationId = conversation.id || uuidv4();
      
      // Insert topic first
      const topicId = uuidv4();
      const topic = {
        topic_id: topicId,
        group_id: conversation.groupId,
        title: conversation.topic,
        description: `Conversation: ${conversation.topic}`,
        status: conversation.status.toLowerCase(),
        priority: 5, // Default priority
        created_at: new Date(conversation.startedAt).toISOString(),
        scheduled_for: null,
        started_at: new Date(conversation.startedAt).toISOString(),
        completed_at: conversation.endedAt ? new Date(conversation.endedAt).toISOString() : null,
        initiator_agent_id: conversation.initiatedBy
      };
      
      const insertTopicSql = `
        INSERT INTO conversation_topics (
          topic_id, group_id, title, description, status, 
          priority, created_at, scheduled_for, started_at, 
          completed_at, initiator_agent_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.execSQLRun(insertTopicSql, [
        topic.topic_id,
        topic.group_id,
        topic.title,
        topic.description,
        topic.status,
        topic.priority,
        topic.created_at,
        topic.scheduled_for,
        topic.started_at,
        topic.completed_at,
        topic.initiator_agent_id
      ]);
      
      this.logger.info(`TelegramCoordinationAdapter: Created conversation with topic ID ${topicId}`);
      return conversationId;
    } catch (error) {
      this.logger.error('TelegramCoordinationAdapter: Failed to create conversation', error);
      return conversation.id;
    }
  }
  
  /**
   * Add a participant to a conversation
   * 
   * @param conversationId - Conversation ID
   * @param participant - Participant data
   */
  public async addParticipant(conversationId: string, participant: ConversationParticipant): Promise<void> {
    if (!this.db) {
      return;
    }
    
    try {
      // Find the topic_id for this conversation 
      const topicQuery = `
        SELECT topic_id FROM conversation_topics 
        WHERE title LIKE ? OR topic_id = ?
      `;
      const topicResult = this.execSQL<{ topic_id: string }>(topicQuery, [
        `%${conversationId}%`,
        conversationId
      ]);
      
      if (!topicResult) {
        this.logger.warn(`TelegramCoordinationAdapter: Cannot find topic for conversation ${conversationId}`);
        return;
      }
      
      const topicId = topicResult.topic_id;
      
      // Add participant to conversation
      const participantId = uuidv4();
      const insertParticipantSql = `
        INSERT INTO agent_conversation_participants (
          participation_id, agent_id, topic_id, role,
          invitation_status, invited_at, joined_at, left_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      this.execSQLRun(insertParticipantSql, [
        participantId,
        participant.agentId,
        topicId,
        'PARTICIPANT',
        'ACCEPTED',
        new Date().toISOString(),
        new Date(participant.joinedAt).toISOString(),
        participant.leftAt ? new Date(participant.leftAt).toISOString() : null
      ]);
      
      this.logger.info(`TelegramCoordinationAdapter: Added participant ${participant.agentId} to conversation ${conversationId}`);
    } catch (error) {
      this.logger.error('TelegramCoordinationAdapter: Failed to add participant', error);
    }
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
    if (!this.db) {
      return;
    }
    
    try {
      // Find the topic_id and group_id for this conversation
      const topicQuery = `
        SELECT topic_id, group_id FROM conversation_topics 
        WHERE title LIKE ? OR topic_id = ?
      `;
      const topicResult = this.execSQL<{ topic_id: string, group_id: string }>(topicQuery, [
        `%${message.conversationId}%`,
        message.conversationId
      ]);
      
      if (!topicResult) {
        this.logger.warn(`TelegramCoordinationAdapter: Cannot find topic for conversation ${message.conversationId}`);
        return;
      }
      
      // Record the message
      const insertMessageSql = `
        INSERT INTO agent_message_history (
          message_id, agent_id, group_id, topic_id,
          content, sent_at, is_to_human, is_from_human, recipient_agent_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const isFromHuman = message.senderId.startsWith('human_') ? 1 : 0;
      const isToHuman = message.receiverId?.startsWith('human_') ? 1 : 0;
      
      this.execSQLRun(insertMessageSql, [
        message.id,
        message.senderId,
        topicResult.group_id,
        topicResult.topic_id,
        message.content,
        new Date(message.sentAt).toISOString(),
        isToHuman,
        isFromHuman,
        message.receiverId || null
      ]);
      
      // Update message metrics
      const updateMetricsSql = `
        INSERT OR IGNORE INTO conversation_message_metrics (
          metric_id, topic_id, timestamp, total_messages, 
          human_messages, agent_messages, engagement_score
        ) VALUES (?, ?, date('now'), 1, ?, ?, 0)
        ON CONFLICT(metric_id) DO UPDATE SET
          total_messages = total_messages + 1,
          human_messages = human_messages + ?,
          agent_messages = agent_messages + ?
      `;
      
      const metricId = `${topicResult.topic_id}_${new Date().toISOString().split('T')[0]}`;
      
      this.execSQLRun(updateMetricsSql, [
        metricId,
        topicResult.topic_id,
        isFromHuman,
        isFromHuman ? 0 : 1,
        isFromHuman,
        isFromHuman ? 0 : 1
      ]);
      
      this.logger.info(`TelegramCoordinationAdapter: Recorded message ${message.id} in conversation ${message.conversationId}`);
    } catch (error) {
      this.logger.error('TelegramCoordinationAdapter: Failed to record message', error);
    }
  }
  
  /**
   * End a conversation
   * 
   * @param conversationId - Conversation ID
   * @param endedAt - Timestamp when the conversation ended
   */
  public async endConversation(conversationId: string, endedAt: number): Promise<void> {
    if (!this.db) {
      return;
    }
    
    try {
      // Update the conversation topic status to completed
      const updateTopicSql = `
        UPDATE conversation_topics
        SET status = 'COMPLETED', completed_at = ?
        WHERE title LIKE ? OR topic_id = ?
      `;
      
      const result = this.execSQLRun(updateTopicSql, [
        new Date(endedAt).toISOString(),
        `%${conversationId}%`,
        conversationId
      ]);
      
      if (result.changes === 0) {
        this.logger.warn(`TelegramCoordinationAdapter: No conversation found with ID ${conversationId}`);
      } else {
        this.logger.info(`TelegramCoordinationAdapter: Ended conversation ${conversationId}`);
      }
    } catch (error) {
      this.logger.error('TelegramCoordinationAdapter: Failed to end conversation', error);
    }
  }
  
  /**
   * Get a conversation by ID
   * 
   * @param conversationId - Conversation ID
   * @returns Conversation data with participants
   */
  public async getConversation(conversationId: string): Promise<Conversation | null> {
    if (!this.db) {
      return null;
    }
    
    try {
      // Get the conversation topic
      const topicQuery = `
        SELECT * FROM conversation_topics 
        WHERE title LIKE ? OR topic_id = ?
      `;
      
      const topic = this.execSQL<any>(topicQuery, [
        `%${conversationId}%`,
        conversationId
      ]);
      
      if (!topic) {
        return null;
      }
      
      // Get conversation participants
      const participantsQuery = `
        SELECT p.*, COUNT(m.message_id) as message_count, MAX(m.sent_at) as last_active
        FROM agent_conversation_participants p
        LEFT JOIN agent_message_history m ON p.agent_id = m.agent_id AND p.topic_id = m.topic_id
        WHERE p.topic_id = ?
        GROUP BY p.agent_id
      `;
      
      const participants = this.execSQLAll<any>(participantsQuery, [topic.topic_id]);
      
      // Get message count
      const messageCountQuery = `
        SELECT COUNT(*) as count FROM agent_message_history
        WHERE topic_id = ?
      `;
      
      const messageCountResult = this.execSQL<{ count: number }>(messageCountQuery, [topic.topic_id]);
      
      if (!messageCountResult) {
        return null;
      }
      
      // Map database entities to Conversation interface
      const conversation: Conversation = {
        id: conversationId,
        groupId: topic.group_id,
        status: topic.status.toUpperCase() as ConversationStatus,
        startedAt: new Date(topic.started_at).getTime(),
        endedAt: topic.completed_at ? new Date(topic.completed_at).getTime() : undefined,
        initiatedBy: topic.initiator_agent_id,
        topic: topic.title,
        messageCount: messageCountResult.count,
        participants: participants.map(p => ({
          agentId: p.agent_id,
          joinedAt: new Date(p.joined_at).getTime(),
          leftAt: p.left_at ? new Date(p.left_at).getTime() : undefined,
          messageCount: p.message_count || 0,
          lastActive: p.last_active ? new Date(p.last_active).getTime() : new Date(p.joined_at).getTime()
        }))
      };
      
      return conversation;
    } catch (error) {
      this.logger.error('TelegramCoordinationAdapter: Failed to get conversation', error);
      return null;
    }
  }
  
  /**
   * Get active conversations for a group
   * 
   * @param groupId - Group ID
   * @returns Array of active conversations
   */
  public async getActiveConversations(groupId: string): Promise<Conversation[]> {
    if (!this.db) {
      return [];
    }
    
    try {
      // Get active topics for the group
      const topicsQuery = `
        SELECT * FROM conversation_topics 
        WHERE group_id = ? AND status = 'ACTIVE'
      `;
      
      const topics = this.execSQLAll<any>(topicsQuery, [groupId]);
      
      if (topics.length === 0) {
        return [];
      }
      
      // Build conversations from topics
      const conversations: Conversation[] = [];
      
      for (const topic of topics) {
        // Get conversation participants
        const participantsQuery = `
          SELECT p.*, COUNT(m.message_id) as message_count, MAX(m.sent_at) as last_active
          FROM agent_conversation_participants p
          LEFT JOIN agent_message_history m ON p.agent_id = m.agent_id AND p.topic_id = m.topic_id
          WHERE p.topic_id = ?
          GROUP BY p.agent_id
        `;
        
        const participants = this.execSQLAll<any>(participantsQuery, [topic.topic_id]);
        
        // Get message count
        const messageCountQuery = `
          SELECT COUNT(*) as count FROM agent_message_history
          WHERE topic_id = ?
        `;
        
        const messageCountResult = this.execSQL<{ count: number }>(messageCountQuery, [topic.topic_id]);
        
        if (!messageCountResult) {
          continue;
        }
        
        // Map database entities to Conversation interface
        const conversation: Conversation = {
          id: topic.topic_id,
          groupId: topic.group_id,
          status: topic.status.toUpperCase() as ConversationStatus,
          startedAt: new Date(topic.started_at).getTime(),
          endedAt: topic.completed_at ? new Date(topic.completed_at).getTime() : undefined,
          initiatedBy: topic.initiator_agent_id,
          topic: topic.title,
          messageCount: messageCountResult.count,
          participants: participants.map(p => ({
            agentId: p.agent_id,
            joinedAt: new Date(p.joined_at).getTime(),
            leftAt: p.left_at ? new Date(p.left_at).getTime() : undefined,
            messageCount: p.message_count || 0,
            lastActive: p.last_active ? new Date(p.last_active).getTime() : new Date(p.joined_at).getTime()
          }))
        };
        
        conversations.push(conversation);
      }
      
      return conversations;
    } catch (error) {
      this.logger.error('TelegramCoordinationAdapter: Failed to get active conversations', error);
      return [];
    }
  }
  
  /**
   * Get recent messages from a conversation
   * 
   * @param conversationId - Conversation ID
   * @param limit - Maximum number of messages to retrieve
   * @returns Array of recent messages
   */
  public async getRecentMessages(conversationId: string, limit: number = 10): Promise<Message[]> {
    if (!this.db) {
      return [];
    }
    
    try {
      // Find the topic_id for this conversation
      const topicQuery = `
        SELECT topic_id FROM conversation_topics 
        WHERE title LIKE ? OR topic_id = ?
      `;
      
      const topicResult = this.execSQL<{ topic_id: string }>(topicQuery, [
        `%${conversationId}%`,
        conversationId
      ]);
      
      if (!topicResult) {
        return [];
      }
      
      // Get recent messages
      const messagesQuery = `
        SELECT m.*, 
               (SELECT COUNT(*) FROM agent_message_history 
                WHERE reply_to_message_id = m.message_id) as has_replies
        FROM agent_message_history m
        WHERE m.topic_id = ?
        ORDER BY m.sent_at DESC
        LIMIT ?
      `;
      
      const messages = this.execSQLAll<any>(messagesQuery, [
        topicResult.topic_id,
        limit
      ]);
      
      // Map database records to Message interface
      return messages.map(m => ({
        id: m.message_id,
        conversationId: conversationId,
        senderId: m.agent_id,
        receiverId: m.recipient_agent_id,
        content: m.content,
        sentAt: new Date(m.sent_at).getTime(),
        isFollowUp: m.has_replies > 0,
        replyToId: m.reply_to_message_id
      })).reverse(); // Return in chronological order
    } catch (error) {
      this.logger.error('TelegramCoordinationAdapter: Failed to get recent messages', error);
      return [];
    }
  }
  
  /**
   * Add or update a topic
   * 
   * @param topic - Topic data
   */
  public async upsertTopic(topic: Topic): Promise<void> {
    if (!this.db) {
      return;
    }
    
    try {
      const topicId = topic.id || uuidv4();
      
      // Check if topic exists
      const existingTopicQuery = `
        SELECT topic_id FROM conversation_topics 
        WHERE topic_id = ? OR title = ?
      `;
      
      const existingTopic = this.execSQL<{ topic_id: string }>(existingTopicQuery, [
        topicId,
        topic.title || topic.name // Use title if available, otherwise use name
      ]);
      
      if (existingTopic) {
        // Update existing topic
        const updateTopicSql = `
          UPDATE conversation_topics
          SET title = ?, description = ?, status = ?, priority = ?,
              scheduled_for = ?, initiator_agent_id = ?
          WHERE topic_id = ?
        `;
        
        this.execSQLRun(updateTopicSql, [
          topic.title || topic.name,
          topic.description || null,
          topic.status || 'PENDING',
          topic.priority || 5,
          topic.scheduledFor ? new Date(topic.scheduledFor).toISOString() : null,
          topic.initiatorId || null,
          existingTopic.topic_id
        ]);
        
        this.logger.info(`TelegramCoordinationAdapter: Updated topic ${existingTopic.topic_id}`);
      } else {
        // Insert new topic
        const insertTopicSql = `
          INSERT INTO conversation_topics (
            topic_id, group_id, title, description, status,
            priority, created_at, scheduled_for, initiator_agent_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        this.execSQLRun(insertTopicSql, [
          topicId,
          topic.groupId || '',
          topic.title || topic.name,
          topic.description || null,
          topic.status || 'PENDING',
          topic.priority || 5,
          new Date().toISOString(),
          topic.scheduledFor ? new Date(topic.scheduledFor).toISOString() : null,
          topic.initiatorId || null
        ]);
        
        this.logger.info(`TelegramCoordinationAdapter: Created new topic ${topicId}`);
      }
    } catch (error) {
      this.logger.error('TelegramCoordinationAdapter: Failed to upsert topic', error);
    }
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
    // No need to close the connection here as the db adapter is managed externally
    this.logger.info('TelegramCoordinationAdapter: Resources released');
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
      
      // FIXED: Register all known bot agents to ensure cross-communication
      // These are hardcoded agent IDs that we know exist in the system
      const knownBotIds = [
        'eth_memelord_9000',
        'bag_flipper_9000',
        'linda_evangelista_88',
        'vc_shark_99',
        'bitcoin_maxi_420',
        'code_samurai_77'
      ];
      
      // Register all known bots if they're not already registered
      for (const botId of knownBotIds) {
        if (!this.knownAgents[botId] && botId !== this.agentId) {
          this.registerAgent(botId, []);
          this.logger.info(`TelegramCoordinationAdapter: Auto-registered known agent ${botId}`);
        }
      }
      
      this.logger.debug(`TelegramCoordinationAdapter: Broadcasting availability for ${this.agentId}`);
      this.logger.debug(`TelegramCoordinationAdapter: Known agents: ${Object.keys(this.knownAgents).join(', ')}`);
      
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

  /**
   * Process a message from Telegram
   * @param chatId The ID of the chat the message was received in
   * @param text The text content of the message
   * @param sender The sender of the message
   * @param isBotMentioned Whether the bot was mentioned in the message
   */
  processMessage(chatId: number | string, text: string, sender: string, isBotMentioned: boolean): void {
    try {
      console.log(`[COORD] TelegramCoordinationAdapter: Processing message from ${sender} in chat ${chatId}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
      
      // Convert chatId to numeric if it's a string
      const numericChatId = typeof chatId === 'string' ? parseInt(chatId, 10) : chatId;
      
      // Store the message in the database
      this.storeMessage(numericChatId, text, sender);
      
      // If the bot was mentioned, update the active conversations
      if (isBotMentioned) {
        console.log(`[COORD] TelegramCoordinationAdapter: Bot was mentioned, updating conversation status`);
        this.updateConversationStatus(numericChatId, ConversationStatus.ACTIVE);
      }
    } catch (error) {
      console.error(`[COORD] TelegramCoordinationAdapter: Error processing message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Store a message in the database
   * @param chatId The ID of the chat the message was received in
   * @param text The text content of the message
   * @param sender The sender of the message
   */
  private storeMessage(chatId: number, text: string, sender: string): void {
    try {
      console.log(`[COORD] TelegramCoordinationAdapter: Storing message from ${sender} in chat ${chatId}`);
      
      // Here we would typically store the message in a database
      // For now, just log that we're storing it
      console.log(`[COORD] TelegramCoordinationAdapter: Message stored (mock implementation)`);
    } catch (error) {
      console.error(`[COORD] TelegramCoordinationAdapter: Error storing message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Update the status of a conversation
   * @param chatId The ID of the chat
   * @param status The new status of the conversation
   */
  private updateConversationStatus(chatId: number, status: ConversationStatus): void {
    try {
      console.log(`[COORD] TelegramCoordinationAdapter: Updating conversation status for chat ${chatId} to ${status}`);
      
      // Here we would typically update the conversation status in a database
      // For now, just log that we're updating it
      console.log(`[COORD] TelegramCoordinationAdapter: Conversation status updated (mock implementation)`);
    } catch (error) {
      console.error(`[COORD] TelegramCoordinationAdapter: Error updating conversation status: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
} 