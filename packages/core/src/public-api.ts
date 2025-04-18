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
  ChunkRow
} from "./types.js";

// Re-export specific value constants needed
export { ModelProviderName, CacheStore, ModelClass } from "./types.js";

// Export context utilities (correct path)
export { composeContext } from './context.js';

// Export logger (correct path)
export { elizaLogger } from './logger.js';

// Export footer and parsing utilities (correct path)
export { booleanFooter, messageCompletionFooter, parseJsonArrayFromText, parseBooleanFromText } from './parsing.js';

// Export provider/context functionality (correct paths)
export { embed } from './embedding.js';
export { formatMessages } from './messages.js';

// Export generation functions (assuming path)
export { generateMessageResponse, generateTrueOrFalse, generateText, generateObjectArray } from "./generation.js";

// Existing value exports
export { getGoals } from "./goals.js";
export { AgentRuntime } from "./runtime.js";
export { getModulePath } from "./utils/module-path.js";
export { default as knowledge } from "./knowledge.js";

// Export MemoryManager implementation (assuming from ./memory)
export { MemoryManager } from './memory.js';

// API types
export type { IAgentRuntimeBridge } from './api/types.js';
export type { AgentLogLevel, IAgentLogger } from './api/types.js';

// Stubs - Review if these are still needed or can be removed/implemented
export const CacheManager = {}; // Placeholder
export const DbCacheAdapter = {}; // Placeholder
export const FsCacheAdapter = {}; // Placeholder
export const settings = {}; // Placeholder
export const stringToUuid = (str: string) => str; // Placeholder
export const validateCharacterConfig = (config: any) => true; // Placeholder

// ADDED DatabaseAdapter class export
export { DatabaseAdapter } from './database.js';

// Remove the duplicated/old export sections entirely
// // --- REMOVE SECTION START ---
// // ... (all code from the REMOVE SECTION START comment to REMOVE SECTION END comment)
// // --- REMOVE SECTION END --- 