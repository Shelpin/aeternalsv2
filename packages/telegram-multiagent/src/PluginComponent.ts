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
   * Uses exponential backoff for retries
   * 
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 60000)
   * @returns Promise resolving to the runtime instance
   * @throws Error if runtime is not available after timeout
   */
  protected async waitForRuntime(timeoutMs: number = 60000): Promise<IAgentRuntime> {
    const start = Date.now();
    const maxDelay = 5000; // Max 5 seconds between attempts
    let delay = 100; // Start with 100ms delay

    this.logger.debug(`Waiting for runtime to be available (timeout: ${timeoutMs}ms)`);

    while (Date.now() - start < timeoutMs) {
      // Check this.runtime first
      if (this.runtime && 
          typeof this.runtime.getAgentId === 'function' && 
          typeof this.runtime.getLogger === 'function') {
        this.logger.debug('Runtime found via this.runtime with all required methods');
        return this.runtime;
      }

      // Check globalThis.__elizaRuntime
      if (globalThis.__elizaRuntime) {
        // Log detailed runtime analysis
        this.logger.info(`[RUNTIME-DEBUG] __elizaRuntime exists`);
        this.logger.info(`[RUNTIME-DEBUG] Runtime constructor: ${globalThis.__elizaRuntime.constructor?.name || 'unknown'}`);
        this.logger.info(`[RUNTIME-DEBUG] Direct keys: ${Object.keys(globalThis.__elizaRuntime).join(', ')}`);
        
        // Check prototype
        const proto = Object.getPrototypeOf(globalThis.__elizaRuntime);
        if (proto) {
          this.logger.info(`[RUNTIME-DEBUG] Prototype exists: ${proto.constructor?.name || 'unknown'}`);
          this.logger.info(`[RUNTIME-DEBUG] Prototype keys: ${Object.getOwnPropertyNames(proto).join(', ')}`);
          
          // Check if methods are on prototype
          this.logger.info(`[RUNTIME-DEBUG] getAgentId on prototype: ${typeof proto.getAgentId === 'function'}`);
          this.logger.info(`[RUNTIME-DEBUG] getLogger on prototype: ${typeof proto.getLogger === 'function'}`);
        } else {
          this.logger.info(`[RUNTIME-DEBUG] No prototype found`);
        }
        
        // Try to access methods directly from the __elizaRuntime object
        this.logger.info(`[RUNTIME-DEBUG] Direct method check:`);
        this.logger.info(`[RUNTIME-DEBUG] - typeof __elizaRuntime.getAgentId: ${typeof globalThis.__elizaRuntime.getAgentId}`);
        this.logger.info(`[RUNTIME-DEBUG] - typeof __elizaRuntime.getLogger: ${typeof globalThis.__elizaRuntime.getLogger}`);
        
        // Try direct method call with binding
        try {
          const proto = Object.getPrototypeOf(globalThis.__elizaRuntime);
          if (proto && typeof proto.getAgentId === 'function') {
            const boundGetAgentId = proto.getAgentId.bind(globalThis.__elizaRuntime);
            const agentId = boundGetAgentId();
            this.logger.info(`[RUNTIME-DEBUG] Direct bound call successful: agentId=${agentId}`);
          }
        } catch (error) {
          this.logger.error(`[RUNTIME-DEBUG] Direct bound call failed: ${error.message}`);
        }
        
        // Create a proxy for the runtime that properly handles prototype methods
        const runtimeProxy = new Proxy(globalThis.__elizaRuntime, {
          get(target, prop, receiver) {
            let value = Reflect.get(target, prop, receiver);

            // If value is undefined, try from prototype
            if (value === undefined) {
              const proto = Object.getPrototypeOf(target);
              if (proto) {
                value = Reflect.get(proto, prop, receiver);
              }
            }

            // Bind function only if it's a function (could be from prototype or direct)
            if (typeof value === 'function') {
              return value.bind(target);
            }

            return value;
          }
        });
        
        // Test if the proxy works and log results
        try {
          this.logger.info("[PROXY] runtime.getAgentId exists:", typeof runtimeProxy.getAgentId === "function");
          this.logger.info("[PROXY] runtime.getLogger exists:", typeof runtimeProxy.getLogger === "function");
          
          const agentId = runtimeProxy.getAgentId?.();
          if (agentId) {
            this.logger.debug(`[RUNTIME] Runtime methods: getAgentId=available`);
            this.logger.info(`[AGENT] Agent ID: ${agentId}`);
            
            // Also verify getLogger works
            const logger = runtimeProxy.getLogger('test');
            if (logger) {
              this.logger.debug('[RUNTIME] Runtime methods: getAgentId=available, getLogger=available');
              this.runtime = runtimeProxy;
              this.logger.info(`[TEST] Runtime proxy test: Agent ID = ${runtimeProxy.getAgentId?.()}`);
              return runtimeProxy;
            }
          } else {
            this.logger.error("[RUNTIME] getAgentId() returned null or undefined");
          }
        } catch (error) {
          this.logger.debug(`[RUNTIME] Error using proxy methods: ${error.message}`);
        }
      }

      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, maxDelay); // Exponential backoff with cap
    }

    throw new Error(`Runtime wait timed out after ${timeoutMs}ms`);
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
  
  /**
   * Safely get the agent ID, with fallback for missing runtime
   * @returns The agent ID or a default value
   */
  protected getAgentIdSafe(): string {
    try {
      if (this.runtime?.getAgentId) {
        const agentId = this.runtime.getAgentId();
        if (agentId) {
          return agentId;
        }
      }
    } catch (error) {
      this.logger.warn(`Error getting agent ID: ${error}`);
    }
    
    return "unknown-agent";
  }
} 