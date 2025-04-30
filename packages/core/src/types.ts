/**
 * This file centralizes type imports and re-exports for the core package,
 * primarily sourcing types from the shared @elizaos/types package.
 */
import type { Readable } from "node:stream";

// Import needed types and enums directly from @elizaos/types
import type {
    UUID,
    Memory,
    MemoryContent,
    IAgentRuntime,
    IDatabaseAdapter as SharedDatabaseAdapterInterface,
    Goal,
    GoalStatus,
    Actor,
    Objective,
    Relationship,
    Account,
    Participant,
    Media,
    Client,
    ClientInstance,
    Adapter,
    Plugin,
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
    Content,
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
    TelemetrySettings
} from "@elizaos/types";

// Import enums and constants as real values so they can be used at runtime and re-exported
import {
    ModelProviderName,
    ModelClass,
    ServiceType,
    TokenizerType,
    TranscriptionProvider,
    ActionTimelineType,
    KnowledgeScope,
    LoggingLevel,
    CacheStore
} from '@elizaos/types';

// Re-export from @elizaos/types for use within the core package
export type {
    UUID,
    Memory,
    MemoryContent,
    IAgentRuntime,
    SharedDatabaseAdapterInterface as IDatabaseAdapter,
    Goal,
    GoalStatus,
    Actor,
    Objective,
    Relationship,
    Account,
    Participant,
    Media,
    Client,
    ClientInstance,
    Adapter,
    Plugin,
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
    Content,
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
    TelemetrySettings
};

// Re-export runtime enums/constants
export {
    ModelProviderName,
    ModelClass,
    ServiceType,
    TokenizerType,
    TranscriptionProvider,
    ActionTimelineType,
    KnowledgeScope,
    LoggingLevel,
    CacheStore
};

// Core-specific types (if any) can be defined below,
// but shared types should ideally reside in @elizaos/types.

// Example of a core-specific type if needed:
export interface CoreInternalConfig {
    someCoreSetting: boolean;
}

// Placeholder types that might still be locally defined if not moved to @elizaos/types
// Remove these if they are successfully imported and re-exported from @elizaos/types
// export type ModelSettings = any;
// export type ImageModelSettings = any;
// export type EmbeddingModelSettings = any;
// export type Model = any;
// export type Models = any;
// export type IAgentConfig = any;
// export type ModelConfiguration = any;
// export type TemplateType = any;
// export type MessageExample = any;
// export type TwitterSpaceDecisionOptions = any;
// export interface IVideoService extends Service { /* ... */ }
// export interface IBrowserService extends Service { /* ... */ }
// export interface ISpeechService extends Service { /* ... */ }
// export interface IPdfService extends Service { /* ... */ }
// export interface IAwsS3Service extends Service { /* ... */ }
// export interface IIrysService extends Service { /* ... */ }
// export interface ITeeLogService extends Service { /* ... */ }
// export interface ISlackService extends Service { /* ... */ }


// Re-exporting API types for backward compatibility (Ensure this doesn't cause conflicts)
// Consider if these should also be moved to @elizaos/types
// export * from './api/types.js';

// Define complex inline types used within Core (These might need to be moved to @elizaos/types too)
// Example from original file - check if still needed or replaced by imports
export type ModelSettings = {
    name: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    repetition_penalty?: number;
    stop: string[];
    temperature: number;
    experimental_telemetry?: any; // Use imported TelemetrySettings if possible
};
export type ImageModelSettings = {
    name: string;
    steps?: number;
};
export type EmbeddingModelSettings = {
    name: string;
    dimensions?: number;
    // Removed 'stop' based on previous findings
};
export type Model = {
    endpoint?: string;
    model: {
        small?: ModelSettings;
        medium?: ModelSettings;
        large?: ModelSettings;
        embedding?: EmbeddingModelSettings;
        image?: ImageModelSettings;
        [key: string]: ModelSettings | EmbeddingModelSettings | ImageModelSettings | undefined;
    };
};
export type Models = {
    [key: string]: Model;
};
export type TemplateType = string | ((options: { state: State }) => string);

// Ensure other necessary types like Objective, Account, Participant etc. are defined or imported
// If Objective is simple, define it here, otherwise import from @elizaos/types
// export interface Objective { id?: string; description: string; completed: boolean; }

// Keep specific core types if absolutely necessary
// e.g., export type CoreSpecificUtilityType = { /* ... */ };
