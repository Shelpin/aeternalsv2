import { IAgentRuntime, ElizaLogger } from './types.js';

// Plugin version for logging purposes
const PLUGIN_VERSION = "0.25.9";

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
    // Create runtime proxy using the adapter pattern
    const runtimeProxy = new Proxy(runtime, this.createRuntimeProxyHandlers());
    this.runtime = runtimeProxy;
    
    this.logger.info(`[PLUGIN] Runtime set for ${this.constructor.name} (Plugin v${PLUGIN_VERSION})`);
    this.logger.debug(`[PLUGIN] Agent ID: ${this.getAgentIdSafe()}`);
    
    // Resolve any waiting promises
    if (this.waitingPromises.length > 0) {
      this.logger.debug(`Resolving ${this.waitingPromises.length} waiting promises`);
      for (const {resolve} of this.waitingPromises) {
        resolve(runtimeProxy);
      }
      this.waitingPromises = [];
    }
  }
  
  /**
   * Create runtime proxy handlers to adapt the actual runtime structure
   * to match the expected IAgentRuntime interface
   */
  protected createRuntimeProxyHandlers(): ProxyHandler<any> {
    return {
      get: (target, prop, receiver) => {
        // Handle getAgentId method
        if (prop === 'getAgentId') {
          return () => {
            // Try to use direct property access first
            if (typeof target.agentId === 'string' && target.agentId) {
              return target.agentId;
            }
            
            // Fall back to method if it exists
            if (typeof target.getAgentId === 'function') {
              return target.getAgentId();
            }
            
            // Last resort
            return "unknown-agent";
          };
        }
        
        // Handle getLogger method
        if (prop === 'getLogger') {
          return (name: string) => {
            // If there's a logging system available, use it
            const loggerService = target.logger || target.loggerService;
            if (loggerService?.getLogger) {
              return loggerService.getLogger(name);
            }
            
            // Fallback to console logging
            return {
              trace: (message: string, ...args: any[]) => console.log(`[TRACE][${name}]: ${message}`, ...args),
              debug: (message: string, ...args: any[]) => console.log(`[DEBUG][${name}]: ${message}`, ...args),
              info: (message: string, ...args: any[]) => console.log(`[INFO][${name}]: ${message}`, ...args),
              warn: (message: string, ...args: any[]) => console.warn(`[WARN][${name}]: ${message}`, ...args),
              error: (message: string, ...args: any[]) => console.error(`[ERROR][${name}]: ${message}`, ...args)
            };
          };
        }
        
        // Passthrough for properties and methods that exist
        if (prop in target) {
          const value = target[prop];
          return typeof value === 'function' ? value.bind(target) : value;
        }
        
        return undefined;
      }
    };
  }
  
  /**
   * Create a runtime wrapper that adapts the actual runtime structure 
   * to match the expected IAgentRuntime interface
   * @deprecated Use createRuntimeProxyHandlers instead
   */
  protected createRuntimeWrapper(runtime: any): IAgentRuntime {
    this.logger.debug(`[PLUGIN] Creating runtime wrapper (legacy method)`);
    
    // Create a wrapper that adapts the actual runtime structure to our expected interface
    return {
      // Direct property access for ID
      getAgentId: () => runtime.agentId ?? "unknown-agent",
      
      // Create logger wrapper
      getLogger: (name: string) => {
        // If there's a logging system available, use it
        const loggerService = runtime.logger || runtime.loggerService;
        if (loggerService?.getLogger) {
          return loggerService.getLogger(name);
        }
        
        // Fallback to console logging
        return {
          trace: (message: string, ...args: any[]) => console.log(`[TRACE][${name}]: ${message}`, ...args),
          debug: (message: string, ...args: any[]) => console.log(`[DEBUG][${name}]: ${message}`, ...args),
          info: (message: string, ...args: any[]) => console.log(`[INFO][${name}]: ${message}`, ...args),
          warn: (message: string, ...args: any[]) => console.warn(`[WARN][${name}]: ${message}`, ...args),
          error: (message: string, ...args: any[]) => console.error(`[ERROR][${name}]: ${message}`, ...args)
        };
      },
      
      // Pass through existing properties
      ...runtime
    };
  }
  
  /**
   * Validate that the runtime has the necessary properties
   * This focuses on the actual properties we need rather than methods
   */
  protected runtimeIsValid(runtime: any): boolean {
    if (!runtime) return false;
    
    // Check for critical properties
    if (typeof runtime.agentId !== 'string' || !runtime.agentId) {
      this.logger.debug('Runtime missing agentId property');
      return false;
    }
    
    // Don't check for memoryManager since it may not be available immediately
    // Just log it for debugging
    if (!runtime.memoryManager) {
      this.logger.debug('Runtime missing memoryManager (continuing anyway)');
    }
    
    return true;
  }
  
  /**
   * Wait for the runtime to be available and ready to use
   * Uses adapter pattern to bridge interface/implementation mismatch
   * 
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 60000)
   * @returns Promise resolving to the runtime instance
   * @throws Error if runtime is not available after timeout
   */
  protected async waitForRuntime(timeoutMs: number = 60000): Promise<IAgentRuntime> {
    const start = Date.now();
    const maxDelay = 5000;
    let delay = 100;

    this.logger.debug(`[PLUGIN] Waiting for runtime to be available (v${PLUGIN_VERSION}, timeout: ${timeoutMs}ms)`);

    while (Date.now() - start < timeoutMs) {
      // Check this.runtime first if it's already a wrapped instance
      if (this.runtime && this.runtimeIsValid(this.runtime)) {
        this.logger.info(`[PLUGIN] Runtime ready, agent ID: ${this.getAgentIdSafe()}`);
        return this.runtime;
      }

      // Check globalThis.__elizaRuntime
      const rawRt = globalThis.__elizaRuntime;
      if (rawRt) {
        // Extra verbose debugging for what properties actually exist
        this.logger.debug(`[RUNTIME-DEBUG] Found __elizaRuntime, checking properties:`);
        this.logger.debug(`[RUNTIME-DEBUG] Has agentId? ${typeof rawRt.agentId === 'string'}`);
        this.logger.debug(`[RUNTIME-DEBUG] agentId value: ${rawRt.agentId}`);
        this.logger.debug(`[RUNTIME-DEBUG] Has memoryManager? ${!!rawRt.memoryManager}`);
        this.logger.debug(`[RUNTIME-DEBUG] Has memoryManagers? ${!!rawRt.memoryManagers}`);
        this.logger.debug(`[RUNTIME-DEBUG] Has clients? ${!!rawRt.clients}`);
      
        // Check if the runtime is valid for our needs
        if (this.runtimeIsValid(rawRt)) {
          // Log runtime constructor for debugging
          this.logger.info(`[RUNTIME] Runtime constructor: ${rawRt.constructor?.name || 'unknown'}`);
          
          // Create runtime proxy using the adapter pattern
          const runtimeProxy = new Proxy(rawRt, this.createRuntimeProxyHandlers());
          this.runtime = runtimeProxy;
          
          // Test if it works
          try {
            const agentId = this.getAgentIdSafe();
            this.logger.info(`[AGENT] Agent ID: ${agentId} (from runtime v${PLUGIN_VERSION})`);
            return runtimeProxy;
          } catch (error) {
            this.logger.error(`[RUNTIME] Error with runtime proxy: ${error.message}`);
          }
        } else {
          this.logger.debug("[RUNTIME-DEBUG] Runtime found but validation failed");
        }
      }

      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * 1.5, maxDelay);
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
    
    this.logger.info(`[PLUGIN-TEST] Testing runtime readiness (v${PLUGIN_VERSION}):`);
    this.logger.info(`- runtime object: ${this.runtime ? 'exists' : 'missing'}`);
    this.logger.info(`- getAgentId: ${typeof this.runtime.getAgentId === 'function' ? 'function' : 'missing'}`);
    this.logger.info(`- getLogger: ${typeof this.runtime.getLogger === 'function' ? 'function' : 'missing'}`);
    this.logger.info(`- memoryManager: ${this.runtime.memoryManager ? 'exists' : 'missing'}`);
    
    if (this.runtime.memoryManager) {
      this.logger.info(`- memoryManager.createMemory: ${typeof this.runtime.memoryManager.createMemory === 'function' ? 'function' : 'missing'}`);
      this.logger.info(`- memoryManager.getMemories: ${typeof this.runtime.memoryManager.getMemories === 'function' ? 'function' : 'missing'}`);
    }
    
    // Try getting agent ID
    try {
      const agentId = this.runtime.getAgentId();
      this.logger.info(`- getAgentId result: ${agentId}`);
    } catch (error) {
      this.logger.error(`- getAgentId call failed: ${error.message}`);
    }
  }
  
  /**
   * Initialize the component
   * This should be called during plugin initialization
   */
  async initialize(): Promise<void> {
    this.logger.info(`[PLUGIN] Initializing ${this.constructor.name} (v${PLUGIN_VERSION})`);
    // To be implemented by subclasses
  }
  
  /**
   * Shutdown the component
   * This should be called during plugin shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.info(`[PLUGIN] Shutting down ${this.constructor.name}`);
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