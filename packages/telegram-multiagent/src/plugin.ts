// @ts-nocheck

import { IAgentRuntime as AgentRuntime, Plugin } from './types';
import telegramClient from '@elizaos/telegram-client';
import { TelegramRelay } from './TelegramRelay';
import { TelegramRelayConfig } from './types';
import { FallbackMemoryManager } from './FallbackMemoryManager';
import { ConversationManager } from './ConversationManager';
import { substituteEnvVars } from './utils/env-subst';

interface MinimalPluginContext {
    runtime: AgentRuntime;
}

export class TelegramMultiAgentPlugin implements Plugin {
    protected logger: { info: (...args: any[]) => void; warn: (...args: any[]) => void; error: (...args: any[]) => void; debug: (...args: any[]) => void; trace: (...args: any[]) => void; };
    protected runtime: AgentRuntime;
    public agentId: string = '<unknown>';
    private botToken?: string;
    private relay?: TelegramRelay;
    private memoryManager?: FallbackMemoryManager;
    private conversationManager?: ConversationManager;
    private initialized: boolean = false;

    readonly name: string = 'telegram-multiagent';

    constructor(contextOrRuntime: MinimalPluginContext | AgentRuntime) {
        const runtime = (contextOrRuntime as MinimalPluginContext).runtime ?? contextOrRuntime as AgentRuntime;
        if (!runtime) throw new Error("AgentRuntime instance is required.");
        this.runtime = runtime;
        if (!this.runtime.logger) {
            console.error("Runtime logger missing!");
            this.logger = { info: console.info, warn: console.warn, error: console.error, debug: console.debug, trace: console.trace };
        } else {
            this.logger = this.runtime.logger;
        }
        this.logger.info('[CONSTRUCTOR] TelegramMultiAgentPlugin: Constructor called');
    }

    async initialize(/* context?: MinimalPluginContext */): Promise<void> {
        this.logger.info('[INITIALIZE] Plugin initialization started.');
        this.agentId = this.runtime.agentId;
        if (!this.agentId || this.agentId === '<unknown>') {
            this.logger.warn(`[INITIALIZE] Agent ID is still unknown!`);
        } else {
            this.logger.info(`[INITIALIZE] Initializing with Agent ID: ${this.agentId}`);
        }

        try {
            this.logger.info('[INITIALIZE] Initializing ConversationManager...');
            this.conversationManager = new ConversationManager(this.logger);
            this.logger.info('[INITIALIZE] ConversationManager created.');
        } catch (error) {
            this.logger.error('[INITIALIZE] Failed to initialize managers', error);
        }

        try {
            this.logger.info('[INITIALIZE] Initializing Telegram client...');
            // 1) Preferred: use TELEGRAM_BOT_TOKEN from environment
            let token = process.env.TELEGRAM_BOT_TOKEN;
            // 2) Try agent-specific token if generic is not set
            if (!token && process.env.AGENT_ID) {
                const formattedId = process.env.AGENT_ID.toUpperCase().replace(/-/g, '_');
                const envVarName = `TELEGRAM_BOT_TOKEN_${formattedId}`;
                token = process.env[envVarName];
                if (token) {
                    console.log(`[MultiAgentPlugin] Using Telegram token from ${envVarName} environment variable`);
                }
            }
            // 3) Fallback: use character secrets
            if (!token) {
                const char = (this.runtime as any).character || {};
                const secrets = char.secrets || {};
                token = secrets.TELEGRAM_BOT_TOKEN;
                if (!token) {
                    console.error('[MultiAgentPlugin] No Telegram token found for agent, aborting client start');
                    return;
                }
                console.log('[MultiAgentPlugin] Using Telegram token from character secrets');
            }

            this.botToken = substituteEnvVars(token);
            if (!this.botToken) throw new Error('Telegram bot token substitution failed');
            this.logger.info(`[INITIALIZE] Substituted Telegram Token: ${this.botToken.substring(0, 10)}...`);
            // Debug: output the full token being passed to TelegramClient for verification
            this.logger.debug(`[INITIALIZE] Token being passed to TelegramClient: ${this.botToken}`);

            telegramClient.initialize(this.botToken!, this.runtime);
            telegramClient.on('message', this.handleTelegramMessage.bind(this));

            const botInfo = telegramClient.getBotInfo;
            this.logger.info(`[INITIALIZE] Connected to Telegram as bot: ${botInfo?.username}`);
            this.logger.info('[INITIALIZE] Telegram client initialized.');
        } catch (error) {
            this.logger.error('[INITIALIZE] Failed to initialize Telegram client', error);
            throw error;
        }

        try {
            this.logger.info('[INITIALIZE] Initializing Relay connection...');
            const relayConfigFromPatch = (this.runtime as any).relayConfig as any;
            if (!relayConfigFromPatch?.relayServerUrl) throw new Error('Relay config missing');

            const fullRelayConfig: TelegramRelayConfig = {
                relayServerUrl: relayConfigFromPatch.relayServerUrl,
                authToken: relayConfigFromPatch.authToken || process.env.RELAY_AUTH_TOKEN,
                agentId: this.agentId,
            };

            this.relay = new TelegramRelay(fullRelayConfig, this.logger);
            await this.relay.connect();

            if (typeof (this.relay as any).registerMessageHandler === 'function') {
                (this.relay as any).registerMessageHandler(this.handleRelayMessage.bind(this));
            } else {
                this.logger.warn('[INITIALIZE] Could not bind Relay message handler (registerMessageHandler not found).');
            }
            this.logger.info('[INITIALIZE] Relay connected successfully.');
        } catch (error) {
            this.logger.error('[INITIALIZE] Failed to initialize Relay connection', error);
        }

        this.initialized = true;
        this.logger.info('[INITIALIZE] Plugin initialization completed.');
    }

    private async handleTelegramMessage(message: any): Promise<void> {
        this.logger.debug(`[HANDLER] Received message from Telegram: ${JSON.stringify(message)?.substring(0, 100)}...`);
        if (!this.relay) return this.logger.warn('[HANDLER] Relay not init.');
        if (!message?.chat?.id || !message?.text || !message?.from?.id) return this.logger.warn('[HANDLER] Skipping incomplete TG msg.');
        try {
            await this.relay.sendMessage(message.chat.id, message.text);
            this.logger.debug(`[HANDLER] Forwarded TG message to Relay.`);
        } catch (error) {
            this.logger.error(`[HANDLER] Failed to forward TG message to Relay`, error);
        }
    }

    private async handleRelayMessage(message: any): Promise<void> {
        this.logger.debug(`[HANDLER] Received message from Relay: ${JSON.stringify(message)?.substring(0, 100)}...`);
        if (message?.sender_agent_id === this.agentId) return this.logger.debug(`[HANDLER] Skipping own msg.`);
        if (!message?.chat?.id || !message?.text || !message?.from?.id) return this.logger.warn('[HANDLER] Skipping incomplete Relay msg.');
        if (!this.runtime?.handleMessage) return this.logger.error('[HANDLER] Runtime missing.');
        if (!this.conversationManager) return this.logger.warn('[HANDLER] Conv manager missing.');

        try {
            const response = await this.runtime.handleMessage(message);
            if (response?.content?.trim()) {
                const shouldRespond = await this.conversationManager.shouldAgentRespond?.(message.chat.id, this.agentId, message.sender_agent_id) ?? true;
                if (shouldRespond) {
                    this.logger.info(`[HANDLER] Sending response to chat ${message.chat.id}`);
                    await telegramClient.sendMessage(message.chat.id, response.content);
                    await this.conversationManager.recordMessage?.(message.chat.id, this.agentId, response.content);
                } else {
                    this.logger.debug(`[HANDLER] Decided not to respond.`);
                }
            }
        } catch (error) {
            this.logger.error('[HANDLER] Failed to handle Relay message', error);
        }
    }
}