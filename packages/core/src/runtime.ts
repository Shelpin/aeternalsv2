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
        logger.debug("--- Handling message END (Invalid Structure) ---");
        return; // Cannot proceed without text and chat ID
    }

    logger.info(`💬 Message received in chat ${chatId} from ${user}: ${text}`);

    // Simple echo response for now
    const responseText = `🤖 Echo from ${this.agentId}: You (${user}) said: ${text}`;
    logger.debug(`Prepared response: ${responseText}`);

    // --- Client Lookup and Validation --- 
    let telegramBotClient: any = null;
    logger.debug("Attempting to locate Telegram client instance on runtime...");
    if (Array.isArray(this.clients) && this.clients.length > 0) {
        // Find the client object pushed during initialization by the agent startup
        const clientInstance = this.clients.find(c =>
            (c as any).name === '@elizaos/client-telegram' || // Check name property if exists
            (c as any).constructor?.name === 'TelegramClient' || // Check constructor name
            (typeof c === 'object' && c !== null && (c as any).bot) // Check if it has a .bot property
        );
        if (clientInstance && (clientInstance as any).bot) {
            telegramBotClient = (clientInstance as any).bot;
            logger.debug("Found client via this.clients lookup. Client object:", clientInstance);
            logger.debug("Extracted .bot property:", telegramBotClient);
        } else if (clientInstance) {
            logger.warn('Found potential client instance via this.clients, but .bot property missing directly. Instance:', clientInstance);
            // Add more specific checks if needed based on client structure
        } else {
            logger.debug("No matching client found in this.clients array.");
        }
    } else {
        logger.debug("this.clients array is empty or not an array.");
    }

    // Fallback to global patch (should be less necessary now but kept as backup)
    if (!telegramBotClient) {
        logger.debug("Client not found via this.clients, attempting globalThis fallback...");
        telegramBotClient = globalThis.__elizaRuntime?.clients?.telegram?.bot;
        if (telegramBotClient) {
            logger.debug('Using Telegram client from globalThis.__elizaRuntime fallback.');
        } else {
            logger.error("❌ FATAL: Telegram client instance NOT FOUND on runtime.clients or globalThis patch.");
            logger.debug("--- Handling message END (Client Not Found) ---");
            return; // Cannot send response without a client
        }
    }
    // --- End Client Lookup --- 

    // --- Send Response via Telegram --- 
    let sentSuccessfully = false;
    try {
        logger.debug(`Attempting to send response via Telegram bot client to chat ${chatId}. Client Type: ${typeof telegramBotClient}`);
        // Ensure sendMessage exists and is a function before calling
        if (telegramBotClient && typeof telegramBotClient.sendMessage === 'function') {
            await telegramBotClient.sendMessage(chatId, responseText);
            logger.info(`✅ Successfully sent response to Telegram chat ${chatId}`);
            sentSuccessfully = true;
        } else {
            logger.error('❌ Failed to send response: telegramBotClient.sendMessage is not a function or client is invalid.', { clientExists: !!telegramBotClient });
        }
    } catch (error) {
        logger.error(`❌ Error during telegramBotClient.sendMessage to chat ${chatId}:`, error);
    }
    // --- End Send Response --- 

    // --- Forward to Relay (Only if Telegram send was successful) --- 
    if (sentSuccessfully) {
        if (typeof (this as any).forwardToRelay === 'function') {
            logger.debug(`Attempting to forward message context to relay for agent ${this.agentId}`);
            // Construct a payload suitable for the relay
            const relayPayload = {
                message: { // Simulate the message *sent* by this bot
                    message_id: message.message_id ? `${message.message_id}-relay-${Date.now()}` : Date.now(), // Create a unique-ish ID
                    from: {
                        id: this.character?.telegramId || this.agentId,
                        is_bot: true,
                        first_name: this.character?.name || this.agentId,
                        username: this.character?.botUsername || this.agentId
                    },
                    chat: {
                        id: chatId,
                        type: message.chat?.type || 'group'
                    },
                    date: Math.floor(Date.now() / 1000),
                    text: responseText // The message content that was sent
                    // Consider adding 'reply_to_message_id: message.message_id' if needed
                },
                sender_agent_id: this.agentId
            };
            try {
                await (this as any).forwardToRelay(relayPayload);
                logger.info(`📡 Successfully forwarded message context to relay.`);
            } catch (relayError) {
                logger.error(`❌ Error during forwardToRelay call:`, relayError);
            }
        } else {
            logger.warn("Skipping relay: `forwardToRelay` function not found on runtime.");
        }
    } else {
        logger.warn("Skipping relay: Telegram message was not sent successfully.");
    }
    // --- End Relay Forwarding --- 

    logger.debug("--- Handling message END ---");
} 