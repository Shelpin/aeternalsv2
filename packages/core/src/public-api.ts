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
  KnowledgeManager,
  // Types required by plugin-bootstrap
  Action,
  ActionExample,
  HandlerCallback, // Renamed from Handler for clarity, assuming ./types
  Objective,
  Evaluator, // Added from ./types
  IMemoryManager, // Export the interface
  // ADDED missing types used by adapter-sqlite
  Relationship,
  ChunkRow,
  // ADDED Agent types
  Agent,
  AgentConfig
} from "./types";

// Re-export specific value constants needed
export { ModelProviderName, CacheStore, ModelClass, ServiceType } from "./types";

// Export cache adapters
export { CacheManager, FsCacheAdapter, DbCacheAdapter, type ICacheAdapter } from "./cache";

// Export context utilities (correct path)
export { elizaLogger } from "./internal/logger-internal";

// Export validation utilities
export { validateCharacterConfig, validateUuid } from "./validation";

// Export environment utilities
export { getEnvVariable } from "./config";

// Export runtime types and instances
export { AgentRuntime } from "./runtime";

// Export parsing utilities
export { parseBooleanFromText, parseJsonArrayFromText, booleanFooter, messageCompletionFooter } from './parsing';

// Export footer and parsing utilities (correct path)
export { stringToUuid } from './uuid';
export { formatMessages } from './messages';

// Export generation functions
export {
  generateMessageResponse,
  generateTrueOrFalse,
  generateText,
  generateObjectArray,
  generateCaption,
  generateImage,
  generateObject
} from "./generation";

// Export embedding functions
export { getEmbeddingZeroVector } from "./embedding";

// Export context composition
export { composeContext } from './context';

// Export embedding utilities
export { embed } from './embedding';

// Existing value exports
export { getGoals } from "./goals";
export { getModulePath } from "./utils/module-path";
export { default as knowledge } from "./knowledge";

// Export MemoryManager implementation
export { MemoryManager } from './memory';

// API types
export type { IAgentRuntimeBridge } from './api/types';
export type { AgentLogLevel, IAgentLogger } from './api/types';

// Stubs - Review if these are still needed or can be removed/implemented
export const settings = {}; // Placeholder

// ADDED DatabaseAdapter class export
export { DatabaseAdapter } from './database';

// Remove the duplicated/old export sections entirely
// // --- REMOVE SECTION START ---
// // ... (all code from the REMOVE SECTION START comment to REMOVE SECTION END comment)
// // --- REMOVE SECTION END --- 