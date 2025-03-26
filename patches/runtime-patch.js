/**
 * Valhalla Runtime Patch
 * 
 * This patch adds a handleMessage method to the ElizaOS runtime
 * allowing the telegram-multiagent plugin to call it successfully
 */

// Import the global ElizaOS runtime
const { runtime } = await import('@elizaos/core');
const elizaLogger = console;

elizaLogger.info('🧩 [PATCH] Applying runtime handleMessage patch');

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
} else {
  elizaLogger.info('🧩 [PATCH] runtime.handleMessage already exists, no patch needed');
}

// Export the patched runtime 
export { runtime }; 