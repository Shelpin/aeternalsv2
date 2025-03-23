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
   * Wait for the runtime to be available
   * This is a simpler approach that just waits for the runtime reference to be set
   * 
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 30000)
   * @returns Promise resolving to the runtime instance
   * @throws Error if runtime is not available after timeout
   */
  protected async waitForRuntime(timeoutMs: number = 30000): Promise<IAgentRuntime> {
    // If runtime is already available, return it immediately
    if (this.runtime) {
      return this.runtime;
    }
    
    this.logger.debug(`Waiting for runtime to be available (timeout: ${timeoutMs}ms)`);
    
    // Create a new promise that will be resolved when runtime is set
    return new Promise<IAgentRuntime>((resolve, reject) => {
      // Store the promise handlers for later resolution
      this.waitingPromises.push({resolve, reject});
      
      // Set a timeout to reject the promise if runtime is not set in time
      setTimeout(() => {
        // Remove this promise from the waiting list
        this.waitingPromises = this.waitingPromises.filter(p => p.resolve !== resolve);
        
        // Reject with timeout error
        const error = new Error(`Runtime wait timed out after ${timeoutMs}ms`);
        this.logger.error(`[RUNTIME] ${error.message}`);
        reject(error);
      }, timeoutMs);
    });
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