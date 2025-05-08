// @ts-nocheck

import { IAgentRuntime as AgentRuntime, Plugin } from './types';
// import telegramClient from '@elizaos/telegram-client'; // Temporarily commented out if not used in MINIMAL version
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
    private telegramClient?: any;

    readonly name: string = 'telegram-multiagent';

    constructor(contextOrRuntime: MinimalPluginContext | AgentRuntime) {
        console.error(">>>> CONSTRUCTOR: TelegramMultiAgentPlugin Entered <<<<");
        try {
            const runtime = (contextOrRuntime as MinimalPluginContext).runtime ?? contextOrRuntime as AgentRuntime;
            console.error(">>>> CONSTRUCTOR: runtime determined <<<<", typeof runtime);
            if (!runtime) {
                console.error("!!! CONSTRUCTOR FATAL: AgentRuntime instance is required. THROWING. !!!");
                throw new Error("AgentRuntime instance is required.");
            }
            this.runtime = runtime;
            console.error(">>>> CONSTRUCTOR: this.runtime assigned <<<<", typeof this.runtime);

            if (!this.runtime.logger) {
                console.error("!!! CONSTRUCTOR WARN: Runtime logger missing! Using console. !!!");
                this.logger = { info: console.info, warn: console.warn, error: console.error, debug: console.debug, trace: console.trace };
            } else {
                this.logger = this.runtime.logger;
                console.error(">>>> CONSTRUCTOR: this.logger assigned from runtime.logger <<<<", typeof this.logger);
            }
            this.logger.info('[CONSTRUCTOR] TelegramMultiAgentPlugin: Logging via this.logger now possible.');

            console.error(">>>> CONSTRUCTOR: Attempting to set agentId <<<<");
            this.agentId = process.env.AGENT_ID || this.runtime?.getAgentId?.() || (this.runtime as any)?.character?.agentId || '<unknown_constructor>';
            this.logger.info(`[CONSTRUCTOR_DEBUG] this.agentId resolved to: ${this.agentId} in TelegramMultiAgentPlugin constructor.`);
            console.error(`>>>> CONSTRUCTOR: agentId set to: ${this.agentId} <<<<`);

            // Temporarily comment out the early telegramClient check to isolate constructor success
            /*
            console.error(">>>> CONSTRUCTOR: Attempting to access this.runtime.clients.telegram <<<<");
            this.telegramClient = (this.runtime?.clients as any)?.telegram;
            if (!this.telegramClient || typeof this.telegramClient.sendMessage !== 'function') {
                this.logger.warn('[CONSTRUCTOR] Telegram client NOT YET available or sendMessage is not a function.');
            } else {
                this.logger.info('[CONSTRUCTOR] Telegram client SEEMS available in constructor.');
            }
            */
            console.error(">>>> CONSTRUCTOR: TelegramMultiAgentPlugin Exiting Successfully <<<<");
        } catch (e: any) {
            console.error("!!! CONSTRUCTOR CRASHED !!!", e, e.stack);
            throw e; // Re-throw to ensure failure is propagated
        }
    }

    async initialize(/* context?: MinimalPluginContext */): Promise<void> {
        console.log(">>>> MINIMAL TelegramMultiAgentPlugin.initialize ENTERED <<<<");
        // Check if logger itself is valid first
        if (!this.logger || typeof this.logger.info !== 'function') {
            console.error("!!! MINIMAL FATAL: this.logger is invalid inside initialize() !!!");
            // Avoid throwing here to see if the raw log above appears
            return;
        }
        this.logger.info(`[TGMA_MINIMAL_INIT] Minimal initialize() was called for agentId: ${this.agentId}. Timestamp: ${Date.now()}`);
        // All other logic from the original initialize method is temporarily removed for this test.
    }

    private async handleTelegramMessage(message: any): Promise<void> {
        this.logger.debug(`[HANDLER_TG] Received message from Telegram: ${JSON.stringify(message)?.substring(0, 100)}...`);
        if (!this.relay) return this.logger.warn('[HANDLER_TG] Relay not initialized. Cannot forward message.');
        if (!message?.chat?.id || !message?.text || !message?.from?.id) return this.logger.warn('[HANDLER_TG] Skipping incomplete Telegram message.');

        if (!this.telegramClient || typeof this.telegramClient.sendMessage !== 'function') {
            this.logger.error('[HANDLER_TG] this.telegramClient is invalid. Cannot reliably process incoming TG message for relay.');
            return;
        }

        try {
            await this.relay.sendMessage(message.chat.id, message.text, message.from.id, message.message_id, message.from.username);
            this.logger.debug(`[HANDLER_TG] Forwarded Telegram message to Relay.`);
        } catch (error) {
            this.logger.error(`[HANDLER_TG] Failed to forward Telegram message to Relay`, error);
        }
    }

    private async handleRelayMessage(message: any): Promise<void> {
        this.logger.debug(`[HANDLER_RELAY] Received message from Relay: ${JSON.stringify(message)?.substring(0, 100)}...`);

        if (message?.sender_agent_id === this.agentId) {
            this.logger.debug(`[HANDLER_RELAY] Skipping own message received from Relay (sender_agent_id: ${message.sender_agent_id}).`);
            return;
        }
        if (!message?.chat?.id || !message?.text) {
            this.logger.warn('[HANDLER_RELAY] Skipping incomplete Relay message.');
            return;
        }
        if (!this.runtime?.handleMessage) {
            this.logger.error('[HANDLER_RELAY] Runtime or runtime.handleMessage is missing. Cannot process message.');
            return;
        }
        if (!this.conversationManager) {
            this.logger.warn('[HANDLER_RELAY] Conversation manager not initialized. Response decisions may be affected.');
        }

        if (!this.telegramClient || typeof this.telegramClient.sendMessage !== 'function') {
            this.logger.error('[HANDLER_RELAY] this.telegramClient is invalid. Cannot send response to Telegram.');
            return;
        }

        try {
            const response = await this.runtime.handleMessage(message);
            if (response?.content?.trim()) {
                const shouldRespond = await this.conversationManager?.shouldAgentRespond?.(message.chat.id, this.agentId, message.sender_agent_id) ?? true;
                if (shouldRespond) {
                    this.logger.info(`[HANDLER_RELAY] Agent ${this.agentId} sending response to chat ${message.chat.id}: ${response.content.substring(0, 50)}...`);
                    await this.telegramClient.sendMessage(message.chat.id, response.content);
                    await this.conversationManager?.recordMessage?.(message.chat.id, this.agentId, response.content);
                } else {
                    this.logger.debug(`[HANDLER_RELAY] Agent ${this.agentId} decided not to respond to message from ${message.sender_agent_id || 'unknown sender'}.`);
                }
            }
        } catch (error) {
            this.logger.error(`[HANDLER_RELAY] Failed to handle Relay message or send response`, error);
        }
    }
}