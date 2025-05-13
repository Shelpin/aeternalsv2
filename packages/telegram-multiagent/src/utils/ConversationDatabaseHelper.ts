/**
 * ConversationDatabaseHelper
 * 
 * Helper class for direct SQLite interactions for conversation state
 * to be used when memoryManager persistence is unavailable.
 */

import { ElizaLogger } from '../types';

// This will be dynamically imported at runtime if needed
// import { SQLiteAdapter } from '@elizaos/adapter-sqlite';

export interface ConversationState {
    status?: string;
    lastMessageTimestamp?: number;
    lastSpeakerId?: string;
    participants?: string[];
    messageCount?: number;
    currentTopic?: string;
    lastUpdated?: number;
}

export class ConversationDatabaseHelper {
    private dbPath: string;
    private logger: ElizaLogger;
    private db: any;
    private isInitialized: boolean;

    constructor(dbPath?: string, logger?: ElizaLogger) {
        this.dbPath = dbPath || './data/conversation.db';
        this.logger = logger || {
            info: (msg: string) => console.log(`[SQLHelper] ${msg}`),
            warn: (msg: string) => console.warn(`[SQLHelper] ${msg}`),
            error: (msg: string) => console.error(`[SQLHelper] ${msg}`),
            debug: (msg: string) => console.debug(`[SQLHelper] ${msg}`),
            trace: (msg: string) => console.log(`[SQLHelper] TRACE: ${msg}`)
        };
        this.db = null;
        this.isInitialized = false;
    }

    /**
     * Initialize the database
     */
    async initialize(): Promise<boolean> {
        try {
            this.logger.info(`[CONVO_DB_HELPER] Initializing with database path: ${this.dbPath}`);

            // Dynamic import to avoid dependency issues when not used
            const { SQLiteAdapter } = await import('@elizaos/adapter-sqlite');

            // Create database connection
            this.db = await SQLiteAdapter.connect(this.dbPath);
            this.logger.info(`[CONVO_DB_HELPER] Connected to SQLite database: ${this.dbPath}`);

            // Create schema
            await this.ensureSchema();
            this.isInitialized = true;

            return true;
        } catch (error: any) {
            this.logger.error(`[CONVO_DB_HELPER] Error initializing database: ${error.message}`);
            throw error;
        }
    }

    /**
     * Ensure the necessary schema exists
     */
    async ensureSchema(): Promise<void> {
        try {
            await this.db.run(`
        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          groupId TEXT NOT NULL,
          status TEXT NOT NULL,
          lastMessageTimestamp INTEGER,
          lastSpeakerId TEXT,
          participants TEXT,
          messageCount INTEGER,
          currentTopic TEXT,
          lastUpdated INTEGER
        )
      `);

            await this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_conversations_groupId 
        ON conversations(groupId)
      `);

            this.logger.info('[CONVO_DB_HELPER] Schema created/verified successfully');
        } catch (error: any) {
            this.logger.error(`[CONVO_DB_HELPER] Error ensuring schema: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get a conversation state by group ID
     * 
     * @param {string} groupId - Group ID
     * @returns {Object|null} - Conversation state or null if not found
     */
    async getConversationState(groupId: string): Promise<ConversationState | null> {
        if (!this.isInitialized) await this.initialize();

        try {
            const conversationId = `telegram-${groupId}`;

            const result = await this.db.get(
                'SELECT * FROM conversations WHERE id = ?',
                [conversationId]
            );

            if (!result) return null;

            // Parse JSON fields
            return {
                status: result.status,
                lastMessageTimestamp: result.lastMessageTimestamp,
                lastSpeakerId: result.lastSpeakerId,
                participants: JSON.parse(result.participants || '[]'),
                messageCount: result.messageCount,
                currentTopic: result.currentTopic,
                lastUpdated: result.lastUpdated
            };
        } catch (error: any) {
            this.logger.error(`[CONVO_DB_HELPER] Error getting conversation state: ${error.message}`);
            return null;
        }
    }

    /**
     * Store a conversation state
     * 
     * @param {string} groupId - Group ID
     * @param {Object} state - Conversation state
     * @returns {boolean} - True if successful
     */
    async storeConversationState(groupId: string, state: ConversationState): Promise<boolean> {
        if (!this.isInitialized) await this.initialize();

        try {
            const conversationId = `telegram-${groupId}`;
            const now = Date.now();

            // Ensure participants is serialized as JSON
            const participants = JSON.stringify(state.participants || []);

            await this.db.run(
                `INSERT INTO conversations 
         (id, groupId, status, lastMessageTimestamp, lastSpeakerId, participants, messageCount, currentTopic, lastUpdated) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           lastMessageTimestamp = excluded.lastMessageTimestamp,
           lastSpeakerId = excluded.lastSpeakerId,
           participants = excluded.participants,
           messageCount = excluded.messageCount,
           currentTopic = excluded.currentTopic,
           lastUpdated = excluded.lastUpdated`,
                [
                    conversationId,
                    groupId.toString(),
                    state.status || 'active',
                    state.lastMessageTimestamp || now,
                    state.lastSpeakerId || null,
                    participants,
                    state.messageCount || 0,
                    state.currentTopic || '',
                    state.lastUpdated || now
                ]
            );

            this.logger.debug(`[CONVO_DB_HELPER] Stored conversation state for group ${groupId}`);
            return true;
        } catch (error: any) {
            this.logger.error(`[CONVO_DB_HELPER] Error storing conversation state: ${error.message}`);
            return false;
        }
    }

    /**
     * Store a message
     * 
     * @param {string} groupId - Group ID
     * @param {string} userId - User ID
     * @param {string} text - Message text
     * @returns {boolean} - True if successful
     */
    async storeMessage(groupId: string, userId: string, text: string): Promise<boolean> {
        if (!this.isInitialized) await this.initialize();

        try {
            // Create messages table if it doesn't exist
            await this.db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          groupId TEXT NOT NULL,
          userId TEXT NOT NULL,
          text TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        )
      `);

            await this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_messages_groupId 
        ON messages(groupId)
      `);

            const messageId = `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

            await this.db.run(
                `INSERT INTO messages (id, groupId, userId, text, timestamp)
         VALUES (?, ?, ?, ?, ?)`,
                [messageId, groupId.toString(), userId, text, Date.now()]
            );

            this.logger.debug(`[CONVO_DB_HELPER] Stored message from ${userId} in group ${groupId}`);
            return true;
        } catch (error: any) {
            this.logger.error(`[CONVO_DB_HELPER] Error storing message: ${error.message}`);
            return false;
        }
    }

    /**
     * Get recent messages for a group
     * 
     * @param {string} groupId - Group ID
     * @param {number} limit - Maximum number of messages to return
     * @returns {Array} - Array of messages
     */
    async getRecentMessages(groupId: string, limit = 10): Promise<any[]> {
        if (!this.isInitialized) await this.initialize();

        try {
            // First ensure the table exists
            await this.db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          groupId TEXT NOT NULL,
          userId TEXT NOT NULL,
          text TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        )
      `);

            const messages = await this.db.all(
                `SELECT * FROM messages 
         WHERE groupId = ? 
         ORDER BY timestamp DESC 
         LIMIT ?`,
                [groupId.toString(), limit]
            );

            return messages;
        } catch (error: any) {
            this.logger.error(`[CONVO_DB_HELPER] Error getting recent messages: ${error.message}`);
            return [];
        }
    }

    /**
     * Close the database connection
     */
    async close(): Promise<void> {
        if (this.db) {
            try {
                await this.db.close();
                this.logger.info('[CONVO_DB_HELPER] Database connection closed');
            } catch (error: any) {
                this.logger.error(`[CONVO_DB_HELPER] Error closing database: ${error.message}`);
            }
        }
    }
}

/**
 * Factory function to get a ConversationDatabaseHelper instance
 * 
 * @param {string} dbPath - Database path
 * @param {ElizaLogger} logger - Logger instance
 * @returns {ConversationDatabaseHelper} - Database helper instance
 */
export const getConversationDatabase = async (
    dbPath?: string,
    logger?: ElizaLogger
): Promise<ConversationDatabaseHelper> => {
    const helper = new ConversationDatabaseHelper(dbPath, logger);
    await helper.initialize();
    return helper;
}; 