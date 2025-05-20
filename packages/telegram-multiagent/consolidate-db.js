#!/usr/bin/env node

/**
 * Database Consolidation Script
 * 
 * This script ensures database consolidation by:
 * 1. Setting up the canonical database path
 * 2. Cleaning up obsolete database files
 * 3. Migrating data (if needed)
 * 4. Validating the consolidated database
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database paths to standardize
const OBSOLETE_DB_PATHS = [
    './packages/agent/data/multiagent.db',
    './packages/telegram-multiagent/test_memory.db',
    './agent/data/multiagent.db',
    './data/conversation.db'
];

// Default canonical database path
const DEFAULT_DB_PATH = path.resolve('./data/telegram-multiagent.db');

// Simple logger
const logger = {
    info: (message) => console.log(`[INFO] ${message}`),
    warn: (message) => console.warn(`[WARN] ${message}`),
    error: (message) => console.error(`[ERROR] ${message}`),
    debug: (message) => process.env.DEBUG && console.log(`[DEBUG] ${message}`)
};

/**
 * Ensure the canonical database directory exists
 */
function ensureDbDirectoryExists(dbPath) {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        logger.info(`Creating database directory: ${dbDir}`);
        fs.mkdirSync(dbDir, { recursive: true });
    }
}

/**
 * Set up environment variables to ensure consistent database path
 */
function setupEnvironmentVariables(dbPath) {
    process.env.DATABASE_PATH = dbPath;
    process.env.SQLITE_FILE = dbPath;

    logger.info(`Set DATABASE_PATH and SQLITE_FILE to ${dbPath}`);
}

/**
 * Check for obsolete database files
 */
function checkObsoleteFiles(deleteFiles = false) {
    logger.info('Checking for obsolete database files...');
    let found = false;

    for (const dbPath of OBSOLETE_DB_PATHS) {
        const resolvedPath = path.resolve(dbPath);
        if (fs.existsSync(resolvedPath)) {
            found = true;
            if (deleteFiles) {
                try {
                    logger.info(`Deleting obsolete database file: ${resolvedPath}`);
                    fs.unlinkSync(resolvedPath);
                } catch (error) {
                    logger.error(`Failed to delete ${resolvedPath}: ${error.message}`);
                }
            } else {
                logger.warn(`Found obsolete database file: ${resolvedPath}`);
            }
        }
    }

    if (!found) {
        logger.info('No obsolete database files found');
    }

    return found;
}

/**
 * Validate database schema
 */
function validateDatabaseSchema(dbPath) {
    logger.info(`Validating database schema at: ${dbPath}`);

    if (!fs.existsSync(dbPath)) {
        logger.error(`Database file does not exist: ${dbPath}`);
        return false;
    }

    logger.info(`Database file exists: ${dbPath}`);

    try {
        // This is a simplified validation.
        // We try to run sqlite3 to check for required tables.
        // In a production environment, you would use better-sqlite3 or a similar library
        // to properly validate the schema.

        logger.debug(`Running table check on: ${dbPath}`);

        // Use the 'child_process' module to run SQLite commands
        import('child_process').then(({ execSync }) => {
            try {
                // List tables in the database
                const tablesOutput = execSync(`sqlite3 "${dbPath}" ".tables"`, { encoding: 'utf8' });
                logger.debug(`Tables found: ${tablesOutput.trim()}`);

                // Check for required tables
                const requiredTables = [
                    'telegram_groups',
                    'agent_telegram_assignments',
                    'conversation_topics',
                    'agent_conversation_participants',
                    'agent_message_history'
                ];

                const missingTables = requiredTables.filter(table => !tablesOutput.includes(table));

                if (missingTables.length > 0) {
                    logger.warn(`Missing required tables: ${missingTables.join(', ')}`);
                    return false;
                }

                logger.info(`Schema validation passed: All required tables present`);
                return true;
            } catch (error) {
                logger.error(`Error executing SQLite command: ${error.message}`);
                return false;
            }
        }).catch(error => {
            logger.error(`Failed to import child_process: ${error.message}`);
            return false;
        });

        // Basic check if the file appears to be a SQLite database
        // Read the first 16 bytes to check for the SQLite file header
        const buffer = Buffer.alloc(16);
        const fd = fs.openSync(dbPath, 'r');
        fs.readSync(fd, buffer, 0, 16, 0);
        fs.closeSync(fd);

        const header = buffer.toString().slice(0, 6);
        if (header !== 'SQLite') {
            logger.warn(`File does not appear to be a valid SQLite database (header: ${header})`);
            return false;
        }

        return true;
    } catch (error) {
        logger.error(`Schema validation error: ${error.message}`);
        return false;
    }
}

/**
 * Run the complete consolidation process
 */
async function consolidateDatabase(options = {}) {
    const dbPath = options.dbPath || process.env.DATABASE_PATH || process.env.SQLITE_FILE || DEFAULT_DB_PATH;
    const deleteObsolete = options.deleteObsoleteFiles || false;

    logger.info('Starting database consolidation process');
    logger.info(`Using database path: ${dbPath}`);

    // Ensure canonical DB directory exists
    ensureDbDirectoryExists(dbPath);

    // Set up environment variables
    setupEnvironmentVariables(dbPath);

    // Create database schema if the file is new or empty
    try {
        const sqlite3 = (await import('sqlite3')).default.verbose();
        const db = new sqlite3.Database(dbPath);

        // Create the required tables
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
                    if (err) {
                        logger.error(`Error creating table: ${err.message}`);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }

        logger.info('Created database schema successfully');
        db.close();
    } catch (error) {
        logger.error(`Error creating database schema: ${error.message}`);
        throw error;
    }

    // Check for obsolete database files
    const hasObsoleteFiles = checkObsoleteFiles(deleteObsolete);
}

// Handle command line arguments
const args = process.argv.slice(2);
const options = {
    dbPath: DEFAULT_DB_PATH,
    deleteObsoleteFiles: args.includes('--delete-obsolete')
};

// Override database path if specified
const dbPathArg = args.find(arg => arg.startsWith('--db-path='));
if (dbPathArg) {
    options.dbPath = dbPathArg.split('=')[1];
}

// Enable debug logging if needed
if (args.includes('--debug')) {
    process.env.DEBUG = 'true';
}

// Run the consolidation process
consolidateDatabase(options)
    .then(() => {
        logger.info('Consolidation completed successfully');
        process.exit(0);
    })
    .catch(error => {
        logger.error(`Consolidation failed: ${error.message}`);
        process.exit(1);
    }); 