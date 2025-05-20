import { generateUUID } from './utils.js';
import {
  IAgentRuntime,
  ElizaLogger,
  ConversationStateTracking,
  MemoryData,
  MemoryQuery,
  RelayMessage
} from './types.js';
import { PluginComponent } from './PluginComponent.js';
import { IMemoryManager } from './interfaces.js';
import { ConversationState, ParticipantMap, ResponseStrategy, Memory } from './types/conversation.js';
import { Database } from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter.js';

// Conversation states
enum ConversationLifecycleState {
  ACTIVE = 'active',
  INACTIVE = 'inactive'
}

export enum TurnStrategy {
  FIFO = 'FIFO',
  ROUND_ROBIN = 'ROUND_ROBIN',
  LLM_ASSISTED = 'LLM_ASSISTED'
}

/**
 * ConversationManager handles the state of conversations across multiple agents
 * using the ElizaOS memory system for persistent state tracking
 */
export class ConversationManager extends PluginComponent {
  private db: Database | null = null;
  private dbInitialized: boolean = false;
  private dbPath: string = '';
  private memoryNamespace = 'telegram-multiagent';
  private memoryManager: IMemoryManager | null = null;
  private directDbHelper: any = null; // Will hold ConversationDatabaseHelper instance if needed
  private usePersistentFallback = false; // Flag to indicate if we're using direct SQLite fallback
  private lastMessageTime: Map<string, number> = new Map(); // Track last message time per group-agent combo
  // Global cooldown tracking
  private lastGlobalMessageTime: Map<string, number> = new Map(); // Track last message time per group (global)

  // Cooldown configuration
  private readonly AGENT_COOLDOWN_MS = 20000; // 20 seconds in milliseconds (increased from 8)
  private readonly GLOBAL_COOLDOWN_MS = 12000; // 12 seconds global cooldown between ANY message
  private readonly HUMAN_MESSAGE_GLOBAL_COOLDOWN_MS = 3000; // Short cooldown after human message

  private currentTurnStrategy: TurnStrategy = TurnStrategy.FIFO;

  private states: Map<string, ConversationStateTracking> = new Map();

  private sqliteHelper: any = null; // Will hold ConversationDatabaseHelper instance if needed
  private usingSqliteFallback = false; // Flag to indicate if we're using direct SQLite fallback

  // Coordination adapter for shared database state
  private coordinationAdapter: TelegramCoordinationAdapter | null = null;

  /**
   * Create a new ConversationManager
   * 
   * @param logger - Logger instance
   */
  constructor(logger: ElizaLogger, runtime: IAgentRuntime | null) {
    super(logger);

    if (runtime) {
      this.setRuntime(runtime);
    }

    this.logger.info('ConversationManager: Created');
  }

  /**
   * Initialize the conversation manager
   */
  async initialize(): Promise<void> {
    this.logger.info('ConversationManager: Initializing');

    try {
      // Initialize shared database
      await this.initDatabase();
      this.logger.info(`[SHARED_DB] Initialized shared database for conversation management`);

      // Ensure memory namespace exists for cross-agent coordination
      await this.ensureMemoryNamespaceExists();
      this.logger.info('ConversationManager: Memory namespace initialized for coordination');

      // Check if we have a runtime-provided memoryManager to use
      if (this.runtime?.memoryManager) {
        this.logger.info(`[SHARED_DB] Using runtime memoryManager for agent ${this.runtime.getAgentId?.() || 'unknown'}`);
      } else {
        this.logger.warn(`[SHARED_DB] No runtime memoryManager available, using direct database access`);
      }

      // Load TelegramCoordinationAdapter dynamically if provided via dependency injection
      if (!this.coordinationAdapter && this.runtime) {
        this.logger.info('ConversationManager: Getting TelegramCoordinationAdapter from plugin context...');
        try {
          // Try to get TelegramCoordinationAdapter from plugin context
          if (typeof this.runtime.getPluginContext === 'function') {
            this.coordinationAdapter = this.runtime.getPluginContext('telegramCoordinationAdapter') as TelegramCoordinationAdapter;
            if (this.coordinationAdapter) {
              this.logger.info('ConversationManager: Successfully obtained TelegramCoordinationAdapter from plugin context');
            } else {
              this.logger.warn('ConversationManager: TelegramCoordinationAdapter not found in plugin context');
            }
          } else {
            this.logger.warn('ConversationManager: runtime.getPluginContext is not a function');
          }
        } catch (error) {
          this.logger.error('ConversationManager: Error getting TelegramCoordinationAdapter from plugin context:', error);
        }
      }

      // If no coordination adapter was provided or found in context, log error
      if (!this.coordinationAdapter) {
        this.logger.error('ConversationManager: TelegramCoordinationAdapter is required but was not provided or found in context');
        this.logger.warn('ConversationManager: Falling back to in-memory state only (no persistence)');
      } else {
        // Initialize the adapter
        await this.coordinationAdapter.initialize();
        this.logger.info('ConversationManager: Successfully initialized TelegramCoordinationAdapter');
      }
    } catch (error: any) {
      this.logger.error('ConversationManager: Error during initialization:', error);
      this.logger.warn('ConversationManager: Using in-memory state only (no persistence)');
    }
  }

  private async initDatabase(): Promise<void> {
    try {
      // Try to get database path from runtime or environment
      this.dbPath = this.getDatabasePath();

      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.logger.info(`[CONVO_DB_HELPER] Initializing with database path: ${this.dbPath}`);

      // Create the database connection
      try {
        const sqlite3 = require('sqlite3').verbose();
        this.db = new sqlite3.Database(this.dbPath, (err: Error | null) => {
          if (err) {
            this.logger.error(`[CONVO_DB_HELPER] Error opening database: ${err.message}`);
            this.dbInitialized = false;
            return;
          }
          this.logger.info(`Connected to SQLite database: ${this.dbPath}`);

          // Ensure schema exists
          try {
            this.ensureSchema();
          } catch (schemaErr) {
            this.logger.error(`[CONVO_DB_HELPER] Error ensuring schema: ${schemaErr}`);
            this.dbInitialized = false;
          }
        });
      } catch (sqliteErr) {
        this.logger.error(`[CONVO_DB_HELPER] Error loading sqlite3 module: ${sqliteErr}`);
        this.dbInitialized = false;
        // Try to use adapter-sqlite if available through runtime
        if (this.runtime?.databaseAdapter) {
          this.logger.info(`[CONVO_DB_HELPER] Attempting to use runtime.databaseAdapter as fallback`);
          try {
            // Initialize memory manager from runtime directly if adapter is available
            this.memoryManager = this.runtime.memoryManager;
            this.logger.info(`[CONVO_DB_HELPER] Successfully set up memoryManager from runtime`);
          } catch (adapterErr) {
            this.logger.error(`[CONVO_DB_HELPER] Error using runtime.databaseAdapter: ${adapterErr}`);
          }
        }
      }
    } catch (error) {
      this.logger.error('[CONVO_DB_HELPER] Error initializing database:', error);
      this.dbInitialized = false;
    }
  }

  /**
   * Try to initialize the persistent SQLite fallback
   * This is done as the third option if memoryManager isn't available
   */
  private async tryInitializePersistentFallback(): Promise<void> {
    try {
      this.logger.info("[MEMORY_FALLBACK] Attempting to initialize persistent SQLite fallback");

      // Find database path from various sources
      const dbPath = this.getDatabasePath(); // Use helper method for consistent path resolution

      // Create directory if it doesn't exist
      const dataDir = path.dirname(dbPath);
      if (!fs.existsSync(dataDir)) {
        this.logger.info(`[MEMORY_FALLBACK] Creating data directory: ${dataDir}`);
        fs.mkdirSync(dataDir, { recursive: true });
      }

      this.logger.info(`[SHARED_DB] Fallback using SHARED database for all agents at: ${dbPath}`);

      // Import helper dynamically to avoid ESM issues
      const { ConversationDatabaseHelper } = await import('./utils/ConversationDatabaseHelper.js');
      this.sqliteHelper = new ConversationDatabaseHelper(dbPath, this.logger);
      await this.sqliteHelper.initialize();

      // Verify database connection by retrieving a sample record
      this.logger.info("[MEMORY_FALLBACK] SQLite fallback initialized successfully");
      this.usingSqliteFallback = true;
    } catch (error: any) {
      this.logger.error(`[MEMORY_FALLBACK] Error initializing persistent SQLite fallback: ${error?.message || error}`);
      this.usingSqliteFallback = false;
    }
  }

  /**
   * Get the database path based on environment and runtime settings
   * following the File-Based DB Rule
   */
  private getDatabasePath(): string {
    // Default database path per File-Based DB Rule
    let dbPath = './data/multiagent.db';

    // Check runtime settings first
    if (this.runtime) {
      if (typeof this.runtime.getSetting === 'function') {
        const runtimeDbPath = this.runtime.getSetting('SQLITE_FILE', '') ||
          this.runtime.getSetting('DATABASE_PATH', '');
        if (runtimeDbPath) {
          dbPath = runtimeDbPath;
          this.logger.info(`[DB_PATH] Using database path from runtime settings: ${dbPath}`);
          return dbPath;
        }
      }

      // Try to get agent-specific data path
      if (this.runtime?.dataDir && typeof this.runtime.dataDir === 'string') {
        const agentId = this.runtime.getAgentId?.() || 'agent';
        dbPath = path.join(this.runtime.dataDir, `multiagent.db`);
        this.logger.info(`[DB_PATH] Using agent-specific database path: ${dbPath}`);
        return dbPath;
      }
    }

    // Check environment variables
    if (typeof process !== 'undefined' && process.env) {
      const envDbPath = process.env.SQLITE_FILE || process.env.DATABASE_PATH;
      if (envDbPath) {
        dbPath = envDbPath;
        this.logger.info(`[DB_PATH] Using database path from environment: ${dbPath}`);
        return dbPath;
      }

      // Check if we're in production, development, or test environment
      const nodeEnv = process.env.NODE_ENV || 'development';
      if (nodeEnv === 'production' && process.env.ELIZA_DATA_DIR) {
        dbPath = path.join(process.env.ELIZA_DATA_DIR, 'telegram-multiagent.db');
        this.logger.info(`[DB_PATH] Using production database path: ${dbPath}`);
        return dbPath;
      } else if (nodeEnv === 'test') {
        dbPath = './test/data/telegram-multiagent-test.db';
        this.logger.info(`[DB_PATH] Using test database path: ${dbPath}`);
        return dbPath;
      }
    }

    // Using default path with absolute resolution
    const resolvedPath = path.resolve(dbPath);
    this.logger.info(`[DB_PATH] Using default database path: ${resolvedPath}`);
    return resolvedPath;
  }

  private ensureSchema(): void {
    if (!this.db) {
      this.logger.error('[CONVO_DB_HELPER] Cannot ensure schema: database not initialized');
      return;
    }

    try {
      this.db.serialize(() => {
        // Create conversation_states table if it doesn't exist
        this.db.run(`
          CREATE TABLE IF NOT EXISTS conversation_states (
            group_id TEXT PRIMARY KEY,
            last_speaker TEXT,
            last_update INTEGER,
            participants TEXT,
            cooldown_until INTEGER,
            topic TEXT,
            state TEXT
          )
        `, (err: Error | null) => {
          if (err) {
            this.logger.error(`[CONVO_DB_HELPER] Error creating conversation_states table: ${err.message}`);
            return;
          }

          // Create index on group_id if it doesn't exist
          this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_conversation_states_group_id ON conversation_states(group_id)
          `, (err: Error | null) => {
            if (err) {
              this.logger.error(`[CONVO_DB_HELPER] Error creating group_id index: ${err.message}`);
              return;
            }

            // Create messages table if it doesn't exist
            this.db.run(`
              CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id TEXT,
                sender TEXT,
                message TEXT,
                timestamp INTEGER,
                FOREIGN KEY (group_id) REFERENCES conversation_states (group_id)
              )
            `, (err: Error | null) => {
              if (err) {
                this.logger.error(`[CONVO_DB_HELPER] Error creating messages table: ${err.message}`);
                return;
              }

              // Create index on group_id in messages table
              this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id)
              `, (err: Error | null) => {
                if (err) {
                  this.logger.error(`[CONVO_DB_HELPER] Error creating messages group_id index: ${err.message}`);
                  return;
                }

                this.dbInitialized = true;
                this.logger.info('[SHARED_DB] Database schema initialized successfully for shared conversation state');
              });
            });
          });
        });
      });
    } catch (error) {
      this.logger.error('[CONVO_DB_HELPER] Error ensuring schema:', error);
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
    // First try to use a runtime-provided memory manager
    if (this.runtime?.memoryManager) {
      this.logger.debug(`[CONVO_MGR_GET_MEMORY] Using runtime memoryManager`);
      return this.runtime.memoryManager as IMemoryManager;
    }

    // Next try the coordination adapter
    if (this.coordinationAdapter) {
      this.logger.debug(`[CONVO_MGR_GET_MEMORY] Using coordinationAdapter as memory manager`);
      return {
        createMemory: async (data: MemoryData) => {
          // Convert to a format the coordination adapter can use
          try {
            const message = {
              id: data.id || generateUUID(),
              conversationId: data.roomId || 'unknown-conversation',
              senderId: data.userId || 'unknown-sender',
              content: data.content?.text || JSON.stringify(data.content),
              sentAt: Date.now(),
              isFollowUp: false
            };
            await this.coordinationAdapter?.recordMessage(message);
            return { id: message.id };
          } catch (error) {
            this.logger.error(`[CONVO_MGR_GET_MEMORY] Error storing memory with adapter: ${error}`);
            return { success: false };
          }
        },
        getMemories: async (query: MemoryQuery) => {
          try {
            const messages = await this.coordinationAdapter?.getRecentMessages(query.roomId || 'unknown', query.count || 10);
            return messages?.map(msg => ({
              id: msg.id,
              type: 'telegram-message',
              roomId: query.roomId || 'unknown',
              userId: msg.senderId,
              content: { text: msg.content },
              timestamp: msg.sentAt,
              metadata: {}
            })) || [];
          } catch (error) {
            this.logger.error(`[CONVO_MGR_GET_MEMORY] Error getting memories with adapter: ${error}`);
            return [];
          }
        }
      } as IMemoryManager;
    }

    // As last resort, try direct SQLite access
    try {
      if (!this.memoryManager) {
        this.logger.warn(`[CONVO_MGR_GET_MEMORY] No memory manager available, using direct SQLite adapter`);
        this.memoryManager = this.getDirectSqliteAdapter();
      }
      return this.memoryManager;
    } catch (error) {
      this.logger.error(`[CONVO_MGR_GET_MEMORY] Error getting memory manager: ${error}`);

      // Return a no-op memory manager
      this.logger.warn(`[CONVO_MGR_GET_MEMORY] Using in-memory fallback`);
      return {
        createMemory: async () => ({ id: generateUUID() }),
        getMemories: async () => []
      } as IMemoryManager;
    }
  }

  /**
   * Get a memory manager adapter for the direct SQLite helper
   * This wraps the ConversationDatabaseHelper in IMemoryManager interface
   */
  private getDirectSqliteAdapter(): IMemoryManager {
    if (!this.sqliteHelper) {
      throw new Error("Direct SQLite helper not initialized");
    }

    // Return an adapter that implements IMemoryManager interface
    return {
      createMemory: async (memoryData: MemoryData) => {
        try {
          const { roomId, userId, content, type } = memoryData;

          // Special handling for conversation state
          if (type?.startsWith('conversation-state-')) {
            const groupId = type.replace('conversation-state-', '');
            if (content.metadata) {
              return this.sqliteHelper.saveConversationState(groupId, content.metadata);
            }
          }

          // For regular messages
          if (roomId && userId && content.text) {
            return this.sqliteHelper.saveMessage(roomId, userId, content.text);
          }

          return false;
        } catch (error: unknown) {
          this.logger.error(`[DIRECT_DB_ADAPTER] Error in createMemory: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
          return false;
        }
      },

      getMemories: async (query: MemoryQuery) => {
        try {
          const { roomId, type, count } = query;

          // Special handling for conversation state
          if (type?.startsWith('conversation-state-')) {
            const groupId = type.replace('conversation-state-', '');
            const state = await this.sqliteHelper.getConversationState(groupId);

            if (!state) return [];

            return [{
              id: `mem-${Date.now()}`,
              roomId,
              userId: 'system',
              content: {
                text: `Conversation state for group ${groupId}`,
                metadata: state
              },
              type,
              createdAt: new Date()
            }];
          }

          // For regular messages
          if (roomId && !type?.startsWith('conversation-state-')) {
            const messages = await this.sqliteHelper.getRecentMessages(roomId, count || 10);

            return messages.map((msg: any) => ({
              id: msg.id,
              roomId: msg.groupId,
              userId: msg.userId,
              content: {
                text: msg.text,
                metadata: {
                  timestamp: msg.timestamp
                }
              },
              type: 'telegram-message',
              createdAt: new Date(msg.timestamp)
            }));
          }

          return [];
        } catch (error: unknown) {
          this.logger.error(`[DIRECT_DB_ADAPTER] Error in getMemories: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
          return [];
        }
      }
    };
  }

  /**
   * Handles an incoming message to get/create conversation state and update participants/timestamps.
   * This is a higher-level function to be called by the plugin.
   * 
   * @param message - The incoming RelayMessage object
   * @param currentAgentId - The ID of the agent processing this message
   * @returns The conversation state or null if the message is invalid
   */
  public async handleMessage(message: RelayMessage, currentAgentId?: string): Promise<ConversationStateTracking | null> {
    const groupId = message.chat?.id?.toString();
    const senderId = message.sender_agent_id || message.from?.username || message.from?.id?.toString();

    if (!groupId) {
      this.logger.warn('[CONVO_MGR_HANDLE] Message lacks chat.id, cannot process conversation state.');
      return null;
    }
    if (!senderId) {
      this.logger.warn('[CONVO_MGR_HANDLE] Message lacks sender information, cannot reliably update participants.');
    }

    // Ensure we have a valid agent ID, not just "agent"
    const validCurrentAgentId = currentAgentId && currentAgentId !== 'agent' && currentAgentId !== 'unknown'
      ? currentAgentId
      : this.runtime?.getAgentId?.() || 'unknown';

    this.logger.info(`[CONVO_MGR_HANDLE] Processing message in group ${groupId} from sender ${senderId}, current agent: ${validCurrentAgentId} (original: ${currentAgentId || 'not provided'})`);

    let state = await this.getConversationState(groupId);

    if (!state) {
      this.logger.info(`[CONVO_MGR_HANDLE] No existing state for group ${groupId}, creating new one.`);
      const participants = new Set<string>();
      if (senderId) participants.add(senderId);
      if (validCurrentAgentId && validCurrentAgentId !== senderId) participants.add(validCurrentAgentId);

      state = {
        status: 'active',
        lastMessageTimestamp: Date.now(),
        lastSpeakerId: senderId,
        messageCount: 1,
        participants: Array.from(participants),
        currentTopic: '',
        lastUpdated: Date.now()
      };
    } else {
      this.logger.debug(`[CONVO_MGR_HANDLE] Existing state found for group ${groupId}. Last speaker: ${state.lastSpeakerId}`);
      const participants = new Set(state.participants || []);
      if (senderId) participants.add(senderId);
      if (validCurrentAgentId && validCurrentAgentId !== senderId) participants.add(validCurrentAgentId);

      state = {
        ...state,
        status: 'active',
        lastMessageTimestamp: Date.now(),
        lastSpeakerId: senderId,
        participants: Array.from(participants),
        messageCount: (state.messageCount || 0) + 1,
        lastUpdated: Date.now()
      };
    }

    const success = await this.storeConversationState(groupId, state);
    if (!success) {
      this.logger.error(`[CONVO_MGR_HANDLE] Failed to store updated conversation state for group ${groupId}.`);
    } else {
      this.logger.info(`[CONVO_MGR_HANDLE] Successfully stored updated state for group ${groupId}. Last speaker: ${state.lastSpeakerId}, Participants: ${state.participants.join(', ')}`);
    }

    if (senderId && message.text) {
      await this.storeMessage(groupId, senderId, message.text);
    }

    return state;
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
   * Record a message sent by an agent in this conversation
   * 
   * @param groupId - Telegram group ID
   * @param agentId - Agent ID that sent the message
   * @param messageText - Text of the message that was sent
   * @returns Updated conversation state
   */
  public async recordMessage(
    groupId: string | number,
    agentId: string, // agentId should be non-null when an agent is recording its own message
    messageText: string
  ): Promise<ConversationStateTracking | null> {
    try {
      // Get or create conversation state
      let state = await this.getConversationState(groupId);
      if (!state) {
        state = {
          status: 'active',
          lastMessageTimestamp: Date.now(),
          lastSpeakerId: '',
          messageCount: 0,
          participants: [],
          lastUpdated: Date.now()
        } as ConversationStateTracking;
      }

      // Ensure this agent is in the participants list
      if (!state.participants.includes(agentId)) {
        state.participants.push(agentId);
      }

      // Update state fields
      state.lastSpeakerId = agentId;
      state.lastMessageTimestamp = Date.now();
      state.lastUpdated = Date.now();
      state.messageCount++;

      // Store message
      await this.storeMessage(groupId, agentId, messageText);

      // Store updated state
      const success = await this.storeConversationState(groupId, state);

      // Update cooldown tracking
      const groupKey = `global-${groupId.toString()}`;
      const agentGroupKey = `${agentId}-${groupId.toString()}`;

      // Update both global and agent-specific cooldown timestamps
      this.lastGlobalMessageTime.set(groupKey, Date.now());
      this.lastMessageTime.set(agentGroupKey, Date.now());

      this.logger.info(`[CONVO_MGR_RECORD] Updated cooldown timers - Global for group ${groupId} and agent-specific for ${agentId}`);

      if (success) {
        // Store in coordination adapter if available
        if (this.coordinationAdapter) {
          try {
            const message = {
              id: generateUUID(),
              conversationId: typeof state.lastUpdated === 'number' ? state.lastUpdated.toString() : generateUUID(),
              senderId: agentId,
              content: messageText,
              sentAt: Date.now(),
              isFollowUp: false
            };
            await this.coordinationAdapter.recordMessage(message);
            this.logger.info(`[CONVO_MGR_RECORD] Successfully stored message in coordination adapter for group ${groupId} from agent ${agentId}`);
          } catch (error) {
            this.logger.error(`[CONVO_MGR_RECORD] Failed to store message in coordination adapter: ${error}`);
          }
        }
      } else {
        this.logger.error(`[CONVO_MGR_RECORD] Failed to store updated state for group ${groupId} after agent ${agentId} spoke.`);
      }
      return success ? state : null;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[CONVO_MANAGER] Error in recordMessage for agent ${agentId} in group ${groupId}: ${error.message}`);
      } else {
        this.logger.error(`[CONVO_MANAGER] Error in recordMessage for agent ${agentId} in group ${groupId}: ${JSON.stringify(error)}`);
      }
      return null;
    }
  }

  /**
   * Determine if an agent should respond to a message
   * 
   * @param groupId - Telegram group ID
   * @param agentId - Agent ID of the potential responder
   * @param fromAgentId - ID of the agent who sent the message (or null for human)
   * @param messageText - Text of the message (optional, used for LLM or keyword checks)
   * @returns True if the agent should respond
   */
  async shouldAgentRespond(
    groupId: string | number,
    agentId: string,
    fromAgentId: string | null,
    messageText?: string,
    message?: any // Optional message parameter to receive the full message object
  ): Promise<boolean> {
    try {
      // Ensure we have a valid agent ID, not just "agent"
      const validAgentId = agentId && agentId !== 'agent' && agentId !== 'unknown_agent_id_at_register' && agentId !== 'unknown' && agentId !== 'unknown_direct_responder'
        ? agentId
        : this.runtime?.getAgentId?.() || agentId;

      this.logger.debug(`[CONVO_MGR_SHOULD_RESPOND] Group ${groupId}. Current Agent: ${validAgentId} (original: ${agentId}). Sender: ${fromAgentId || 'Human/Unknown'}. Strategy: ${this.currentTurnStrategy}`);

      // Don't respond to your own messages
      if (fromAgentId === validAgentId) {
        this.logger.debug(`[CONVO_MGR_SHOULD_RESPOND] Agent ${validAgentId} should not respond to itself.`);
        return false;
      }

      // NEW: Check if this message is a direct reply to this agent
      if (message && message.reply_to_message) {
        // Extract the bot username from character config or fall back to agent ID
        const character = this.runtime?.character || {};
        const botUsername = typeof character === 'object' && character !== null && 'username' in character
          ? character.username as string
          : `${validAgentId}_bot`;

        const replyToUsername = message.reply_to_message.from?.username;

        // Check if this is a reply to this agent
        if (replyToUsername && (
          replyToUsername === botUsername ||
          replyToUsername === `${validAgentId}_bot` ||
          replyToUsername.startsWith(validAgentId)
        )) {
          this.logger.info(`[CONVO_MGR_SHOULD_RESPOND] Direct reply to agent ${validAgentId}. Prioritizing response.`);

          // NEW: Check if another agent is already responding before claiming priority
          if (this.coordinationAdapter) {
            const currentResponder = await this.coordinationAdapter.getRespondingAgent(groupId.toString());
            if (currentResponder && currentResponder !== validAgentId) {
              this.logger.info(`[CONVO_MGR_SHOULD_RESPOND] Agent ${currentResponder} is already responding to group ${groupId}. Despite being a direct reply, agent ${validAgentId} will defer.`);
              return false;
            }

            // Mark this agent as responding
            const marked = await this.coordinationAdapter.markAgentAsResponding(groupId.toString(), validAgentId);
            if (!marked) {
              this.logger.info(`[CONVO_MGR_SHOULD_RESPOND] Failed to mark agent ${validAgentId} as responding to group ${groupId}, likely due to race condition. Deferring.`);
              return false;
            }

            this.logger.info(`[CONVO_MGR_SHOULD_RESPOND] Agent ${validAgentId} marked as responding to direct reply in group ${groupId}.`);
          }

          return true; // Override other checks for direct replies
        }

        // If it's a reply to another agent, this agent should defer
        if (replyToUsername && replyToUsername !== botUsername && replyToUsername.includes('_bot')) {
          this.logger.info(`[CONVO_MGR_SHOULD_RESPOND] Message is a reply to another agent ${replyToUsername}. Agent ${validAgentId} defers.`);
          return false;
        }
      }

      // NEW: Check if any agent is already responding to this group
      if (this.coordinationAdapter) {
        const currentResponder = await this.coordinationAdapter.getRespondingAgent(groupId.toString());
        if (currentResponder) {
          if (currentResponder === validAgentId) {
            this.logger.info(`[CONVO_MGR_SHOULD_RESPOND] Agent ${validAgentId} is already marked as responding to group ${groupId}.`);
            return true; // This agent already has responding status
          } else {
            this.logger.info(`[CONVO_MGR_SHOULD_RESPOND] Agent ${currentResponder} is already responding to group ${groupId}. Agent ${validAgentId} defers.`);
            return false;
          }
        }
      }

      // First, check global cooldown for the entire conversation
      const groupKey = `global-${groupId.toString()}`;
      const lastGlobalMessageTimestamp = this.lastGlobalMessageTime.get(groupKey);
      const now = Date.now();

      // If the message is from human, use a shorter cooldown
      const isFromHuman = !fromAgentId || fromAgentId.startsWith('human_');
      const effectiveGlobalCooldown = isFromHuman ? this.HUMAN_MESSAGE_GLOBAL_COOLDOWN_MS : this.GLOBAL_COOLDOWN_MS;

      if (lastGlobalMessageTimestamp && (now - lastGlobalMessageTimestamp) < effectiveGlobalCooldown) {
        const timeElapsed = now - lastGlobalMessageTimestamp;
        this.logger.info(`[CONVO_MGR_SHOULD_RESPOND] Global cooldown in effect for group ${groupId}. ${timeElapsed}ms elapsed, needed ${effectiveGlobalCooldown}ms. Agent ${validAgentId} defers.`);
        return false;
      }

      // Then check agent-specific cooldown
      const agentGroupKey = `${validAgentId}-${groupId.toString()}`;
      const lastTimeThisAgentSpoke = this.lastMessageTime.get(agentGroupKey);

      if (lastTimeThisAgentSpoke && (now - lastTimeThisAgentSpoke) < this.AGENT_COOLDOWN_MS) {
        const timeElapsed = now - lastTimeThisAgentSpoke;
        this.logger.info(`[CONVO_MGR_SHOULD_RESPOND] Agent ${validAgentId} in group ${groupId} is in cooldown. ${timeElapsed}ms elapsed, needed ${this.AGENT_COOLDOWN_MS}ms. Agent defers.`);
        return false;
      }

      // Attempt to get conversation state
      const conversationState = await this.getConversationState(groupId);
      if (!conversationState) {
        this.logger.warn(`[CONVO_MGR_SHOULD_RESPOND] No conversation state found for group ${groupId}. Agent ${validAgentId} might respond by default if no other rules prevent.`);

        // Check default response criteria
        const shouldRespond = this.basicShouldRespond(validAgentId, fromAgentId, messageText);

        // If agent decides to respond, mark it as responding
        if (shouldRespond && this.coordinationAdapter) {
          const marked = await this.coordinationAdapter.markAgentAsResponding(groupId.toString(), validAgentId);
          if (!marked) {
            this.logger.info(`[CONVO_MGR_SHOULD_RESPOND] Failed to mark agent ${validAgentId} as responding to group ${groupId}, likely due to race condition. Deferring.`);
            return false;
          }
        }

        return shouldRespond;
      }

      // Check turn-taking strategy
      if (this.currentTurnStrategy === TurnStrategy.FIFO) {
        if (conversationState.lastSpeakerId === validAgentId) {
          this.logger.info(`[CONVO_MGR_SHOULD_RESPOND][FIFO] Agent ${validAgentId} was the last speaker in group ${groupId}. Should not respond.`);
          return false;
        }
        this.logger.info(`[CONVO_MGR_SHOULD_RESPOND][FIFO] Agent ${validAgentId} was NOT the last speaker (${conversationState.lastSpeakerId}) in group ${groupId}. Allowed to respond.`);

        // Before responding, mark this agent as the current responder
        if (this.coordinationAdapter) {
          const marked = await this.coordinationAdapter.markAgentAsResponding(groupId.toString(), validAgentId);
          if (!marked) {
            this.logger.info(`[CONVO_MGR_SHOULD_RESPOND][FIFO] Failed to mark agent ${validAgentId} as responding to group ${groupId}, likely due to race condition. Deferring.`);
            return false;
          }
        }

        return true;
      }

      // Rest of the existing logic...
      return this.basicShouldRespond(validAgentId, fromAgentId, messageText, conversationState);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[CONVO_MGR_SHOULD_RESPOND] Error in shouldAgentRespond: ${error.message}`);
      } else {
        this.logger.error(`[CONVO_MGR_SHOULD_RESPOND] Error in shouldAgentRespond: ${JSON.stringify(error)}`);
      }
      return false;
    }
  }

  /**
   * Basic logic to determine if an agent should respond
   * Used as a fallback when LLM is not available
   */
  private basicShouldRespond(
    agentId: string,
    fromAgentId: string | null,
    messageText?: string,
    conversationState?: ConversationStateTracking
  ): boolean {
    // Don't respond to self
    if (fromAgentId === agentId) {
      return false;
    }

    // Was this agent the last speaker?
    if (conversationState?.lastSpeakerId === agentId) {
      return false;
    }

    // Basic mention check
    if (messageText) {
      // Add type checking for runtime.character
      const character = this.runtime?.character || {};
      const botUsername = typeof character === 'object' && character !== null && 'username' in character
        ? character.username as string
        : agentId;

      if (messageText.includes(`@${botUsername}`) ||
        messageText.toLowerCase().includes(agentId.toLowerCase())) {
        return true;
      }
    }

    // Default response probability (30%)
    return Math.random() < 0.3;
  }

  /**
   * Check if it's a good time to kickstart a conversation in a group
   * 
   * @param groupId - Telegram group ID
   * @param minInterval - Minimum interval between kickstarts in milliseconds
   * @returns True if conversation can be kickstarted
   */
  async canKickstartConversation(
    groupId: string | number,
    minInterval: number = 300000
  ): Promise<boolean> {
    try {
      // Get the current conversation state
      const state = await this.getConversationState(groupId);

      // If no state, we can kickstart a new conversation
      if (!state) {
        this.logger.debug(`[KICKSTART_CHECK] No conversation state for group ${groupId}, can kickstart`);
        return true;
      }

      // Check if the last message was too recent
      const now = Date.now();
      const lastMessageTime = state.lastMessageTimestamp || 0;
      const timeSinceLastMessage = now - lastMessageTime;

      if (timeSinceLastMessage < minInterval) {
        this.logger.debug(`[KICKSTART_CHECK] Last message in group ${groupId} was too recent (${timeSinceLastMessage}ms ago), cannot kickstart`);
        return false;
      }

      // All checks passed, we can kickstart
      this.logger.debug(`[KICKSTART_CHECK] Can kickstart conversation in group ${groupId}`);
      return true;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[KICKSTART_CHECK] Error checking if conversation can be kickstarted: ${error.message}`);
      } else {
        this.logger.error(`[KICKSTART_CHECK] Error checking if conversation can be kickstarted: ${JSON.stringify(error)}`);
      }

      // Default to false on error
      return false;
    }
  }

  private async getConversationStateFromSqlite(groupId: string): Promise<ConversationStateTracking | null> {
    try {
      if (!this.sqliteHelper) {
        this.logger.warn("[MEMORY_SQLITE] SQLite helper not initialized");
        return null;
      }

      const state = await this.sqliteHelper.getConversationState(groupId.toString());

      if (!state) {
        return null;
      }

      // Convert database record to ConversationStateTracking format
      return {
        status: state.status || 'active',
        lastSpeakerId: state.lastSpeakerId || null,
        participants: state.participants || [],
        lastMessageTimestamp: state.lastMessageTimestamp || Date.now(),
        messageCount: state.messageCount || 0,
        currentTopic: state.currentTopic || '',
        lastUpdated: state.lastUpdated || Date.now()
      };
    } catch (error: any) {
      this.logger.error(`[MEMORY_SQLITE] Error getting state from SQLite: ${error?.message || error}`);
      return null;
    }
  }

  private async storeConversationStateInSqlite(state: ConversationStateTracking): Promise<boolean> {
    try {
      if (!this.sqliteHelper) {
        this.logger.warn("[MEMORY_SQLITE] SQLite helper not initialized");
        return false;
      }

      // Extract groupId from stored data - it's passed as string to getConversationState
      const groupId = this.extractGroupIdFromStateData(state);

      if (!groupId) {
        this.logger.error("[MEMORY_SQLITE] Cannot determine groupId for conversation state");
        return false;
      }

      return await this.sqliteHelper.saveConversationState(groupId, {
        ...state,
        groupId
      });
    } catch (error: any) {
      this.logger.error(`[MEMORY_SQLITE] Error storing state in SQLite: ${error?.message || error}`);
      return false;
    }
  }

  // Helper to extract groupId from memory data in a conversation
  private extractGroupIdFromStateData(state: any): string {
    // Try to look for the group ID in various places
    const possibleMemorySource = state.memoryKey ||
      state.memoryId ||
      state.key ||
      state.id ||
      '';

    // If it looks like "conversation-state-12345", extract the group ID
    if (typeof possibleMemorySource === 'string' && possibleMemorySource.startsWith('conversation-state-')) {
      return possibleMemorySource.replace('conversation-state-', '');
    }

    // Try other potential fields that might have the group ID
    return String(state.chatId || state.roomId || state.groupId || '');
  }

  private async storeMessageInSqlite(groupId: string, agentId: string, text: string): Promise<boolean> {
    try {
      if (!this.sqliteHelper) {
        this.logger.warn("[MEMORY_SQLITE] SQLite helper not initialized");
        return false;
      }

      return await this.sqliteHelper.saveMessage(groupId.toString(), agentId, text);
    } catch (error: any) {
      this.logger.error(`[MEMORY_SQLITE] Error storing message in SQLite: ${error?.message || error}`);
      return false;
    }
  }

  /**
   * Set the coordination adapter explicitly (useful for dependency injection)
   */
  setCoordinationAdapter(adapter: TelegramCoordinationAdapter): void {
    this.coordinationAdapter = adapter;
    this.logger.info('ConversationManager: TelegramCoordinationAdapter explicitly set');
  }
}