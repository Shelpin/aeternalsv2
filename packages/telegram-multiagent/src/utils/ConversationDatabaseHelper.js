/**
 * ConversationDatabaseHelper
 * 
 * Helper class for direct SQLite interactions for conversation state
 * to be used when memoryManager persistence is unavailable.
 */

import { ElizaLogger } from '../types.js';
import fs from 'fs';
import path from 'path';

// This will be dynamically imported at runtime
// import { Database } from 'better-sqlite3';

export class ConversationDatabaseHelper {
    constructor(dbPath, logger) {
        this.dbPath = dbPath || './data/multiagent.db'; // Using shared database by default
        this.logger = logger || {
            info: (msg) => console.log(`[SQLHelper] ${msg}`),
            warn: (msg) => console.warn(`[SQLHelper] ${msg}`),
            error: (msg) => console.error(`[SQLHelper] ${msg}`),
            debug: (msg) => console.debug(`[SQLHelper] ${msg}`)
        };
        this.db = null;
        this.isInitialized = false;

        if (this.logger && this.logger.info) {
            this.logger.info(`[SHARED_DB] ConversationDatabaseHelper using SHARED database at: ${this.dbPath}`);
        }
    }

    /**
     * Initialize the database
     */
    async initialize() {
        try {
            this.logger.info(`[CONVO_DB_HELPER] Initializing with database path: ${this.dbPath}`);

            // Ensure directory exists
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                this.logger.info(`[CONVO_DB_HELPER] Created directory: ${dir}`);
            }

            // Try better-sqlite3 first
            try {
                const BetterSQLite3Module = await import('better-sqlite3');
                const BetterSQLite3 = BetterSQLite3Module.default || BetterSQLite3Module;

                this.db = new BetterSQLite3(this.dbPath);
                this.logger.info(`Connected to SQLite database: ${this.dbPath}`);

                // Create Promise-based wrappers while preserving context
                const originalDb = this.db;

                this.db = {
                    run: async (sql, params = []) => {
                        try {
                            const stmt = originalDb.prepare(sql);
                            const result = Array.isArray(params) ? stmt.run(...params) : stmt.run(params);
                            return {
                                lastID: result.lastInsertRowid,
                                changes: result.changes
                            };
                        } catch (err) {
                            this.logger.error(`[CONVO_DB_HELPER] Error in run: ${err.message} SQL: ${sql}`);
                            throw err;
                        }
                    },

                    get: async (sql, params = []) => {
                        try {
                            const stmt = originalDb.prepare(sql);
                            return Array.isArray(params) ? stmt.get(...params) : stmt.get(params);
                        } catch (err) {
                            this.logger.error(`[CONVO_DB_HELPER] Error in get: ${err.message}`);
                            throw err;
                        }
                    },

                    all: async (sql, params = []) => {
                        try {
                            const stmt = originalDb.prepare(sql);
                            return Array.isArray(params) ? stmt.all(...params) : stmt.all(params);
                        } catch (err) {
                            this.logger.error(`[CONVO_DB_HELPER] Error in all: ${err.message}`);
                            throw err;
                        }
                    },

                    close: async () => {
                        try {
                            originalDb.close();
                            return true;
                        } catch (err) {
                            this.logger.error(`[CONVO_DB_HELPER] Error closing database: ${err.message}`);
                            throw err;
                        }
                    },

                    // Preserve original for internal use
                    _originalDb: originalDb
                };
            } catch (betterErr) {
                this.logger.warn(`[CONVO_DB_HELPER] Failed to load better-sqlite3, falling back to sqlite3: ${betterErr.message}`);

                // Fall back to sqlite3
                try {
                    // Use dynamic import for ESM compatibility
                    const sqlite3Module = await import('sqlite3');
                    const sqlite3 = sqlite3Module.default || sqlite3Module;
                    const Database = sqlite3.verbose().Database;

                    // Create database with Promise wrapper
                    const originalDb = await new Promise((resolve, reject) => {
                        const db = new Database(this.dbPath, (err) => {
                            if (err) reject(err);
                            else resolve(db);
                        });
                    });

                    this.logger.info(`Connected to SQLite database: ${this.dbPath}`);

                    // Create Promise-based wrappers
                    this.db = {
                        run: (sql, params = []) => {
                            return new Promise((resolve, reject) => {
                                originalDb.run(sql, params, function (err) {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve({
                                            lastID: this.lastID,
                                            changes: this.changes
                                        });
                                    }
                                });
                            });
                        },

                        get: (sql, params = []) => {
                            return new Promise((resolve, reject) => {
                                originalDb.get(sql, params, (err, row) => {
                                    if (err) reject(err);
                                    else resolve(row);
                                });
                            });
                        },

                        all: (sql, params = []) => {
                            return new Promise((resolve, reject) => {
                                originalDb.all(sql, params, (err, rows) => {
                                    if (err) reject(err);
                                    else resolve(rows);
                                });
                            });
                        },

                        close: () => {
                            return new Promise((resolve, reject) => {
                                originalDb.close((err) => {
                                    if (err) reject(err);
                                    else resolve();
                                });
                            });
                        },

                        // Preserve original for internal use
                        _originalDb: originalDb
                    };
                } catch (sqliteErr) {
                    this.logger.error(`[CONVO_DB_HELPER] Failed to load any SQLite implementation: ${sqliteErr.message}`);
                    throw new Error(`Cannot load any SQLite implementation: ${sqliteErr.message}`);
                }
            }

            // Create schema
            await this.ensureSchema();
            this.isInitialized = true;
            this.logger.info('[CONVO_DB_HELPER] Database initialized successfully');
            return true;
        } catch (error) {
            this.logger.error(`[CONVO_DB_HELPER] Error initializing database: ${error.message}`);
            throw error;
        }
    }

    /**
     * Ensure the necessary schema exists
     */
    async ensureSchema() {
        try {
            // Create conversations table
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
                    lastUpdated INTEGER,
                    cooldownUntil INTEGER
                )
            `);

            // Create index on groupId
            await this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_conversations_groupId 
                ON conversations(groupId)
            `);

            // Create messages table
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    groupId TEXT NOT NULL,
                    userId TEXT NOT NULL,
                    text TEXT NOT NULL,
                    timestamp INTEGER NOT NULL
                )
            `);

            // Create index on groupId for messages
            await this.db.run(`
                CREATE INDEX IF NOT EXISTS idx_messages_groupId 
                ON messages(groupId)
            `);

            this.logger.info('[CONVO_DB_HELPER] Schema created/verified successfully');
        } catch (error) {
            this.logger.error(`[CONVO_DB_HELPER] Error ensuring schema: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get conversation state by group ID
     * @param {string} groupId 
     * @returns {Promise<object|null>}
     */
    async getConversationState(groupId) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const row = await this.db.get(
                'SELECT * FROM conversations WHERE groupId = ?',
                [groupId]
            );

            if (row) {
                // Parse JSON fields
                if (row.participants) {
                    try {
                        row.participants = JSON.parse(row.participants);
                    } catch (e) {
                        this.logger.warn(`[CONVO_DB_HELPER] Error parsing participants: ${e.message}`);
                        row.participants = [];
                    }
                } else {
                    row.participants = [];
                }

                return row;
            }

            return null;
        } catch (error) {
            this.logger.error(`[CONVO_DB_HELPER] Error getting conversation state: ${error.message}`);
            return null;
        }
    }

    /**
     * Save or update conversation state
     * @param {string} groupId 
     * @param {Object} state 
     * @returns {Promise<boolean>}
     */
    async saveConversationState(groupId, state) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Prepare data for insertion/update
            const id = state.id || `conv_${groupId}_${Date.now()}`;
            const lastMessageTimestamp = state.lastMessageTimestamp || Date.now();
            const lastSpeakerId = state.lastSpeakerId || null;
            const participants = JSON.stringify(state.participants || []);
            const messageCount = state.messageCount || 0;
            const currentTopic = state.currentTopic || '';
            const lastUpdated = Date.now();
            const cooldownUntil = state.cooldownUntil || 0;

            // Insert or update conversation
            await this.db.run(
                `INSERT OR REPLACE INTO conversations (
                    id, groupId, status, lastMessageTimestamp, lastSpeakerId, 
                    participants, messageCount, currentTopic, lastUpdated, cooldownUntil
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    id, groupId, 'active', lastMessageTimestamp, lastSpeakerId,
                    participants, messageCount, currentTopic, lastUpdated, cooldownUntil
                ]
            );

            return true;
        } catch (error) {
            this.logger.error(`[CONVO_DB_HELPER] Error saving conversation state: ${error.message}`);
            return false;
        }
    }

    /**
     * Update conversation cooldown
     * @param {string} groupId
     * @param {string} agentId
     * @param {number} cooldownMs
     * @returns {Promise<boolean>}
     */
    async updateCooldown(groupId, agentId, cooldownMs = 8000) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const cooldownUntil = Date.now() + cooldownMs;
            const state = await this.getConversationState(groupId);

            if (state) {
                // Update existing state with cooldown
                state.cooldownUntil = cooldownUntil;
                state.lastSpeakerId = agentId;
                return await this.saveConversationState(groupId, state);
            } else {
                // Create new state with cooldown
                const newState = {
                    status: 'active',
                    lastMessageTimestamp: Date.now(),
                    lastSpeakerId: agentId,
                    messageCount: 1,
                    participants: [agentId],
                    cooldownUntil: cooldownUntil,
                    currentTopic: '',
                    lastUpdated: Date.now()
                };
                return await this.saveConversationState(groupId, newState);
            }
        } catch (error) {
            this.logger.error(`[CONVO_DB_HELPER] Error updating cooldown: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if agent is in cooldown period
     * @param {string} groupId
     * @param {string} agentId
     * @returns {Promise<boolean>}
     */
    async isInCooldown(groupId, agentId) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const state = await this.getConversationState(groupId);
            if (!state || !state.cooldownUntil) {
                return false;
            }

            const now = Date.now();
            const isCurrentlyCooling = state.cooldownUntil > now;
            const isLastSpeaker = state.lastSpeakerId === agentId;

            // Only apply cooldown to the last speaker
            return isCurrentlyCooling && isLastSpeaker;
        } catch (error) {
            this.logger.error(`[CONVO_DB_HELPER] Error checking cooldown: ${error.message}`);
            return false; // Default to allowing response on error
        }
    }

    /**
     * Save a message
     * @param {string} groupId 
     * @param {string} userId 
     * @param {string} text 
     * @returns {Promise<boolean>}
     */
    async saveMessage(groupId, userId, text) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const id = `msg_${groupId}_${userId}_${Date.now()}`;
            const timestamp = Date.now();

            await this.db.run(
                `INSERT INTO messages (id, groupId, userId, text, timestamp) 
                 VALUES (?, ?, ?, ?, ?)`,
                [id, groupId, userId, text, timestamp]
            );

            return true;
        } catch (error) {
            this.logger.error(`[CONVO_DB_HELPER] Error saving message: ${error.message}`);
            return false;
        }
    }

    /**
     * Get recent messages for a group
     * @param {string} groupId 
     * @param {number} limit 
     * @returns {Promise<Array>}
     */
    async getRecentMessages(groupId, limit = 10) {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            const rows = await this.db.all(
                `SELECT * FROM messages 
                 WHERE groupId = ? 
                 ORDER BY timestamp DESC 
                 LIMIT ?`,
                [groupId, limit]
            );

            return rows;
        } catch (error) {
            this.logger.error(`[CONVO_DB_HELPER] Error getting recent messages: ${error.message}`);
            return [];
        }
    }

    /**
     * Close the database connection
     * @returns {Promise<boolean>}
     */
    async close() {
        try {
            if (this.db) {
                await this.db.close();
                this.isInitialized = false;
                this.logger.info('[CONVO_DB_HELPER] Database connection closed');
            }
            return true;
        } catch (error) {
            this.logger.error(`[CONVO_DB_HELPER] Error closing database: ${error.message}`);
            return false;
        }
    }
}

// Export a singleton instance to be shared across the application
let instance = null;

export const getConversationDatabase = async (dbPath, logger) => {
    if (!instance) {
        instance = new ConversationDatabaseHelper(dbPath, logger);
        await instance.initialize();
    }
    return instance;
}; 