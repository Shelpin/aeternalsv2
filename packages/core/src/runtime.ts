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

    // Add handleMessage property to the class definition
    handleMessage: (message: any) => Promise<void>;

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

        // --- BIND handleMessage --- 
        this.handleMessage = handleMessage.bind(this); // Ensure 'this' context is correct
    }

    getSetting(key: string): string | undefined {
        return this.settings.get(key) || process.env[key];
    }

    /**
     * Handles an incoming message (IMPLEMENTED FROM PLAN v11.1)
     */
    // async handleMessage(message: any): Promise<any> { // Original stub removed
    //     this.logger.info("Handling message:", message);
    //     return { text: "This is a test response" };
    // }

    // ADDED Missing method stubs
    async initialize(): Promise<void> {
        this.logger.info("AgentRuntime initializing...");

        // Register Plugins
        if (this.providers && Array.isArray(this.providers)) {
            this.logger.info(`Found ${this.providers.length} providers/plugins to register.`);
            for (const pluginOrClass of this.providers) {
                let pluginInstance: any = null;
                let pluginName = 'Unknown Plugin';

                try {
                    // Check if it's a class constructor or an object with methods
                    if (typeof pluginOrClass === 'function' && pluginOrClass.prototype && pluginOrClass.prototype.constructor === pluginOrClass) {
                        // It's likely a class, instantiate it
                        pluginName = pluginOrClass.name || pluginName;
                        this.logger.debug(`Instantiating plugin class: ${pluginName}`);
                        // Assuming constructor takes (runtime, character?)
                        // Pass runtime context, character might be needed by some plugins
                        pluginInstance = new pluginOrClass(this, this.character);
                        pluginName = pluginInstance?.name || pluginName; // Get name from instance if available
                    } else if (typeof pluginOrClass === 'object' && pluginOrClass !== null) {
                        // It's likely already an instance or a plain object
                        pluginInstance = pluginOrClass;
                        pluginName = pluginInstance?.name || pluginInstance?.npmName || pluginName;
                    } else {
                        this.logger.warn('Encountered an invalid item in the plugins array:', pluginOrClass);
                        continue; // Skip this invalid item
                    }

                    this.logger.info(`Processing plugin: ${pluginName}`);

                    // --- Attempt Registration (if available) ---
                    if (pluginInstance && typeof pluginInstance.register === 'function') {
                        this.logger.debug(`Calling register() for plugin: ${pluginName}`);
                        const registrationResult = pluginInstance.register(this);
                        if (registrationResult) {
                            this.logger.info(`Successfully registered plugin via register(): ${pluginName}`);
                        } else {
                            this.logger.warn(`register() returned falsy value for plugin: ${pluginName}`);
                        }
                    }

                    // --- Attempt Initialization (if available) ---
                    if (pluginInstance && typeof pluginInstance.initialize === 'function') {
                        this.logger.info(`Calling initialize() for plugin: ${pluginName}`);
                        this.logger.debug(`[RUNTIME_INIT_DEBUG] Before await initialize: pluginInstance exists: ${!!pluginInstance}`);
                        this.logger.debug(`[RUNTIME_INIT_DEBUG] Before await initialize: typeof pluginInstance.initialize: ${typeof pluginInstance.initialize}`);
                        try {
                            // Pass the runtime instance as the context
                            await pluginInstance.initialize(this);
                        } catch (initError) {
                            this.logger.error(`[RUNTIME_INIT_DEBUG] Error caught DIRECTLY from awaiting pluginInstance.initialize() for ${pluginName}:`, initError);
                            // Re-throw or handle as needed, for now just log that we caught it here
                            throw initError; // Re-throw to ensure it's logged by the outer catch block too
                        }
                        this.logger.info(`Successfully initialized plugin via initialize(): ${pluginName}`);
                    } else if (!pluginInstance || (typeof pluginInstance.register !== 'function' && typeof pluginInstance.initialize !== 'function')) {
                        // Log warning only if neither register nor initialize is present
                        this.logger.warn(`Plugin ${pluginName} lacks both register() and initialize() methods.`);
                    }

                } catch (error) {
                    this.logger.error(`Error processing plugin ${pluginName}: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
                    // Optionally log stack trace for deeper debugging
                    // if (error instanceof Error) console.error(error.stack);
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

    getLogger(name: string): CoreLoggerType {
        // Ensure getLogger is defined if not already present
        // This might already exist, verify the read file output
        const logFn = (level: string, msg: string, ...args: any[]) => console.log(`[${level.toUpperCase()}] ${name}: ${msg}`, ...args.map(arg => JSON.stringify(arg)));
        return {
            trace: (msg: string, ...args: any[]) => logFn('trace', msg, ...args),
            debug: (msg: string, ...args: any[]) => logFn('debug', msg, ...args),
            info: (msg: string, ...args: any[]) => logFn('info', msg, ...args),
            warn: (msg: string, ...args: any[]) => logFn('warn', msg, ...args),
            error: (msg: string, ...args: any[]) => logFn('error', msg, ...args),
        };
    }
}

// Exporting the new handleMessage function separately to avoid class syntax issues with complex logic
// This function will be bound to the AgentRuntime instance in the constructor.
export async function handleMessage(this: AgentRuntime, message: any) {
    const logger = this.getLogger('runtime:handleMessage');
    logger.debug("--- Handling message START ---");
    // Log the state of this.clients at the beginning of handleMessage
    try {
        logger.info(`[HANDLE_MSG_CLIENT_DEBUG] this.clients at start of handleMessage: ${JSON.stringify(this.clients, null, 2)}`);
        logger.info(`[HANDLE_MSG_CLIENT_DEBUG] typeof this.clients?.telegram: ${typeof (this.clients as any)?.telegram}`);
    } catch (e) {
        logger.warn(`[HANDLE_MSG_CLIENT_DEBUG] Could not stringify this.clients: ${e.message}`);
        logger.info(`[HANDLE_MSG_CLIENT_DEBUG] this.clients keys: ${Object.keys(this.clients || {}).join(', ')}`);
        logger.info(`[HANDLE_MSG_CLIENT_DEBUG] this.clients constructor name: ${this.clients?.constructor?.name}`);
    }

    logger.debug("Raw incoming message object:", JSON.stringify(message, null, 2));

    let responseText = `🤖 Echo from agent: You (${message?.from?.username || message?.from?.id || 'Unknown User'}) said: ${message.text}`;
    logger.debug("Prepared response:", responseText);

    // --- MODIFIED CLIENT LOOKUP ---
    logger.debug("Attempting to locate Telegram client instance on runtime via direct access...");
    const telegramClient = (this.clients as any)?.telegram;

    if (telegramClient && typeof telegramClient.sendMessage === 'function') {
        logger.info("Telegram client instance found directly on this.clients.telegram.");
        try {
            logger.info(`Attempting to send response via client to chatID: ${message.chat.id}`);
            await telegramClient.sendMessage(message.chat.id, responseText);
            logger.info(`✅ Successfully sent response to chatID: ${message.chat.id}`);
        } catch (error) {
            logger.error(`❌ Error sending message via Telegram client: ${error.message}`, { stack: error.stack });
            responseText = `⚠️ Error sending message: ${error.message}`; // Update responseText if send fails
        }
    } else {
        logger.error("❌ FATAL: Telegram client instance NOT FOUND on this.clients.telegram or it's invalid.");
        // Fallback or alternative client logic could go here if needed
    }
    // --- END MODIFIED CLIENT LOOKUP ---

    // Attempt to forward the response to the relay server if configured
    // Check the globally patched runtime for forwardToRelay
    if (globalThis.__elizaRuntime && typeof (globalThis.__elizaRuntime as any).forwardToRelay === 'function') {
        logger.info('[FORWARD_RELAY] Attempting to forward response to relay via globalThis.__elizaRuntime.forwardToRelay');
        await (globalThis.__elizaRuntime as any).forwardToRelay(message, {
            type: 'agent_response',
            originalMessage: message,
            agentId: this.agentId,
            chatId: message.chat?.id || message.chat_id,
        });
    } else {
        logger.warn('[FORWARD_RELAY] Skipping relay forward: `forwardToRelay` function not found on globalThis.__elizaRuntime.');
    }

    logger.debug("--- Handling message END ---");
    // Return a structured response, or adjust as per plugin expectations
    return {
        id: message.message_id,
        chat_id: message.chat.id,
        text: responseText, // Return the (potentially error-updated) response
        action: responseText ? 'send' : 'none'
    };
} 