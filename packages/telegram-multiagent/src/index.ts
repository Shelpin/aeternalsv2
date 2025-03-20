import { Plugin } from './types';
import { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin';
// Import better-sqlite3 directly at the module level
import BetterSqlite3 from 'better-sqlite3';

// Debug log to understand module loading
console.log('[DEBUG] telegram-multiagent index.ts is being evaluated');

// Make better-sqlite3 available globally if needed
globalThis.betterSqlite3 = BetterSqlite3;
console.log('[DEBUG] BetterSqlite3 imported and made globally available');

// Define KickstarterConfig locally to avoid import issues
interface KickstarterConfig {
  minInterval: number;
  maxInterval: number;
  probabilityFactor: number;
  maxActiveConversationsPerGroup: number;
  shouldTagAgents: boolean;
  maxAgentsToTag: number;
  persistConversations: boolean;
}

// Plugin configuration options
export interface TelegramMultiAgentPluginConfig {
  relayServerUrl: string;
  authToken: string;
  groupIds: number[];
  conversationCheckIntervalMs?: number;
  enabled?: boolean;
  // SQLite adapter options
  useSqliteAdapter?: boolean;
  dbPath?: string;
  // Kickstarter configuration
  kickstarterConfig?: Partial<KickstarterConfig>;
}

// Create plugin instance with explicit configuration
let pluginConfig = {
  relayServerUrl: process.env.RELAY_SERVER_URL || 'http://localhost:4000',
  authToken: process.env.RELAY_AUTH_TOKEN || 'elizaos-secure-relay-key',
  agentId: process.env.AGENT_ID,
  groupIds: [],
  enabled: true,
  useSqliteAdapter: process.env.USE_SQLITE === 'true' || true,
  dbPath: process.env.SQLITE_DB_PATH || ':memory:'
};

// Create plugin instance
const pluginInstance = new TelegramMultiAgentPlugin(pluginConfig);

// MODULE-LEVEL PROPERTIES
// These become accessible as properties of the module itself
// Making them accessible both through import and require
export { TelegramMultiAgentPlugin };
// Define module-level functions first
const moduleInitialize = async function() {
  console.log('[DEBUG] Module-level initialize() called directly');
  return pluginInstance.initialize();
};

const moduleShutdown = async function() {
  console.log('[DEBUG] Module-level shutdown() called directly');
  return pluginInstance.shutdown();
};

// Export module-level functions with a single export statement
export { moduleInitialize as initialize, moduleShutdown as shutdown };
export const name = "@elizaos/telegram-multiagent";

// Export all components
export { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
export { TelegramRelay } from './TelegramRelay';
export { ConversationManager } from './ConversationManager';
export { PersonalityEnhancer } from './PersonalityEnhancer';
export { ConversationKickstarter, KickstarterConfig } from './ConversationKickstarter';
export { SqliteDatabaseAdapter } from './SqliteAdapterProxy';

// Export types
export { type ElizaLogger, type Plugin, type IAgentRuntime } from './types';

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

// Final debug log
console.log('[DEBUG] telegram-multiagent index.ts evaluation complete');