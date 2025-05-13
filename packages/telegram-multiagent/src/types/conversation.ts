/**
 * Types related to conversation management in the Telegram Multi-Agent plugin
 */

/**
 * Represents a mapping of participants in a conversation
 */
export type ParticipantMap = Record<string, { lastMessage?: number }>;

/**
 * Represents the state of a conversation
 */
export interface ConversationState {
    /**
     * The ID of the last speaker in the conversation
     */
    lastSpeaker: string;

    /**
     * Timestamp of the last update to the conversation
     */
    lastUpdate: number;

    /**
     * Map of participant IDs to their last message timestamp
     */
    participants: ParticipantMap;

    /**
     * Timestamp until which the conversation should be in cooldown
     */
    cooldownUntil?: number;

    /**
     * Current topic of the conversation
     */
    topic?: string;

    /**
     * Additional state information (serialized as string)
     */
    state?: string;
}

/**
 * Strategy for determining when an agent should respond in a conversation
 */
export enum ResponseStrategy {
    /**
     * First In, First Out - respond in the order messages are received
     */
    FIFO = 'fifo',

    /**
     * Probability-based response
     */
    PROBABILITY = 'probability',

    /**
     * Respond only when mentioned
     */
    MENTION_ONLY = 'mention_only'
}

/**
 * Memory interface for storing conversation data
 * Compatible with the Memory interface in types.ts
 */
export interface Memory {
    id: string;
    roomId?: string;
    userId?: string;
    type?: string;
    createdAt?: Date;
    content?: {
        text: string;
        metadata?: Record<string, any>;
    };
    text?: string; // For backward compatibility
    created_at?: number;
    metadata?: Record<string, any>;
} 