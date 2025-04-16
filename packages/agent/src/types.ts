import {
    UUID,
    FsCacheAdapter,
    DbCacheAdapter,
    IDatabaseCacheAdapter,
    CacheManager
} from "@elizaos/core";

export interface Settings {
    GAIA_API_KEY?: string;
    OPENAI_API_KEY?: string;
    ETERNALAI_API_KEY?: string;
    NINETEEN_AI_API_KEY?: string;
    LLAMACLOUD_API_KEY?: string;
    TOGETHER_API_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    CLAUDE_API_KEY?: string;
    REDPILL_API_KEY?: string;
    OPENROUTER_API_KEY?: string;
    GROK_API_KEY?: string;
    HEURIST_API_KEY?: string;
    GROQ_API_KEY?: string;
    GALADRIEL_API_KEY?: string;
    FAL_API_KEY?: string;
    ALI_BAILIAN_API_KEY?: string;
    VOLENGINE_API_KEY?: string;
    NANOGPT_API_KEY?: string;
    HYPERBOLIC_API_KEY?: string;
    VENICE_API_KEY?: string;
    ATOMASDK_BEARER_AUTH?: string;
    NVIDIA_API_KEY?: string;
    AKASH_CHAT_API_KEY?: string;
    GOOGLE_GENERATIVE_AI_API_KEY?: string;
    MISTRAL_API_KEY?: string;
    LETZAI_API_KEY?: string;
    INFERA_API_KEY?: string;
    DEEPSEEK_API_KEY?: string;
    LIVEPEER_GATEWAY_URL?: string;
    SECRET_AI_API_KEY?: string;
    NEARAI_API_KEY?: string;
    SERVER_PORT?: string;
    CACHE_STORE?: string;
    CACHE_DIR?: string;
}

// Re-export types from core
export type {
    UUID,
    FsCacheAdapter,
    DbCacheAdapter,
    IDatabaseCacheAdapter,
    CacheManager
}; 