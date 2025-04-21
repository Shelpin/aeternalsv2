import { IDatabaseAdapter, IAgentRuntime } from "@elizaos/types";

// Re-export for backward compatibility
export type DatabaseAdapter = IDatabaseAdapter;

/**
 * Creates a logger for the specified component
 */
export function createLogger(name: string) {
    return {
        trace: (msg: string, ...args: any[]) => console.log(`[TRACE] ${name}: ${msg}`, ...args),
        debug: (msg: string, ...args: any[]) => console.log(`[DEBUG] ${name}: ${msg}`, ...args),
        info: (msg: string, ...args: any[]) => console.log(`[INFO] ${name}: ${msg}`, ...args),
        warn: (msg: string, ...args: any[]) => console.warn(`[WARN] ${name}: ${msg}`, ...args),
        error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${name}: ${msg}`, ...args)
    };
}

/**
 * Interface for runtime configuration
 */
export interface RuntimeConfig {
    conversationLength?: number;
    agentId?: string;
    character?: any;
    token: string;
    serverUrl?: string;
    actions?: any[];
    evaluators?: any[];
    plugins?: any[];
    characterPath?: string;
    embedder?: any;
    port?: number;
    imageModelProvider?: string;
    modelProvider?: string;
    databaseAdapter?: IDatabaseAdapter;
    logging?: boolean;
}

/**
 * Represents the runtime environment for an agent, handling message processing,
 * action registration, and interaction with external services.
 */
export class AgentRuntime implements IAgentRuntime {
    agentId: string;
    serverUrl?: string;
    databaseAdapter?: IDatabaseAdapter;
    logger: any;

    constructor(config: RuntimeConfig) {
        this.agentId = config.agentId || "agent";
        this.serverUrl = config.serverUrl;
        this.databaseAdapter = config.databaseAdapter;
        this.logger = createLogger(`Runtime:${this.agentId}`);
    }

    /**
     * Handles an incoming message
     */
    async handleMessage(message: any): Promise<any> {
        this.logger.info("Handling message:", message);
        return { text: "This is a test response" };
    }
} 