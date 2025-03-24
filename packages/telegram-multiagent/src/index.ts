/**
 * @elizaos/telegram-multiagent
 * 
 * Multi-agent coordination for Telegram bots in ElizaOS
 */

// Import the plugin class with .js extension for ESM
import { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin.js';

// Create a plugin instance
const plugin = new TelegramMultiAgentPlugin();

// Explicitly bind initialize as a direct property on the object
// This ensures ElizaOS can detect it with typeof plugin.initialize === 'function'
plugin.initialize = plugin.initialize.bind(plugin);

// Verification logging to confirm initialize is now a direct property
console.log("[TELEGRAM-MULTIAGENT] Plugin created with these properties:");
console.log("Own keys:", Object.keys(plugin)); // Should include 'initialize'
console.log("Has initialize:", typeof plugin.initialize === 'function'); // Should be true
console.log("plugin instanceof TelegramMultiAgentPlugin:", plugin instanceof TelegramMultiAgentPlugin);

// Export the plugin instance as default
export default plugin;