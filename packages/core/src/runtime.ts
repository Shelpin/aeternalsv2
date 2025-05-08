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
export async function handleMessage(this: AgentRuntime, message: any) { // Added 'this' type annotation
    const logger = this.getLogger('runtime:handleMessage'); // Use runtime logger
    logger.debug("--- Handling message START ---");
    logger.debug("Raw incoming message object:", JSON.stringify(message, null, 2));

    const text = message?.text || message?.message?.text;
    const user = message?.from?.username || message?.from?.first_name || message?.from?.id || 'Unknown User';
    const chatId = message.chat?.id || message.message?.chat?.id;

    if (!text || !chatId) {
        logger.warn("handleMessage received invalid or non-text message structure. Cannot process.", { textExists: !!text, chatIdExists: !!chatId });
        logger.debug("--- Handling message END (Invalid Message Structure) ---");
        return;
    }

    const responseText = `🤖 Echo from agent: You (${user}) said: ${text}`;
    logger.debug("Prepared response:", responseText);

    logger.debug("Attempting to locate Telegram client instance on runtime...");

    const globalRuntimeClients = (globalThis.__elizaRuntime as any)?.clients;
    logger.debug(`[CLIENT_LOCATE_DEBUG] Is this.clients === globalThis.__elizaRuntime.clients? ${this.clients === globalRuntimeClients}`);
    logger.debug(`[CLIENT_LOCATE_DEBUG] Actual length of this.clients at start of search: ${this.clients ? this.clients.length : 'null/undefined'}`);

    let telegramClient: any = null;

    if (this.clients && Array.isArray(this.clients) && this.clients.length > 0) {
        telegramClient = this.clients.find(client => (client as any).name === 'telegram' || client.constructor?.name === 'TelegramClient' || (typeof (client as any).sendMessage === 'function' && typeof (client as any).start === 'function'));
        if (telegramClient) {
            logger.info("Telegram client instance found on this.clients.");
        } else {
            logger.warn("No client matching Telegram criteria found on this.clients.");
            logger.debug("Contents of this.clients:", JSON.stringify(this.clients.map(c => ({ name: (c as any).name, type: typeof c, constructorName: (c as any).constructor?.name }))));
        }
    } else {
        logger.debug("this.clients array is empty or not an array.");
    }

    if (!telegramClient && globalRuntimeClients) {
        logger.debug("Client not found via this.clients, attempting globalThis fallback on globalRuntimeClients...");
        if (Array.isArray(globalRuntimeClients) && globalRuntimeClients.length > 0) {
            telegramClient = globalRuntimeClients.find(client => (client as any).name === 'telegram' || client.constructor?.name === 'TelegramClient' || (typeof (client as any).sendMessage === 'function' && typeof (client as any).start === 'function'));
            if (telegramClient) {
                logger.info("Telegram client instance found on globalThis.__elizaRuntime.clients (globalRuntimeClients).");
            } else {
                logger.warn("No client matching Telegram criteria found on globalThis.__elizaRuntime.clients (globalRuntimeClients).");
            }
        }
    }

    if (!telegramClient || typeof telegramClient.sendMessage !== 'function') {
        logger.error("❌ FATAL: Telegram client instance NOT FOUND on runtime.clients or globalThis patch.");
        logger.debug("--- Handling message END (Client Not Found) ---");
        return;
    }

    try {
        logger.info(`Attempting to send response via client to chatID: ${chatId}`);
        await telegramClient.sendMessage(chatId, responseText);
        logger.info(`✅ Successfully sent response to chatID: ${chatId}`);
    } catch (error) {
        logger.error(`❌ Error sending message via Telegram client: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
        // Consider logging stack trace for deeper errors: if (error instanceof Error) console.error(error.stack);
    }
    logger.debug("--- Handling message END ---");
} 