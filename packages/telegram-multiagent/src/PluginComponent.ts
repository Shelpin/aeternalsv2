import { IAgentRuntime, ElizaLogger } from './types.js';

/**
 * Base class for plugin components that require runtime access
 */
export abstract class PluginComponent {
  protected runtime: IAgentRuntime | null = null;
  protected logger: ElizaLogger;
  private waitingPromises: {resolve: Function, reject: Function}[] = [];
  
  /**
   * Create a new plugin component
   * 
   * @param logger - Logger instance for this component
   */
  constructor(logger: ElizaLogger) {
    this.logger = logger;
  }
  
  /**
   * Set the runtime instance for this component
   * This should be called during plugin registration
   * 
   * @param runtime - The agent runtime
   */
  setRuntime(runtime: IAgentRuntime): void {
    this.runtime = runtime;
    this.logger.debug(`Runtime reference set for ${this.constructor.name}`);
    
    // Resolve any waiting promises
    if (this.waitingPromises.length > 0) {
      this.logger.debug(`Resolving ${this.waitingPromises.length} waiting promises`);
      for (const {resolve} of this.waitingPromises) {
        resolve(runtime);
      }
      this.waitingPromises = [];
    }
  }
  
  /**
   * Wait for the runtime to be available and ready to use
   * Verifies that critical methods like getAgentId and getLogger are available
   * 
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 30000)
   * @returns Promise resolving to the runtime instance
   * @throws Error if runtime is not available after timeout
   */
  protected async waitForRuntime(timeoutMs: number = 30000): Promise<IAgentRuntime> {
    // If runtime is already available AND its methods are defined, return it immediately
    if (this.runtime && 
        typeof this.runtime.getAgentId === 'function' && 
        typeof this.runtime.getLogger === 'function') {
      return this.runtime;
    }
    
    this.logger.debug(`Waiting for runtime to be available and ready (timeout: ${timeoutMs}ms)`);
    
    const interval = 100;
    let elapsed = 0;
    
    // Use polling with timeout instead of Promise resolution
    while (elapsed < timeoutMs) {
      // Check if runtime is available and critical methods are defined
      if (this.runtime && 
          typeof this.runtime.getAgentId === 'function' && 
          typeof this.runtime.getLogger === 'function') {
        this.logger.debug('Runtime is available and ready with all required methods');
        return this.runtime;
      }
      
      // Wait for a short interval
      await new Promise(resolve => setTimeout(resolve, interval));
      elapsed += interval;
    }
    
    // If we get here, timeout occurred
    const error = new Error(`Runtime wait timed out after ${timeoutMs}ms`);
    this.logger.error(`[RUNTIME] ${error.message}`);
    throw error;
  }
  
  /**
   * Test if the runtime is ready with all critical methods
   * Useful for debugging runtime availability issues
   */
  protected testRuntime(): void {
    if (!this.runtime) {
      this.logger.error('Runtime reference is null');
      return;
    }
    
    this.logger.info('Testing runtime readiness:');
    this.logger.info(`- runtime object: ${this.runtime ? 'exists' : 'missing'}`);
    this.logger.info(`- getAgentId: ${typeof this.runtime.getAgentId === 'function' ? 'function' : 'missing'}`);
    this.logger.info(`- getLogger: ${typeof this.runtime.getLogger === 'function' ? 'function' : 'missing'}`);
    this.logger.info(`- memoryManager: ${this.runtime.memoryManager ? 'exists' : 'missing'}`);
    
    if (this.runtime.memoryManager) {
      this.logger.info(`- memoryManager.createMemory: ${typeof this.runtime.memoryManager.createMemory === 'function' ? 'function' : 'missing'}`);
      this.logger.info(`- memoryManager.getMemories: ${typeof this.runtime.memoryManager.getMemories === 'function' ? 'function' : 'missing'}`);
    }
  }
  
  /**
   * Initialize the component
   * This should be called during plugin initialization
   */
  async initialize(): Promise<void> {
    // To be implemented by subclasses
  }
  
  /**
   * Shutdown the component
   * This should be called during plugin shutdown
   */
  async shutdown(): Promise<void> {
    // To be implemented by subclasses
  }
} 