import { Plugin } from './types';
import { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin';

// Debug log to understand module loading
console.log('[DEBUG] telegram-multiagent index.ts is being evaluated');

// Create singleton instance early
const pluginInstance = new TelegramMultiAgentPlugin({});

// MODULE-LEVEL PROPERTIES
// These become accessible as properties of the module itself
// Making them accessible both through import and require
module.exports.name = "@elizaos/telegram-multiagent";
module.exports.description = "Enables multi-agent coordination in Telegram groups";
module.exports.npmName = "@elizaos/telegram-multiagent";

// Add initialize function at module level
module.exports.initialize = async function() {
  console.log('[DEBUG] Module-level initialize() called directly');
  return pluginInstance.initialize();
};

// Add shutdown function at module level
module.exports.shutdown = async function() {
  console.log('[DEBUG] Module-level shutdown() called directly');
  return pluginInstance.shutdown();
};

// Export all components
export { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
export { TelegramRelay } from './TelegramRelay';
export { ConversationManager } from './ConversationManager';
export { PersonalityEnhancer } from './PersonalityEnhancer';
export { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin';

// Export types
export { type ElizaLogger, type Plugin, type IAgentRuntime } from './types';

// Plugin configuration options
export interface TelegramMultiAgentPluginConfig {
  relayServerUrl: string;
  authToken: string;
  groupIds: number[];
  conversationCheckIntervalMs?: number;
  enabled?: boolean;
}

// Create a formal plugin object
export const telegramMultiAgentPlugin = {
  name: "@elizaos/telegram-multiagent",
  description: "Enables multi-agent coordination in Telegram groups",
  npmName: "@elizaos/telegram-multiagent",

  initialize: async function() {
    console.log('[PLUGIN_OBJECT] telegramMultiAgentPlugin.initialize called');
    return pluginInstance.initialize();
  },

  shutdown: async function() {
    console.log('[PLUGIN_OBJECT] telegramMultiAgentPlugin.shutdown called');
    return pluginInstance.shutdown();
  }
} as Plugin;

// Also export as default
export default telegramMultiAgentPlugin;

// Final debug log
console.log('[DEBUG] telegram-multiagent index.ts evaluation complete');