#!/usr/bin/env node

/**
 * Test script to verify the TelegramMultiAgentPlugin runtime integration
 */
const { TelegramMultiAgentPlugin } = require('../dist');

// Mock runtime
const mockRuntime = {
  getAgentId: () => 'test-agent-1',
  getCharacter: () => ({ name: 'Test Character', username: 'testbot' }),
  registerPlugin: (plugin) => {
    console.log(`[MOCK RUNTIME] registerPlugin called with plugin: ${plugin.constructor.name}`);
    return true;
  },
  registerService: (name, service) => {
    console.log(`[MOCK RUNTIME] registerService called with name: ${name}`);
    return true;
  },
  logger: {
    debug: (...args) => console.log('[DEBUG]', ...args),
    info: (...args) => console.log('[INFO]', ...args),
    warn: (...args) => console.log('[WARN]', ...args),
    error: (...args) => console.log('[ERROR]', ...args),
  },
  clients: [],
};

async function runTest() {
  console.log('Starting TelegramMultiAgentPlugin runtime integration test');
  
  // Disable actual connections
  process.env.TELEGRAM_BOT_TOKEN = 'dummy-token';
  process.env.RELAY_SERVER_URL = 'http://localhost:9999';
  process.env.TELEGRAM_GROUP_IDS = '12345';
  process.env.DISABLE_CONNECTIONS = 'true';
  
  // Create plugin instance
  console.log('Creating plugin instance...');
  const plugin = new TelegramMultiAgentPlugin({
    relayServerUrl: 'http://localhost:9999',
    authToken: 'dummy-token',
    groupIds: ['12345'],
    disableConnections: true,
  });
  
  // Add missing methods needed for testing
  plugin.getVersion = () => '0.1.0-test';
  plugin.initializeBot = async () => console.log('[MOCK] initializeBot called');
  plugin.initializeServer = async () => console.log('[MOCK] initializeServer called');
  plugin.initializeStorage = async () => console.log('[MOCK] initializeStorage called');
  plugin.initialized = false;
  
  // Test manual registration
  console.log('\nTesting manual registration...');
  const registerResult = plugin.register(mockRuntime);
  console.log(`Register result: ${registerResult}`);
  
  // Test runtime retrieval functions
  console.log('\nTesting runtime retrieval...');
  
  // This method is private, so we're using reflection to access it
  const isRuntimeAvailable = plugin.isRuntimeAvailable?.bind(plugin) || 
    (() => { console.log('isRuntimeAvailable method not found'); return false; });
  
  console.log(`Runtime available: ${isRuntimeAvailable()}`);
  
  // Test initialization
  console.log('\nTesting initialization...');
  try {
    await plugin.initialize();
    console.log('Initialization succeeded');
  } catch (error) {
    console.error('Initialization failed:', error);
  }
  
  // Verify runtime is accessible
  console.log('\nTesting runtime access after initialization...');
  console.log(`Runtime initialized: ${plugin.runtimeInitialized}`);
  console.log(`Agent ID: ${plugin.agentId}`);
  
  console.log('\nTest completed');
}

// Run the test
runTest().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
}); 