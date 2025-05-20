#!/usr/bin/env node

/**
 * Cooldown Mechanism Test Script
 * 
 * This script tests the concept of global and per-agent cooldowns
 * by simulating the timing behavior implemented in ConversationManager.
 */

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

// Cooldown configuration (matching our implementation)
const GLOBAL_COOLDOWN_MS = 12000; // 12 seconds global cooldown between ANY message
const AGENT_COOLDOWN_MS = 20000; // 20 seconds per-agent cooldown
const HUMAN_MESSAGE_GLOBAL_COOLDOWN_MS = 3000; // Shorter cooldown after human message

// Mock state storage
const lastGlobalMessageTime = new Map();
const lastAgentMessageTime = new Map();

/**
 * Determine if agent should respond
 */
function shouldAgentRespond(groupId, agentId, fromAgentId) {
    const now = Date.now();

    // Don't respond to self
    if (fromAgentId === agentId) {
        logger.debug(`Agent ${agentId} should not respond to itself`);
        return false;
    }

    // Check global cooldown
    const groupKey = `global-${groupId}`;
    const lastGlobalTime = lastGlobalMessageTime.get(groupKey);

    // If message is from human, use shorter cooldown
    const isFromHuman = !fromAgentId || fromAgentId.startsWith('human_');
    const effectiveGlobalCooldown = isFromHuman ? HUMAN_MESSAGE_GLOBAL_COOLDOWN_MS : GLOBAL_COOLDOWN_MS;

    if (lastGlobalTime && (now - lastGlobalTime) < effectiveGlobalCooldown) {
        const timeElapsed = now - lastGlobalTime;
        logger.info(`Global cooldown in effect for group ${groupId}. ${timeElapsed}ms elapsed, needed ${effectiveGlobalCooldown}ms`);
        return false;
    }

    // Check agent-specific cooldown
    const agentGroupKey = `${agentId}-${groupId}`;
    const lastAgentTime = lastAgentMessageTime.get(agentGroupKey);

    if (lastAgentTime && (now - lastAgentTime) < AGENT_COOLDOWN_MS) {
        const timeElapsed = now - lastAgentTime;
        logger.info(`Agent ${agentId} in group ${groupId} is in cooldown. ${timeElapsed}ms elapsed, needed ${AGENT_COOLDOWN_MS}ms`);
        return false;
    }

    return true;
}

/**
 * Record a message from an agent
 */
function recordMessage(groupId, agentId) {
    const groupKey = `global-${groupId}`;
    const agentGroupKey = `${agentId}-${groupId}`;

    // Update timestamps
    const now = Date.now();
    lastGlobalMessageTime.set(groupKey, now);
    lastAgentMessageTime.set(agentGroupKey, now);

    logger.info(`Recorded message from agent ${agentId} in group ${groupId}`);
}

/**
 * Attempt to have an agent respond to a message
 */
async function attemptAgentResponse(agent, fromAgentId) {
    const startTime = Date.now();
    logger.info(`${colors.bright}${agent.name}${colors.reset} (${agent.id}) attempting to respond to ${fromAgentId || 'human'} in group ${TEST_GROUP_ID}...`);

    // Check if agent should respond
    const shouldRespond = shouldAgentRespond(TEST_GROUP_ID, agent.id, fromAgentId);

    if (shouldRespond) {
        logger.info(`${colors.green}✓ ${agent.name} ${colors.reset}(${agent.id}) ${colors.green}IS allowed to respond${colors.reset}`);

        // Record the message
        recordMessage(TEST_GROUP_ID, agent.id);
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

/**
 * Run the test
 */
async function runTest() {
    logger.info(`${colors.cyan}=== Beginning Cooldown Mechanism Test ====${colors.reset}`);

    // Start with a human message
    logger.info(`Human sends message in group ${TEST_GROUP_ID}`);

    // First agent responds (should succeed)
    await attemptAgentResponse(TEST_AGENTS[0], null);

    // Second agent tries immediately (should fail - global cooldown)
    await attemptAgentResponse(TEST_AGENTS[1], TEST_AGENTS[0].id);

    // Wait 5 seconds (still in global cooldown)
    logger.info(`Waiting 5 seconds...`);
    await sleep(5000);

    // Try second agent again (should still fail - global cooldown not expired)
    await attemptAgentResponse(TEST_AGENTS[1], TEST_AGENTS[0].id);

    // Wait 8 more seconds (global cooldown should expire)
    logger.info(`Waiting 8 more seconds...`);
    await sleep(8000);

    // Try second agent again (should succeed - global cooldown expired)
    await attemptAgentResponse(TEST_AGENTS[1], TEST_AGENTS[0].id);

    // First agent tries again (should fail - per-agent cooldown)
    await attemptAgentResponse(TEST_AGENTS[0], TEST_AGENTS[1].id);

    // Wait 13 seconds (global cooldown expired, agent cooldown still active)
    logger.info(`Waiting 13 seconds...`);
    await sleep(13000);

    // Third agent responds (should succeed - different agent, global cooldown expired)
    await attemptAgentResponse(TEST_AGENTS[2], TEST_AGENTS[1].id);

    // First agent tries again (should still fail - per-agent cooldown not expired)
    await attemptAgentResponse(TEST_AGENTS[0], TEST_AGENTS[2].id);

    // Wait 10 more seconds
    logger.info(`Waiting 10 more seconds...`);
    await sleep(10000);

    // First agent tries again (should succeed - per-agent cooldown finally expired)
    await attemptAgentResponse(TEST_AGENTS[0], TEST_AGENTS[2].id);

    logger.info(`${colors.cyan}=== Cooldown Mechanism Test Complete ====${colors.reset}`);
}

// Run the test
runTest().catch(error => {
    logger.error(`Test failed: ${error}`);
    logger.error(error.stack);
}); 