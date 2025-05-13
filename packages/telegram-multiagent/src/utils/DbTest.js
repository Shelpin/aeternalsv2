#!/usr/bin/env node

/**
 * Database Persistence Test Utility
 * 
 * This script tests whether conversation state is persisted properly
 * using direct database access rather than importing TypeScript modules.
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);

// Simple logger implementation
const logger = {
    info: (msg, ...args) => console.log(`[INFO] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[WARN] ${msg}`, ...args),
    error: (msg, ...args) => console.error(`[ERROR] ${msg}`, ...args),
    debug: (msg, ...args) => console.debug(`[DEBUG] ${msg}`, ...args),
};

/**
 * Test conversation state persistence
 * 
 * @param {string} groupId - Group ID to test
 * @param {string} agentId - Agent ID to use
 */
async function testPersistence(groupId, agentId) {
    logger.info('Starting persistence test...');

    // Find database path
    const dbPath = process.env.SQLITE_FILE ||
        process.env.DATABASE_PATH ||
        path.resolve(process.cwd(), './data/conversation.db');

    logger.info(`Using database at: ${dbPath}`);

    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        logger.info(`Created directory: ${dbDir}`);
    }

    // Load SQLite
    let Database;
    try {
        Database = require('better-sqlite3');
    } catch (err) {
        logger.error('Failed to load better-sqlite3:', err.message);
        logger.error('Try: npm install better-sqlite3');
        process.exit(1);
    }

    // Connect to database
    const db = new Database(dbPath);
    logger.info('Connected to database');

    // Create schema if needed
    try {
        db.exec(`
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
      );
      
      CREATE INDEX IF NOT EXISTS idx_conversations_groupId 
      ON conversations(groupId);
      
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        groupId TEXT NOT NULL,
        userId TEXT NOT NULL,
        text TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_messages_groupId 
      ON messages(groupId);
    `);
        logger.info('Schema created/verified');
    } catch (err) {
        logger.error('Error creating schema:', err.message);
        db.close();
        process.exit(1);
    }

    // Check for existing state
    const conversationId = `telegram-${groupId}`;
    const existingState = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);

    if (existingState) {
        // Parse participants
        let participants = [];
        try {
            participants = JSON.parse(existingState.participants || '[]');
        } catch (err) {
            participants = [];
        }

        logger.info('Found existing conversation state:');
        logger.info(`- Last speaker: ${existingState.lastSpeakerId}`);
        logger.info(`- Participants: ${participants.join(', ')}`);
        logger.info(`- Message count: ${existingState.messageCount}`);
        logger.info(`- Last updated: ${new Date(existingState.lastUpdated).toISOString()}`);
    } else {
        logger.info('No existing conversation state found. Creating new state...');

        // Create a new conversation state
        const now = Date.now();
        const participants = [agentId, 'test_user'];

        // Insert new conversation
        db.prepare(`
      INSERT INTO conversations 
      (id, groupId, status, lastMessageTimestamp, lastSpeakerId, participants, messageCount, currentTopic, lastUpdated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            conversationId,
            groupId.toString(),
            'active',
            now,
            'test_user',
            JSON.stringify(participants),
            1,
            '',
            now
        );

        logger.info('Created new conversation state:');
        logger.info(`- Last speaker: test_user`);
        logger.info(`- Participants: ${participants.join(', ')}`);

        // Insert test message
        const messageId = `msg-${now}-${Math.floor(Math.random() * 1000)}`;
        db.prepare(`
      INSERT INTO messages (id, groupId, userId, text, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(
            messageId,
            groupId.toString(),
            'test_user',
            'Test message for persistence',
            now
        );

        // Now record a message from the agent
        const agentMessageId = `msg-${now + 1000}-${Math.floor(Math.random() * 1000)}`;
        db.prepare(`
      INSERT INTO messages (id, groupId, userId, text, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `).run(
            agentMessageId,
            groupId.toString(),
            agentId,
            'Test response from agent',
            now + 1000
        );

        // Update conversation state to reflect agent as last speaker
        db.prepare(`
      UPDATE conversations
      SET lastSpeakerId = ?, lastMessageTimestamp = ?, messageCount = 2, lastUpdated = ?
      WHERE id = ?
    `).run(
            agentId,
            now + 1000,
            now + 1000,
            conversationId
        );

        // Get updated state
        const updatedState = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);

        if (updatedState) {
            logger.info('State after agent response:');
            logger.info(`- Last speaker: ${updatedState.lastSpeakerId}`);
            logger.info(`- Participants: ${participants.join(', ')}`);
        }

        logger.info('Persistence test completed. Restart the agent and run this test again to verify persistence.');
    }

    // Close database
    db.close();
}

// Run the test if executed directly
if (process.argv[1] === import.meta.url || (process.argv[1] && process.argv[1].endsWith('DbTest.js'))) {
    const groupId = process.argv[2] || 'test_group';
    const agentId = process.argv[3] || process.env.AGENT_ID || 'test_agent';

    testPersistence(groupId, agentId)
        .then(() => {
            logger.info('Test completed.');
            process.exit(0);
        })
        .catch(error => {
            logger.error('Test failed:', error);
            process.exit(1);
        });
}

export { testPersistence }; 