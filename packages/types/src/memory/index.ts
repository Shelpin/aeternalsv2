/**
 * Memory interface definitions
 */

// Empty export to avoid circular dependencies
export { };

import { UUID } from '../common/index.js';

// Memory entry
export interface Memory {
    id: UUID;
    content: string;
    timestamp: number;
    type: string;
    metadata?: Record<string, any>;
}

// Memory query options
export interface MemoryQueryOptions {
    limit?: number;
    offset?: number;
    type?: string;
    fromTimestamp?: number;
    toTimestamp?: number;
    orderBy?: 'timestamp' | 'id';
    order?: 'asc' | 'desc';
}

// Memory storage interface
export interface MemoryStorage {
    /**
     * Store a memory
     */
    store(memory: Omit<Memory, 'id'>): Promise<Memory>;

    /**
     * Retrieve a memory by ID
     */
    retrieve(id: UUID): Promise<Memory | null>;

    /**
     * Query memories
     */
    query(options: MemoryQueryOptions): Promise<Memory[]>;

    /**
     * Update a memory
     */
    update(id: UUID, updates: Partial<Omit<Memory, 'id'>>): Promise<Memory | null>;

    /**
     * Delete a memory
     */
    delete(id: UUID): Promise<boolean>;

    /**
     * Clear all memories
     */
    clear(): Promise<void>;
} 