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

// Store the original initialize method
const originalInitialize = plugin.initialize.bind(plugin);

// Add direct initialize method to the plugin instance 
(plugin as any).initialize = async function(runtime: IAgentRuntime) {
  console.log('[TELEGRAM-MULTIAGENT] Direct initialize method called on plugin instance');
  plugin.register(runtime);
  return originalInitialize();
};

// Export the plugin instance as default
export default plugin;