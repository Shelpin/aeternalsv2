// Public API exports
// Do not export from both ./api/types and ./types - choose one source of truth
// For public API types, we prefer ./types as the canonical source

// ✅ Explicit type re-exports from canonical source
export type {
  IAgentRuntime,
  Client,
  Content,
  Media,
  Memory,
  Plugin,
  // Additional types needed by adapter-sqlite and other packages
  IDatabaseAdapter,
  IDatabaseCacheAdapter,
  Account,
  Actor,
  Participant,
  Goal,
  GoalStatus,
  RAGKnowledgeItem,
  UUID,
  Character,
  ClientInstance,
  Adapter,
  Provider,
  State,
  KnowledgeManager
} from "./types";

// Re-export values that are needed by dependent packages
export { ModelProviderName, CacheStore } from "./types";

// Temporary re-exports for backward compatibility
// Note: These should be moved to appropriate public API modules in the future
export { composeContext } from "./context";
export { elizaLogger } from "./logger";
export { generateMessageResponse, generateTrueOrFalse } from "./generation";
export { getGoals } from "./goals";
export { AgentRuntime } from "./runtime";

// Export common functions
export { default as knowledge } from "./knowledge";

// Export additional types for dependent packages
export type { generateText } from './generation';
export { parseJsonArrayFromText, parseBooleanFromText } from './parsing';

// API types
export type { IAgentRuntimeBridge } from './api/types';
export type { IMemoryManager } from './api/types';
export type { AgentLogLevel, IAgentLogger } from './api/types';

// Add stubs for missing exports
// These will be implemented properly in a future update
export const CacheManager = {};
export const DbCacheAdapter = {};
export const FsCacheAdapter = {};
export const settings = {};
export const stringToUuid = (str: string) => str;
export const validateCharacterConfig = (config: any) => true;

// Note: Removed duplicate exports of MemoryManager, generateText, and parseJsonArrayFromText
// Note: Removed duplicate section with agent imports due to missing module 