/**
 * Valhalla Runtime Patch
 * 
 * This file provides the core runtime patches needed for the Valhalla runtime.
 * It sets up a message handling system and integrates with other patches.
 */

console.log('🔧 Applying Valhalla runtime patch...');

// Create a minimal runtime object
const runtime = {
  name: 'ElizaOS Valhalla Runtime',
  version: '1.0.0',
  clients: {},
  plugins: {},
  actions: {},

  // Provide agent identity
  getAgentId: () => process.env.AGENT_ID || '<unknown>',

  // Logger factory for patches
  getLogger: (name) => ({
    info: (...args) => console.log(`[${name}]`, ...args),
    warn: (...args) => console.warn(`[${name}]`, ...args),
    error: (...args) => console.error(`[${name}]`, ...args),
    debug: (...args) => console.debug(`[${name}]`, ...args),
  }),

  // Configuration methods
  getSetting(key, defaultValue) {
    return process.env[key] || defaultValue;
  },

  // Client management
  registerClient(client) {
    console.log(`🔌 Registering client: ${client.name || 'unnamed'}`);
    this.clients[client.name] = client;
    return client;
  },

  // Plugin management
  registerPlugin(plugin) {
    console.log(`🔌 Registering plugin: ${plugin.name || 'unnamed'}`);
    this.plugins[plugin.name] = plugin;
    return plugin;
  },

  // Action registration
  registerAction(action) {
    console.log(`🔌 Registering action: ${action.name || 'unnamed'}`);
    this.actions[action.name] = action;
    return action;
  },

  // Message handling
  async handleMessage(message, context = {}) {
    try {
      console.log(`📨 Handling message: ${JSON.stringify(message).substring(0, 100)}...`);

      // Basic validation
      if (!message || typeof message !== 'object') {
        console.error('❌ Invalid message format');
        return { error: true, message: 'Invalid message format' };
      }

      // Extract information from the message
      const { type, content, source, target } = message;

      // Log the message details
      console.log(`📨 Message details:
        Type: ${type || 'unknown'}
        Source: ${source || 'unknown'}
        Target: ${target || 'broadcast'}
        Content length: ${content ? (typeof content === 'string' ? content.length : JSON.stringify(content).length) : 0}
      `);

      // Route the message to the appropriate handler
      if (type === 'text' || type === 'chat') {
        return this.handleTextMessage(message, context);
      } else if (type === 'command') {
        return this.handleCommandMessage(message, context);
      } else if (type === 'system') {
        return this.handleSystemMessage(message, context);
      } else {
        console.warn(`⚠️ Unknown message type: ${type}`);
        return { error: true, message: `Unknown message type: ${type}` };
      }
    } catch (error) {
      console.error('❌ Error handling message:', error);
      return { error: true, message: error.message };
    }
  },

  // Specific message type handlers
  async handleTextMessage(message, context) {
    console.log('📨 Handling text message');

    // Echo the message for now
    return {
      type: 'text',
      content: `Echo: ${message.content}`,
      source: 'runtime',
      target: message.source
    };
  },

  async handleCommandMessage(message, context) {
    console.log('📨 Handling command message');

    const { command } = message;

    if (!command) {
      return { error: true, message: 'No command specified' };
    }

    // Check if we have a registered action for this command
    if (this.actions[command] && typeof this.actions[command].handler === 'function') {
      return this.actions[command].handler(message, context);
    }

    // Default command response
    return {
      type: 'command',
      content: `Command acknowledged: ${command}`,
      source: 'runtime',
      target: message.source
    };
  },

  async handleSystemMessage(message, context) {
    console.log('📨 Handling system message');

    // Just acknowledge system messages
    return {
      type: 'system',
      content: 'System message acknowledged',
      source: 'runtime',
      target: message.source
    };
  }
};

console.log('✅ Valhalla runtime patch applied');

// Assign to global scope
if (typeof globalThis !== 'undefined') {
  console.log('🔧 Attempting assignment to globalThis.__elizaRuntime...');
  globalThis.__elizaRuntime = runtime;
  console.log(`✅ Runtime assigned to globalThis.__elizaRuntime. Type: ${typeof globalThis.__elizaRuntime}`);
} else {
  console.warn('⚠️ globalThis not available, cannot assign runtime globally.');
}

// Export the runtime
export { runtime };

// Add an applyPatch function if it's expected by the caller
// This might be missing, causing the runtime variable in apply-patches.js to be undefined
export async function applyPatch() {
  console.log('🔧 runtime-patch.js: applyPatch() called');
  const logger = runtime.getLogger('patch');
  // Ensure global assignment happens if needed
  if (typeof globalThis !== 'undefined' && !globalThis.__elizaRuntime) {
    globalThis.__elizaRuntime = runtime;
    logger.info('✅ Runtime assigned globally from applyPatch()');
  }

  // 🔗 Prepare Relay Configuration (Defer Connection)
  try {
    // Store config for later use by the plugin
    runtime.relayConfig = {
      relayServerUrl: process.env.RELAY_SERVER_URL || 'http://localhost:4000', // Ensure fallback
      authToken: process.env.RELAY_AUTH_TOKEN,
      agentId: runtime.getAgentId() // Still gets initial <unknown> here, plugin will override
    };
    logger.info('🔧 Relay config prepared for plugin initialization.', runtime.relayConfig);

    // 💾 Prepare Memory Configuration (Defer Initialization)
    // The plugin will handle its own memory manager initialization within its lifecycle.
    logger.info('🔧 Memory initialization deferred to plugin.');

  } catch (err) {
    logger.error('❌ Error preparing configurations in runtime patch', err);
  }

  return runtime; // Return the runtime instance
}
