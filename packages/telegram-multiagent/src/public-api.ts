/**
 * Public API for Telegram Multi-Agent
 * This file re-exports the public API from the package
 */

// Export specific types rather than wildcards to avoid duplicate exports
// Import and re-export specific types from types.js
import {
    ElizaLogger,
    IAgentRuntime,
    Plugin,
    TypingSimulation,
    TelegramMultiAgentConfig,
    KickstarterConfig,
    PersonalityTraits,
    PersonalityVoice,
    MessageStatus,
    RelayMessage,
    TelegramRelayConfig,
    ConversationStateTracking,
    FollowUpType,
    Character,
    Topic,
    Runtime,
    PersonalityStyle
} from './types.js';

// Re-export the types
export {
    ElizaLogger,
    IAgentRuntime,
    Plugin,
    TypingSimulation,
    TelegramMultiAgentConfig,
    KickstarterConfig,
    PersonalityTraits,
    PersonalityVoice,
    MessageStatus,
    RelayMessage,
    TelegramRelayConfig,
    ConversationStateTracking,
    FollowUpType,
    Character,
    Topic,
    Runtime,
    PersonalityStyle
};

// Export components and classes with wildcards since they don't have duplicates
export * from './ConversationManager.js';
export * from './TelegramRelay.js';
export * from './PersonalityEnhancer.js';
export * from './PluginComponent.js';
export * from './FallbackMemoryManager.js';
export * from './SqliteAdapterProxy.js';
export * from './TelegramMultiAgentPlugin.js';
export * from './ConversationKickstarter.js';
export * from './TelegramCoordinationAdapter.js';
export * from './ConversationFlow.js';
export * from './TypingSimulator.js';
export * from './utils.js';
export * from './schema.js'; 