Based on my review, there's a contradiction in your code:
The plugin says it's "Using ElizaOS core for Telegram polling" in the logs, but it's also immediately implementing direct Telegram polling with this.startTelegramPolling().

   if (runtime.client?.telegram) {
     runtime.client.telegram.on('message', async (message) => {
       // Message handling logic
     });
   } else {
     this.logger.warn(`[REGISTER] ${this.name}: ElizaOS Telegram client not available`);
   }

   But the logs show that the ElizaOS Telegram client is not available, as shown by the error message "ElizaOS Telegram client not available".
The code also has direct Telegram polling implemented in the startTelegramPolling() method, which is being called during initialization.
Let me remove the custom polling implementation:

// ... existing code ...
      // VALHALLA FIX: Remove custom Telegram polling and rely on ElizaOS core
      this.logger.info(`[PLUGIN] Using ElizaOS core for Telegram polling`);
      
      // VALHALLA FIX: Implement direct Telegram polling instead of relying on ElizaOS core
      // this.logger.info(`[PLUGIN] Implementing direct Telegram polling`);
      // this.startTelegramPolling();
      
      // Connect to relay
// ... existing code ...

Now let's add more detailed logging for the ElizaOS client setup to help debug why it's not available:

// ... existing code ...
      // VALHALLA FIX: Hook into ElizaOS core's message events with enhanced logging
      if (runtime.client?.telegram) {
        this.logger.info(`[PLUGIN] ElizaOS Telegram client found: ${typeof runtime.client.telegram}`, '', '');
        this.logger.info(`[PLUGIN] ElizaOS Telegram client keys: ${Object.keys(runtime.client.telegram).join(', ')}`, '', '');
        
        runtime.client.telegram.on('message', async (message) => {
// ... existing code ...
      } else {
        this.logger.error(`[PLUGIN][VALHALLA][FLOW] ElizaOS Telegram client not available`);
        this.logger.info(`[PLUGIN] Runtime client keys: ${runtime.client ? Object.keys(runtime.client).join(', ') : 'client not available'}`, '', '');
        this.logger.info(`[PLUGIN] Runtime keys: ${Object.keys(runtime).join(', ')}`, '', '');
      }
// ... existing code ...

Let's also update the handleIncomingMessage method to properly check for and use the ElizaOS Telegram client:

Based on my review, I'm making these changes:
I've removed the custom Telegram polling implementation by commenting out the startTelegramPolling() call in the initialize() method.
I've added enhanced logging for the ElizaOS Telegram client to help debug why it's not available.
The code already has appropriate checks for using the ElizaOS Telegram client in the handleIncomingMessage method:

   // If we have the Telegram client from ElizaOS, use it
   if (this.runtime?.client?.telegram) {
     try {
       // Send via ElizaOS client
       await this.runtime.client.telegram.sendMessage(groupId, cleanedText);
       this.logger.info(`[PLUGIN][VALHALLA][FLOW] Message sent via ElizaOS Telegram client`, '', '');
       
       // Forward to relay so other bots can see it
       if (this.relay) {
         await this.relay.sendMessage(groupId, cleanedText);
         this.logger.info(`[PLUGIN][VALHALLA][FLOW] Message forwarded to relay for other bots`, '', '');
       }
     } catch (telegramError) {
       this.logger.error(`[PLUGIN][VALHALLA][FLOW] Error sending message via ElizaOS client: ${telegramError.message}`, '', '');
     }
   } else {
     this.logger.error(`[PLUGIN][VALHALLA][FLOW] ElizaOS Telegram client not available`, '', '');
   }

   The plugin is now configured to use the ElizaOS Telegram client for polling instead of custom polling. The logs will provide more detail about why the ElizaOS Telegram client might not be available.