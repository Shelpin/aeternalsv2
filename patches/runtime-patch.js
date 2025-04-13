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

// Export the runtime
export { runtime };
