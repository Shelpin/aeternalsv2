import { IDatabaseAdapter, IAgentRuntime, Character, IMemoryManager, ModelProviderName, Provider, FetchFunction, State, Memory, ClientInstance, ICacheManager, Action } from "@elizaos/types";
import { Logger as CoreLoggerType } from '@elizaos/types';

// Re-export for backward compatibility
export type DatabaseAdapter = IDatabaseAdapter;

/**
 * Creates a logger for the specified component
 */
export function createLogger(name: string): CoreLoggerType {
    const logFn = (level: string, msg: string, ...args: any[]) => console.log(`[${level.toUpperCase()}] ${name}: ${msg}`, ...args.map(arg => JSON.stringify(arg)));
    return {
        trace: (msg: string, ...args: any[]) => logFn('trace', msg, ...args),
        debug: (msg: string, ...args: any[]) => logFn('debug', msg, ...args),
        info: (msg: string, ...args: any[]) => logFn('info', msg, ...args),
        warn: (msg: string, ...args: any[]) => logFn('warn', msg, ...args),
        error: (msg: string, ...args: any[]) => logFn('error', msg, ...args),
    };
}

/**
 * Interface for runtime configuration
 */
export interface RuntimeConfig {
    conversationLength?: number;
    agentId?: string;
    character: Character;
    token: string;
    serverUrl?: string;
    actions?: any[];
    evaluators?: any[];
    plugins?: Provider[];
    characterPath?: string;
    embedder?: any;
    port?: number;
    imageModelProvider?: ModelProviderName;
    modelProvider: ModelProviderName;
    databaseAdapter?: IDatabaseAdapter;
    logging?: boolean;
    settings?: Map<string, string>;
    messageManager?: IMemoryManager;
    fetch?: FetchFunction;
}

/**
 * Represents the runtime environment for an agent, handling message processing,
 * action registration, and interaction with external services.
 */
export class AgentRuntime implements IAgentRuntime {
    agentId: string;
    serverUrl?: string;
    databaseAdapter?: IDatabaseAdapter;
    logger: CoreLoggerType;

    character: Character;
    messageManager: IMemoryManager;
    modelProvider: ModelProviderName;
    token?: string;
    imageModelProvider?: ModelProviderName;
    fetch?: FetchFunction;
    providers?: Provider[];
    settings: Map<string, string>;

    // ADDED Missing properties
    public adapters: any[] = []; // Placeholder type
    public cacheManager: ICacheManager | null = null; // Use imported ICacheManager
    public clients: ClientInstance[] = [];
    public actions: Action[] = []; // ADDED actions property

    constructor(config: RuntimeConfig) {
        this.agentId = config.agentId || "agent";
        this.serverUrl = config.serverUrl;
        this.databaseAdapter = config.databaseAdapter;
        this.logger = createLogger(`Runtime:${this.agentId}`);

        if (!config.character) throw new Error("Character configuration is required in RuntimeConfig");
        this.character = config.character;
        this.messageManager = config.messageManager || {} as IMemoryManager;
        this.modelProvider = config.modelProvider;
        this.token = config.token;
        this.imageModelProvider = config.imageModelProvider;
        this.fetch = config.fetch;
        this.providers = config.plugins;
        this.settings = config.settings || new Map<string, string>();
    }

    getSetting(key: string): string | undefined {
        return this.settings.get(key) || process.env[key];
    }

    /**
     * Handles an incoming message
     */
    async handleMessage(message: any): Promise<any> {
        this.logger.info("Handling message:", message);
        return { text: "This is a test response" };
    }

    // ADDED Missing method stubs
    async initialize(): Promise<void> {
        this.logger.info("AgentRuntime initializing...");

        // Register Plugins
        if (this.providers && Array.isArray(this.providers)) {
            this.logger.info(`Found ${this.providers.length} providers/plugins to register.`);
            for (const plugin of this.providers) {
                if (plugin && typeof plugin.register === 'function') {
                    try {
                        const pluginName = plugin.name || plugin.npmName || 'Unknown Plugin';
                        this.logger.info(`Registering plugin: ${pluginName}`);
                        const registrationResult = plugin.register(this); // Pass runtime instance
                        if (registrationResult) {
                            this.logger.info(`Successfully registered plugin: ${pluginName}`);
                            // Optional: Await initialization if needed, per expert feedback
                            // if (typeof plugin.initialize === 'function') {
                            //     this.logger.info(`Initializing plugin: ${pluginName}`);
                            //     await plugin.initialize(); 
                            //     this.logger.info(`Initialized plugin: ${pluginName}`);
                            // }
                        } else {
                            this.logger.warn(`Registration returned falsy value for plugin: ${pluginName}`);
                        }
                    } catch (error) {
                        const pluginName = plugin.name || plugin.npmName || 'Unknown Plugin';
                        this.logger.error(`Error registering plugin ${pluginName}: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
                    }
                } else {
                    this.logger.warn(`Provider object found but lacks a register method.`);
                    console.log('Invalid plugin object:', plugin); // Log the object for inspection
                }
            }
        } else {
            this.logger.info("No providers/plugins found in config to register.");
        }

        // TODO: Implement other actual initialization logic (e.g., loading knowledge)
        this.logger.info("AgentRuntime core initialization complete.");
    }

    async composeState(message: Memory, additionalKeys?: Record<string, any>): Promise<State> {
        this.logger.debug("Composing state (stub)", { message, additionalKeys });
        // TODO: Implement actual state composition
        return { /* stub state object */ } as State;
    }

    async updateRecentMessageState(state: State): Promise<State> {
        this.logger.debug("Updating recent message state (stub)", { state });
        // TODO: Implement actual state update logic
        return state; // Return input state for now
    }

    getConversationLength(): number {
        this.logger.debug("Getting conversation length (stub)");
        // TODO: Implement actual conversation length logic
        return 0; // Return dummy value
    }

    // ADDED Stubs for missing methods from IAgentRuntime
    async stop(): Promise<void> {
        this.logger.warn("AgentRuntime.stop() called but not implemented.");
        // TODO: Implement actual stop logic (e.g., closing connections, stopping clients)
        return Promise.resolve();
    }

    async ensureConnection(userId: string, roomId: string, userName?: string, userScreenName?: string, source?: string): Promise<void> {
        this.logger.warn("AgentRuntime.ensureConnection() called but not implemented.", { userId, roomId, source });
        // TODO: Implement actual connection ensuring logic (e.g., creating user/participant records)
        return Promise.resolve();
    }

    async processActions(message: Memory, responses: Memory[], state?: any, callback?: any): Promise<void> {
        this.logger.warn("AgentRuntime.processActions() called but not implemented.", { messageId: message.id });
        // TODO: Implement actual action processing logic
        return Promise.resolve();
    }

    async evaluate(message: Memory, state?: any, didRespond?: boolean, callback?: any): Promise<string[] | null> {
        this.logger.warn("AgentRuntime.evaluate() called but not implemented.", { messageId: message.id });
        // TODO: Implement actual evaluation logic
        return Promise.resolve(null);
    }
} 