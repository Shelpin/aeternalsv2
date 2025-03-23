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
   * Wait for the runtime to be available and fully initialized
   * This is a critical pattern for ElizaOS plugins to ensure
   * runtime is ready before attempting to access its services
   * 
   * @returns Promise resolving to the runtime instance
   * @throws Error if runtime is not available after max attempts
   */
  protected async waitForRuntime(): Promise<IAgentRuntime> {
    const maxAttempts = 40; // Increased from 20 to allow more time
    const delayMs = 500;    // Keep 500ms delay between checks
    const timeoutMs = maxAttempts * delayMs;
    
    this.logger.debug(`Waiting for runtime to be available (timeout: ${timeoutMs}ms)`);
    
    // Set a timeout promise
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`Runtime wait timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    
    // Set a runtime check promise
    const runtimePromise = new Promise<IAgentRuntime>(async (resolve, reject) => {
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        try {
          // Check if runtime is available
          if (this.runtime) {
            // Verify runtime has critical methods initialized
            if (typeof this.runtime.getAgentId === 'function') {
              try {
                // Try to actually call a method to verify it's working
                const agentId = this.runtime.getAgentId();
                this.logger.debug(`[RUNTIME] Runtime verified with agentId: ${agentId}`);
                resolve(this.runtime);
                return;
              } catch (methodError) {
                this.logger.debug(`[RUNTIME] Runtime found but getAgentId not ready yet: ${methodError.message}`);
              }
            }
          }
          
          // Wait and try again
          await new Promise(r => setTimeout(r, delayMs));
          attempts++;
          
          if (attempts % 5 === 0) {
            this.logger.debug(`[RUNTIME] Still waiting for runtime (attempt ${attempts}/${maxAttempts})`);
          }
        } catch (error) {
          reject(new Error(`Error while waiting for runtime: ${error.message}`));
          return;
        }
      }
      
      reject(new Error(`Runtime not fully initialized after ${maxAttempts} attempts`));
    });
    
    try {
      // Race the runtime check against the timeout
      return await Promise.race([runtimePromise, timeoutPromise]);
    } catch (error) {
      this.logger.error(`[RUNTIME] ${error.message}`);
      throw error;
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