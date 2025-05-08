// Public API exports
// Do not export from both ./api/types and ./types - choose one source of truth
// For public API types, we prefer ./types as the canonical source

// Export types sourced DIRECTLY from @elizaos/types
export type {
  IAgentRuntime,
  Client,
  Content,
  Media,
  Memory,
  MemoryContent,
  Plugin,
  IDatabaseAdapter,
  Goal,
  GoalStatus,
  Actor,
  Objective,
  Relationship,
  Account,
  Participant,
  ClientInstance,
  Adapter,
  Service,
  Provider,
  Action,
  ActionExample,
  Evaluator,
  EvaluationExample,
  Handler,
  HandlerCallback,
  Validator,
  State,
  Character,
  RAGKnowledgeItem,
  IMemoryManager,
  Logger,
  FetchFunction,
  CacheOptions,
  ICacheManager,
  IRAGKnowledgeManager,
  KnowledgeItem,
  ActionResponse,
  CacheKeyPrefix,
  DirectoryItem,
  ChunkRow,
  IDatabaseCacheAdapter,
  IImageDescriptionService,
  ITextGenerationService,
  TelemetrySettings,
  UUID
} from '@elizaos/types';

// Export enums/constants sourced DIRECTLY from @elizaos/types
export {
  ModelProviderName,
  CacheStore,
  ModelClass,
  ServiceType,
  TokenizerType,
  TranscriptionProvider,
  ActionTimelineType,
  KnowledgeScope,
  LoggingLevel
} from '@elizaos/types';

// Export types that are TRULY LOCAL to core (defined in core/src/types.ts)
export type {
  CoreInternalConfig,
  ModelSettings,
  ImageModelSettings,
  EmbeddingModelSettings,
  Model,
  Models,
  TemplateType
} from './types.js'; // This refers to packages/core/src/types.ts after compilation

// Other exports from local files within @elizaos/core
export { composeContext } from './context.js';
export { elizaLogger } from './logger.js';
export { booleanFooter, messageCompletionFooter, parseJsonArrayFromText, parseBooleanFromText } from './parsing.js';
export { embed } from './embedding.js';
export { formatMessages } from './messages.js';
export { generateMessageResponse, generateTrueOrFalse, generateText, generateObjectArray, generateCaption, generateImage, generateObject } from './generation.js';
export { getGoals } from './goals.js';
export { AgentRuntime } from './runtime.js';
export { getModulePath } from './utils/module-path.js';
export { getEnvVariable } from './settings.js';
export { isUUID, stringToUuid } from './uuid.js';
export { getEmbeddingZeroVector } from './embedding.js';
export { default as knowledge } from './knowledge.js';
export { MemoryManager } from './memory.js';
export type { IAgentRuntimeBridge, AgentLogLevel, IAgentLogger } from './api/types.js';
export { CacheManager, DbCacheAdapter, FsCacheAdapter } from './cache.js';
export { settings } from './settings.js';
export const validateCharacterConfig = (config: any) => true; // Placeholder
export { DatabaseAdapter as CoreDatabaseAdapter } from './database.js';

// Removed the erroneous re-export blocks that caused duplicate identifiers.
// Specifically, the block starting with `export type { Participant, Goal, ... } from './types.js';`
// and the block `export { ModelProviderName, CacheStore, ... } from './types.js';` have been removed. 