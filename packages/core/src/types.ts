/**
 * This file centralizes type imports and re-exports for the core package,
 * primarily sourcing types from the shared @elizaos/types package.
 * MODIFIED: This file will now ONLY contain types TRULY SPECIFIC to @elizaos/core.
 * Types from @elizaos/types should be imported directly by consumer files within core.
 */
import type { Readable } from "node:stream";

// Types previously re-exported from @elizaos/types are now REMOVED.
// Consumer files within @elizaos/core should import them directly from "@elizaos/types".

// Enums/constants previously re-exported from @elizaos/types are now REMOVED.
// Consumer files within @elizaos/core should import them directly from "@elizaos/types".

// Core-specific types are KEPT here.
export interface CoreInternalConfig {
    someCoreSetting: boolean;
}

// Definitions for ModelSettings, ImageModelSettings, etc., which are currently local to core.
// These might be candidates for moving to @elizaos/types in the future if used more broadly.
export type ModelSettings = {
    name: string;
    maxInputTokens: number;
    maxOutputTokens: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    repetition_penalty?: number;
    stop: string[];
    temperature: number;
    experimental_telemetry?: any; // TODO: Consider using TelemetrySettings from @elizaos/types
};
export type ImageModelSettings = {
    name: string;
    steps?: number;
};
export type EmbeddingModelSettings = {
    name: string;
    dimensions?: number;
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

// Assuming State is a type that should be imported from @elizaos/types by TemplateType's user,
// or defined here if it's truly core-specific and simple.
// For now, to keep this file compilable if State was from @elizaos/types,
// TemplateType might need adjustment or State needs to be imported here.
// Let's assume for now State will be imported where TemplateType is used, or it's a global/implicit type.
// A more robust solution would be: import type { State } from "@elizaos/types"; if it belongs there.
export type TemplateType = string | ((options: { state: any /* Placeholder for State */ }) => string);

// Placeholder types that were commented out are kept commented or removed if fully obsolete.
// export type IAgentConfig = any; // Example: if this was truly core-specific, it would stay.
// ... other placeholders removed for brevity if they were just for @elizaos/types things ...

// Note: If any of the previously re-exported *runtime values* (enums like ModelProviderName)
// were ONLY used internally within core by being imported from this file,
// those internal core files will also need to change their imports to get them from "@elizaos/types".
// This edit focuses on the structure of types.ts and public-api.ts as a first step.

// --- End of changes for packages/core/src/types.ts ---

// --- START of conceptual changes for packages/core/src/public-api.ts ---
// The following is how public-api.ts would be changed.
// This will be applied in a separate edit_file call if this approach is confirmed.

/*
// In packages/core/src/public-api.ts:

// Import types that are now EXCLUSIVELY from @elizaos/types
export type {
    IAgentRuntime,
    Client,
    Content,
    Media,
    Memory,
    Plugin,
    IDatabaseAdapter, // Assuming SharedDatabaseAdapterInterface was aliased to this
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
    State, // Assuming this is from @elizaos/types
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
    UUID // Assuming UUID was also from @elizaos/types
} from \'@elizaos/types\'; // <-- Import directly

// Import enums/constants that are now EXCLUSIVELY from @elizaos/types
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
} from \'@elizaos/types\'; // <-- Import directly

// Import types that are TRULY LOCAL to core (if any remain in core/src/types.ts after its cleanup)
// For example, if CoreInternalConfig, ModelSettings etc. are still in core/src/types.ts:
export type {
    CoreInternalConfig, // Example
    ModelSettings,      // Now local to core
    ImageModelSettings, // Now local to core
    EmbeddingModelSettings, // Now local to core
    Model,              // Now local to core
    Models,             // Now local to core
    TemplateType        // Now local to core (State might need to be imported from @elizaos/types here or where TemplateType is used)
} from \'./types.js\'; // <-- Import local core-specific types

// Other exports remain as they are if they import from other local files like ./context.js, ./logger.js etc.
export { composeContext } from \'./context.js\';
export { elizaLogger } from \'./logger.js\';
// ... and so on for other direct local file exports ...

export { AgentRuntime } from \'./runtime.js\';
export { MemoryManager } from \'./memory.js\';
export { DatabaseAdapter as CoreDatabaseAdapter } from \'./database.js\'; // Assuming this is core's own DB Adapter
// etc.
*/
