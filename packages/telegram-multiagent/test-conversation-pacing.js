#!/usr/bin/env node

/**
 * Conversation Pacing Test Script
 * 
 * This script tests the conversation pacing implementation by:
 * 1. Simulating multiple agents sending messages in a shared group
 * 2. Checking global and per-agent cooldown functionality
 * 3. Verifying that ConversationManager properly applies cooldown periods
 * 4. Logging timing of message attempts and successes/failures
 */

import { ConversationManager } from './src/ConversationManager.js';
import { SqliteDatabaseAdapter } from './src/SqliteAdapterProxy.js';
import { TelegramCoordinationAdapter } from './src/TelegramCoordinationAdapter.js';
import path from 'path';
import fs from 'fs';

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

// Create a simple logger
const logger = {
    trace: (message, ...args) => console.log(`${colors.bright}[TRACE]${colors.reset} ${message}`, ...args),
    debug: (message, ...args) => console.log(`${colors.blue}[DEBUG]${colors.reset} ${message}`, ...args),
    info: (message, ...args) => console.log(`${colors.green}[INFO]${colors.reset} ${message}`, ...args),
    warn: (message, ...args) => console.log(`${colors.yellow}[WARN]${colors.reset} ${message}`, ...args),
    error: (message, ...args) => console.log(`${colors.red}[ERROR]${colors.reset} ${message}`, ...args)
};

// Test configuration
const TEST_GROUP_ID = '123456789';
const TEST_AGENTS = [
    { id: 'eth_memelord_9000', name: 'ETH Memelord' },
    { id: 'bag_flipper_9000', name: 'Bag Flipper' },
    { id: 'linda_evangelista_88', name: 'Linda' }
];
const TEST_DB_PATH = path.resolve('./data/test-conversation-pacing.db');

/**
 * Create test database directory if it doesn't exist
 */
function ensureDbDirectory() {
    const dbDir = path.dirname(TEST_DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
        logger.info(`Created database directory: ${dbDir}`);
    }

    // Remove existing test database if it exists
    if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
        logger.info(`Removed existing test database: ${TEST_DB_PATH}`);
    }
}

/**
 * Set up the test environment
 */
async function setupTest() {
    logger.info(`${colors.cyan}=== Setting up Conversation Pacing Test ====${colors.reset}`);

    // Ensure database directory exists
    ensureDbDirectory();

    // Create empty file to ensure permissions are correct
    fs.closeSync(fs.openSync(TEST_DB_PATH, 'w'));

    // Set environment variables
    process.env.DATABASE_PATH = TEST_DB_PATH;
    process.env.SQLITE_FILE = TEST_DB_PATH;

    // Create SQLite adapter
    const dbAdapter = new SqliteDatabaseAdapter(TEST_DB_PATH);
    logger.info(`SQLite adapter initialized with database path: ${TEST_DB_PATH}`);

    // Create dummy runtime
    const dummyRuntime = {
        getAgentId: () => 'test_agent',
        getLogger: () => logger
    };

    // Create coordination adapters for each agent
    const coordinationAdapters = {};
    for (const agent of TEST_AGENTS) {
        coordinationAdapters[agent.id] = new TelegramCoordinationAdapter(agent.id, dummyRuntime, logger, dbAdapter);
        await coordinationAdapters[agent.id].initialize();
        logger.info(`Created coordination adapter for agent ${agent.id}`);
    }

    // Create conversation managers for each agent
    const conversationManagers = {};
    for (const agent of TEST_AGENTS) {
        conversationManagers[agent.id] = new ConversationManager(logger, dummyRuntime);
        conversationManagers[agent.id].setCoordinationAdapter(coordinationAdapters[agent.id]);
        await conversationManagers[agent.id].initialize();
        logger.info(`Created conversation manager for agent ${agent.id}`);
    }

    return { conversationManagers, coordinationAdapters };
}

/**
 * Run the test
 */
async function runTest() {
    // Set up test environment
    const { conversationManagers } = await setupTest();

    logger.info(`${colors.cyan}=== Beginning Conversation Pacing Test ====${colors.reset}`);

    // Start with a human message
    logger.info(`Human sends message in group ${TEST_GROUP_ID}`);

    // First agent responds (should succeed)
    await attemptAgentResponse(conversationManagers, TEST_AGENTS[0], null);

    // Second agent tries immediately (should fail - global cooldown)
    await attemptAgentResponse(conversationManagers, TEST_AGENTS[1], TEST_AGENTS[0].id);

    // Wait 5 seconds (still in global cooldown)
    logger.info(`Waiting 5 seconds...`);
    await sleep(5000);

    // Try second agent again (should still fail - global cooldown not expired)
    await attemptAgentResponse(conversationManagers, TEST_AGENTS[1], TEST_AGENTS[0].id);

    // Wait 8 more seconds (global cooldown should expire)
    logger.info(`Waiting 8 more seconds...`);
    await sleep(8000);

    // Try second agent again (should succeed - global cooldown expired)
    await attemptAgentResponse(conversationManagers, TEST_AGENTS[1], TEST_AGENTS[0].id);

    // First agent tries again (should fail - per-agent cooldown)
    await attemptAgentResponse(conversationManagers, TEST_AGENTS[0], TEST_AGENTS[1].id);

    // Wait 13 seconds (global cooldown expired, agent cooldown still active)
    logger.info(`Waiting 13 seconds...`);
    await sleep(13000);

    // Third agent responds (should succeed - different agent, global cooldown expired)
    await attemptAgentResponse(conversationManagers, TEST_AGENTS[2], TEST_AGENTS[1].id);

    // First agent tries again (should still fail - per-agent cooldown not expired)
    await attemptAgentResponse(conversationManagers, TEST_AGENTS[0], TEST_AGENTS[2].id);

    // Wait 10 more seconds
    logger.info(`Waiting 10 more seconds...`);
    await sleep(10000);

    // First agent tries again (should succeed - per-agent cooldown finally expired)
    await attemptAgentResponse(conversationManagers, TEST_AGENTS[0], TEST_AGENTS[2].id);

    logger.info(`${colors.cyan}=== Conversation Pacing Test Complete ====${colors.reset}`);
}

/**
 * Attempt to have an agent respond to a message
 */
async function attemptAgentResponse(conversationManagers, agent, fromAgentId) {
    const startTime = Date.now();
    logger.info(`${colors.bright}${agent.name}${colors.reset} (${agent.id}) attempting to respond to ${fromAgentId || 'human'} in group ${TEST_GROUP_ID}...`);

    // Check if agent should respond
    const shouldRespond = await conversationManagers[agent.id].shouldAgentRespond(
        TEST_GROUP_ID,
        agent.id,
        fromAgentId,
        'Test message content'
    );

    if (shouldRespond) {
        logger.info(`${colors.green}✓ ${agent.name} ${colors.reset}(${agent.id}) ${colors.green}IS allowed to respond${colors.reset}`);

        // Record the message
        const state = await conversationManagers[agent.id].recordMessage(
            TEST_GROUP_ID,
            agent.id,
            `This is a test message from ${agent.name}`
        );

        logger.info(`${colors.green}✓ ${agent.name} recorded message successfully${colors.reset}`);
        logger.debug(`Updated conversation state: ${JSON.stringify(state)}`);
    } else {
        logger.info(`${colors.red}✗ ${agent.name} ${colors.reset}(${agent.id}) ${colors.red}is NOT allowed to respond${colors.reset} (cooldown in effect)`);
    }

    const elapsed = Date.now() - startTime;
    logger.debug(`Response check took ${elapsed}ms`);
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the test
runTest().catch(error => {
    logger.error(`Test failed: ${error}`);
    logger.error(error.stack);
}); 