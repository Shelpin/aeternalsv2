/**
 * @elizaos/telegram-multiagent
 * 
 * Multi-agent coordination for Telegram bots in ElizaOS
 */

// Import the plugin class with .js extension for ESM
import { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin.js';
import { IAgentRuntime } from './types.js';

// Create a plugin instance
const plugin = new TelegramMultiAgentPlugin();

// Explicitly bind initialize as a direct property on the object
// This ensures ElizaOS can detect it with typeof plugin.initialize === 'function'
plugin.initialize = plugin.initialize.bind(plugin);

// ---- ADDED CLIENT EXPOSURE LOGIC ----
plugin.clients = [
    {
        name: '@elizaos/clients/telegram', // Use the correct package name
        start: async (runtime: IAgentRuntime) => {
            console.log('[MultiAgentPlugin] Attempting to start embedded Telegram client...');
            // Retrieve token - Ensure runtime and character structure is correct
            // Safely access nested properties
            let token = runtime?.character?.secrets?.TELEGRAM_BOT_TOKEN ||
                runtime?.character?.settings?.secrets?.TELEGRAM_BOT_TOKEN;

            if (!token) {
                console.error('[MultiAgentPlugin] Telegram token not found in runtime character secrets.');
                // Attempt to get from environment as a last resort, using the specific agent ID
                const agentId = runtime?.getAgentId ? runtime.getAgentId() : process.env.AGENT_ID;
                const tokenVarName = agentId ? `TELEGRAM_BOT_TOKEN_${agentId}` : null;
                const envToken = tokenVarName ? process.env[tokenVarName] : null;

                if (!envToken) {
                    console.error(`[MultiAgentPlugin] Telegram token also not found in environment variable: ${tokenVarName}`);
                    return null; // Cannot start client without token
                }
                console.log(`[MultiAgentPlugin] Using Telegram token from environment variable: ${tokenVarName}`);
                token = envToken;
            } else {
                console.log('[MultiAgentPlugin] Found Telegram token in character secrets.');
            }

            try {
                // Dynamically import the client package
                const telegramClientModule = await import('@elizaos/telegram-client');
                const clientInstance = telegramClientModule.default; // Assuming default export is the singleton

                if (clientInstance && typeof clientInstance.initialize === 'function') {
                    clientInstance.initialize(token, runtime); // Pass runtime to allow injection
                    console.log('[MultiAgentPlugin] Telegram client initialized via plugin start method.');
                    return clientInstance; // Return the initialized instance
                } else {
                    console.error('[MultiAgentPlugin] Imported Telegram client module or its initialize function is invalid.');
                    return null;
                }
            } catch (error) {
                console.error(`[MultiAgentPlugin] Error importing or initializing Telegram client: ${error}`);
                return null;
            }
        }
    }
];
console.log('[MultiAgentPlugin] Added clients array to plugin instance.');
// ---- END ADDED LOGIC ----

// Verification logging to confirm initialize is now a direct property
console.log("[TELEGRAM-MULTIAGENT] Plugin created with these properties:");
console.log("Own keys:", Object.keys(plugin)); // Should include 'initialize'
console.log("Has initialize:", typeof plugin.initialize === 'function'); // Should be true
console.log("plugin instanceof TelegramMultiAgentPlugin:", plugin instanceof TelegramMultiAgentPlugin);

// Export the plugin instance as default
export default plugin;