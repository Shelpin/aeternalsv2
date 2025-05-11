import { IDatabaseAdapter, IAgentRuntime, Character, IMemoryManager, ModelProviderName, Provider, FetchFunction, State, Memory, ClientInstance, ICacheManager, Action, Evaluator, HandlerCallback } from "@elizaos/types";
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
    imageVisionModelProvider?: ModelProviderName;
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
    serverUrl: string;
    databaseAdapter: IDatabaseAdapter;
    token: string | null;
    modelProvider: ModelProviderName;
    imageModelProvider: ModelProviderName;
    imageVisionModelProvider: ModelProviderName;
    character: Character;
    providers: Provider[];
    actions: Action[];
    evaluators: Evaluator[] = [];
    plugins: Provider[];
    logger: CoreLoggerType;
    messageManager: IMemoryManager;
    fetch?: FetchFunction;
    settings: Map<string, string>;

    // ADDED Missing properties
    public adapters: any[] = []; // Placeholder type
    public cacheManager: ICacheManager | null = null; // Use imported ICacheManager
    public clients: ClientInstance[] = [];
    public loadedPlugins: Plugin[] = []; // ADDED for storing initialized plugin instances

    // Add handleMessage property to the class definition
    handleMessage: (message: any) => Promise<void>;

    constructor(config: RuntimeConfig) {
        this.agentId = config.agentId || "agent";
        this.serverUrl = config.serverUrl || "https://example.com";
        this.databaseAdapter = config.databaseAdapter || {} as IDatabaseAdapter;
        this.logger = createLogger(`Runtime:${this.agentId}`);

        if (!config.character) throw new Error("Character configuration is required in RuntimeConfig");
        this.character = config.character;
        this.messageManager = config.messageManager || {} as IMemoryManager;
        this.modelProvider = config.modelProvider;
        this.token = config.token;
        this.imageModelProvider = config.imageModelProvider || 'openai' as ModelProviderName;
        this.imageVisionModelProvider = config.imageVisionModelProvider || 'openai' as ModelProviderName;
        this.fetch = config.fetch;
        this.providers = config.plugins || [];
        this.settings = config.settings || new Map<string, string>();
        this.actions = config.actions || [];
        this.evaluators = config.evaluators || [];

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
            this.loadedPlugins = []; // Clear or initialize the list
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
                    if (pluginInstance) { // Ensure pluginInstance is valid before trying to use it
                        // Assign runtime to plugin if it has a setRuntime method (like PluginComponent)
                        if (typeof pluginInstance.setRuntime === 'function') {
                            pluginInstance.setRuntime(this);
                        }

                        let registered = false;
                        // --- Attempt Registration (if available) ---
                        if (typeof pluginInstance.register === 'function') {
                            this.logger.debug(`Calling register() for plugin: ${pluginName}`);
                            const registrationResult = pluginInstance.register(this);
                            // Consider registration successful if it doesn't throw and returns true or the instance itself
                            if (registrationResult === true || (typeof registrationResult === 'object' && registrationResult !== null)) {
                                registered = true;
                                this.logger.info(`Plugin ${pluginName} registered successfully.`);
                                if (typeof registrationResult === 'object' && registrationResult !== pluginInstance) {
                                    pluginInstance = registrationResult; // Update instance if register returned a new one
                                }
                            } else {
                                this.logger.warn(`Plugin ${pluginName} register() method did not return true or an instance. Registration may not be complete.`);
                            }
                        }

                        // --- Attempt Initialization (always try if method exists, especially after registration) ---
                        if (typeof pluginInstance.initialize === 'function') {
                            if (registered) {
                                this.logger.info(`Calling initialize() for registered plugin: ${pluginName}.`);
                            } else {
                                // This case implies register was not found or failed, so we are trying initialize as a primary step.
                                this.logger.info(`Calling initialize() for plugin: ${pluginName} (register not found or failed).`);
                            }
                            await pluginInstance.initialize(this); // Pass runtime context
                            this.logger.info(`Plugin ${pluginInstance.name || pluginName} initialized.`);
                        } else if (!registered) {
                            // This means neither register nor initialize was found.
                            this.logger.warn(`Plugin ${pluginName} has no register() or initialize() method.`);
                        }

                        this.loadedPlugins.push(pluginInstance as Plugin); // Store the instance
                    } else {
                        this.logger.error(`Failed to create or identify plugin instance for: ${pluginName}`);
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

    async evaluate(message: Memory, state?: State, didRespond?: boolean, callback?: HandlerCallback): Promise<string[] | null> {
        try {
            this.logger.info(`[EVALUATOR] Starting evaluation for message: ${message.content?.text?.substring(0, 50)}...`);

            // Get all evaluators that should run
            const evaluatorsToRun = await Promise.all(
                this.evaluators.map(async (evaluator) => {
                    const shouldRun = evaluator.alwaysRun || await evaluator.validate(this, message, state);
                    if (shouldRun) {
                        this.logger.info(`[EVALUATOR] Will run evaluator: ${evaluator.name}`);
                    }
                    return shouldRun ? evaluator : null;
                })
            );

            // Filter out nulls and run valid evaluators
            const validEvaluators = evaluatorsToRun.filter((e): e is Evaluator => e !== null);

            if (validEvaluators.length === 0) {
                this.logger.info('[EVALUATOR] No evaluators to run for this message');
                return null;
            }

            this.logger.info(`[EVALUATOR] Running ${validEvaluators.length} evaluators`);

            // Run all valid evaluators
            const results = await Promise.all(
                validEvaluators.map(async (evaluator) => {
                    try {
                        this.logger.info(`[EVALUATOR] Running evaluator: ${evaluator.name}`);
                        await evaluator.handler(this, message);
                        this.logger.info(`[EVALUATOR] Completed evaluator: ${evaluator.name}`);
                        return evaluator.name;
                    } catch (error) {
                        this.logger.error(`[EVALUATOR] Error in evaluator ${evaluator.name}: ${error instanceof Error ? error.message : String(error)}`);
                        return null;
                    }
                })
            );

            // Filter out null results and return evaluator names
            const successfulEvaluators = results.filter((name): name is string => name !== null);
            this.logger.info(`[EVALUATOR] Completed evaluation with ${successfulEvaluators.length} successful evaluators`);
            return successfulEvaluators;
        } catch (error) {
            this.logger.error(`[EVALUATOR] Error in evaluate: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
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

    const incomingText = message.text;
    const chatId = message.chat?.id || message.chat_id;

    if (!chatId) {
        logger.error("❌ Message does not have a valid chat.id or chat_id. Cannot process.");
        return { id: message.message_id, chat_id: null, text: "Error: Missing chat ID.", action: 'none' };
    }

    if (!incomingText || typeof incomingText !== 'string' || incomingText.trim() === '') {
        logger.info("ℹ️ Incoming message has no text content or is not a string. Skipping LLM call.");
        return { id: message.message_id, chat_id: chatId, text: '', action: 'none' };
    }

    let responseText = ''; // Initialize responseText

    // --- LLM Integration START ---
    try {
        const modelProvider = (this.modelProvider || this.getSetting('MODEL_PROVIDER') || 'openai').toLowerCase();
        logger.info(`[LLM] Using model provider: ${modelProvider}`);

        // Check for OpenAI compatible providers (OpenAI itself or DeepSeek)
        if (modelProvider === 'openai' || modelProvider === 'deepseek') {
            let llmApiKey: string | undefined;
            let apiUrl: string;
            let modelName: string;

            if (modelProvider === 'openai') {
                llmApiKey = this.getSetting('OPENAI_API_KEY');
                apiUrl = this.getSetting('OPENAI_API_URL') || 'https://api.openai.com/v1/chat/completions';
                modelName = this.getSetting('OPENAI_MODEL_NAME') || this.getSetting('SMALL_OPENAI_MODEL') || 'gpt-3.5-turbo';
                if (!llmApiKey) {
                    logger.error("❌ OpenAI API Key (OPENAI_API_KEY) not configured.");
                    responseText = "🤖 LLM Error: OpenAI API Key not configured.";
                }
            } else { // deepseek
                llmApiKey = this.getSetting('DEEPSEEK_API_KEY');
                apiUrl = this.getSetting('DEEPSEEK_API_URL') || 'https://api.deepseek.com/v1/chat/completions'; // Default DeepSeek API URL
                modelName = this.getSetting('DEEPSEEK_MODEL_NAME') || this.getSetting('SMALL_DEEPSEEK_MODEL') || 'deepseek-chat'; // Default DeepSeek model
                if (!llmApiKey) {
                    logger.error("❌ DeepSeek API Key (DEEPSEEK_API_KEY) not configured.");
                    responseText = "🤖 LLM Error: DeepSeek API Key not configured.";
                }
            }

            if (llmApiKey) { // Proceed only if API key is found
                // Log the full character object to see its structure
                logger.debug("[LLM_CHARACTER_DEBUG] this.character object:", JSON.stringify(this.character, null, 2));

                // Construct a more detailed system prompt using available character fields
                let systemPrompt = `You are ${this.character.name || "a conversational AI"}.`;
                if (this.character.system) {
                    systemPrompt += ` Your primary purpose and persona: ${this.character.system}`;
                } else if (this.character.description) { // Fallback to description if system is not present
                    systemPrompt += ` Your persona: ${this.character.description}`;
                }

                if (this.character.style?.all && Array.isArray(this.character.style.all) && this.character.style.all.length > 0) {
                    systemPrompt += ` Your key traits and style: ${this.character.style.all.join(', ')}.`;
                } else if (this.character.adjectives && Array.isArray(this.character.adjectives) && this.character.adjectives.length > 0) {
                    systemPrompt += ` Your key traits: ${this.character.adjectives.join(', ')}.`;
                } else if (this.character.traits) { // Fallback to general traits
                    systemPrompt += ` Traits: ${JSON.stringify(this.character.traits)}.`;
                }

                if (this.character.topics && Array.isArray(this.character.topics) && this.character.topics.length > 0) {
                    systemPrompt += ` Your main topics of interest and expertise are: ${this.character.topics.join(', ')}.`;
                } else if (this.character.interests && Array.isArray(this.character.interests) && this.character.interests.length > 0) { // Fallback to interests
                    systemPrompt += ` Your main topics of interest are: ${this.character.interests.join(', ')}.`;
                } else {
                    systemPrompt += " You are interested in general topics.";
                }

                // Specific instruction for Aeternity focus if implied by character name or topics
                const agentNameLower = (this.character.name || "").toLowerCase();
                const topicsLower = (this.character.topics || []).join(', ').toLowerCase();
                if (agentNameLower.includes("aeternity") || agentNameLower.includes("ae") || topicsLower.includes("aeternity") || (this.character.system || "").toLowerCase().includes("aeternity")) {
                    systemPrompt += " You should always try to advocate for and discuss Aeternity blockchain and its ecosystem when the conversation allows, aligning with your dedicated persona. Mention its benefits like state channels, oracles, and scalability."
                }

                systemPrompt += " Respond naturally based on this comprehensive persona.";

                const userPrompt = incomingText;

                logger.debug(`[LLM] System Prompt for ${modelProvider}: "${systemPrompt.substring(0, 150)}..."`);
                logger.debug(`[LLM] User Prompt for ${modelProvider}: "${userPrompt.substring(0, 150)}..."`);
                logger.info(`[LLM] Attempting API call to ${apiUrl} with model ${modelName}`);

                const fetchFn = this.fetch || fetch;
                const llmApiResponse = await fetchFn(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${llmApiKey}`
                    },
                    body: JSON.stringify({
                        model: modelName,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userPrompt }
                        ],
                        max_tokens: 1024,
                        temperature: 0.7
                    })
                });

                if (!llmApiResponse.ok) {
                    const errorBody = await llmApiResponse.text();
                    logger.error(`❌ ${modelProvider.toUpperCase()} API Error: ${llmApiResponse.status} - ${errorBody}`);
                    responseText = `🤖 LLM Error: API request failed (${llmApiResponse.status}).`;
                } else {
                    const data = await llmApiResponse.json();
                    if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
                        responseText = data.choices[0].message.content.trim();
                        logger.info(`[LLM] Received response from ${modelProvider.toUpperCase()}: "${responseText.substring(0, 100)}..."`);
                    } else {
                        logger.error(`❌ ${modelProvider.toUpperCase()} API Error: Invalid response structure.`, data);
                        responseText = "🤖 LLM Error: Invalid response from API.";
                    }
                }
            }
            // If llmApiKey was not found for the selected provider, responseText already contains the error message.
        } else {
            logger.warn(`[LLM] Model provider '${modelProvider}' is not 'openai' or 'deepseek'. Falling back to echo for this provider.`);
            responseText = `🤖 Echo (LLM provider '${modelProvider}' not configured): You (${message?.from?.username || message?.from?.id || 'Unknown User'}) said: ${incomingText}`;
        }
    } catch (error) {
        logger.error(`❌ Exception during LLM call: ${error.message}`, { stack: error.stack });
        responseText = `🤖 LLM Exception: ${error.message}`;
    }
    // --- LLM Integration END ---

    logger.debug("Generated responseText after LLM attempt:", responseText);

    const telegramClient = (this.clients as any)?.telegram;

    if (telegramClient && typeof telegramClient.sendMessage === 'function') {
        if (responseText && responseText.trim() !== '') {
            logger.info(`Attempting to send LLM response via client to chatID: ${chatId}`);
            try {
                await telegramClient.sendMessage(chatId, responseText);
                logger.info(`✅ Successfully sent LLM response to chatID: ${chatId}`);
            } catch (error) {
                logger.error(`❌ Error sending LLM response via Telegram client: ${error.message}`, { stack: error.stack });
            }
        } else {
            logger.info("ℹ️ Empty responseText from LLM or after processing, not sending to Telegram.");
        }
    } else {
        logger.error("❌ FATAL: Telegram client instance NOT FOUND on this.clients.telegram or it's invalid. Cannot send LLM response.");
    }

    // --- MODIFIED FORWARD TO RELAY LOGIC ---
    // Find the telegram-multiagent plugin instance from the loaded plugins
    const relayPlugin = this.loadedPlugins.find(p => p.name === 'telegram-multiagent' && typeof (p as any).forwardToRelay === 'function') as any;

    if (relayPlugin) {
        if (responseText && responseText.trim() !== '') { // Only forward if there was a response generated
            logger.info(`[FORWARD_RELAY] Attempting to forward agent\'s response ("${responseText.substring(0, 50)}...") via plugin: ${relayPlugin.name}`);
            try {
                await relayPlugin.forwardToRelay(chatId, responseText, message);
                logger.info(`[FORWARD_RELAY] Successfully called forwardToRelay on plugin ${relayPlugin.name}.`);
            } catch (error) {
                logger.error(`[FORWARD_RELAY] Error calling forwardToRelay on plugin ${relayPlugin.name}: ${error.message}`, { stack: error.stack });
            }
        } else {
            logger.info("[FORWARD_RELAY] Empty responseText, not forwarding agent's response via plugin.");
        }
    } else {
        logger.warn('[FORWARD_RELAY] Skipping relay forward: telegram-multiagent plugin with forwardToRelay method not found in loadedPlugins.');
        // Fallback to trying globalThis, though this should ideally not be needed if plugins are loaded correctly
        if (globalThis.__elizaRuntime && typeof (globalThis.__elizaRuntime as any).forwardToRelay === 'function') {
            logger.warn('[FORWARD_RELAY_FALLBACK] Attempting to use globalThis.__elizaRuntime.forwardToRelay as a fallback.');
            if (responseText && responseText.trim() !== '') {
                try {
                    await (globalThis.__elizaRuntime as any).forwardToRelay(chatId, responseText, message);
                    logger.info('[FORWARD_RELAY_FALLBACK] Successfully called globalThis.__elizaRuntime.forwardToRelay.');
                } catch (error) {
                    logger.error(`[FORWARD_RELAY_FALLBACK] Error calling globalThis.__elizaRuntime.forwardToRelay: ${error.message}`, { stack: error.stack });
                }
            }
        } else {
            logger.warn('[FORWARD_RELAY_FALLBACK] forwardToRelay also not found on globalThis.__elizaRuntime or no responseText to send.');
        }
    }
    // --- END MODIFIED FORWARD TO RELAY LOGIC ---

    logger.debug("--- Handling message END ---");
    return {
        id: message.message_id,
        chat_id: chatId,
        text: responseText,
        action: responseText && responseText.trim() !== '' ? 'send' : 'none'
    };
} 