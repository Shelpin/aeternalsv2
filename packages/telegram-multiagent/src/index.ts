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
            const logger = runtime.getLogger ? runtime.getLogger('MultiAgentClientStart') : console; // Get logger safely

            // VALHALLA FIX: Check if core runtime config includes the telegram client via --clients flag
            const coreClientsConfig = (runtime as any).clientsConfig || (runtime as any)._clientsConfig || []; // Access config safely
            let coreHandlesTelegram = false;
            if (Array.isArray(coreClientsConfig)) {
                coreHandlesTelegram = coreClientsConfig.some(client =>
                    (typeof client === 'string' && client.includes('@elizaos/client-telegram')) ||
                    (typeof client === 'object' && client !== null && client.name === '@elizaos/client-telegram')
                );
            }

            if (coreHandlesTelegram) {
                logger.info('[MultiAgentPlugin] Core runtime configuration includes @elizaos/client-telegram. Skipping plugin-based client initialization.');
                return; // Exit early
            }

            console.log('[MultiAgentPlugin] Attempting to start embedded Telegram client...');

            // VALHALLA FIX: Check if core runtime already initialized the client via --clients flag
            // Declare globalThis with the expected runtime structure
            declare const globalThis: { __elizaRuntime?: { clients?: { telegram?: any }, getSecret?: (key: string) => string | undefined } };

            if (globalThis.__elizaRuntime?.clients?.telegram) {
                console.log('[MultiAgentPlugin] Detected existing global Telegram client (likely from --clients flag). Skipping plugin-based client initialization.');
                // Optionally, ensure the instance is returned if needed downstream, though maybe not necessary
                // return globalThis.__elizaRuntime.clients.telegram;
                return; // Exit early, do not re-initialize
            }

            console.log('[MultiAgentPlugin] No global Telegram client detected. Proceeding with plugin-based initialization (check configuration if --clients was intended).');

            // Retrieve token - Ensure runtime and character structure is correct
            // Safely access nested properties
            const isProduction = process.env.NODE_ENV === 'production';
            const secrets = (runtime?.character && typeof runtime.character === 'object' && 'secrets' in runtime.character) ? runtime.character.secrets : {};
            const settings = (runtime?.character && typeof runtime.character === 'object' && 'settings' in runtime.character) ? runtime.character.settings : {};
            const agentId = runtime.getAgentId ? runtime.getAgentId() : 'unknown'; // Ensure getAgentId exists
            // Retrieve token using the globally patched runtime to ensure getSecret is available
            let token: string | undefined | null = undefined;
            // Declare globalThis with the expected runtime structure
            declare const globalThis: { __elizaRuntime?: { getSecret?: (key: string) => string | undefined } };

            if (typeof globalThis.__elizaRuntime?.getSecret === 'function') {
                token = globalThis.__elizaRuntime.getSecret('TELEGRAM_BOT_TOKEN');
                if (token) {
                    console.log('[MultiAgentPlugin] Found Telegram token via runtime.getSecret().');
                } else {
                    console.log('[MultiAgentPlugin] globalThis.__elizaRuntime.getSecret("TELEGRAM_BOT_TOKEN") returned null/undefined. Trying agent-specific env var as fallback.');
                    const tokenVarName = agentId ? `TELEGRAM_BOT_TOKEN_${agentId}` : null;
                    token = tokenVarName ? process.env[tokenVarName] : undefined;
                    if (token) {
                        console.log(`[MultiAgentPlugin] Using Telegram token from environment variable: ${tokenVarName}`);
                    }
                }
            } else {
                console.warn('[MultiAgentPlugin] globalThis.__elizaRuntime.getSecret method not found. Falling back to direct access (may be unsubstituted).');
                // Fallback to previous direct access method if getSecret isn't available
                token = (secrets as any)?.TELEGRAM_BOT_TOKEN || (settings as any)?.secrets?.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || null;
            }

            // Final check and validation
            if (!token) {
                console.error(`[MultiAgentPlugin] CRITICAL: No Telegram token found via getSecret, environment, or character secrets for agent ${agentId}.`);
                return null; // Cannot start client without token
            }

            // Validation: Ensure token doesn't look like a placeholder
            if (token.includes('${') && token.includes('}')) {
                console.error(`[MultiAgentPlugin] CRITICAL: Retrieved token still contains placeholder pattern: ${token.substring(0, 10)}...`);
                throw new Error(`Invalid bot token detected (placeholder): ${token.substring(0, 10)}...`);
            }

            try {
                // Dynamically import the client package
                const telegramClientModule = await import('@elizaos/telegram-client');
                const clientInstance = telegramClientModule.default; // Assuming default export is the singleton

                // Initialize the client if the method exists, then return the instance
                if (typeof (clientInstance as any).initialize === 'function') {
                    (clientInstance as any).initialize(token, runtime);
                    console.log('[MultiAgentPlugin] Telegram client initialized via plugin start method.');

                    // VALHALLA FIX: Explicitly stop polling for the client instance managed by the multi-agent plugin
                    if (typeof (clientInstance as any).stop === 'function') {
                        (clientInstance as any).stop(); // Assuming stop() handles polling termination
                        console.log('[MultiAgentPlugin] Explicitly stopped polling for multi-agent client instance.');
                    } else if ((clientInstance as any).bot && typeof (clientInstance as any).bot.stopPolling === 'function') {
                        // Fallback: try accessing the underlying bot object if available
                        (clientInstance as any).bot.stopPolling();
                        console.log('[MultiAgentPlugin] Explicitly stopped polling via underlying bot object.');
                    } else {
                        console.warn('[MultiAgentPlugin] Could not explicitly stop polling - stop() or bot.stopPolling() method not found on client instance.');
                    }

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

// Re-export types for easier consumption
export * from './types.js';
export { ConversationManager } from './ConversationManager.js';
export { PersonalityEnhancer } from './PersonalityEnhancer.js';
export { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin.js';

// Re-export TelegramRelay for external use (e.g. runtime-patch)
export { TelegramRelay } from './TelegramRelay.js';

// Make sure the conversation types are exported through index.ts
export * from './types/conversation.js';

// Verification logging to confirm initialize is now a direct property
console.log("[TELEGRAM-MULTIAGENT] Plugin created with these properties:");
console.log("Own keys:", Object.keys(plugin)); // Should include 'initialize'
console.log("Has initialize:", typeof plugin.initialize === 'function'); // Should be true
console.log("plugin instanceof TelegramMultiAgentPlugin:", plugin instanceof TelegramMultiAgentPlugin);

// Export the plugin instance as default
export default plugin;