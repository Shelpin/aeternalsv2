/**
 * Telegram Multi-Agent Plugin for ElizaOS
 * Enables multi-agent coordination in Telegram groups
 */

import { Plugin } from './types';
import { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin';
import BetterSqlite3 from 'better-sqlite3';

// Global runtime reference
let sharedRuntime = null;

// Debug log to understand module loading
console.log('[DEBUG] telegram-multiagent index.ts is being evaluated');

// Make better-sqlite3 available globally if needed
(globalThis as any).betterSqlite3 = BetterSqlite3;
console.log('[DEBUG] BetterSqlite3 imported and made globally available');

/**
 * Pre-register the runtime with the plugin
 * This should be called by ElizaOS core during plugin loading
 */
export function preRegisterRuntime(runtime: any) {
  if (!runtime) {
    console.warn('[PLUGIN] telegram-multiagent: Attempted to register null runtime');
    return;
  }
  
  console.log('[PLUGIN] telegram-multiagent: Pre-registering runtime');
  
  // Store runtime in module-level variable
  sharedRuntime = runtime;
  
  // Also make available globally for legacy code
  try {
    (globalThis as any).__elizaRuntime = runtime;
    (globalThis as any).__telegramMultiAgentRuntime = runtime;
  } catch (error) {
    console.warn('[PLUGIN] telegram-multiagent: Failed to store runtime globally', error);
  }
}

/**
 * Get the shared runtime instance
 */
export function getSharedRuntime() {
  return sharedRuntime;
}

// Create plugin instance
const pluginInstance = new TelegramMultiAgentPlugin();

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

// Add default export for compatibility with ElizaOS plugin system
export default telegramMultiAgentPlugin;

// Export the plugin class for direct usage
export { TelegramMultiAgentPlugin };

// Final debug log
console.log('[DEBUG] telegram-multiagent index.ts evaluation complete');