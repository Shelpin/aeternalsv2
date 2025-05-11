import { generateUUID } from './utils.js';
import {
  IAgentRuntime,
  ElizaLogger,
  ConversationStateTracking,
  MemoryData,
  MemoryQuery
} from './types.js';
import { PluginComponent } from './PluginComponent.js';
import { FallbackMemoryManager } from './FallbackMemoryManager.js';
import { IMemoryManager } from './interfaces.js';

// Conversation states
enum ConversationState {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

/**
 * ConversationManager handles the state of conversations across multiple agents
 * using the ElizaOS memory system for persistent state tracking
 */
export class ConversationManager extends PluginComponent {
  private db: any | null;
  private memoryNamespace = 'telegram-multiagent';
  private fallbackMemory: FallbackMemoryManager | null = null;
  private memoryManager: any | null = null;
  private lastMessageTime: Map<string, number> = new Map(); // Track last message time per group
  private readonly MESSAGE_DELAY = 15000; // 15 seconds in milliseconds

  /**
   * Create a new ConversationManager
   * 
   * @param logger - Logger instance
   */
  constructor(logger: ElizaLogger) {
    super(logger);

    this.logger.info('ConversationManager: Created');

    // Create fallback memory manager
    this.fallbackMemory = new FallbackMemoryManager();
    this.logger.info('ConversationManager: Fallback memory manager created');

    // VALHALLA FIX: Add more detailed debug log about memory manager status
    this.logger.debug("[MEMORY] Using fallback memory manager since runtime memory manager is not available yet");
  }

  /**
   * Initialize the conversation manager
   */
  async initialize(): Promise<void> {
    this.logger.info('ConversationManager: Initializing');

    try {
      // VALHALLA FIX: Add specific logging for memory manager status
      if (this.runtime) {
        if (this.runtime.memoryManager) {
          this.logger.info("[MEMORY] Found memory manager on runtime");
        } else if (this.runtime.memoryManagers) {
          this.logger.info("[MEMORY] Found memory managers collection on runtime");
        } else {
          this.logger.warn("[MEMORY] No memory manager found on runtime, using fallback");
        }
      } else {
        this.logger.warn("[MEMORY] No runtime available, using fallback memory manager");
      }

      await this.ensureMemoryNamespaceExists();
      this.logger.info('ConversationManager: Memory namespace initialized');
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.warn(`ConversationManager: Error initializing memory namespace: ${error.message}`);
      } else {
        this.logger.warn(`ConversationManager: Error initializing memory namespace: ${JSON.stringify(error)}`);
      }
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

      // Get memory manager - use fallback if runtime memory manager is unavailable
      const memoryManager = this.getMemoryManager();
      const memories = await memoryManager.getMemories(query);

      if (memories && memories.length > 0) {
        // Get the most recent state
        const latestMemory = memories.reduce((prev: any, current: any) => {
          const prevDate = prev.createdAt instanceof Date ? prev.createdAt : new Date(prev.createdAt);
          const currDate = current.createdAt instanceof Date ? current.createdAt : new Date(current.createdAt);
          return prevDate > currDate ? prev : current;
        });

        // Extract conversation state from memory metadata
        this.logger.debug(`[MEMORY] Retrieved conversation state for group ${groupId}`);
        return (latestMemory.content as { metadata?: unknown }).metadata as ConversationStateTracking;
      }

      return null;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`ConversationManager: Error getting conversation state for group ${groupId}: ${error.message}`);
      } else {
        this.logger.error(`ConversationManager: Error getting conversation state for group ${groupId}: ${JSON.stringify(error)}`);
      }
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

      // Get memory manager - use fallback if runtime memory manager is unavailable
      const memoryManager = this.getMemoryManager();
      await memoryManager.createMemory(memoryData);
      this.logger.debug(`[MEMORY] Stored conversation state for group ${groupId}`);

      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`ConversationManager: Error storing conversation state for group ${groupId}: ${error.message}`);
      } else {
        this.logger.error(`ConversationManager: Error storing conversation state for group ${groupId}: ${JSON.stringify(error)}`);
      }
      return false;
    }
  }

  /**
   * Ensure the memory namespace exists
   */
  private async ensureMemoryNamespaceExists(): Promise<void> {
    // Get memory manager - use fallback if runtime memory manager is unavailable
    const memoryManager = this.getMemoryManager();

    // Just write a dummy record if needed to create the namespace
    // Using count instead of limit for the query as per MemoryQuery type
    const existingMemory = await memoryManager.getMemories({
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

      await memoryManager.createMemory(initData);
      this.logger.info(`[MEMORY] Created memory namespace: ${this.memoryNamespace}`);
    }
  }

  /**
   * Get the memory key for a conversation
   * 
   * @param groupId - Telegram group ID
   * @returns Memory key
   */
  private getMemoryKey(groupId: string | number): string {
    return `conversation-state-${groupId}`;
  }

  /**
   * Get the memory manager to use - either runtime's or fallback
   * 
   * @returns Memory manager to use
   */
  private getMemoryManager(): IMemoryManager {
    try {
      // Check if runtime exists
      if (!this.runtime) {
        this.logger.warn("Memory manager unavailable (no runtime), using fallback.");
        if (!this.fallbackMemory) {
          this.fallbackMemory = new FallbackMemoryManager();
        }
        return this.fallbackMemory;
      }

      // Check if runtime.memoryManager exists and has required methods
      if (this.runtime.memoryManager?.createMemory && this.runtime.memoryManager.getMemories) {
        return this.runtime.memoryManager as IMemoryManager;
      }

      // Fall back to our in-memory implementation
      if (!this.fallbackMemory) {
        this.logger.warn("Memory manager unavailable, creating fallback memory manager");
        this.fallbackMemory = new FallbackMemoryManager();
      }

      this.logger.debug("Using fallback memory manager");
      return this.fallbackMemory;
    } catch (error: unknown) {
      // In case of any error, use fallback
      if (!this.fallbackMemory) {
        this.fallbackMemory = new FallbackMemoryManager();
      }

      this.logger.warn(`Error accessing memory manager: ${error instanceof Error ? error.message : JSON.stringify(error)}, using fallback`);
      return this.fallbackMemory;
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
      // Update last message time when recording a message
      this.lastMessageTime.set(groupId.toString(), Date.now());

      let state = await this.getConversationState(groupId);
      if (!state) {
        state = {
          status: 'active',
          lastMessageTimestamp: Date.now(),
          lastSpeakerId: agentId || '',
          messageCount: 1,
          participants: agentId ? [agentId] : [],
          currentTopic: '',
          lastUpdated: Date.now()
        };
      } else {
        let participants = state.participants || [];
        if (agentId && !participants.includes(agentId)) {
          participants = [...participants, agentId];
        }
        state = {
          ...state,
          status: 'active',
          lastMessageTimestamp: Date.now(),
          lastSpeakerId: agentId || '',
          participants,
          messageCount: (state.messageCount || 0) + 1,
          lastUpdated: Date.now()
        };
      }
      const success = await this.storeConversationState(groupId, state);
      if (success && agentId) {
        await this.storeMessage(groupId, agentId, messageText);
      }
      return success ? state : null;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[CONVO_MANAGER] Error recording message: ${error.message}`);
      } else {
        this.logger.error(`[CONVO_MANAGER] Error recording message: ${JSON.stringify(error)}`);
      }
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

      // Get memory manager - use fallback if runtime memory manager is unavailable
      const memoryManager = this.getMemoryManager();
      await memoryManager.createMemory(memoryData);
      this.logger.debug(`[MEMORY] Stored message from ${agentId} in group ${groupId}`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[CONVO_MANAGER] Error storing message: ${error.message}`);
      } else {
        this.logger.error(`[CONVO_MANAGER] Error storing message: ${JSON.stringify(error)}`);
      }
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
      this.logger.debug(`[CONVO_MANAGER] Checking if ${agentId} should respond to message from ${fromAgentId || ''} in group ${groupId}`);

      // Check if enough time has passed since the last message
      const lastTime = this.lastMessageTime.get(groupId.toString());
      const now = Date.now();
      if (lastTime && (now - lastTime) < this.MESSAGE_DELAY) {
        this.logger.debug(`[CONVO_MANAGER] Not enough time has passed since last message (${now - lastTime}ms < ${this.MESSAGE_DELAY}ms)`);
        return false;
      }

      const state = await this.getConversationState(groupId);
      if (fromAgentId === agentId) {
        this.logger.debug(`[CONVO_MANAGER] Agent ${agentId} should not respond to itself`);
        return false;
      }

      let runtime: IAgentRuntime | undefined;
      try {
        runtime = await this.waitForRuntime();
      } catch (error: unknown) {
        this.logger.warn(`[CONVO_MANAGER] Error getting runtime: ${error instanceof Error ? error.message : JSON.stringify(error)}, using basic response logic`);
        return this.basicShouldRespond(agentId, fromAgentId, messageText);
      }

      let character: any = undefined;
      let agentName = agentId;
      let persona = '';
      let topics: string[] = [];
      let interests: string[] = [];
      try {
        character = runtime && runtime.character;
        if (character) {
          agentName = character.name || agentId;
          persona = character.bio || '';
          topics = character.topics || [];
          interests = character.interests || [];
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.warn(`[CONVO_MANAGER] Error getting character: ${error.message}`);
        } else {
          this.logger.warn(`[CONVO_MANAGER] Error getting character: ${JSON.stringify(error)}`);
        }
      }

      let history = '';
      let participants: string[] = [];
      try {
        const memoryManager = this.getMemoryManager();
        const recentMessages = await memoryManager.getMemories({
          roomId: groupId.toString(),
          type: 'telegram-message',
          count: 5
        });
        if (recentMessages && recentMessages.length > 0) {
          history = recentMessages.map((m: any) => `${m.userId}: ${m.content.text}`).join('\n');
        }
        if (state && state.participants) {
          participants = state.participants;
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.warn(`[CONVO_MANAGER] Error getting history: ${error.message}`);
        } else {
          this.logger.warn(`[CONVO_MANAGER] Error getting history: ${JSON.stringify(error)}`);
        }
      }

      const prompt = `You are ${agentName}, an AI participating in a group chat.\n\nYour persona:\n${persona}\n\nYour interests: ${interests.join(', ')}\nTopics you know about: ${topics.join(', ')}\n\nCurrent group chat: Telegram group ${groupId}\nOther participants: ${participants.length > 0 ? participants.filter(p => p !== agentId).join(', ') : 'None identified yet'}\n\nRecent conversation:\n${history || 'No recent messages'}\n\nMessage just received:\nFROM: ${fromAgentId || ''}\nMESSAGE: \"${messageText || ''}\"\n\nShould you respond to this message? Consider:\n- If it's directed at you\n- If it's about a topic you're interested in\n- If you have something valuable to add\n- If it's natural for you to join the conversation at this point\n\nReply with ONLY ONE of these exact options:\n[RESPOND] - if you want to speak\n[IGNORE] - if you choose to remain silent`;

      try {
        if (runtime?.modelProvider && typeof (runtime.modelProvider as any).generateText === 'function') {
          const result = await (runtime.modelProvider as { generateText: (opts: { prompt: string, temperature: number, maxTokens: number }) => Promise<string> }).generateText({
            prompt,
            temperature: 0.7,
            maxTokens: 50
          });
          const decision = result.includes('RESPOND') ? true : false;
          this.logger.info(`[CONVO_MANAGER] LLM response decision for ${agentId}: ${decision ? 'RESPOND' : 'IGNORE'}`);
          return decision;
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.warn(`[CONVO_MANAGER] Error generating LLM response: ${error.message}, falling back to basic logic`);
        } else {
          this.logger.warn(`[CONVO_MANAGER] Error generating LLM response: ${JSON.stringify(error)}, falling back to basic logic`);
        }
      }

      return this.basicShouldRespond(agentId, fromAgentId, messageText);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[CONVO_MANAGER] Error checking if agent should respond: ${error.message}`);
      } else {
        this.logger.error(`[CONVO_MANAGER] Error checking if agent should respond: ${JSON.stringify(error)}`);
      }
      return true;
    }
  }

  /**
   * Basic response decision logic without using runtime
   */
  private basicShouldRespond(agentId: string, fromAgentId: string | null, messageText?: string): boolean {
    // Determine if message is from a bot by checking agent ID patterns
    const isFromBot = fromAgentId && (
      fromAgentId.includes('Bot') ||
      fromAgentId.includes('_') ||
      ['linda_evangelista_88', 'vc_shark_99', 'bitcoin_maxi_420',
        'bag_flipper_9000', 'code_samurai_77', 'eth_memelord_9000'].includes(fromAgentId)
    );

    this.logger.debug(`[CONVO_MANAGER] Is message from bot? ${isFromBot}`);

    // Check if this message directly mentions this agent (simple check)
    const isDirectedToThisAgent = messageText && (
      messageText.toLowerCase().includes(agentId.toLowerCase())
    );

    if (isDirectedToThisAgent) {
      this.logger.debug(`[CONVO_MANAGER] Message is directed at this agent, will respond`);
      return true;
    }

    // Always use a higher probability for bot-to-bot communication to ensure interactions happen
    if (isFromBot) {
      // Use a probability-based approach to avoid infinite loops but ensure good conversation flow
      // Higher probability means more responsive agents
      const probabilityFactor = 0.4; // 40% chance to respond to other bots

      // Add randomness to avoid multiple agents responding at the same time
      const shouldRespond = Math.random() < probabilityFactor;
      this.logger.debug(`[CONVO_MANAGER] Bot-to-bot response decision: ${shouldRespond} (probability: ${probabilityFactor})`);
      return shouldRespond;
    }

    // For messages from humans (not bots)
    const responseChance = 0.3; // 30% chance to respond to human messages
    const shouldRespond = Math.random() <= responseChance;

    this.logger.debug(`[CONVO_MANAGER] Human message response probability ${responseChance}, shouldRespond=${shouldRespond}`);

    return shouldRespond;
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