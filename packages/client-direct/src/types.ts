import type { Content, AgentRuntime } from "@elizaos/core";

export interface ClientMessagePayload {
    text: string;
    userId: string;
    roomId: string;
    agentId: string;
}

export interface ClientSettings {
    serverPort?: number;
    apiKey?: string;
    // Add other client-specific settings as needed
}

export interface CommandSchema {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
}

export interface IDirectClientMethods {
    startAgent(character: any): Promise<AgentRuntime>;
    unregisterAgent(agent: AgentRuntime): void;
    message(text: Content, userId: string, roomId: string, agentId: string): Promise<Content[]>;
    registerAgent(runtime: AgentRuntime): void;
    start(port: number): void;
    stop(): Promise<void>;
} 