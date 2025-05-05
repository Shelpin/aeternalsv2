/**
 * @elizaos/telegram-multiagent
 * 
 * Multi-agent coordination for Telegram bots in ElizaOS
 */

// @ts-nocheck - Removed temporarily to allow ambient declaration
declare const process: any; // Declare process as ambient global for this file

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
            const isProduction = process.env.NODE_ENV === 'production';
            const secrets = (runtime?.character && typeof runtime.character === 'object' && 'secrets' in runtime.character) ? runtime.character.secrets : {};
            const settings = (runtime?.character && typeof runtime.character === 'object' && 'settings' in runtime.character) ? runtime.character.settings : {};
            const agentId = runtime.getAgentId ? runtime.getAgentId() : 'unknown'; // Ensure getAgentId exists
            // Retrieve token using runtime.getSecret to ensure substitution
            let token: string | undefined | null = null;
            if (typeof runtime.getSecret === 'function') {
                token = runtime.getSecret('TELEGRAM_BOT_TOKEN');
                if (token) {
                    console.log('[MultiAgentPlugin] Found Telegram token via runtime.getSecret().');
                } else {
                    console.log('[MultiAgentPlugin] runtime.getSecret("TELEGRAM_BOT_TOKEN") returned null/undefined.');
                }
            } else {
                console.warn('[MultiAgentPlugin] runtime.getSecret method not found. Falling back to direct access (may be unsubstituted).');
                // Fallback to previous direct access method if getSecret isn't available
                token = (secrets as any)?.TELEGRAM_BOT_TOKEN || (settings as any)?.secrets?.TELEGRAM_BOT_TOKEN || null;
            }

            if (!token) {
                console.error('[MultiAgentPlugin] Telegram token not found in runtime character secrets.');
                // Attempt to get from environment as a last resort, using the specific agent ID
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

                // Initialize the client if the method exists, then return the instance
                if (typeof (clientInstance as any).initialize === 'function') {
                    (clientInstance as any).initialize(token, runtime);
                    console.log('[MultiAgentPlugin] Telegram client initialized via plugin start method.');
                } else {
                    console.warn('[MultiAgentPlugin] Telegram client initialize method not found—skipping init.');
                }
                return clientInstance;

            } catch (error) {
                console.error(`[MultiAgentPlugin] Error importing or initializing Telegram client: ${error}`);
                return null;
            }
        }
    }
];
console.log('[MultiAgentPlugin] Added clients array to plugin instance.');
// ---- END ADDED LOGIC ----

// Re-export TelegramRelay for external use (e.g. runtime-patch)
export { TelegramRelay } from './TelegramRelay.js';

export * from './TelegramRelay.js';

// Verification logging to confirm initialize is now a direct property
console.log("[TELEGRAM-MULTIAGENT] Plugin created with these properties:");
console.log("Own keys:", Object.keys(plugin)); // Should include 'initialize'
console.log("Has initialize:", typeof plugin.initialize === 'function'); // Should be true
console.log("plugin instanceof TelegramMultiAgentPlugin:", plugin instanceof TelegramMultiAgentPlugin);

// Export the plugin instance as default
export default plugin;