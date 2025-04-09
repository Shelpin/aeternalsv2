// Public API exports
export * from "./api/types";

// ✅ Explicit type re-exports:
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
  ModelProviderName,
  CacheStore
} from "./types";

// Temporary re-exports for backward compatibility
// Note: These should be moved to appropriate public API modules in the future
export { composeContext } from "./context";
export { elizaLogger } from "./logger";
export { generateMessageResponse, generateTrueOrFalse } from "./generation";
export { getGoals } from "./goals";
export { MemoryManager } from "./memory";
export { AgentRuntime } from "./runtime";

// Export common functions
export { default as knowledge } from "./knowledge";
