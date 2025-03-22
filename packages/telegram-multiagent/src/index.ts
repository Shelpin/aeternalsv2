/**
 * @elizaos/telegram-multiagent
 * 
 * Multi-agent coordination for Telegram bots in ElizaOS
 */

// Export main plugin class
import { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin';

// Export default plugin creator function
import createPlugin from './TelegramMultiAgentPlugin';

// Export other components for direct use if needed
import { TelegramRelay } from './TelegramRelay';
import { ConversationManager } from './ConversationManager';
import { ConversationKickstarter } from './ConversationKickstarter';

// Export types
import * as Types from './types';

// Export plugin class
export { TelegramMultiAgentPlugin };

// Export components
export { TelegramRelay };
export { ConversationManager };
export { ConversationKickstarter };

// Export types
export { Types };

// Default export - plugin creator
export default createPlugin;