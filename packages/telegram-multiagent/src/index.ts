/**
 * @elizaos/telegram-multiagent
 * 
 * Multi-agent coordination for Telegram bots in ElizaOS
 */

// Import the plugin class
import { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin';

// Export components for direct use if needed
import { TelegramRelay } from './TelegramRelay';
import { ConversationManager } from './ConversationManager';
import { ConversationKickstarter } from './ConversationKickstarter';

// Export types
import * as Types from './types';

// Export components (named exports)
export { TelegramMultiAgentPlugin };
export { TelegramRelay };
export { ConversationManager };
export { ConversationKickstarter };
export { Types };

// Create plugin instance
const telegramMultiAgentPlugin = new TelegramMultiAgentPlugin();

// CRITICAL FIX: Explicitly attach the initialize method to make it directly accessible
// ElizaOS plugin system likely checks for the method directly, not via the prototype
const pluginExport = {
  ...telegramMultiAgentPlugin,
  // Explicitly bind initialize method to the instance
  initialize: telegramMultiAgentPlugin.initialize.bind(telegramMultiAgentPlugin),
  // Explicitly bind shutdown method as well
  shutdown: telegramMultiAgentPlugin.shutdown.bind(telegramMultiAgentPlugin)
};

// Log the plugin instance for debugging
console.log('[TELEGRAMMODULE] Creating plugin instance');
console.log('[TELEGRAMMODULE] Plugin has initialize method:', typeof pluginExport.initialize === 'function');
console.log('[TELEGRAMMODULE] Direct check if initialize exists:', 'initialize' in pluginExport);

// Default export - plugin instance with explicitly attached methods
export default pluginExport;