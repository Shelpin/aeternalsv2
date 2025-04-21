// interfaces.ts
// This file contains shared interfaces to break circular dependencies

import { IAgentRuntime, ElizaLogger, MemoryData, MemoryQuery } from './types.js';

/**
 * Interface for Memory Manager to break circular dependencies
 */
export interface IMemoryManager {
    createMemory(memory: MemoryData): Promise<any>;
    getMemories(query: MemoryQuery): Promise<any[]>;
}

/**
 * Plugin interface needed by ConversationManager
 */
export interface ITelegramPlugin {
    name: string;
    logger: ElizaLogger;
    getAgentId(): string;
} 