import { generateUUID } from './utils';
import { 
  IAgentRuntime, 
  ElizaLogger, 
  ConversationStateTracking,
  MemoryData,
  MemoryQuery
} from './types';
import { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
import { TelegramRelay } from './TelegramRelay';
import { PersonalityEnhancer } from './PersonalityEnhancer';

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
export class ConversationManager {
  private runtime: IAgentRuntime;
  private logger: ElizaLogger;
  private memoryNamespace = 'telegram-multiagent';
  
  /**
   * Create a new ConversationManager
   * 
   * @param runtime - Agent runtime
   * @param logger - Logger instance
   */
  constructor(runtime: IAgentRuntime, logger: ElizaLogger) {
    this.runtime = runtime;
    this.logger = logger;
  }
  
  /**
   * Initialize the conversation manager
   */
  async initialize(): Promise<void> {
    this.logger.info('ConversationManager: Initializing');
    
    // Check if memory is available
    if (!this.runtime.memoryManager) {
      this.logger.error('ConversationManager: Memory system not available in runtime');
      throw new Error('Memory system not available in runtime');
    }
    
    // Ensure the memory namespace exists
    try {
      await this.ensureMemoryNamespaceExists();
      this.logger.info('ConversationManager: Memory namespace initialized');
    } catch (error) {
      this.logger.error(`ConversationManager: Error initializing memory namespace: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get conversation state for a group
   * 
   * @param groupId - Telegram group ID
   * @returns Conversation state or null if not found
   */
  async getConversationState(groupId: string | number): Promise<ConversationStateTracking | null> {
    try {
      const memoryKey = this.getMemoryKey(groupId);
      
      // Query the memory system
      const query: MemoryQuery = {
        roomId: memoryKey,
        type: 'conversation_state'
      };
      
      const memories = await this.runtime.memoryManager.getMemories(query);
      
      if (!memories || memories.length === 0) {
        this.logger.debug(`ConversationManager: No conversation state found for group ${groupId}`);
        return null;
      }
      
      this.logger.debug(`ConversationManager: Retrieved conversation state for group ${groupId}`);
      return memories[0].content.metadata as ConversationStateTracking;
    } catch (error) {
      this.logger.error(`ConversationManager: Error getting conversation state: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Store conversation state for a group
   * 
   * @param groupId - Telegram group ID
   * @param state - Conversation state
   * @returns True if stored successfully, false otherwise
   */
  async storeConversationState(groupId: string | number, state: ConversationStateTracking): Promise<boolean> {
    try {
      const memoryKey = this.getMemoryKey(groupId);
      
      // Create memory data
      const memoryData: MemoryData = {
        roomId: memoryKey,
        userId: 'system',
        content: {
          text: `Conversation state for group ${groupId}`,
          metadata: {
            ...state,
            groupId: groupId.toString()
          }
        },
        type: 'conversation_state'
      };
      
      // Store in memory system
      await this.runtime.memoryManager.createMemory(memoryData);
      
      this.logger.debug(`ConversationManager: Stored conversation state for group ${groupId}`);
      return true;
    } catch (error) {
      this.logger.error(`ConversationManager: Error storing conversation state: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Update conversation state for a group
   * 
   * @param groupId - Telegram group ID
   * @param updates - Partial conversation state updates
   * @returns Updated conversation state or null if failed
   */
  async updateConversationState(
    groupId: string | number, 
    updates: Partial<ConversationStateTracking>
  ): Promise<ConversationStateTracking | null> {
    try {
      // Get current state
      let currentState = await this.getConversationState(groupId);
      
      if (!currentState) {
        // Initialize new state if none exists
        currentState = {
          status: 'inactive',
          lastMessageTimestamp: Date.now(),
          lastSpeakerId: null,
          messageCount: 0,
          participants: [],
          currentTopic: null,
          lastUpdated: Date.now()
        };
      }
      
      // Apply updates
      const updatedState = {
        ...currentState,
        ...updates,
        lastUpdated: Date.now()
      };
      
      // Store updated state
      const success = await this.storeConversationState(groupId, updatedState);
      
      if (!success) {
        return null;
      }
      
      return updatedState;
    } catch (error) {
      this.logger.error(`ConversationManager: Error updating conversation state: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Check if an agent should respond to a message
   * 
   * @param groupId - Telegram group ID
   * @param agentId - Agent ID
   * @param fromAgentId - Sender agent ID
   * @returns True if the agent should respond
   */
  async shouldAgentRespond(
    groupId: string | number,
    agentId: string,
    fromAgentId: string | null
  ): Promise<boolean> {
    try {
      // Get current conversation state
      const state = await this.getConversationState(groupId);
      
      if (!state) {
        // No conversation in progress, allow response
        this.logger.debug(`ConversationManager: No conversation state, ${agentId} can respond to ${fromAgentId || 'human'}`);
        return true;
      }
      
      // Don't respond to our own messages
      if (fromAgentId === agentId) {
        this.logger.debug(`ConversationManager: Agent ${agentId} should not respond to itself`);
        return false;
      }
      
      // If this is the first message in conversation, any agent can respond
      if (state.messageCount === 0) {
        this.logger.debug(`ConversationManager: First message in conversation, ${agentId} can respond`);
        return true;
      }
      
      // Don't respond if we were the last speaker
      if (state.lastSpeakerId === agentId) {
        this.logger.debug(`ConversationManager: Agent ${agentId} was the last speaker, should not respond`);
        return false;
      }
      
      // Randomize response probability based on number of participants
      // to prevent all agents from responding simultaneously
      const participantCount = state.participants.length || 1;
      const responseChance = 1 / participantCount;
      const shouldRespond = Math.random() <= responseChance;
      
      this.logger.debug(`ConversationManager: Agent ${agentId} response probability ${responseChance}, shouldRespond=${shouldRespond}`);
      
      return shouldRespond;
    } catch (error) {
      this.logger.error(`ConversationManager: Error checking if agent should respond: ${error.message}`);
      // Default to allowing response in case of error
      return true;
    }
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
      
      return success ? state : null;
    } catch (error) {
      this.logger.error(`ConversationManager: Error recording message: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Check if a conversation is active in a group
   * 
   * @param groupId - Telegram group ID
   * @returns True if conversation is active
   */
  async isConversationActive(groupId: string | number): Promise<boolean> {
    try {
      const state = await this.getConversationState(groupId);
      
      if (!state) {
        return false;
      }
      
      // Check if conversation is explicitly marked as active
      if (state.status === 'active' || state.status === 'starting') {
        // Check if the last message is recent (within 10 minutes)
        const lastMessageTime = state.lastMessageTimestamp || 0;
        const timeSinceLastMessage = Date.now() - lastMessageTime;
        
        // Consider conversation active if last message was within 10 minutes
        if (timeSinceLastMessage < 10 * 60 * 1000) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      this.logger.error(`ConversationManager: Error checking if conversation is active: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Mark a conversation as ended in a group
   * 
   * @param groupId - Telegram group ID
   * @returns True if successful
   */
  async endConversation(groupId: string | number): Promise<boolean> {
    try {
      const state = await this.getConversationState(groupId);
      
      if (!state) {
        return true; // No conversation to end
      }
      
      const updatedState: ConversationStateTracking = {
        ...state,
        status: 'inactive' as 'inactive' | 'starting' | 'active' | 'ending',
        lastUpdated: Date.now()
      };
      
      return await this.storeConversationState(groupId, updatedState);
    } catch (error) {
      this.logger.error(`ConversationManager: Error ending conversation: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Ensure memory namespace exists
   */
  private async ensureMemoryNamespaceExists(): Promise<void> {
    try {
      // Check if namespace exists by trying to get a key
      const initMemory = await this.runtime.memoryManager.getMemories({
        roomId: 'system',
        type: 'initialization'
      });
      
      if (!initMemory || initMemory.length === 0) {
        // Initialize namespace with a sentinel value
        await this.runtime.memoryManager.createMemory({
          roomId: 'system',
          userId: 'system',
          content: {
            text: 'Telegram Multi-Agent initialization record',
            metadata: {
              initialized: true,
              timestamp: Date.now()
            }
          },
          type: 'initialization'
        });
      }
    } catch (error) {
      this.logger.error(`ConversationManager: Error ensuring memory namespace exists: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Get memory key for a group
   * 
   * @param groupId - Telegram group ID
   * @returns Memory key
   */
  private getMemoryKey(groupId: string | number): string {
    return `conversation:${groupId}`;
  }
} 