// Export all components
export { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
export { TelegramRelay } from './TelegramRelay';
export { ConversationManager } from './ConversationManager';
export { PersonalityEnhancer } from './PersonalityEnhancer';
export { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin';

// Export types
export interface ElizaLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface IAgentRuntime {
  registerPlugin(plugin: any): boolean;
}

// Plugin configuration options
export interface TelegramMultiAgentPluginConfig {
  relayServerUrl: string;
  authToken: string;
  groupIds: number[];
  conversationCheckIntervalMs?: number;
  enabled?: boolean;
}

// Re-export types from other files
export * from './types'; 