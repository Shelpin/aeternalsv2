import { generateUUID } from './utils.js';
import { 
  IAgentRuntime, 
  ElizaLogger, 
  ConversationStateTracking,
  MemoryData,
  MemoryQuery
} from './types.js';
import { PluginComponent } from './PluginComponent.js';

// Conversation states
enum ConversationState {
  INACTIVE,
  STARTING,
  ACTIVE,
  ENDING
}

/**
 * ConversationManager handles the state of conversations across multiple agents
 * using the ElizaOS memory system for persistent state tracking
 */
export class ConversationManager extends PluginComponent {
  private memoryNamespace = 'telegram-multiagent';
  
  /**
   * Create a new ConversationManager
   * 
   * @param logger - Logger instance
   */
  constructor(logger: ElizaLogger) {
    super(logger);
    
    this.logger.info('ConversationManager: Created');
  }
  
  /**
   * Initialize the conversation manager
   */
  async initialize(): Promise<void> {
    this.logger.info('ConversationManager: Initializing');
    
    try {
      await this.ensureMemoryNamespaceExists();
      this.logger.info('ConversationManager: Memory namespace initialized');
    } catch (error) {
      // Just log the error, don't throw - we'll retry later with waitForRuntime
      this.logger.warn(`ConversationManager: Error initializing memory namespace: ${error.message}`);
    }
  }
  
  /**
   * Get the current state of a conversation in a group
   * 
   * @param groupId - Telegram group ID
   * @returns The conversation state or null if not found
   */
  async getConversationState(groupId: string | number): Promise<ConversationStateTracking | null> {
    try {
      // Use waitForRuntime to ensure runtime is available
      const runtime = await this.waitForRuntime();
      
      await this.ensureMemoryNamespaceExists();
      
      const memoryKey = this.getMemoryKey(groupId);
      
      // Query the memory system
      const query: MemoryQuery = {
        roomId: this.memoryNamespace,
        type: memoryKey
      };
      
      const memories = await runtime.memoryManager.getMemories(query);
      
      if (memories && memories.length > 0) {
        // Get the most recent state
        const latestMemory = memories.reduce((prev, current) => {
          const prevDate = prev.createdAt instanceof Date ? prev.createdAt : new Date(prev.createdAt);
          const currDate = current.createdAt instanceof Date ? current.createdAt : new Date(current.createdAt);
          return prevDate > currDate ? prev : current;
        });
        
        // Extract conversation state from memory metadata
        this.logger.debug(`[MEMORY] Retrieved conversation state for group ${groupId}`);
        return latestMemory.content.metadata as ConversationStateTracking;
      }
      
      return null;
    } catch (error) {
      this.logger.error(`ConversationManager: Error getting conversation state for group ${groupId}: ${error}`);
      return null;
    }
  }
  
  /**
   * Store the state of a conversation in a group
   * 
   * @param groupId - Telegram group ID
   * @param state - The conversation state to store
   * @returns True if successfully stored
   */
  async storeConversationState(groupId: string | number, state: ConversationStateTracking): Promise<boolean> {
    try {
      // Use waitForRuntime to ensure runtime is available
      const runtime = await this.waitForRuntime();

      await this.ensureMemoryNamespaceExists();
      
      const memoryKey = this.getMemoryKey(groupId);
      
      // Create memory data in the correct format
      const memoryData: MemoryData = {
        roomId: this.memoryNamespace,
        userId: 'system',
        content: {
          text: `Conversation state for group ${groupId}`,
          metadata: {
            ...state,
            groupId: groupId.toString()
          }
        },
        type: memoryKey
      };
      
      await runtime.memoryManager.createMemory(memoryData);
      this.logger.debug(`[MEMORY] Stored conversation state for group ${groupId}`);
      
      return true;
    } catch (error) {
      this.logger.error(`ConversationManager: Error storing conversation state for group ${groupId}: ${error}`);
      return false;
    }
  }

  /**
   * Ensure the memory namespace exists
   */
  private async ensureMemoryNamespaceExists(): Promise<void> {
    // Use waitForRuntime to ensure runtime is available
    const runtime = await this.waitForRuntime();
    
    // Just write a dummy record if needed to create the namespace
    // Using count instead of limit for the query as per MemoryQuery type
    const existingMemory = await runtime.memoryManager.getMemories({
      roomId: this.memoryNamespace,
      count: 1
    });
    
    if (!existingMemory || existingMemory.length === 0) {
      const initData: MemoryData = {
        roomId: this.memoryNamespace,
        userId: 'system',
        content: {
          text: 'Namespace initialization',
          metadata: {
            initialized: true,
            timestamp: Date.now()
          }
        },
        type: 'namespace_init'
      };
      
      await runtime.memoryManager.createMemory(initData);
      this.logger.info(`[MEMORY] Created memory namespace: ${this.memoryNamespace}`);
    }
  }

  /**
   * Get the memory key for a group
   * 
   * @param groupId - Telegram group ID
   * @returns The memory key
   */
  private getMemoryKey(groupId: string | number): string {
    return `conversation_state_${groupId}`;
  }
  
  /**
   * Record a message in the conversation state
   * 
   * @param groupId - Telegram group ID
   * @param agentId - Agent ID (or null for human)
   * @param messageText - Message text
   * @returns Updated conversation state
   */
  async recordMessage(
    groupId: string | number,
    agentId: string | null,
    messageText: string
  ): Promise<ConversationStateTracking | null> {
    try {
      // Get current conversation state
      let state = await this.getConversationState(groupId);
      
      if (!state) {
        // Initialize new state
        state = {
          status: 'active',
          lastMessageTimestamp: Date.now(),
          lastSpeakerId: agentId,
          messageCount: 1,
          participants: agentId ? [agentId] : [],
          currentTopic: null,
          lastUpdated: Date.now()
        };
      } else {
        // Add agent to participants if not already present
        let participants = state.participants || [];
        if (agentId && !participants.includes(agentId)) {
          participants = [...participants, agentId];
        }
        
        state = {
          ...state,
          status: 'active',
          lastMessageTimestamp: Date.now(),
          lastSpeakerId: agentId,
          participants,
          messageCount: (state.messageCount || 0) + 1,
          lastUpdated: Date.now()
        };
      }
      
      // Store updated state
      const success = await this.storeConversationState(groupId, state);
      
      // Also store the message content in memory for context
      if (success && agentId) {
        await this.storeMessage(groupId, agentId, messageText);
      }
      
      return success ? state : null;
    } catch (error) {
      this.logger.error(`ConversationManager: Error recording message: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Store a message in memory for future context
   * 
   * @param groupId - Group ID
   * @param agentId - Agent ID
   * @param messageText - Message text
   */
  private async storeMessage(
    groupId: string | number, 
    agentId: string, 
    messageText: string
  ): Promise<void> {
    try {
      const runtime = await this.waitForRuntime();
      
      const memoryData: MemoryData = {
        roomId: groupId.toString(),
        userId: agentId,
        content: {
          text: messageText,
          metadata: {
            isAgentMessage: true,
            timestamp: Date.now()
          }
        },
        type: 'telegram-message'
      };
      
      await runtime.memoryManager.createMemory(memoryData);
      this.logger.debug(`[MEMORY] Stored message from ${agentId} in group ${groupId}`);
    } catch (error) {
      this.logger.error(`ConversationManager: Error storing message: ${error.message}`);
    }
  }
  
  /**
   * Determine if an agent should respond to a message
   * 
   * @param groupId - Telegram group ID
   * @param agentId - Agent ID
   * @param fromAgentId - ID of the agent who sent the message (or null for human)
   * @param messageText - Text of the message
   * @returns True if the agent should respond
   */
  async shouldAgentRespond(
    groupId: string | number,
    agentId: string,
    fromAgentId: string | null,
    messageText?: string
  ): Promise<boolean> {
    try {
      console.log(`[CONVO_MANAGER] Checking if ${agentId} should respond to message from ${fromAgentId || 'unknown'} in group ${groupId}`);
      
      // Get current conversation state
      const state = await this.getConversationState(groupId);
      
      if (!state) {
        // No conversation in progress, allow response
        console.log(`[CONVO_MANAGER] No conversation state, ${agentId} can respond to ${fromAgentId || 'human'}`);
        this.logger.debug(`ConversationManager: No conversation state, ${agentId} can respond to ${fromAgentId || 'human'}`);
        return true;
      }
      
      // Don't respond to our own messages
      if (fromAgentId === agentId) {
        console.log(`[CONVO_MANAGER] Agent ${agentId} should not respond to itself`);
        this.logger.debug(`ConversationManager: Agent ${agentId} should not respond to itself`);
        return false;
      }
      
      // If this is the first message in conversation, any agent can respond
      if (state.messageCount === 0) {
        console.log(`[CONVO_MANAGER] First message in conversation, ${agentId} can respond`);
        this.logger.debug(`ConversationManager: First message in conversation, ${agentId} can respond`);
        return true;
      }
      
      // Don't respond if we were the last speaker
      if (state.lastSpeakerId === agentId) {
        console.log(`[CONVO_MANAGER] Agent ${agentId} was the last speaker, should not respond`);
        this.logger.debug(`ConversationManager: Agent ${agentId} was the last speaker, should not respond`);
        return false;
      }
      
      // Determine if message is from a bot by checking agent ID patterns
      const isFromBot = fromAgentId && (
        fromAgentId.includes('Bot') || 
        fromAgentId.includes('_') || 
        ['linda_evangelista_88', 'vc_shark_99', 'bitcoin_maxi_420', 
         'bag_flipper_9000', 'code_samurai_77', 'eth_memelord_9000'].includes(fromAgentId)
      );
      
      console.log(`[CONVO_MANAGER] Is message from bot? ${isFromBot}`);
      
      // Check if this message directly mentions this agent
      const runtime = await this.waitForRuntime();
      const agentName = runtime.character?.name || agentId;
      
      const isDirectedToThisAgent = messageText && (
        messageText.toLowerCase().includes(agentName.toLowerCase()) || 
        messageText.toLowerCase().includes(agentId.toLowerCase())
      );
      
      if (isDirectedToThisAgent) {
        console.log(`[CONVO_MANAGER] Message is directed at this agent, will respond`);
        this.logger.debug(`ConversationManager: Message is directed at this agent, will respond`);
        return true;
      }
      
      // Always use a higher probability for bot-to-bot communication to ensure interactions happen
      if (isFromBot) {
        console.log(`[CONVO_MANAGER] Message is from another bot (${fromAgentId}), using higher response probability`);
        
        // Use a probability-based approach to avoid infinite loops but ensure good conversation flow
        // Higher probability means more responsive agents
        const probabilityFactor = 0.4; // 40% chance to respond to other bots
        
        // Add randomness to avoid multiple agents responding at the same time
        const shouldRespond = Math.random() < probabilityFactor;
        console.log(`[CONVO_MANAGER] Bot-to-bot response decision: ${shouldRespond} (probability: ${probabilityFactor})`);
        return shouldRespond;
      }
      
      // Randomize response probability based on number of participants
      // to prevent all agents from responding simultaneously
      const participantCount = state.participants.length || 1;
      const responseChance = 1 / participantCount;
      const shouldRespond = Math.random() <= responseChance;
      
      console.log(`[CONVO_MANAGER] Agent ${agentId} response probability ${responseChance}, shouldRespond=${shouldRespond}`);
      this.logger.debug(`ConversationManager: Agent ${agentId} response probability ${responseChance}, shouldRespond=${shouldRespond}`);
      
      return shouldRespond;
    } catch (error) {
      console.error(`[CONVO_MANAGER] Error checking if agent should respond:`, error);
      this.logger.error(`ConversationManager: Error checking if agent should respond: ${error.message}`);
      // Default to allowing response in case of error
      return true;
    }
  }
  
  /**
   * Check if a conversation is active in a group
   * 
   * @param groupId - Telegram group ID
   * @returns True if conversation is active
   */
  async isConversationActive(groupId: string | number): Promise<boolean> {
    const state = await this.getConversationState(groupId);
    return !!state && state.status === 'active';
  }
  
  /**
   * Get the timestamp of the last message in a conversation
   * 
   * @param groupId - Telegram group ID
   * @returns Timestamp or 0 if no conversation
   */
  async getLastMessageTime(groupId: string | number): Promise<number> {
    const state = await this.getConversationState(groupId);
    return (state && state.lastMessageTimestamp) || 0;
  }
  
  /**
   * Check if it's a good time to kickstart a conversation
   * 
   * @param groupId - Telegram group ID
   * @param minIntervalMs - Minimum time between kickstarts
   * @returns True if conversation can be kickstarted
   */
  async canKickstartConversation(groupId: string | number, minIntervalMs: number): Promise<boolean> {
    const state = await this.getConversationState(groupId);
    
    // If no conversation exists, we can kickstart
    if (!state) {
      return true;
    }
    
    // If conversation is inactive, we can kickstart if enough time has passed
    if (state.status !== 'active') {
      const lastUpdateTime = state.lastUpdated || 0;
      const timeSinceLastUpdate = Date.now() - lastUpdateTime;
      return timeSinceLastUpdate >= minIntervalMs;
    }
    
    // If conversation is active, check when the last message was sent
    const lastMessageTime = state.lastMessageTimestamp || 0;
    const timeSinceLastMessage = Date.now() - lastMessageTime;
    
    // Only kickstart if enough time has passed since the last message
    return timeSinceLastMessage >= minIntervalMs;
  }
  
  /**
   * Shutdown the conversation manager
   */
  async shutdown(): Promise<void> {
    this.logger.info('ConversationManager: Shutting down');
    // No resources to clean up
  }
} 