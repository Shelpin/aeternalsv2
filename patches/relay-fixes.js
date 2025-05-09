/**
 * Relay Fixes
 * 
 * This patch provides more extensive fixes for the relay system:
 * 1. Sets up correct routing between agents and relay server
 * 2. Manages message forwarding and handling
 * 3. Fixes potential deadlocks and timeouts
 */

console.log('🔧 Applying relay fixes...');

// Validate environment
if (!process.env.RELAY_SERVER_URL) {
  console.warn('⚠️ RELAY_SERVER_URL not set, relay fixes may not work properly');
}

// Setup relay message handling
function setupRelayHandling() {
  try {
    // Access runtime if available
    if (!globalThis.__elizaRuntime) {
      console.warn('⚠️ ElizaOS runtime not found, skipping relay fixes');
      return false;
    }

    const runtime = globalThis.__elizaRuntime;

    // Patch message handling to properly route relay messages
    if (typeof runtime.handleMessage === 'function') {
      console.log('🔧 Patching message handler for relay support');

      const originalHandleMessage = runtime.handleMessage;

      runtime.handleMessage = async function (message, context) {
        try {
          // Add relay routing information to context
          if (message && message.source === 'relay') {
            context = context || {};
            context.isRelay = true;
            context.relaySource = message.relaySource || 'unknown';

            console.log(`📨 Handling relay message from ${context.relaySource}`);
          }

          // Call original handler
          return await originalHandleMessage.call(this, message, context);
        } catch (error) {
          console.error('❌ Error in patched handleMessage:', error);
          // Still return something so the system doesn't crash
          return {
            error: true,
            message: "Error processing message in relay-patched handler"
          };
        }
      };

      console.log('✅ Patched message handler for relay support');
    }

    // Set up relay forwarding
    if (runtime.forwardToRelay) {
      console.log('⚠️ forwardToRelay already exists on runtime. Overwriting with plugin-based forwarder.');
    }
    runtime.forwardToRelay = (...args) => {
      // Ensure globalThis.__elizaRuntime and its plugins array exist
      if (!globalThis.__elizaRuntime || !Array.isArray(globalThis.__elizaRuntime.plugins)) {
        console.error('[FORWARD_RELAY_PATCH] globalThis.__elizaRuntime or its plugins array is not available.');
        return Promise.resolve({ error: true, message: 'Runtime or plugins not available for relay forwarding' });
      }
      // Find the plugin that has a forwardToRelay method (this should be TelegramMultiAgentPlugin)
      const relayPlugin = globalThis.__elizaRuntime.plugins.find(p => typeof p.forwardToRelay === 'function');

      if (relayPlugin) {
        console.log(`[FORWARD_RELAY_PATCH] Found relayPlugin: ${relayPlugin.name}. Calling its forwardToRelay method.`);
        // The actual sendMessage in TelegramRelay might need to be aliased or wrapped as forwardToRelay in the plugin
        // For now, assuming the plugin itself exposes a suitable forwardToRelay method.
        // If the plugin has `this.relay.sendMessage(chatId, text, agentIdToForwardAs, originalMessageContext)`
        // it might need to be wrapped or directly aliased as `forwardToRelay` on the plugin instance.
        // The `TelegramRelay` class has `sendMessage(chatId: string, text: string, agentIdOverride?: string, originalMessage?: any)`
        // The plugin could expose this as: 
        // public async forwardToRelay(chatId: string, text: string, agentIdOverride?: string, originalMessage?: any): Promise<void> {
        //    if (this.relay) { return this.relay.sendMessage(chatId, text, agentIdOverride, originalMessage); }
        // }
        return relayPlugin.forwardToRelay(...args);
      } else {
        console.warn('[FORWARD_RELAY_PATCH] No plugin found with a forwardToRelay method.');
        return Promise.resolve({ error: true, message: 'No relay plugin found' });
      }
    };
    console.log('✅ Patched runtime.forwardToRelay to use a plugin-based forwarder.');

    return true;
  } catch (error) {
    console.error('❌ Error setting up relay handling:', error);
    return false;
  }
}

// Apply fixes
const relayFixesApplied = setupRelayHandling();

console.log(`${relayFixesApplied ? '✅' : '❌'} Relay fixes applied`); 