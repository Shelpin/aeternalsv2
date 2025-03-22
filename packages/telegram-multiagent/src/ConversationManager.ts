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
  private runtime: IAgentRuntime | null;
  private logger: ElizaLogger;
  private memoryNamespace = 'telegram-multiagent';
  
  /**
   * Create a new ConversationManager
   * 
   * @param runtime - Agent runtime (can be null for testing)
   * @param logger - Logger instance
   */
  constructor(runtime: IAgentRuntime | null, logger: ElizaLogger) {
    this.runtime = runtime;
    this.logger = logger;
  }
  
  /**
   * Initialize the conversation manager
   */
  async initialize(): Promise<void> {
    this.logger.info('ConversationManager: Initializing');
    
    // Skip memory check if runtime is not available
    if (!this.runtime) {
      this.logger.warn('ConversationManager: Runtime not available, operating in limited mode');
      return;
    }
    
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
   * Get the current state of a conversation in a group
   * 
   * @param groupId - Telegram group ID
   * @returns The conversation state or null if not found
   */
  async getConversationState(groupId: string | number): Promise<ConversationStateTracking | null> {
    // Skip if runtime is not available
    if (!this.runtime || !this.runtime.memoryManager) {
      this.logger.warn(`ConversationManager: Cannot get conversation state - runtime or memory not available`);
      return null;
    }

    try {
      await this.ensureMemoryNamespaceExists();
      
      const memoryKey = this.getMemoryKey(groupId);
      
      // Query the memory system
      const query: MemoryQuery = {
        roomId: this.memoryNamespace,
        type: memoryKey
      };
      
      const memories = await this.runtime.memoryManager.getMemories(query);
      
      if (memories && memories.length > 0) {
        // Get the most recent state
        const latestMemory = memories.reduce((prev, current) => {
          const prevDate = prev.createdAt instanceof Date ? prev.createdAt : new Date(prev.createdAt);
          const currDate = current.createdAt instanceof Date ? current.createdAt : new Date(current.createdAt);
          return prevDate > currDate ? prev : current;
        });
        
        // Extract conversation state from memory metadata
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
    // Skip if runtime is not available
    if (!this.runtime || !this.runtime.memoryManager) {
      this.logger.warn(`ConversationManager: Cannot store conversation state - runtime or memory not available`);
      return false;
    }

    try {
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
      
      await this.runtime.memoryManager.createMemory(memoryData);
      this.logger.debug(`ConversationManager: Stored state for group ${groupId}`);
      
      return true;
    } catch (error) {
      this.logger.error(`ConversationManager: Error storing conversation state for group ${groupId}: ${error}`);
      return false;
    }
  }
  
  /**
   * Update an existing conversation state with partial changes
   * 
   * @param groupId - Telegram group ID
   * @param updates - Partial state changes to apply
   * @returns The updated state or null if failed
   */
  async updateConversationState(
    groupId: string | number, 
    updates: Partial<ConversationStateTracking>
  ): Promise<ConversationStateTracking | null> {
    // Skip if runtime is not available
    if (!this.runtime || !this.runtime.memoryManager) {
      this.logger.warn(`ConversationManager: Cannot update conversation state - runtime or memory not available`);
      return null;
    }

    try {
      // Get current state
      let currentState = await this.getConversationState(groupId);
      
      // If no existing state, create a new one
      if (!currentState) {
        currentState = {
          status: 'inactive' as 'inactive' | 'active' | 'starting' | 'ending',
          lastMessageTimestamp: Date.now(),
          lastSpeakerId: null,
          messageCount: 0,
          participants: [],
          currentTopic: null,
          lastUpdated: Date.now()
        };
      }
      
      // Update the state
      const updatedState: ConversationStateTracking = {
        ...currentState,
        ...updates,
        lastUpdated: Date.now()
      };
      
      // Store the updated state
      const success = await this.storeConversationState(groupId, updatedState);
      
      if (success) {
        return updatedState;
      }
      
      return null;
    } catch (error) {
      this.logger.error(`ConversationManager: Error updating conversation state for group ${groupId}: ${error}`);
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
      
      // Always use a higher probability for bot-to-bot communication to ensure interactions happen
      if (isFromBot) {
        console.log(`[CONVO_MANAGER] Message is from another bot (${fromAgentId}), using higher response probability`);
        
        // Check if this is a message specifically directed at this agent
        const isDirectedToThisAgent = false; // TODO: Implement message parsing to check for @mentions
        
        if (isDirectedToThisAgent) {
          console.log(`[CONVO_MANAGER] Message is directed at this agent, will respond`);
          return true;
        }
        
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
   * Ensure the memory namespace exists
   */
  private async ensureMemoryNamespaceExists(): Promise<void> {
    // Skip if runtime is not available
    if (!this.runtime || !this.runtime.memoryManager) {
      this.logger.warn('ConversationManager: Cannot ensure memory namespace - runtime or memory not available');
      return;
    }

    try {
      // Check if the namespace exists by querying it
      const query: MemoryQuery = {
        roomId: this.memoryNamespace,
        count: 1
      };
      
      const memories = await this.runtime.memoryManager.getMemories(query);
      
      // If there are no memories, create a namespace marker
      if (!memories || memories.length === 0) {
        this.logger.debug(`ConversationManager: Creating memory namespace: ${this.memoryNamespace}`);
        
        // Create a marker memory to establish the namespace
        const namespaceMarker: MemoryData = {
          roomId: this.memoryNamespace,
          userId: 'system',
          content: {
            text: `${this.memoryNamespace} namespace`,
            metadata: {
              type: 'namespace_marker',
              created: Date.now()
            }
          },
          type: 'namespace_marker'
        };
        
        await this.runtime.memoryManager.createMemory(namespaceMarker);
      }
    } catch (error) {
      this.logger.error(`ConversationManager: Error ensuring memory namespace: ${error}`);
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