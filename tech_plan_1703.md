# ElizaOS Multi-Agent Telegram System: Implementation Plan (17-03)

## 1. Executive Summary

This document outlines the implementation plan for completing the ElizaOS Multi-Agent Telegram System, with a focus on enabling natural, human-like conversations in Telegram groups. The primary goal is to create a system where multiple AI agents can engage in autonomous, natural conversations that include both other bots and human users.

Our highest priority is implementing the conversation initiation and tagging functionality, which will allow agents to kickstart conversations with both bots and human users in a natural way.

## 2. Project Context & Current State

### 2.1 System Overview
The ElizaOS Multi-Agent Telegram System is designed to overcome a key limitation in Telegram's platform: bots cannot see messages from other bots in group chats. This system allows multiple AI agents powered by ElizaOS to have natural, engaging conversations with each other and with human users in Telegram groups.

### 2.2 Current Implementation Status
- **Operational Components**:
  - Multiple AI agents running successfully with process management scripts
  - Process management layer with multi-process architecture
  - Individual port and PID management for each agent
  - Character-specific configurations for 6 agents
  - Relay Server for bot-to-bot communication
  - Telegram client integration
  - SQLite adapter properly initialized with appropriate path
  - Group IDs successfully loading from environment variables
  - Configuration loading from external files

- **Partially Implemented Components**:
  - Conversation kickstarting feature (implemented but not actively generating conversations)
  - User/agent tagging system (implemented but needs testing)
  - Basic conversation flow structure 
  - Basic personality enhancement system
  - Simple typing simulation for natural interactions
  - Persistent SQLite storage (file-based database configured)

- **Not Yet Implemented Components**:
  - Scheduled auto-posting
  - User engagement tracking and optimization
  - Advanced conversation management

- **Current State**:
  - The system is running with the complete infrastructure in place
  - SQLite adapter is properly initialized with file-based storage at `/root/eliza/agent/data/telegram-multiagent.sqlite`
  - Group IDs are correctly loaded from the TELEGRAM_GROUP_IDS environment variable
  - Configuration is loaded from `/root/eliza/agent/config/plugins/telegram-multiagent.json` and properly merged with environment variables
  - Connection to relay server is established and heartbeats are exchanged
  - Conversation check interval is running regularly (every 30 seconds)
  - Agents are successfully connecting to Telegram
  - Conversation kickstarting is not actively generating conversations yet

### 2.3 Value Proposition
This system provides several key benefits:
- **Enhanced User Experience**: Creates the illusion of natural multi-agent conversations in Telegram
- **Autonomous Content**: Reduces manual management by enabling agents to operate independently
- **Community Engagement**: Improves user retention and engagement in Telegram groups
- **Showcase Technology**: Demonstrates ElizaOS capabilities through natural agent interactions
- **Educational Value**: Allows interactions with specialized knowledge agents in a conversational format

### 2.4 Integration with ElizaOS Ecosystem
The Multi-Agent Telegram System integrates with ElizaOS through:
- ElizaOS plugin architecture
- ElizaOS SQLite database adapter
- ElizaOS character definition system
- ElizaOS Telegram client
- ElizaOS runtime environment

## 3. Terminology & Key Concepts

To ensure clarity throughout implementation, these key concepts are defined:

### 3.1 Conversation Kickstarting
The ability of agents to **initiate interactive dialogues** with the expectation of responses, including:
- Starting conversations directed at specific participants
- Selecting contextually relevant topics
- Using natural conversation starters
- Managing the conversation flow to sustain engagement
- Using appropriate tagging to bring others into the conversation

### 3.2 Autonomous Content Generation
The ability of agents to **publish standalone content** without necessarily expecting direct responses:
- Posting about topics of interest without specific conversation invitation
- Sharing insights, opinions, or information based on agent personality
- Scheduled based on time patterns and activity levels
- Emulating human social media posting behavior
- May incidentally lead to conversations, but not the primary goal

### 3.3 Smart Tagging System
A system for intelligently mentioning users and other agents in messages:
- Selecting relevant recipients based on topic and past interactions
- Using natural language patterns for mentions
- Implementing cooldown periods to prevent spam
- Adapting tagging frequency based on user responsiveness

### 3.4 Conversation Management
The coordination of conversation flow including:
- Topic selection and relevance scoring
- Participation management (who speaks when)
- Natural conversation progression (start, middle, end)
- Context awareness across multiple messages
- Handling multiple simultaneous conversations

## 4. Priority-Based Implementation Plan

### 4.1 Priority 1: Conversation Initiation and Tagging System

#### 4.1.1 SQLite Integration Completion
- **Objective**: Properly utilize the ElizaOS SQLite adapter for conversation management
- **Tasks**:
  - ✅ Integrate TelegramCoordinationAdapter with ElizaOS SQLite adapter
  - ✅ Configure SQLite database path for persistent storage
  - ✅ Ensure SQLite adapter initializes properly
  - ⏳ Implement database access methods for conversation tracking
  - ⏳ Create appropriate indexes for performance optimization
  - ✅ Verify data persistence across agent restarts
- **Current Status**: SQLite adapter is successfully initialized with persistent file storage at `/root/eliza/agent/data/telegram-multiagent.sqlite`. The database connection is working properly.

#### 4.1.2 Conversation Kickstarting
- **Objective**: Enable agents to autonomously initiate conversations
- **Tasks**:
  - ✅ Implement basic conversation kickstarter framework
  - ✅ Configure time-based intervals for conversation checks
  - ⏳ Fix the actual conversation starting mechanism
  - ⏳ Implement topic selection algorithm based on agent personality and interests
  - ⏳ Create natural conversation starters based on selected topics
  - ⏳ Implement context awareness to avoid disrupting ongoing conversations
- **Current Status**: The conversation check interval is running, but no actual conversations are being initiated. The kickstarter framework is implemented but not fully functional.

#### 4.1.3 Smart Tagging System
- **Objective**: Enable agents to naturally tag and engage with both other bots and human users
- **Tasks**:
  - ✅ Implement configuration for agent tagging
  - ⏳ Test tagging functionality with the `/kickstart` command
  - ⏳ Implement user activity tracking to identify active users
  - ⏳ Create relevance matching between topics and user interests
  - ⏳ Add tagging cooldown to prevent spamming users
  - ⏳ Implement natural language patterns for mentioning users
- **Current Status**: Tagging system is implemented but needs testing with the `/kickstart` command.

### 4.2 Priority 2: Enhanced Conversation Management

#### 4.2.1 Participant Selection Logic
- **Objective**: Improve how agents select conversation participants
- **Tasks**:
  - Implement relevance scoring based on agent interests and topic
  - Add natural randomness to avoid predictable patterns
  - Create multi-variable selection criteria (recency, relevance, history)
  - Ensure appropriate group size for natural conversations
- **Current Status**: Basic participant management exists but lacks sophistication

#### 4.2.2 Conversation Flow Control
- **Objective**: Create more natural conversation progressions
- **Tasks**:
  - Implement conversation lifecycle with beginning, middle, and end phases
  - Add natural topic transitions
  - Implement conversation length variability
  - Create intelligent disengagement patterns for conversation endings
- **Current Status**: Basic conversation tracking exists but needs enhancement

### 4.3 Priority 3: Auto-posting System

#### 4.3.1 Autonomous Content Generation
- **Objective**: Enable agents to post without direct triggers
- **Tasks**:
  - Implement personality-driven content generation
  - Create time-based posting schedule with natural patterns
  - Add contextual awareness to generate relevant content
  - Implement posting history tracking to avoid repetition
- **Current Status**: Not implemented

#### 4.3.2 Conflict Avoidance
- **Objective**: Ensure auto-posts don't disrupt ongoing conversations
- **Tasks**:
  - Create conversation activity detection
  - Implement posting delay when conversations are active
  - Add priority system for different types of content
  - Implement group activity monitoring to find optimal posting times
- **Current Status**: Not implemented

### 4.4 Priority 4: User Engagement Optimization

#### 4.4.1 User Interaction Tracking
- **Objective**: Track and learn from user engagement patterns
- **Tasks**:
  - Create user activity monitoring system
  - Implement response tracking for tagged messages
  - Add interest inference based on user responses
  - Create engagement score calculation
- **Current Status**: Not implemented

#### 4.4.2 Adaptive Engagement
- **Objective**: Adjust engagement based on user activity patterns
- **Tasks**:
  - Implement user preference learning
  - Create adaptive tagging frequency based on user responsiveness
  - Add topic customization based on user interests
  - Implement time-of-day awareness for user engagement
- **Current Status**: Not implemented

### 4.5 Priority 5: Testing, Optimization, and Documentation

#### 4.5.1 Automated Testing
- **Objective**: Create tests to verify critical functionality
- **Tasks**:
  - Implement unit tests for SQLite integration
  - Create integration tests for conversation flow
  - Add automated validation for the tagging system
  - Implement performance benchmarks
- **Current Status**: Limited testing exists

#### 4.5.2 Performance Optimization
- **Objective**: Ensure system runs efficiently
- **Tasks**:
  - Optimize database queries
  - Implement caching for frequently accessed data
  - Reduce memory usage
  - Optimize message processing
- **Current Status**: Basic implementation without optimization

#### 4.5.3 Documentation and Monitoring
- **Objective**: Improve system observability and documentation
- **Tasks**:
  - Enhance logging system
  - Create monitoring dashboard
  - Update user guide
  - Document API and database schema
- **Current Status**: Basic documentation exists, technical debt document created

## 5. Technical Implementation Details

### 5.1 System Architecture

```
ElizaOS Multi-Agent System
├── Process Management Layer
│   ├── start_agents.sh (Secure process launching)
│   ├── stop_agents.sh (Graceful termination)
│   └── Agent port management
├── Coordination Layer
│   ├── TelegramCoordinationAdapter (Database access)
│   ├── ConversationManager (Conversation handling)
│   └── PersonalityEnhancer (Message enhancement)
├── Agent Layer
│   ├── Multiple Telegram Agent Processes
│   ├── Individual Port & PID Management
│   └── Character-specific Configuration
└── Communication Bridge
    ├── Relay Server Implementation
    ├── TelegramRelay (Client communication)
    └── Message Routing Logic
```

### 5.2 Database Schema

```sql
-- Core tables for telegram group coordination
CREATE TABLE IF NOT EXISTS "telegram_groups" (
    "group_id" TEXT PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "member_count" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "is_active" INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS "agent_telegram_assignments" (
    "assignment_id" TEXT PRIMARY KEY,
    "agent_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "role" TEXT DEFAULT 'PARTICIPANT',
    "is_active" INTEGER DEFAULT 1,
    "activation_schedule" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agent_id") REFERENCES "accounts"("id"),
    FOREIGN KEY ("group_id") REFERENCES "telegram_groups"("group_id")
);

-- Conversation management tables
CREATE TABLE IF NOT EXISTS "conversation_topics" (
    "topic_id" TEXT PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT DEFAULT 'PENDING',
    "priority" INTEGER DEFAULT 5,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "scheduled_for" TIMESTAMP,
    "started_at" TIMESTAMP,
    "completed_at" TIMESTAMP,
    "initiator_agent_id" TEXT,
    FOREIGN KEY ("group_id") REFERENCES "telegram_groups"("group_id"),
    FOREIGN KEY ("initiator_agent_id") REFERENCES "accounts"("id")
);

-- User engagement tracking tables
CREATE TABLE IF NOT EXISTS "telegram_users" (
    "user_id" TEXT PRIMARY KEY,
    "username" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "last_active" TIMESTAMP,
    "first_seen" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "message_count" INTEGER DEFAULT 0,
    "is_active" INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS "user_tagging_history" (
    "tagging_id" TEXT PRIMARY KEY,
    "user_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "tagged_at" TIMESTAMP NOT NULL,
    "responded" INTEGER DEFAULT 0,
    "response_time" INTEGER,
    "topic_id" TEXT,
    FOREIGN KEY ("user_id") REFERENCES "telegram_users"("user_id"),
    FOREIGN KEY ("agent_id") REFERENCES "accounts"("id"),
    FOREIGN KEY ("topic_id") REFERENCES "conversation_topics"("topic_id")
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "telegram_users_activity_idx" 
    ON "telegram_users" ("last_active");
```

### 5.3 SQLite Integration

```typescript
// TelegramCoordinationAdapter integration with ElizaOS SQLite
import { SqliteDatabaseAdapter } from "@elizaos-plugins/adapter-sqlite";
import { telegramMultiAgentSchema } from './schema';

export class TelegramCoordinationAdapter {
  private dbAdapter: SqliteDatabaseAdapter;
  private agentId: string;
  private logger: ElizaLogger;
  
  constructor(dbAdapter: SqliteDatabaseAdapter, agentId: string, logger: ElizaLogger) {
    this.dbAdapter = dbAdapter;
    this.agentId = agentId;
    this.logger = logger;
  }
  
  async initialize(): Promise<void> {
    try {
      // Initialize schema if needed
      await this.dbAdapter.executeQuery(telegramMultiAgentSchema);
      
      // Register agent in the coordination system
      await this.registerAgent();
      this.logger.info(`TelegramCoordinationAdapter: Initialized for agent ${this.agentId}`);
    } catch (error) {
      this.logger.error(`Failed to initialize TelegramCoordinationAdapter: ${error.message}`);
      throw error;
    }
  }
  
  async registerAgent(): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO agent_status 
      (agent_id, last_active, is_available) 
      VALUES (?, ?, 1)
    `;
    await this.dbAdapter.executeQuery(query, [this.agentId, Date.now()]);
  }
  
  // User tracking methods
  async trackUserActivity(userId: string, username: string, firstName?: string, lastName?: string): Promise<void> {
    const query = `
      INSERT INTO telegram_users
      (user_id, username, first_name, last_name, last_active, message_count)
      VALUES (?, ?, ?, ?, ?, 1)
      ON CONFLICT (user_id) DO UPDATE SET
      username = COALESCE(excluded.username, username),
      first_name = COALESCE(excluded.first_name, first_name),
      last_name = COALESCE(excluded.last_name, last_name),
      last_active = excluded.last_active,
      message_count = message_count + 1
    `;
    
    await this.dbAdapter.executeQuery(query, [
      userId, username, firstName || null, lastName || null, Date.now()
    ]);
  }
  
  async getActiveUsers(hoursCutoff: number = 24): Promise<any[]> {
    const cutoffTime = Date.now() - (hoursCutoff * 60 * 60 * 1000);
    
    return this.dbAdapter.executeQuery(`
      SELECT * FROM telegram_users
      WHERE last_active > ?
      ORDER BY last_active DESC
    `, [cutoffTime]);
  }
  
  // Conversation tracking methods
  async createConversation(groupId: string, topic: string, initiatorAgentId: string): Promise<string> {
    const topicId = generateUUID();
    
    await this.dbAdapter.executeQuery(`
      INSERT INTO conversation_topics
      (topic_id, group_id, title, status, initiator_agent_id, started_at)
      VALUES (?, ?, ?, 'ACTIVE', ?, ?)
    `, [topicId, groupId, topic, initiatorAgentId, Date.now()]);
    
    return topicId;
  }
  
  async recordTagging(userId: string, topicId?: string): Promise<void> {
    const taggingId = generateUUID();
    
    await this.dbAdapter.executeQuery(`
      INSERT INTO user_tagging_history
      (tagging_id, user_id, agent_id, tagged_at, topic_id)
      VALUES (?, ?, ?, ?, ?)
    `, [taggingId, userId, this.agentId, Date.now(), topicId || null]);
  }
  
  async getLastTagging(userId: string): Promise<any> {
    const result = await this.dbAdapter.executeQuery(`
      SELECT * FROM user_tagging_history
      WHERE user_id = ? AND agent_id = ?
      ORDER BY tagged_at DESC
      LIMIT 1
    `, [userId, this.agentId]);
    
    return result.length > 0 ? result[0] : null;
  }
  
  // Additional methods for conversation tracking...
}
```

### 5.4 Conversation Initiation System

```typescript
// ConversationInitiator class
export class ConversationInitiator {
  private adapter: TelegramCoordinationAdapter;
  private personality: PersonalityEnhancer;
  private telegram: TelegramClient;
  private agentId: string;
  private logger: ElizaLogger;
  private groupId: number;
  private conversationTimer: NodeJS.Timeout | null = null;
  
  // Natural timing parameters
  private MIN_INTERVAL_HOURS = 3;
  private MAX_INTERVAL_HOURS = 12;
  private PEAK_HOURS = [9, 10, 11, 12, 13, 14, 19, 20, 21, 22];
  private NIGHT_HOURS = [0, 1, 2, 3, 4, 5];
  
  constructor(
    adapter: TelegramCoordinationAdapter,
    personality: PersonalityEnhancer,
    telegram: TelegramClient,
    agentId: string,
    groupId: number,
    logger: ElizaLogger
  ) {
    this.adapter = adapter;
    this.personality = personality;
    this.telegram = telegram;
    this.agentId = agentId;
    this.groupId = groupId;
    this.logger = logger;
  }
  
  /**
   * Start the conversation scheduling system
   */
  start(): void {
    this.scheduleNextConversation();
    this.logger.info(`Conversation initiator started for agent ${this.agentId}`);
  }
  
  /**
   * Stop the conversation scheduling system
   */
  stop(): void {
    if (this.conversationTimer) {
      clearTimeout(this.conversationTimer);
      this.conversationTimer = null;
    }
    this.logger.info(`Conversation initiator stopped for agent ${this.agentId}`);
  }
  
  /**
   * Schedule the next conversation
   */
  private scheduleNextConversation(): void {
    // Clear any existing timer
    if (this.conversationTimer) {
      clearTimeout(this.conversationTimer);
    }
    
    // Determine next conversation time
    const nextTime = this.calculateNextConversationTime();
    const delayMs = nextTime - Date.now();
    
    // Log the scheduled time
    const scheduledTime = new Date(nextTime).toISOString();
    this.logger.info(`Next conversation scheduled for ${scheduledTime} (in ${Math.round(delayMs/60000)} minutes)`);
    
    // Schedule the conversation
    this.conversationTimer = setTimeout(() => {
      this.initiateConversation().catch(err => {
        this.logger.error(`Error initiating conversation: ${err.message}`);
      }).finally(() => {
        // Always schedule the next conversation, even after error
        this.scheduleNextConversation();
      });
    }, delayMs);
  }
  
  /**
   * Calculate when the next conversation should happen
   */
  private calculateNextConversationTime(): number {
    const now = new Date();
    const hour = now.getHours();
    
    // Base interval in milliseconds
    let intervalMs = (this.MIN_INTERVAL_HOURS + Math.random() * 
                      (this.MAX_INTERVAL_HOURS - this.MIN_INTERVAL_HOURS)) * 60 * 60 * 1000;
    
    // Adjust based on time of day
    if (this.PEAK_HOURS.includes(hour)) {
      // More frequent during peak hours
      intervalMs *= 0.7;
    } else if (this.NIGHT_HOURS.includes(hour)) {
      // Less frequent during night hours
      intervalMs *= 2.0;
    }
    
    // Add some randomness (±10%)
    intervalMs *= 0.9 + Math.random() * 0.2;
    
    return Date.now() + intervalMs;
  }
  
  /**
   * Initiate a conversation
   */
  async initiateConversation(): Promise<void> {
    this.logger.info(`Attempting to initiate conversation...`);
    
    // Check if group is active
    const isActive = await this.isGroupActive();
    if (!isActive) {
      this.logger.info(`Group is currently active, postponing conversation initiation`);
      return;
    }
    
    // Select a topic based on personality and interests
    const topic = await this.selectTopic();
    
    // Generate conversation starter
    const starter = this.generateConversationStarter(topic);
    this.logger.info(`Selected topic: "${topic}", starter: "${starter}"`);
    
    // Create conversation in database
    const conversationId = await this.adapter.createConversation(
      this.groupId.toString(), 
      topic, 
      this.agentId
    );
    
    // Determine if we should tag others
    const shouldTag = Math.random() < 0.7; // 70% chance to tag
    
    if (shouldTag) {
      // Find relevant users/bots to tag
      const targets = await this.findRelevantTargets(topic);
      
      if (targets.length > 0) {
        // Generate message with tags
        const message = this.createTaggedMessage(starter, targets);
        
        // Record the tagging in database
        for (const target of targets) {
          if (target.type === 'user') {
            await this.adapter.recordTagging(target.id, conversationId);
          }
        }
        
        // Send the message
        await this.telegram.sendMessage(this.groupId, message);
        this.logger.info(`Initiated conversation with tags: ${message}`);
      } else {
        // No suitable targets, send without tagging
        await this.telegram.sendMessage(this.groupId, starter);
        this.logger.info(`Initiated conversation without tags: ${starter}`);
      }
    } else {
      // Send without tagging
      await this.telegram.sendMessage(this.groupId, starter);
      this.logger.info(`Initiated conversation without tags: ${starter}`);
    }
  }
  
  /**
   * Check if the group is currently active
   */
  private async isGroupActive(): Promise<boolean> {
    // Logic to determine if a conversation is already happening
    // For now, just return true to allow conversation initiation
    return true;
  }
  
  /**
   * Select a topic based on agent personality and interests
   */
  private async selectTopic(): Promise<string> {
    // Get agent interests from profile
    const interests = await this.personality.getAgentInterests();
    
    // For now, simply select a random interest
    // In future, this would consider current events, group history, etc.
    const randomIndex = Math.floor(Math.random() * interests.length);
    return interests[randomIndex];
  }
  
  /**
   * Generate a conversation starter for the given topic
   */
  private generateConversationStarter(topic: string): string {
    // Simple templates for conversation starters
    const templates = [
      `I've been thinking about ${topic} lately. What are your thoughts?`,
      `Has anyone been following the latest developments in ${topic}?`,
      `I'm curious what people think about ${topic} these days.`,
      `${topic} has been on my mind recently. Anyone else interested in this?`,
      `I'd love to discuss ${topic} with some of you.`
    ];
    
    // Select a random template
    const randomIndex = Math.floor(Math.random() * templates.length);
    return templates[randomIndex];
  }
  
  /**
   * Find relevant users and agents to tag based on topic
   */
  private async findRelevantTargets(topic: string): Promise<Array<{id: string, type: 'user' | 'agent'}>> {
    // Get active users
    const activeUsers = await this.adapter.getActiveUsers(24);
    
    // Get other agents
    const agents = await this.adapter.getActiveAgents(this.agentId);
    
    // Calculate relevance for users
    const taggedUsers = await this.calculateUserRelevance(activeUsers, topic);
    
    // Calculate relevance for agents
    const taggedAgents = await this.calculateAgentRelevance(agents, topic);
    
    // Combine and limit to max 2 tags
    const combined = [...taggedUsers, ...taggedAgents]
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
    
    return combined.map(item => ({
      id: item.id,
      type: item.type
    }));
  }
  
  /**
   * Create a message with tags
   */
  private createTaggedMessage(message: string, targets: Array<{id: string, type: 'user' | 'agent'}>): string {
    // Simple implementation - in future, would integrate tags more naturally
    const tagString = targets.map(target => `@${target.id}`).join(' ');
    return `${message} ${tagString}`;
  }
  
  // Additional methods for topic selection, timing, etc.
}
```

### 5.5 Smart Tagging System

```typescript
// UserTaggingSystem class
export class UserTaggingSystem {
  private adapter: TelegramCoordinationAdapter;
  private logger: ElizaLogger;
  private MAX_TAGS_PER_MESSAGE = 2;
  private MIN_TAG_COOLDOWN_HOURS = 24;
  
  constructor(adapter: TelegramCoordinationAdapter, logger: ElizaLogger) {
    this.adapter = adapter;
    this.logger = logger;
  }
  
  /**
   * Find relevant users for the given topic
   */
  async findRelevantUsers(topic: string, maxUsers: number = 2): Promise<string[]> {
    this.logger.debug(`Finding relevant users for topic: ${topic}`);
    
    // Get active users in the last 24 hours
    const activeUsers = await this.adapter.getActiveUsers(24);
    this.logger.debug(`Found ${activeUsers.length} active users`);
    
    if (activeUsers.length === 0) {
      return [];
    }
    
    // Calculate topic relevance scores
    const scoredUsers = await Promise.all(
      activeUsers.map(async user => {
        const score = await this.calculateUserRelevance(user, topic);
        return { userId: user.user_id, username: user.username, score };
      })
    );
    
    // Sort by relevance score
    scoredUsers.sort((a, b) => b.score - a.score);
    
    // Filter out users tagged recently
    const filteredUsers = await this.filterRecentlyTagged(scoredUsers);
    
    // Return top N users
    const selectedUsers = filteredUsers.slice(0, maxUsers).map(u => u.username);
    this.logger.debug(`Selected users: ${selectedUsers.join(', ')}`);
    
    return selectedUsers;
  }
  
  /**
   * Calculate user relevance score for a topic
   */
  private async calculateUserRelevance(user: any, topic: string): Promise<number> {
    // Base score on activity
    let score = 0.5;
    
    // Adjust based on user's message history
    const topicKeywords = this.extractKeywords(topic);
    const userMessages = await this.adapter.getUserMessages(user.user_id, 20);
    
    // Calculate keyword matches
    let matches = 0;
    for (const message of userMessages) {
      for (const keyword of topicKeywords) {
        if (message.content.toLowerCase().includes(keyword.toLowerCase())) {
          matches++;
        }
      }
    }
    
    // Adjust score based on keyword matches
    if (userMessages.length > 0) {
      score += (matches / userMessages.length) * 0.5;
    }
    
    // Add randomness for natural variation
    score += Math.random() * 0.2 - 0.1; // ±0.1 random adjustment
    
    return Math.min(Math.max(score, 0), 1); // Ensure 0-1 range
  }
  
  /**
   * Filter out users who were tagged recently
   */
  private async filterRecentlyTagged(users: Array<{userId: string, username: string, score: number}>): Promise<Array<{userId: string, username: string, score: number}>> {
    const cutoffTime = Date.now() - (this.MIN_TAG_COOLDOWN_HOURS * 60 * 60 * 1000);
    
    const filteredUsers = [];
    
    for (const user of users) {
      const lastTagging = await this.adapter.getLastTagging(user.userId);
      
      if (!lastTagging || lastTagging.tagged_at < cutoffTime) {
        filteredUsers.push(user);
      }
    }
    
    return filteredUsers;
  }
  
  /**
   * Extract keywords from a topic
   */
  private extractKeywords(topic: string): string[] {
    // Simple implementation - split by spaces and remove common words
    const commonWords = ['the', 'and', 'or', 'a', 'an', 'in', 'on', 'at', 'by', 'for', 'with', 'about'];
    
    return topic
      .toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.includes(word));
  }
  
  // Additional methods for tagging functionality...
}
```

## 6. Success Scenarios

### 6.1 Scheduled Conversation Scenario
1. **Scenario Initiation**: At 2:15 PM, ETH Memelord agent determines it's time to start a conversation
2. **Topic Selection**: Agent selects "DeFi yields" based on its interests and group history
3. **Participant Selection**: 
   - Agent identifies Bitcoin Maxi and VC Shark as relevant participants based on their interests
   - System verifies neither has been tagged in the past 24 hours
4. **Conversation Start**: 
   - ETH Memelord posts: "These DeFi yields are getting crazy again! What do you think about the sustainability? @bitcoin_maxi_420 @vc_shark_99"
   - System records the conversation initiation and participant tagging
5. **Conversation Progression**:
   - Bitcoin Maxi responds with skepticism about DeFi
   - VC Shark analyzes the investment opportunity
   - Conversation continues with 7-10 message exchanges
6. **Natural Ending**:
   - After sufficient exchanges, conversation naturally concludes
   - System records conversation metrics for future reference

### 6.2 User Engagement Scenario
1. **User Activity Tracking**: System notices user "crypto_enthusiast" frequently discusses Ethereum
2. **Topic Relevance**: When ETH Memelord discusses NFT marketplaces, system identifies potential interest match
3. **Natural Tagging**:
   - ETH Memelord posts: "I'm curious what people think about the new NFT marketplace on Polygon? @crypto_enthusiast have you tried it yet?"
   - System records the user tag
4. **Engagement Measurement**:
   - System tracks if/how quickly the user responds
   - Response information adjusts future tagging likelihood
5. **Adaptive Behavior**:
   - If user responds positively, system increases tag probability for similar topics
   - If user doesn't respond, system reduces tagging frequency

## 7. Known Technical Debt and Implementation Issues

### 7.1 Configuration Management
- **Issue**: Configuration management could be improved with better defaults and validation.
- **Status**: ✅ Fixed - Configuration now properly loads from file and environment variables with appropriate fallbacks.
- **Details**: We've implemented a robust config loading mechanism that checks environment variables first (TELEGRAM_GROUP_IDS), then the config file, and finally falls back to hardcoded values.

### 7.2 SQLite Integration
- **Issue**: The plugin was using an in-memory SQLite database instead of file-based storage.
- **Status**: ✅ Fixed - SQLite adapter now correctly initializes with file-based storage.
- **Details**: The database path is correctly set to `/root/eliza/agent/data/telegram-multiagent.sqlite` and the connection is established successfully.

### 7.3 Bootstrap Plugin Error
- **Issue**: Error message "Plugin bootstrap does not have initialize method" appears in logs.
- **Status**: ⚠️ Not Critical - This error is not affecting the functionality of the main plugin.
- **Details**: This is a warning related to another plugin and not directly impacting our TelegramMultiAgentPlugin.

### 7.4 Conversation Kickstarting Not Active
- **Issue**: Despite configuration and framework being in place, no conversations are being initiated.
- **Status**: ⏳ Under Investigation - Need to test with `/kickstart` command and investigate why automatic kickstarting isn't functioning.
- **Workaround**: Test manually with the `/kickstart` command to verify the basic functionality works before fixing the automatic kickstarting.

### 7.5 TypeScript Warnings
- **Issue**: The build process shows several TypeScript warnings related to type mismatches.
- **Status**: ⚠️ Low Priority - These warnings don't prevent the code from functioning.
- **Future Fix**: Address the TypeScript issues to ensure type safety and proper function calls.

## 8. Testing Strategy

See the accompanying Testing Plan document (updated_testing_plan_17_03.md) for detailed test scenarios and procedures.

## 9. Current Status and Next Steps

### 9.1 Current Status
- ✅ Agents are running successfully with the telegram-multiagent plugin loaded
- ✅ SQLite adapter is operating with proper file-based storage
- ✅ Group IDs are correctly loaded from environment variables
- ✅ The relay server is connected and heartbeat messages are being exchanged
- ✅ Configuration loading is working properly
- ❌ No active conversations or message exchanges have been observed yet
- ⏳ Conversation check interval is running but not initiating conversations

### 9.2 Recommended Next Steps

1. **Test Conversation Kickstarting**:
   - Test the `/kickstart` command in a configured Telegram group
   - Monitor logs for response and conversation initiation
   - Verify that agent tagging works when initiating conversations

2. **Debug Automatic Kickstarting**:
   - Investigate why the automatic conversation kickstarting isn't working
   - Check the ConversationKickstarter implementation for issues
   - Implement fixes to enable automatic conversation initiation

3. **Implement Conversation Management**:
   - Enhance the conversation flow control logic
   - Implement topic selection based on agent personality
   - Add natural conversation progression

## 10. Success Metrics

### 10.1 Quantitative Metrics
- Conversation initiation success rate
- User response rate to tagged messages
- Conversation length and participant count
- System performance metrics

### 10.2 Qualitative Metrics
- Natural conversation flow assessment
- User engagement quality
- Conversation topic relevance
- System reliability and recovery

## 11. Conclusion

This implementation plan has been updated to reflect our current progress. We've successfully resolved several key technical issues, including:

1. Proper loading of group IDs from environment variables
2. Correct initialization of the SQLite adapter with file-based storage
3. Robust configuration loading from both files and environment variables

The system now has a solid foundation with all core components in place. Our agents are successfully connecting to Telegram and the relay server, and the conversation check interval is running regularly.

Our immediate focus should be on testing and enabling the conversation kickstarting functionality, which is the key feature needed to allow our agents to initiate and maintain natural conversations. Once this is working, we can proceed with enhancing the conversation management, tagging system, and eventually implementing the auto-posting and user engagement tracking features. 