/**
 * Type for UUIDs used across ElizaOS
 */
export type UUID = string;

/**
 * Interface for database adapters
 */
export interface IDatabaseAdapter {
    /**
     * Connects to the database
     */
    connect(): Promise<void>;

    /**
     * Disconnects from the database
     */
    disconnect(): Promise<void>;

    /**
     * Executes a query
     */
    query(sql: string, params?: any[]): Promise<any[]>;
}

/**
 * Interface for memory content
 */
export interface MemoryContent {
    /**
     * The text content of the memory
     */
    text: string;

    /**
     * Actions associated with the memory
     */
    action?: string;

    /**
     * Attachments associated with the memory
     */
    attachments?: any[];

    /**
     * Additional properties
     */
    [key: string]: any;
}

/**
 * Memory interface for storing agent memories
 */
export interface Memory {
    id: string;
    content: MemoryContent;
    createdAt: number;
    importance: number;
    lastAccessed: number;
    embedding?: number[];
}

/**
 * Interface for agent runtime
 */
export interface IAgentRuntime {
    /**
     * The ID of the agent
     */
    agentId: string;

    /**
     * The URL of the server
     */
    serverUrl?: string;

    /**
     * The database adapter
     */
    databaseAdapter?: IDatabaseAdapter;
}

/**
 * Interface for goals
 */
export interface Goal {
    /**
     * The ID of the goal
     */
    id: UUID;

    /**
     * The agent ID associated with the goal
     */
    agentId: UUID;

    /**
     * The description of the goal
     */
    description: string;

    /**
     * The status of the goal
     */
    status: 'pending' | 'active' | 'completed' | 'failed';

    /**
     * The priority of the goal
     */
    priority: number;

    /**
     * When the goal was created
     */
    createdAt: number;

    /**
     * When the goal was completed
     */
    completedAt?: number;

    /**
     * Additional metadata
     */
    metadata?: Record<string, any>;
}

/**
 * Type for callbacks
 */
export type HandlerCallback = (data: any) => Promise<void>;

/**
 * State interface
 */
export interface State {
    [key: string]: any;
}

/**
 * Actor interface
 */
export interface Actor {
    id: UUID;
    name: string;
    [key: string]: any;
} 