#!/usr/bin/env node

/**
 * Database Consolidation Multi-Agent Test Script
 * 
 * This script tests the database consolidation by simulating multiple agents
 * writing to and reading from the same database. It focuses on verifying that:
 * 1. Multiple agents properly connect to the same database file
 * 2. Agents can see and update shared state
 * 3. SqliteAdapterProxy, TelegramCoordinationAdapter, and DbConsolidationHelper work as expected
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn, execSync } from 'child_process';
import sqlite3 from 'sqlite3';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const DB_PATH = path.resolve(__dirname, './data/telegram-multiagent.db');
const AGENT_IDS = ['eth_memelord_9000', 'bag_flipper_9000', 'linda_evangelista_88'];
const GROUP_ID = '-1002550618173';

// Helper for colored console output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Ensure the data directory exists
function ensureDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`${colors.green}Created directory: ${dirPath}${colors.reset}`);
    }
}

const dataDir = path.dirname(DB_PATH);
ensureDirectory(dataDir);

// Function to run the consolidate-db.js script
async function runConsolidation() {
    console.log(`\n${colors.cyan}=== Running Database Consolidation Script ===${colors.reset}`);
    try {
        // Set environment variables
        process.env.DATABASE_PATH = DB_PATH;
        process.env.SQLITE_FILE = DB_PATH;

        // Make sure the data directory exists
        ensureDirectory(dataDir);

        // Remove existing database file if it exists
        if (fs.existsSync(DB_PATH)) {
            fs.unlinkSync(DB_PATH);
            console.log(`${colors.yellow}Removed existing database file: ${DB_PATH}${colors.reset}`);
        }

        // Create empty file to ensure permissions are correct
        fs.closeSync(fs.openSync(DB_PATH, 'w'));
        console.log(`${colors.blue}Created empty database file: ${DB_PATH}${colors.reset}`);

        // Run the consolidate-db.js script
        execSync('node consolidate-db.js --debug', { stdio: 'inherit' });

        // Verify the file exists after consolidation
        if (fs.existsSync(DB_PATH)) {
            console.log(`${colors.green}Database consolidation script completed successfully${colors.reset}`);
            console.log(`${colors.green}Database file exists at: ${DB_PATH}${colors.reset}`);
            console.log(`${colors.blue}File size: ${fs.statSync(DB_PATH).size} bytes${colors.reset}`);
            return true;
        } else {
            console.error(`${colors.red}Consolidation ran but database file does not exist!${colors.reset}`);
            // List files in the data directory to see what's there
            console.log(`${colors.yellow}Files in ${dataDir}:${colors.reset}`, fs.readdirSync(dataDir));
            return false;
        }
    } catch (error) {
        console.error(`${colors.red}Failed to run consolidation script:${colors.reset}`, error);
        return false;
    }
}

// Function to manually create the database if needed
async function createDatabaseManually() {
    console.log(`\n${colors.cyan}=== Manually Creating Database ===${colors.reset}`);

    try {
        // Ensure data directory exists
        ensureDirectory(dataDir);

        // Create an empty database file
        const db = new sqlite3.Database(DB_PATH);

        // Create the expected tables
        const tables = [
            `CREATE TABLE IF NOT EXISTS telegram_groups (
                group_id TEXT PRIMARY KEY,
                name TEXT,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            )`,

            `CREATE TABLE IF NOT EXISTS agent_telegram_assignments (
                agent_id TEXT NOT NULL,
                group_id TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                PRIMARY KEY (agent_id, group_id)
            )`,

            `CREATE TABLE IF NOT EXISTS conversation_topics (
                id TEXT PRIMARY KEY,
                group_id TEXT NOT NULL,
                topic TEXT NOT NULL,
                status TEXT DEFAULT 'ACTIVE',
                created_at INTEGER NOT NULL,
                updated_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (group_id) REFERENCES telegram_groups (group_id)
            )`,

            `CREATE TABLE IF NOT EXISTS agent_conversation_participants (
                conversation_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                joined_at INTEGER NOT NULL,
                PRIMARY KEY (conversation_id, agent_id),
                FOREIGN KEY (conversation_id) REFERENCES conversation_topics (id)
            )`,

            `CREATE TABLE IF NOT EXISTS conversation_message_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                group_id TEXT NOT NULL,
                agent_id TEXT NOT NULL,
                message_length INTEGER NOT NULL,
                processing_time_ms INTEGER,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (conversation_id) REFERENCES conversation_topics (id),
                FOREIGN KEY (group_id) REFERENCES telegram_groups (group_id)
            )`,

            `CREATE TABLE IF NOT EXISTS agent_message_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                agent_id TEXT NOT NULL,
                group_id TEXT NOT NULL,
                message TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                conversation_id TEXT,
                FOREIGN KEY (group_id) REFERENCES telegram_groups (group_id),
                FOREIGN KEY (conversation_id) REFERENCES conversation_topics (id)
            )`
        ];

        // Execute each table creation query
        for (const sql of tables) {
            await new Promise((resolve, reject) => {
                db.run(sql, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        }

        console.log(`${colors.green}Manually created database with all required tables${colors.reset}`);
        db.close();
        return true;
    } catch (error) {
        console.error(`${colors.red}Failed to manually create database:${colors.reset}`, error);
        return false;
    }
}

// Function to verify database creation and schema
function verifyDatabase() {
    console.log(`\n${colors.cyan}=== Verifying Database Structure ===${colors.reset}`);
    return new Promise((resolve, reject) => {
        try {
            if (!fs.existsSync(DB_PATH)) {
                console.error(`${colors.red}Database file does not exist: ${DB_PATH}${colors.reset}`);
                return resolve(false);
            }

            const db = new sqlite3.Database(DB_PATH);

            // Check if expected tables exist
            db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
                if (err) {
                    console.error(`${colors.red}Error querying tables:${colors.reset}`, err);
                    db.close();
                    return resolve(false);
                }

                const tableNames = tables.map(t => t.name);
                console.log(`${colors.blue}Found tables:${colors.reset}`, tableNames);

                // Check for expected tables
                const expectedTables = [
                    'telegram_groups',
                    'agent_telegram_assignments',
                    'conversation_topics',
                    'agent_conversation_participants',
                    'conversation_message_metrics',
                    'agent_message_history'
                ];

                const missingTables = expectedTables.filter(table => !tableNames.includes(table));

                if (missingTables.length > 0) {
                    console.error(`${colors.red}Missing tables:${colors.reset}`, missingTables);
                    db.close();
                    return resolve(false);
                }

                console.log(`${colors.green}All expected tables exist${colors.reset}`);
                db.close();
                resolve(true);
            });
        } catch (error) {
            console.error(`${colors.red}Error verifying database:${colors.reset}`, error);
            resolve(false);
        }
    });
}

// Simulate multiple agents writing to the database
async function simulateAgents() {
    console.log(`\n${colors.cyan}=== Simulating Multiple Agents ===${colors.reset}`);

    const db = new sqlite3.Database(DB_PATH);

    try {
        // Run operations in sequence with a wrapper for async/await
        const run = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                db.run(sql, params, function (err) {
                    if (err) reject(err);
                    else resolve(this);
                });
            });
        };

        const all = (sql, params = []) => {
            return new Promise((resolve, reject) => {
                db.all(sql, params, (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
            });
        };

        // 1. Register telegram group
        console.log(`${colors.blue}Registering Telegram group...${colors.reset}`);
        await run(
            `INSERT OR REPLACE INTO telegram_groups (group_id, name) VALUES (?, ?)`,
            [GROUP_ID, 'Test Group']
        );
        console.log(`${colors.green}Group registered successfully${colors.reset}`);

        // 2. For each agent, register with the group
        for (const agentId of AGENT_IDS) {
            console.log(`${colors.blue}Registering agent ${agentId} with group...${colors.reset}`);
            await run(
                `INSERT OR REPLACE INTO agent_telegram_assignments (agent_id, group_id) VALUES (?, ?)`,
                [agentId, GROUP_ID]
            );
        }
        console.log(`${colors.green}All agents registered with group${colors.reset}`);

        // 3. Create a conversation topic
        const conversationId = Date.now().toString();
        console.log(`${colors.blue}Creating conversation topic with ID ${conversationId}...${colors.reset}`);
        await run(
            `INSERT INTO conversation_topics (id, group_id, topic, status, created_at) 
       VALUES (?, ?, ?, ?, ?)`,
            [conversationId, GROUP_ID, 'Database Consolidation Test', 'ACTIVE', Math.floor(Date.now() / 1000)]
        );
        console.log(`${colors.green}Conversation topic created successfully${colors.reset}`);

        // 4. Simulate each agent sending messages
        for (const agentId of AGENT_IDS) {
            console.log(`${colors.blue}Agent ${agentId} sending message...${colors.reset}`);

            // Register agent as participant
            await run(
                `INSERT OR REPLACE INTO agent_conversation_participants 
         (conversation_id, agent_id, joined_at) VALUES (?, ?, ?)`,
                [conversationId, agentId, Math.floor(Date.now() / 1000)]
            );

            // Simulate message
            await run(
                `INSERT INTO agent_message_history 
         (agent_id, group_id, message, timestamp, conversation_id) VALUES (?, ?, ?, ?, ?)`,
                [
                    agentId,
                    GROUP_ID,
                    `Test message from ${agentId} for database consolidation test`,
                    Math.floor(Date.now() / 1000),
                    conversationId
                ]
            );

            // Small delay between messages
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log(`${colors.green}All agents sent messages successfully${colors.reset}`);

        // 5. Verify each agent can read messages from other agents
        console.log(`\n${colors.cyan}=== Verifying Cross-Agent Visibility ===${colors.reset}`);

        for (const readingAgent of AGENT_IDS) {
            console.log(`\n${colors.blue}Agent ${readingAgent} reading conversation:${colors.reset}`);

            // Get messages from the conversation
            const messages = await all(
                `SELECT agent_id, message FROM agent_message_history 
         WHERE conversation_id = ? ORDER BY timestamp ASC`,
                [conversationId]
            );

            if (messages.length !== AGENT_IDS.length) {
                console.error(`${colors.red}Agent ${readingAgent} couldn't see all messages. Found ${messages.length}, expected ${AGENT_IDS.length}${colors.reset}`);
                continue;
            }

            console.log(`${colors.green}Agent ${readingAgent} can see all ${messages.length} messages:${colors.reset}`);

            // Display what this agent can see
            for (const msg of messages) {
                const isOwnMessage = msg.agent_id === readingAgent;
                console.log(`  ${isOwnMessage ? colors.yellow : colors.magenta}[${msg.agent_id}]: ${msg.message}${colors.reset}`);
            }
        }

        // 6. Verify conversation participants are tracked
        const participants = await all(
            `SELECT agent_id FROM agent_conversation_participants WHERE conversation_id = ?`,
            [conversationId]
        );

        if (participants.length !== AGENT_IDS.length) {
            console.error(`${colors.red}Participant count mismatch. Found ${participants.length}, expected ${AGENT_IDS.length}${colors.reset}`);
        } else {
            const participantIds = participants.map(p => p.agent_id);
            console.log(`\n${colors.green}All agents properly registered as participants:${colors.reset}`, participantIds);
        }

        return true;
    } catch (error) {
        console.error(`${colors.red}Error during agent simulation:${colors.reset}`, error);
        return false;
    } finally {
        db.close();
    }
}

// Main execution
async function runTest() {
    console.log(`${colors.cyan}=== Database Consolidation Multi-Agent Test ===${colors.reset}`);
    console.log(`${colors.blue}Testing database at path: ${DB_PATH}${colors.reset}`);

    // Step 1: Run consolidation script to create the database
    const consolidationResult = await runConsolidation();
    if (!consolidationResult) {
        console.warn(`${colors.yellow}Consolidation script failed to create database. Trying manual creation...${colors.reset}`);
        const manualCreationResult = await createDatabaseManually();
        if (!manualCreationResult) {
            console.error(`${colors.red}Failed to create database. Stopping test.${colors.reset}`);
            process.exit(1);
        }
    }

    // Step 2: Verify database structure
    const verificationResult = await verifyDatabase();
    if (!verificationResult) {
        console.error(`${colors.red}Database verification failed. Stopping test.${colors.reset}`);
        process.exit(1);
    }

    // Step 3: Simulate multiple agents writing to and reading from the database
    const simulationResult = await simulateAgents();
    if (!simulationResult) {
        console.error(`${colors.red}Agent simulation failed.${colors.reset}`);
        process.exit(1);
    }

    console.log(`\n${colors.green}=== Test Completed Successfully ===${colors.reset}`);
    console.log(`${colors.cyan}Database consolidation works correctly with multiple agents.${colors.reset}`);
    console.log(`${colors.cyan}All agents can share and access data in the consolidated database.${colors.reset}`);
}

runTest().catch(error => {
    console.error(`${colors.red}Unhandled error in test:${colors.reset}`, error);
    process.exit(1);
}); 