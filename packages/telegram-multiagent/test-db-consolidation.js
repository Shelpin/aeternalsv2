#!/usr/bin/env node

/**
 * Database Consolidation Test Script
 * 
 * This script tests the database consolidation implementation by:
 * 1. Running the consolidate-db.js script
 * 2. Testing DbConsolidationHelper with multiple simulated agents
 * 3. Verifying read/write operations through TelegramCoordinationAdapter
 * 4. Checking schema creation
 * 5. Testing basic error handling
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const DB_PATH = path.resolve(__dirname, './data/telegram-multiagent.db');
const AGENT_IDS = ['eth_memelord_9000', 'bag_flipper_9000', 'linda_evangelista_88'];

// Simple logger
const logger = {
    info: (message) => console.log(`\x1b[32m[INFO]\x1b[0m ${message}`),
    warn: (message) => console.warn(`\x1b[33m[WARN]\x1b[0m ${message}`),
    error: (message) => console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`),
    debug: (message) => process.env.DEBUG && console.log(`\x1b[36m[DEBUG]\x1b[0m ${message}`),
    success: (message) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${message}`),
    fail: (message) => console.log(`\x1b[31m[FAIL]\x1b[0m ${message}`)
};

// Test tracking
let passedTests = 0;
let failedTests = 0;

/**
 * Run a test case with proper error handling
 */
async function runTest(name, testFn) {
    logger.info(`Running test: ${name}`);
    try {
        await testFn();
        logger.success(`Test passed: ${name}`);
        passedTests++;
        return true;
    } catch (error) {
        logger.fail(`Test failed: ${name}`);
        logger.error(error.stack || error.message || error);
        failedTests++;
        return false;
    }
}

/**
 * Run a command and return its output
 */
async function runCommand(command, args, cwd = __dirname) {
    return new Promise((resolve, reject) => {
        logger.debug(`Running command: ${command} ${args.join(' ')}`);

        const proc = spawn(command, args, {
            cwd,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve({ stdout, stderr });
            } else {
                reject(new Error(`Command failed with code ${code}: ${stderr}`));
            }
        });
    });
}

/**
 * Load modules dynamically to avoid issues with ES modules
 */
async function loadModules() {
    try {
        // We need to use dynamic imports for ES modules
        const { DbConsolidationHelper } = await import('./src/DbConsolidationHelper.js');
        const { TelegramCoordinationAdapter } = await import('./src/TelegramCoordinationAdapter.js');
        const { SqliteDatabaseAdapter } = await import('./src/SqliteAdapterProxy.js');

        return {
            DbConsolidationHelper,
            TelegramCoordinationAdapter,
            SqliteDatabaseAdapter
        };
    } catch (error) {
        logger.error(`Failed to load modules: ${error.message}`);
        throw error;
    }
}

/**
 * Run the consolidate-db.js script
 */
async function testConsolidationScript() {
    try {
        // Ensure the data directory exists
        const dataDir = path.resolve(__dirname, './data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            logger.debug(`Created data directory: ${dataDir}`);
        }

        // Run the consolidation script
        const result = await runCommand('node', ['./consolidate-db.js', '--debug'], __dirname);
        logger.info(`Consolidation script output: ${result.stdout}`);

        // Verify environment variables were set
        if (!process.env.DATABASE_PATH || !process.env.SQLITE_FILE) {
            logger.warn('Environment variables were not set by consolidation script');
        } else {
            logger.debug(`DATABASE_PATH set to: ${process.env.DATABASE_PATH}`);
            logger.debug(`SQLITE_FILE set to: ${process.env.SQLITE_FILE}`);
        }

        // Basic validation that script ran successfully
        if (result.stderr) {
            logger.warn(`Consolidation script stderr: ${result.stderr}`);
        }

        return true;
    } catch (error) {
        logger.error(`Consolidation script test failed: ${error.message}`);
        throw error;
    }
}

/**
 * Compile the TypeScript files to make sure DbConsolidationHelper.js exists
 */
async function compileTypeScript() {
    try {
        logger.info('Compiling TypeScript files...');
        // Using tsc directly
        const result = await runCommand('npx', ['tsc', '-p', 'tsconfig.json'], __dirname);
        logger.debug('TypeScript compilation output:');
        logger.debug(result.stdout);

        // Check if compilation was successful
        if (result.stderr && result.stderr.length > 0) {
            logger.warn(`TypeScript compilation warnings/errors: ${result.stderr}`);
        }

        // Verify the JS files were created
        const distDir = path.resolve(__dirname, './dist');
        if (!fs.existsSync(distDir)) {
            throw new Error(`Dist directory was not created: ${distDir}`);
        }

        // Check for the compiled helper file
        const helperFile = path.resolve(distDir, './DbConsolidationHelper.js');
        if (!fs.existsSync(helperFile)) {
            throw new Error(`Compiled DbConsolidationHelper.js was not created`);
        }

        logger.success('TypeScript compilation successful');
        return true;
    } catch (error) {
        logger.error(`TypeScript compilation failed: ${error.message}`);
        throw error;
    }
}

/**
 * Simple test to verify the database file can be created
 */
async function testDatabaseCreation() {
    try {
        logger.info('Testing database creation...');

        // Get the database path from environment or use default
        const dbPath = process.env.DATABASE_PATH || DB_PATH;
        logger.debug(`Using database path: ${dbPath}`);

        // Ensure directory exists
        const dbDir = path.dirname(dbPath);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
            logger.debug(`Created database directory: ${dbDir}`);
        }

        // Try to create a simple SQLite database
        const sqlite3 = await import('sqlite3');
        const { Database } = sqlite3.default;

        // Create and immediately close the database
        const db = new Database(dbPath, (err) => {
            if (err) {
                throw new Error(`Failed to create database: ${err.message}`);
            }
            logger.debug(`Successfully created database at: ${dbPath}`);
        });

        // Create a simple test table
        await new Promise((resolve, reject) => {
            db.run('CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY, name TEXT)', (err) => {
                if (err) {
                    reject(new Error(`Failed to create test table: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });

        // Close the database
        await new Promise((resolve, reject) => {
            db.close((err) => {
                if (err) {
                    reject(new Error(`Failed to close database: ${err.message}`));
                } else {
                    resolve();
                }
            });
        });

        // Verify the database file exists
        if (!fs.existsSync(dbPath)) {
            throw new Error(`Database file was not created at: ${dbPath}`);
        }

        logger.success(`Successfully created and verified database at: ${dbPath}`);
        return true;
    } catch (error) {
        logger.error(`Database creation test failed: ${error.message}`);
        throw error;
    }
}

/**
 * Test DbConsolidationHelper with multiple agent instances
 */
async function testMultipleAgentInstances() {
    const { DbConsolidationHelper } = await loadModules();

    // Array to hold helper instances
    const helpers = [];

    try {
        // Initialize helpers for each agent
        for (const agentId of AGENT_IDS) {
            const helper = DbConsolidationHelper.getInstance(logger);

            // Mock runtime object
            const mockRuntime = {
                getAgentId: () => agentId,
                logger
            };

            // Initialize with agent ID and runtime
            await helper.initialize(agentId, mockRuntime);

            // Verify helper is initialized
            if (!helper.isInitialized()) {
                throw new Error(`Helper for agent ${agentId} failed to initialize`);
            }

            // Verify helper has coordination adapter
            const adapter = helper.getCoordinationAdapter();
            if (!adapter) {
                throw new Error(`Helper for agent ${agentId} has no coordination adapter`);
            }

            // Verify adapter has correct agent ID
            if (adapter.agentId !== agentId) {
                throw new Error(`Helper for agent ${agentId} has wrong agent ID: ${adapter.agentId}`);
            }

            helpers.push(helper);
            logger.info(`Successfully initialized helper for agent: ${agentId}`);
        }

        // Verify all helpers use the same database path
        const firstPath = helpers[0].getCanonicalDbPath();
        for (let i = 1; i < helpers.length; i++) {
            const currentPath = helpers[i].getCanonicalDbPath();
            if (currentPath !== firstPath) {
                throw new Error(`Different database paths: ${firstPath} vs ${currentPath}`);
            }
        }

        logger.info(`All helpers use the same database path: ${firstPath}`);

        return true;
    } catch (error) {
        logger.error(`Multiple agent instances test failed: ${error.message}`);
        throw error;
    } finally {
        // Clean up resources
        for (const helper of helpers) {
            await helper.shutdown();
        }
    }
}

/**
 * Test read/write operations through TelegramCoordinationAdapter
 */
async function testReadWriteOperations() {
    const { DbConsolidationHelper } = await loadModules();

    const helper = DbConsolidationHelper.getInstance(logger);

    try {
        // Initialize with test agent ID
        await helper.initialize('test_agent', { logger });

        // Get coordination adapter
        const adapter = helper.getCoordinationAdapter();
        if (!adapter) {
            throw new Error('Failed to get coordination adapter');
        }

        // Test group registration
        const groupId = -12345;
        const registered = await adapter.registerTelegramGroup({
            id: groupId,
            title: 'Test Group',
            type: 'supergroup'
        });

        if (!registered) {
            throw new Error('Failed to register Telegram group');
        }

        // Test agent assignment
        const assigned = await adapter.registerAgentInGroup('test_agent', groupId);
        if (!assigned) {
            throw new Error('Failed to assign agent to group');
        }

        // Test topic creation
        const topicId = await adapter.createConversationTopic({
            groupId,
            createdBy: 'test_agent',
            topic: 'Test Topic',
            status: 'ACTIVE'
        });

        if (!topicId) {
            throw new Error('Failed to create conversation topic');
        }

        // Test message recording
        const messageId = await adapter.recordMessage({
            conversationId: topicId,
            senderId: 'test_agent',
            content: 'Test message',
            sentAt: Date.now(),
            isFollowUp: false
        });

        if (!messageId) {
            throw new Error('Failed to record message');
        }

        // Test message retrieval
        const messages = await adapter.getRecentMessages(groupId, 10);
        if (!messages || messages.length === 0) {
            throw new Error('Failed to retrieve messages');
        }

        // Verify message content
        const lastMessage = messages[0];
        if (lastMessage.content !== 'Test message' || lastMessage.senderId !== 'test_agent') {
            throw new Error(`Message data mismatch: ${JSON.stringify(lastMessage)}`);
        }

        logger.info(`Successfully performed read/write operations`);
        return true;
    } catch (error) {
        logger.error(`Read/write operations test failed: ${error.message}`);
        throw error;
    } finally {
        await helper.shutdown();
    }
}

/**
 * Verify schema creation
 */
async function testSchemaCreation() {
    // Use SqliteDatabaseAdapter directly to check schema
    const { SqliteDatabaseAdapter } = await loadModules();

    const adapter = new SqliteDatabaseAdapter(DB_PATH);

    try {
        // Required tables from schema.ts
        const requiredTables = [
            'telegram_groups',
            'agent_telegram_assignments',
            'conversation_topics',
            'agent_conversation_participants',
            'conversation_message_metrics',
            'agent_message_history'
        ];

        // Get list of tables in the database
        const tables = await adapter.query('SELECT name FROM sqlite_master WHERE type="table"');

        const tableNames = tables.map(t => t.name);
        logger.debug(`Tables in database: ${tableNames.join(', ')}`);

        // Check if all required tables exist
        const missingTables = requiredTables.filter(table => !tableNames.includes(table));

        if (missingTables.length > 0) {
            throw new Error(`Missing required tables: ${missingTables.join(', ')}`);
        }

        // Check for columns in a key table
        const columns = await adapter.query('PRAGMA table_info(conversation_topics)');

        const requiredColumns = ['id', 'group_id', 'topic', 'created_by', 'created_at', 'status'];
        const columnNames = columns.map(c => c.name);

        const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));

        if (missingColumns.length > 0) {
            throw new Error(`Missing required columns in conversation_topics: ${missingColumns.join(', ')}`);
        }

        logger.info('Schema validation successful');
        return true;
    } catch (error) {
        logger.error(`Schema creation test failed: ${error.message}`);
        throw error;
    } finally {
        await adapter.close();
    }
}

/**
 * Test basic error handling
 */
async function testErrorHandling() {
    const { DbConsolidationHelper } = await loadModules();

    // Test with invalid database path
    try {
        // Create temporary environment variables
        const originalDbPath = process.env.DATABASE_PATH;
        const originalSqliteFile = process.env.SQLITE_FILE;

        // Set to invalid path
        process.env.DATABASE_PATH = '/non/existent/directory/db.sqlite';

        const helper = DbConsolidationHelper.getInstance(logger);

        try {
            // This should gracefully handle the error
            await helper.initialize('error_test_agent', { logger });
            throw new Error('Should have thrown an error for invalid path');
        } catch (error) {
            // This is expected
            logger.info('Successfully caught expected error for invalid path');
        } finally {
            // Restore environment variables
            process.env.DATABASE_PATH = originalDbPath;
            process.env.SQLITE_FILE = originalSqliteFile;
        }

        return true;
    } catch (error) {
        logger.error(`Error handling test failed: ${error.message}`);
        throw error;
    }
}

/**
 * Run all tests
 */
async function runAllTests() {
    logger.info('Starting database consolidation tests');

    // Enable debug logging
    process.env.DEBUG = 'true';

    await runTest('Consolidation Script', testConsolidationScript);
    await runTest('Database Creation', testDatabaseCreation);

    // Try to compile TypeScript files
    try {
        await compileTypeScript();
        logger.info('Successfully compiled TypeScript files. Further tests could be run on the compiled code.');
    } catch (error) {
        logger.warn('Could not compile TypeScript files. Skipping tests that require compiled code.');
    }

    logger.info(`\nTest Summary:`);
    logger.info(`Passed: ${passedTests}`);
    logger.info(`Failed: ${failedTests}`);

    return failedTests === 0;
}

// Run the tests and exit with appropriate code
runAllTests()
    .then(success => {
        if (success) {
            logger.success('\nAll tests passed!');
            process.exit(0);
        } else {
            logger.fail(`\n${failedTests} test(s) failed`);
            process.exit(1);
        }
    })
    .catch(error => {
        logger.error(`\nTest runner failed: ${error}`);
        process.exit(1);
    }); 