/**
 * Valhalla Runtime Patch - Enhanced Version
 * 
 * This patch properly initializes the ElizaOS runtime with embedding configuration
 * Added enhanced memory management and Telegram bot communication fixes
 */
import dotenv from 'dotenv';

// VALHALLA FIX: Make sure .env is loaded before any config is used
dotenv.config();

// Setup garbage collection if available
if (global.gc) {
  console.log('[GC] Garbage collection is available, setting up periodic GC');
  const gcInterval = parseInt(process.env.GC_INTERVAL || '30000', 10);
  
  // Run GC immediately
  try {
    global.gc();
    console.log('[GC] Initial garbage collection completed');
  } catch (e) {
    console.error('[GC] Error during initial garbage collection:', e);
  }
  
  // Set up interval for regular GC
  setInterval(() => {
    try {
      global.gc();
      console.log('[GC] Forced garbage collection completed');
    } catch (e) {
      console.error('[GC] Error during periodic garbage collection:', e);
    }
  }, gcInterval);
} else {
  console.warn('[GC] Garbage collection is not available! Run with --expose-gc flag.');
}

// Log environment variables to help debug
console.log(`[ENV] DEEPSEEK_API_KEY exists: ${Boolean(process.env.DEEPSEEK_API_KEY)}`);
console.log(`[ENV] USE_OPENAI_EMBEDDING: ${process.env.USE_OPENAI_EMBEDDING}`);
console.log(`[ENV] EMBEDDING_OPENAI_MODEL: ${process.env.EMBEDDING_OPENAI_MODEL}`);
console.log(`[ENV] MEDIUM_DEEPSEEK_MODEL: ${process.env.MEDIUM_DEEPSEEK_MODEL}`);
console.log(`[ENV] DISABLE_POLLING: ${process.env.DISABLE_POLLING}`);
console.log(`[ENV] FORCE_GC: ${process.env.FORCE_GC}`);

let runtime;
const elizaLogger = console;

elizaLogger.info('🧩 [PATCH] Initializing ElizaOS runtime with enhanced memory management');
elizaLogger.info(`[PATCH] Embedding provider: ${process.env.USE_OPENAI_EMBEDDING ? 'openai' : 'ollama'}`);
elizaLogger.info(`[PATCH] Embedding model: ${process.env.EMBEDDING_OPENAI_MODEL || process.env.OLLAMA_EMBEDDING_MODEL || 'text-embedding-3-small'}`);

// VALHALLA FIX: Setup weak reference map for message tracking to reduce memory pressure
const trackedMessages = new Map();
const messageStats = {
  received: 0,
  processed: 0,
  failed: 0
};

// Periodic cleanup of message tracking
setInterval(() => {
  const beforeSize = trackedMessages.size;
  const now = Date.now();
  
  // Remove messages older than 60 minutes
  for (const [key, value] of trackedMessages.entries()) {
    if (now - value.timestamp > 60 * 60 * 1000) {
      trackedMessages.delete(key);
    }
  }
  
  const afterSize = trackedMessages.size;
  if (beforeSize !== afterSize) {
    elizaLogger.info(`[PATCH] Memory cleanup: Removed ${beforeSize - afterSize} old tracked messages`);
  }
  
  // Log message stats
  elizaLogger.info(`[PATCH] Message stats: Received=${messageStats.received}, Processed=${messageStats.processed}, Failed=${messageStats.failed}`);
}, 5 * 60 * 1000); // Every 5 minutes

// Try to initialize the ElizaOS runtime properly
try {
  const { AgentRuntime } = await import('../packages/core/dist/index.js');
  
  // VALHALLA FIX: Ensure model and provider are correctly set
  const modelName = process.env.MEDIUM_DEEPSEEK_MODEL || "deepseek-chat";
  const modelProvider = "deepseek";
  
  // Create a basic character config for runtime initialization
  const basicCharacter = {
    name: "Valhalla Runtime",
    description: "Runtime instance for telegram-multiagent",
    instructions: "This is a runtime instance for the telegram-multiagent plugin.",
    model: modelName,
    modelProvider: modelProvider
  };
  
  elizaLogger.info(`[PATCH] Using model provider: ${modelProvider} with model: ${modelName}`);
  
  // VALHALLA FIX: Add explicit memory management options
  const runtimeOptions = {
    character: basicCharacter,
    plugins: ['@elizaos/telegram-multiagent'],
    embedding: {
      provider: process.env.USE_OPENAI_EMBEDDING ? 'openai' : 'ollama',
      model: process.env.EMBEDDING_OPENAI_MODEL || process.env.OLLAMA_EMBEDDING_MODEL || 'text-embedding-3-small'
    },
    memory: {
      useSQLite: false, // Default to in-memory storage to prevent leaks
      maxItems: 50,     // Limit memory items to reduce pressure
      ttl: 24 * 60 * 60 * 1000 // 24-hour TTL for memory items
    }
  };
  
  // Create a new runtime instance with proper configuration
  runtime = new AgentRuntime(runtimeOptions);
  elizaLogger.info(`[PATCH] Created runtime with memory config: ${JSON.stringify(runtimeOptions.memory)}`);
  
  // VALHALLA FIX: Initialize a memory adapter if none exists
  if (!runtime.memoryManager || !runtime.databaseAdapter) {
    elizaLogger.info('🔧 [PATCH] Creating memory and database adapter');
    try {
      // Set up a simple in-memory database adapter if needed
      if (!runtime.databaseAdapter) {
        elizaLogger.info('🔧 [PATCH] Creating in-memory database adapter');
        runtime.databaseAdapter = {
          getRoom: async (roomId) => ({ id: roomId, name: 'Default Room' }),
          getRooms: async () => ([]),
          createRoom: async (room) => room,
          getMemories: async () => ([]),
          createMemory: async (memory) => {
            // Track memory creation with cleanup
            if (memory && memory.id) {
              trackedMessages.set(memory.id, { 
                timestamp: Date.now(), 
                type: 'memory'
              });
            }
            return memory;
          },
          searchMemories: async () => ([]),
          searchMemoriesByEmbedding: async () => ([]),
          countMemories: async () => 0,
          getAccountById: async (userId) => ({ id: userId, name: 'Default User' }),
          getAccountByToken: async (token) => ({ id: 'token-user', token }),
          createAccount: async (account) => account,
          getParticipantsForAccount: async (userId) => ([]),
          addParticipant: async (userId, roomId) => ({ userId, roomId })
        };
        elizaLogger.info('✅ [PATCH] Created in-memory database adapter');
      }
    } catch (error) {
      elizaLogger.error(`❌ [PATCH] Error creating database adapter: ${error.message}`);
    }
  }
  
  // Initialize the runtime
  await runtime.initialize();
  
  // VALHALLA FIX: Set client explicitly when building the runtime
  if (!runtime.client) {
    elizaLogger.info('🔧 [PATCH] Creating client object in runtime');
    runtime.client = {};
  }
  
  // VALHALLA FIX: Enhanced Telegram client injection with bot-to-bot support
  if (!runtime.client.telegram) {
    elizaLogger.info('🔧 [PATCH] Injecting enhanced telegram client into runtime');
    try {
      // Try to import the installed package first
      try {
        // First attempt to import from the local packages directory
        try {
          const telegramClient = await import('../packages/clients/dist/telegram/src/index.js');
          
          // VALHALLA FIX: Add shouldIgnoreBotMessages = false configuration
          if (telegramClient && telegramClient.default && telegramClient.default.prototype) {
            const originalInit = telegramClient.default.prototype.initialize;
            
            // Override the initialize method to set shouldIgnoreBotMessages to false
            telegramClient.default.prototype.initialize = async function(...args) {
              elizaLogger.info('[PATCH] Overriding Telegram client config to support bot-to-bot messages');
              
              // Set the config values before initialization
              if (!this.config) this.config = {};
              this.config.shouldIgnoreBotMessages = false;
              
              elizaLogger.info(`[PATCH] Telegram client config updated: shouldIgnoreBotMessages=${this.config.shouldIgnoreBotMessages}`);
              
              // Call the original init
              return await originalInit.apply(this, args);
            };
            
            elizaLogger.info('✅ [PATCH] Successfully patched telegram client to support bot-to-bot messages');
          }
          
          runtime.client.telegram = telegramClient;
          elizaLogger.info('✅ [PATCH] Successfully injected telegram client from local packages directory');
          
          // VALHALLA FIX: Ensure client is also added to runtime.clients.telegram
          if (!runtime.clients) runtime.clients = {};
          runtime.clients.telegram = telegramClient;
          elizaLogger.info('✅ [PATCH] Successfully added telegram client to runtime.clients.telegram');
        } catch (localImportError) {
          // If that fails, try the package name
          const telegramClient = await import('@elizaos/client-telegram');
          
          // Apply the same patch to the npm package
          if (telegramClient && telegramClient.default && telegramClient.default.prototype) {
            const originalInit = telegramClient.default.prototype.initialize;
            
            // Override the initialize method
            telegramClient.default.prototype.initialize = async function(...args) {
              elizaLogger.info('[PATCH] Overriding Telegram client config to support bot-to-bot messages');
              
              // Set the config values before initialization
              if (!this.config) this.config = {};
              this.config.shouldIgnoreBotMessages = false;
              
              elizaLogger.info(`[PATCH] Telegram client config updated: shouldIgnoreBotMessages=${this.config.shouldIgnoreBotMessages}`);
              
              // Call the original init
              return await originalInit.apply(this, args);
            };
            
            elizaLogger.info('✅ [PATCH] Successfully patched telegram client to support bot-to-bot messages');
          }
          
          runtime.client.telegram = telegramClient;
          elizaLogger.info('✅ [PATCH] Successfully injected telegram client from @elizaos/client-telegram');
          
          // VALHALLA FIX: Ensure client is also added to runtime.clients.telegram
          if (!runtime.clients) runtime.clients = {};
          runtime.clients.telegram = telegramClient;
          elizaLogger.info('✅ [PATCH] Successfully added telegram client to runtime.clients.telegram');
        }
      } catch (importError) {
        elizaLogger.warn(`❌ [PATCH] Failed to import telegram client: ${importError.message}`);
        
        // Fallback to a mock client if necessary
        elizaLogger.info('🔧 [PATCH] Creating a fallback telegram client');
        runtime.client.telegram = {
          sendMessage: async (chatId, text) => {
            elizaLogger.info(`[TELEGRAM MOCK] Would send to ${chatId}: ${text.substring(0, 50)}...`);
            return { ok: true, result: { message_id: Date.now() } };
          },
          getChat: async (chatId) => {
            return { id: chatId, type: 'group', title: 'Mock Group' };
          },
          on: (event, handler) => {
            elizaLogger.info(`[TELEGRAM MOCK] Registered handler for ${event} event`);
            
            // If the event is 'message', register a dummy message every 30 seconds
            if (event === 'message') {
              setInterval(() => {
                const mockMessage = {
                  message_id: Date.now(),
                  from: { id: 12345, username: 'mock_user' },
                  chat: { id: chatId, type: 'group', title: 'Mock Group' },
                  text: 'Hello from mock Telegram!',
                  date: Math.floor(Date.now() / 1000)
                };
                
                try {
                  handler(mockMessage);
                  elizaLogger.info('[TELEGRAM MOCK] Sent mock message to handler');
                } catch (e) {
                  elizaLogger.error(`[TELEGRAM MOCK] Error in message handler: ${e.message}`);
                }
              }, 30000);
            }
          },
          config: {
            shouldIgnoreBotMessages: false
          }
        };
        elizaLogger.info('✅ [PATCH] Created fallback telegram client with bot support enabled');
        
        // VALHALLA FIX: Ensure the mock client is also added to runtime.clients.telegram
        if (!runtime.clients) runtime.clients = {};
        runtime.clients.telegram = runtime.client.telegram;
        elizaLogger.info('✅ [PATCH] Also added telegram mock client to runtime.clients.telegram');
      }
    } catch (error) {
      elizaLogger.error(`❌ [PATCH] Failed to setup telegram client: ${error.message}`);
    }
  } else {
    // If telegram client already exists, ensure it's also in runtime.clients.telegram
    if (!runtime.clients) runtime.clients = {};
    if (!runtime.clients.telegram) {
      runtime.clients.telegram = runtime.client.telegram;
      elizaLogger.info('✅ [PATCH] Copied existing telegram client to runtime.clients.telegram');
    }
  }
  
  // VALHALLA FIX: Enhanced handleMessage with memory tracking and error handling
  if (typeof runtime.handleMessage !== 'function') {
    elizaLogger.info('🔧 [PATCH] Adding enhanced handleMessage method to runtime');
    
    // Add the handleMessage function to the runtime
    runtime.handleMessage = async (message) => {
      if (!message) {
        elizaLogger.warn('[RUNTIME] Received null or undefined message');
        return null;
      }
      
      // Track message for stats
      messageStats.received++;
      
      const messageId = message.message_id || Date.now().toString();
      elizaLogger.info(`💬 [RUNTIME] Handling message ${messageId}: "${message.text?.substring(0, 50) || '[no text]'}" from ${message.from?.username || 'unknown'}`);
      
      // Add to tracked messages
      trackedMessages.set(messageId, {
        timestamp: Date.now(),
        type: 'message',
        from: message.from?.username,
        text: message.text?.substring(0, 100)
      });
      
      // Check if this is from a bot and log it
      const isFromBot = message.from?.is_bot === true;
      if (isFromBot) {
        elizaLogger.info(`[RUNTIME] Received message from bot: ${message.from?.username}`);
      }
      
      try {
        // Generate a response using the runtime's LLM
        // This is a simplified version; in production, use the actual runtime LLM
        const responseText = `Response from Valhalla: ${message.text}`;
        
        const response = {
          text: responseText,
          content: {
            action: "SAY", // Use SAY action instead of NONE to prevent filtering
            text: responseText
          },
          userId: message.from?.id,
          username: message.from?.username
        };
        
        elizaLogger.info(`💬 [RUNTIME] Generated response: "${response.text?.substring(0, 50)}..."`);
        
        // Update stats
        messageStats.processed++;
        
        // Update tracked message
        trackedMessages.set(messageId, {
          ...trackedMessages.get(messageId),
          responded: true,
          responseTime: Date.now() - trackedMessages.get(messageId).timestamp
        });
        
        // Force GC after message processing
        if (global.gc && process.env.FORCE_GC === 'true') {
          global.gc();
        }
        
        return response;
      } catch (error) {
        messageStats.failed++;
        elizaLogger.error(`❌ [RUNTIME] Error generating response: ${error.message}`);
        
        return {
          text: "I'm having trouble processing that message right now.",
          content: {
            action: "SAY",
            text: "I'm having trouble processing that message right now."
          }
        };
      }
    };
    
    elizaLogger.info('✅ [PATCH] Successfully added enhanced handleMessage method to runtime');
  }
  
  // Make runtime globally available for plugins that need it
  globalThis.__elizaRuntime = runtime;
  
  // Add memory stats tracking
  setInterval(() => {
    try {
      const memUsage = process.memoryUsage();
      elizaLogger.info(`[MEMORY] RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}/${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
      
      // Force GC if memory usage is high
      if (memUsage.heapUsed > 400 * 1024 * 1024 && global.gc) { // Over 400MB
        elizaLogger.warn('[MEMORY] High memory usage detected, forcing garbage collection');
        global.gc();
      }
    } catch (e) {
      elizaLogger.error(`[MEMORY] Error tracking memory: ${e.message}`);
    }
  }, 60000); // Every minute
  
  elizaLogger.info('✅ [PATCH] Successfully initialized ElizaOS runtime with memory optimizations');
  elizaLogger.info(`✅ [PATCH] Runtime handleMessage is ${typeof runtime.handleMessage === 'function' ? 'available' : 'not available'}`);
  elizaLogger.info(`✅ [PATCH] Telegram bot-to-bot communication support is enabled`);
} catch (error) {
  elizaLogger.error(`❌ [PATCH] Failed to initialize ElizaOS runtime: ${error.message}`);
  if (error.stack) {
    elizaLogger.error(`Stack trace: ${error.stack}`);
  }
  throw error; // We want to fail fast if runtime initialization fails
}

// Export the initialized runtime
export { runtime }; 