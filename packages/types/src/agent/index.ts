/**
 * Agent interface definitions
 */

import { UUID } from '../common/index.js';

// Agent configuration
export interface AgentConfig {
    name: string;
    capabilities?: string[];
    model?: string;
    ports?: {
        webhook?: number;
        http?: number;
        router?: number;
    };
}

// Agent state
export enum AgentState {
    INITIALIZING = 'initializing',
    RUNNING = 'running',
    PAUSED = 'paused',
    STOPPED = 'stopped',
    ERROR = 'error'
}

// Agent runtime interface
export interface IAgentRuntime {
    /**
     * Get the agent ID
     */
    getAgentId(): string;

    /**
     * Get a logger instance
     */
    getLogger(name: string): any;

    /**
     * Handle an incoming message
     */
    handleMessage?(message: any): Promise<any>;

    /**
     * Get the agent's current state
     */
    getState?(): AgentState;

    /**
     * Get the agent's configuration
     */
    getConfig?(): AgentConfig;
}

// Plugin registration
export interface PluginRegistration {
    name: string;
    version: string;
    capabilities: string[];
    initialize: (context: any) => Promise<void>;
    shutdown: () => Promise<void>;
}