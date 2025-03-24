import { Memory, MemoryData, MemoryQuery } from './types.js';

/**
 * FallbackMemoryManager provides an in-memory alternative when the runtime's
 * memory manager is not available. This prevents crashes and allows basic
 * functionality to continue working even when memory services are unavailable.
 */
export class FallbackMemoryManager {
  private memories: Memory[] = [];
  private nextId = 1;

  /**
   * Create a new memory entry
   * 
   * @param data - Memory data to store
   * @returns Memory object that was created
   */
  async createMemory(data: MemoryData): Promise<Memory> {
    const id = data.id || `fallback-memory-${this.nextId++}`;
    
    const memory: Memory = {
      id,
      roomId: data.roomId,
      userId: data.userId,
      content: data.content,
      createdAt: new Date(),
      type: data.type || 'text'
    };
    
    this.memories.push(memory);
    
    // Keep only the most recent 1000 memories to prevent memory leaks
    if (this.memories.length > 1000) {
      this.memories = this.memories.slice(-1000);
    }
    
    return memory;
  }

  /**
   * Get memories matching the query criteria
   * 
   * @param options - Query options
   * @returns Matching memories
   */
  async getMemories(options: MemoryQuery): Promise<Memory[]> {
    let results = this.memories.filter(memory => {
      // Filter by roomId (required)
      if (memory.roomId !== options.roomId) {
        return false;
      }
      
      // Filter by userId (optional)
      if (options.userId && memory.userId !== options.userId) {
        return false;
      }
      
      // Filter by type (optional)
      if (options.type && memory.type !== options.type) {
        return false;
      }
      
      return true;
    });
    
    // Sort by creation date (newest first)
    results = results.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      return dateB.getTime() - dateA.getTime();
    });
    
    // Apply count limit if specified
    if (options.count && options.count > 0) {
      results = results.slice(0, options.count);
    }
    
    // Apply uniqueness if required
    if (options.unique) {
      const seen = new Set<string>();
      results = results.filter(memory => {
        if (seen.has(memory.userId)) {
          return false;
        }
        seen.add(memory.userId);
        return true;
      });
    }
    
    return results;
  }

  /**
   * Add an embedding to a memory (stub implementation)
   * 
   * @param memoryId - ID of the memory
   * @param embedding - Embedding vector
   */
  async addEmbeddingToMemory(memoryId: string, embedding: number[]): Promise<void> {
    // Find the memory
    const memoryIndex = this.memories.findIndex(m => m.id === memoryId);
    
    // If found, add the embedding
    if (memoryIndex >= 0) {
      // Use type assertion to add embedding property
      (this.memories[memoryIndex] as any).embedding = embedding;
    }
  }
} 