/**
 * Valhalla Runtime Patch
 * 
 * This patch adds a handleMessage method to the ElizaOS runtime
 * allowing the telegram-multiagent plugin to call it successfully
 */

let runtime;
const elizaLogger = console;

elizaLogger.info('🧩 [PATCH] Applying runtime handleMessage patch');

// Try to import the ElizaOS runtime, with fallback if not available
try {
  // Import the global ElizaOS runtime
  const coreModule = await import('@elizaos/core');
  runtime = coreModule.runtime;
  elizaLogger.info('✅ [PATCH] Successfully imported @elizaos/core');
} catch (error) {
  elizaLogger.warn(`⚠️ [PATCH] Could not import @elizaos/core: ${error.message}`);
  elizaLogger.info('🔍 [PATCH] Attempting to use global runtime object instead');
  
  // Try to use the global runtime object if it exists
  if (globalThis.__elizaRuntime) {
    runtime = globalThis.__elizaRuntime;
    elizaLogger.info('✅ [PATCH] Using globalThis.__elizaRuntime');
  } else {
    // Create a minimal runtime object if nothing else is available
    elizaLogger.warn('⚠️ [PATCH] No runtime found, creating minimal stub');
    runtime = {
      agentId: process.env.AGENT_ID || 'unknown-agent',
      logger: console,
      getLogger: (name) => {
        return {
          trace: (message, ...args) => console.log(`[TRACE] ${name}: ${message}`, ...args),
          debug: (message, ...args) => console.log(`[DEBUG] ${name}: ${message}`, ...args),
          info: (message, ...args) => console.log(`[INFO] ${name}: ${message}`, ...args),
          warn: (message, ...args) => console.warn(`[WARN] ${name}: ${message}`, ...args),
          error: (message, ...args) => console.error(`[ERROR] ${name}: ${message}`, ...args)
        };
      }
    };
    elizaLogger.info('✅ [PATCH] Created minimal runtime stub');
  }
}

// Check if runtime already has a handleMessage method
if (runtime && typeof runtime.handleMessage !== 'function') {
  elizaLogger.info('🧩 [PATCH] runtime.handleMessage is not defined, adding it now');

  // Add a handleMessage method to the runtime
  runtime.handleMessage = async (message) => {
    elizaLogger.info(`🧩 [PATCH] runtime.handleMessage called with message: ${JSON.stringify(message).substring(0, 100)}...`);
    
    try {
      // If the runtime has a ConversationManager, use it
      if (runtime.conversationManager && typeof runtime.conversationManager.generateResponse === 'function') {
        elizaLogger.info('🧩 [PATCH] Using conversationManager.generateResponse');
        return await runtime.conversationManager.generateResponse(message);
      }
      
      // If the runtime has a client system, try to use it
      if (runtime.clients && runtime.clients.length > 0) {
        // Try to find a telegram client
        const telegramClient = runtime.clients.find(client => 
          client.type === 'telegram' || 
          client.telegram
        );
        
        if (telegramClient && telegramClient.handleMessage) {
          elizaLogger.info('🧩 [PATCH] Using telegramClient.handleMessage');
          return await telegramClient.handleMessage(message);
        }
      }
      
      // Fallback to simple text-based response
      elizaLogger.warn('🧩 [PATCH] No conversation handler found, using minimal fallback');
      return {
        text: `I received your message "${message.text.substring(0, 50)}..."`,
        content: {
          action: 'SAY'
        }
      };
    } catch (error) {
      elizaLogger.error(`🧩 [PATCH] Error in patched handleMessage: ${error.message}`);
      return {
        text: "I'm having trouble processing messages right now. Please try again later.",
        content: {
          action: 'SAY'
        }
      };
    }
  };
  
  elizaLogger.info('🧩 [PATCH] runtime.handleMessage successfully patched');
} else if (runtime) {
  elizaLogger.info('🧩 [PATCH] runtime.handleMessage already exists, no patch needed');
} else {
  elizaLogger.error('❌ [PATCH] No runtime object available, patch failed');
}

// Make sure runtime is not undefined
if (!runtime) {
  elizaLogger.warn('⚠️ [PATCH] Creating minimal runtime stub for export');
  runtime = {
    agentId: process.env.AGENT_ID || 'unknown-agent',
    handleMessage: async (message) => {
      elizaLogger.info(`[STUB] Handling message: ${JSON.stringify(message).substring(0, 100)}...`);
      return {
        text: `This is a fallback response for message: "${message.text?.substring(0, 50) || 'unknown'}"`,
        content: { action: 'SAY' }
      };
    },
    getLogger: (name) => {
      return {
        trace: (message, ...args) => console.log(`[TRACE] ${name}: ${message}`, ...args),
        debug: (message, ...args) => console.log(`[DEBUG] ${name}: ${message}`, ...args),
        info: (message, ...args) => console.log(`[INFO] ${name}: ${message}`, ...args),
        warn: (message, ...args) => console.warn(`[WARN] ${name}: ${message}`, ...args),
        error: (message, ...args) => console.error(`[ERROR] ${name}: ${message}`, ...args)
      };
    }
  };
  elizaLogger.info('✅ [PATCH] Created emergency fallback runtime stub for export');
}

// Export the patched runtime 
export { runtime }; 