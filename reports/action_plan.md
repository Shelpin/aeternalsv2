# Aeternals Multi-Agent System - Action Plan

## 📊 Current Status

After analyzing the system logs and code, I've confirmed the issues identified by ElizaOS Assistant:

1. **Runtime Initialization Issue**: 
   - ElizaOS does not automatically call `plugin.register(runtime)` on the plugin instance
   - It only calls `plugin.initialize()` without arguments
   - Our current implementation is returning `false` when register receives null runtime
   - The waitForRuntime pattern is implemented but not accessing runtime through alternative methods

2. **Plugin Export Issue**:
   - Current index.ts attempts to monkey-patch initialize to call register(runtime)
   - This approach fails because ElizaOS calls initialize() with no arguments

3. **Relay Server Registration**:
   - No agents are connecting to the relay server due to runtime initialization failure
   - All 6 agents show the same error pattern: "Runtime wait timed out after 30000ms"

## 🛠️ Proposed Solution

The solution aligns with ElizaOS Assistant's recommendations:

1. **Fix index.ts**:
   - Remove the monkey-patching of the initialize method
   - Export the plugin instance directly as default

2. **Update TelegramMultiAgentPlugin.ts**:
   - Modify waitForRuntime to check for global runtime via globalThis
   - Move all runtime-dependent initialization into initialize() method
   - Properly handle the case where register() receives null runtime
   - Assign runtime obtained through waitForRuntime to this.runtime

3. **Update Component Initialization**:
   - Only construct ConversationManager, Kickstarter, etc. after waitForRuntime succeeds
   - Ensure all components get the runtime instance after it's properly fetched

## 📝 Implementation Steps

1. **Update index.ts**:
   ```typescript
   import { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin.js';
   
   const plugin = new TelegramMultiAgentPlugin();
   
   // Export plugin as default (ElizaOS loads this)
   export default plugin;
   ```

2. **Update PluginComponent.ts - waitForRuntime method**:
   ```typescript
   protected async waitForRuntime(timeoutMs: number = 30000): Promise<IAgentRuntime> {
     // First check this.runtime normally
     if (this.runtime && 
         typeof this.runtime.getAgentId === 'function' && 
         typeof this.runtime.getLogger === 'function') {
       return this.runtime;
     }
     
     this.logger.debug(`Waiting for runtime to be available and ready (timeout: ${timeoutMs}ms)`);
     
     const interval = 100;
     let elapsed = 0;
     
     // Use polling with timeout
     while (elapsed < timeoutMs) {
       // Check this.runtime again
       if (this.runtime && 
           typeof this.runtime.getAgentId === 'function' && 
           typeof this.runtime.getLogger === 'function') {
         this.logger.debug('Runtime is available via this.runtime with all required methods');
         return this.runtime;
       }
       
       // Check for global runtime
       const rt = globalThis.__elizaRuntime || globalThis.__telegramMultiAgentRuntime;
       if (rt && typeof rt.getAgentId === 'function' && typeof rt.getLogger === 'function') {
         this.logger.debug('Runtime found via globalThis with all required methods');
         this.runtime = rt; // Store it for future use
         return rt;
       }
       
       // Wait for a short interval
       await new Promise(resolve => setTimeout(resolve, interval));
       elapsed += interval;
     }
     
     // If we get here, timeout occurred
     const error = new Error(`Runtime wait timed out after ${timeoutMs}ms`);
     this.logger.error(`[RUNTIME] ${error.message}`);
     throw error;
   }
   ```

3. **Update TelegramMultiAgentPlugin.ts - register method**:
   ```typescript
   register(runtime: IAgentRuntime): Plugin | boolean {
     try {
       console.log(`[REGISTER] ${this.name}: Register method called`);
       
       // Store runtime reference even if null, don't fail immediately
       if (!runtime) {
         console.warn(`[REGISTER] ${this.name}: Received null runtime, will attempt to obtain later`);
         // Return this instead of false to allow initialization to proceed
         return this;
       }
       
       // Store the runtime reference in parent class
       super.setRuntime(runtime);
       console.log(`[REGISTER] ${this.name}: Runtime reference stored successfully`);
       
       return this;
     } catch (error) {
       console.error(`[ERROR] ${this.name}: Unexpected error during plugin registration: ${error}`);
       return false;
     }
   }
   ```

4. **Update TelegramMultiAgentPlugin.ts - _initialize method**:
   ```typescript
   private async _initialize(): Promise<void> {
     try {
       console.log(`[ELIZAOS] ${this.name}: Initialize method called`);
       
       // Skip if already initialized
       if (this.initialized) {
         console.log(`[ELIZAOS] ${this.name}: Already initialized, skipping`);
         return;
       }
       
       // IMPORTANT: Wait for runtime to be fully available with all required methods
       let runtime: IAgentRuntime;
       try {
         // Get runtime via waitForRuntime (which now checks globalThis)
         runtime = await this.waitForRuntime(30000); // 30 second timeout
         
         // Ensure this.runtime is set properly
         this.runtime = runtime;
         
         this.logger.info(`${this.name}: Runtime is now available and fully initialized!`);
         
         // Test runtime functionality to ensure methods are ready
         this.testRuntime();
         
         // Now that runtime is guaranteed available, get the proper logger
         this.logger = runtime.getLogger('telegram-multiagent');
         
         // Get agent ID now that we know runtime is available
         this.agentId = runtime.getAgentId();
         this.logger.info(`${this.name}: Got agent ID from runtime: ${this.agentId}`);
         
         // ONLY NOW initialize components with runtime
         this.conversationManager = new ConversationManager(this.logger);
         this.conversationManager.setRuntime(runtime);
         await this.conversationManager.initialize();
         
         // Initialize kickstarter
         const kickstarter = new ConversationKickstarter(this.logger);
         kickstarter.setRuntime(runtime);
         await kickstarter.initialize();
         this.kickstarters.set(this.agentId, kickstarter);
         
         // Initialize relay
         this.relay = new TelegramRelay({
           relayServerUrl: this.config.relayServerUrl,
           authToken: this.config.authToken,
           agentId: this.agentId
         }, this.logger);
         
         // Set up relay message handling
         this.relay.onMessage(this.handleRelayMessage.bind(this));
         
         // Connect to relay server
         await this.relay.connect();
         
         // Set up conversation check interval
         if (this.config.conversationCheckIntervalMs) {
           this.checkIntervalId = setInterval(() => {
             this.checkConversations().catch(error => {
               this.logger.error(`Error in conversation check: ${error}`);
             });
           }, this.config.conversationCheckIntervalMs);
         }
         
         this.initialized = true;
         this.logger.info(`${this.name}: Plugin initialized successfully!`);
         
       } catch (error) {
         this.logger.error(`${this.name}: Runtime initialization failed: ${error.message}`);
         this.logger.warn(`${this.name}: Continuing with limited functionality - autonomous responses may not work`);
         return;
       }
     } catch (error) {
       this.logger.error(`${this.name}: Initialization error: ${error}`);
     }
   }
   ```

5. **Update ConversationManager and ConversationKickstarter**:
   - Ensure they use the waitForRuntime pattern consistently
   - Never access this.runtime directly without checking if it's null
   - Get runtime via waitForRuntime at the beginning of each method that needs it

## 🧪 Testing Plan

1. Rebuild the plugin after making changes:
   ```bash
   cd /root/eliza/packages/telegram-multiagent
   pnpm build
   ```

2. Restart the system:
   ```bash
   cd /root/eliza
   ./clean_restart.sh
   ```

3. Monitor logs to verify:
   - Plugin initialization success
   - Runtime detection via globalThis
   - Connection to the relay server
   - Proper handling of Telegram messages

## 🔍 Success Criteria

The implementation will be considered successful when:

1. All agents connect to the relay server successfully
2. Agents respond to messages in the Telegram group
3. Agents can see and process other bots' messages
4. No runtime timeout errors appear in the logs
5. Conversation kickstarting works, triggering autonomous interactions 