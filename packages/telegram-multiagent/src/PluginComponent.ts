import { IAgentRuntime, ElizaLogger } from './types.js';

/**
 * Base class for plugin components that require runtime access
 * 
 * Implements the waitForRuntime() guard pattern for reliable 
 * runtime access across all components
 */
export abstract class PluginComponent {
  protected runtime: IAgentRuntime | null = null;
  protected logger: ElizaLogger;
  
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
    this.logger.debug(`Runtime set for ${this.constructor.name}`);
  }
  
  /**
   * Wait for the runtime to be available
   * This is a critical pattern for ElizaOS plugins to ensure
   * runtime is ready before attempting to access its services
   * 
   * @returns Promise resolving to the runtime instance
   * @throws Error if runtime is not available after max attempts
   */
  protected async waitForRuntime(): Promise<IAgentRuntime> {
    const maxAttempts = 10;
    const delayMs = 1000;
    
    let attempts = 0;
    while (!this.runtime && attempts < maxAttempts) {
      this.logger.debug(`Waiting for runtime to be available (attempt ${attempts + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      attempts++;
    }
    
    if (!this.runtime) {
      const error = new Error(`Runtime not available after ${maxAttempts} attempts`);
      this.logger.error(`[RUNTIME] ${error.message}`);
      throw error;
    }
    
    this.logger.debug(`[RUNTIME] Runtime successfully acquired for ${this.constructor.name}`);
    return this.runtime;
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