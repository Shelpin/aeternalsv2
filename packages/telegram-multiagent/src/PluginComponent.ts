import { IAgentRuntime, ElizaLogger } from './types.js';

// Plugin version for logging purposes
const PLUGIN_VERSION = "0.25.9";

/**
 * Base class for plugin components that require runtime access
 */
export abstract class PluginComponent {
  protected runtime: IAgentRuntime | null = null;
  protected logger: ElizaLogger;
  private waitingPromises: { resolve: Function, reject: Function }[] = [];

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
    const runtimeProxy = new Proxy(runtime, this.createRuntimeProxyHandlers()) as IAgentRuntime;
    this.runtime = runtimeProxy;

    this.logger.info(`[PLUGIN] Runtime set for ${this.constructor.name} (Plugin v${PLUGIN_VERSION})`);
    this.logger.debug(`[PLUGIN] Agent ID: ${this.getAgentIdSafe()}`);
    // Resolve any waiting promises
    if (this.waitingPromises.length > 0) {
      this.logger.debug(`Resolving ${this.waitingPromises.length} waiting promises`);
      for (const { resolve } of this.waitingPromises) {
        resolve(runtimeProxy);
      }
      this.waitingPromises = [];
    }
  }

  /**
   * Create runtime proxy handlers to adapt the actual runtime structure
   * to match the expected IAgentRuntime interface
   */
  protected createRuntimeProxyHandlers(): ProxyHandler<object> {
    return {
      get: (target: object, prop: string | symbol, receiver: unknown): unknown => {
        // Handle getAgentId method
        if (prop === 'getAgentId') {
          return () => {
            // Try to use direct property access first
            if (typeof (target as { agentId?: string }).agentId === 'string' && (target as { agentId?: string }).agentId) {
              return (target as { agentId: string }).agentId;
            }
            // Fall back to method if it exists
            if (typeof (target as { getAgentId?: () => string }).getAgentId === 'function') {
              return (target as { getAgentId: () => string }).getAgentId();
            }
            // Last resort
            return 'unknown-agent';
          };
        }
        // Handle getLogger method
        if (prop === 'getLogger') {
          return (name: string) => {
            // If there's a logging system available, use it
            const loggerService = (target as { logger?: { getLogger?: (name: string) => unknown }, loggerService?: { getLogger?: (name: string) => unknown } }).logger || (target as { loggerService?: { getLogger?: (name: string) => unknown } }).loggerService;
            if (loggerService && typeof loggerService.getLogger === 'function') {
              return loggerService.getLogger(name);
            }
            // Fallback to console logging
            return {
              trace: (message: string, ...args: unknown[]) => console.log(`[TRACE][${name}]: ${message}`, ...args),
              debug: (message: string, ...args: unknown[]) => console.log(`[DEBUG][${name}]: ${message}`, ...args),
              info: (message: string, ...args: unknown[]) => console.log(`[INFO][${name}]: ${message}`, ...args),
              warn: (message: string, ...args: unknown[]) => console.warn(`[WARN][${name}]: ${message}`, ...args),
              error: (message: string, ...args: unknown[]) => console.error(`[ERROR][${name}]: ${message}`, ...args)
            };
          };
        }
        // Passthrough for properties and methods that exist
        if (prop in target) {
          const value = (target as Record<string | symbol, unknown>)[prop];
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
   * Wait for the runtime to be available
   * @param timeoutMs Maximum time to wait in milliseconds
   * @returns The runtime object or throws error if not available in time
   */
  protected async waitForRuntime(timeoutMs: number = 60000): Promise<IAgentRuntime> {
    const start = Date.now();
    let delay = 100;
    const maxDelay = 5000;

    this.logger.debug(`[RUNTIME] Waiting for runtime to be available (timeout: ${timeoutMs}ms)`);

    while (Date.now() - start < timeoutMs) {
      // If already wrapped and valid, use it
      if (this.runtime && this.runtimeIsValid(this.runtime)) {
        this.logger.info(`[RUNTIME] Using existing wrapped runtime`);
        return this.runtime;
      }

      // Check for global runtime first (Valhalla patching approach)
      if (globalThis.__elizaRuntime && typeof globalThis.__elizaRuntime === 'object') {
        this.logger.info(`[RUNTIME] Found globalThis.__elizaRuntime, attempting to wrap it`);
        this.logger.debug(`[RUNTIME] Global runtime constructor: ${globalThis.__elizaRuntime.constructor?.name || 'unknown'}`);
        this.logger.debug(`[RUNTIME] Global runtime handleMessage present: ${typeof globalThis.__elizaRuntime.handleMessage === 'function'}`);

        try {
          const wrappedRuntime = this.createRuntimeWrapper(globalThis.__elizaRuntime);
          this.runtime = wrappedRuntime;
          const agentId = wrappedRuntime.getAgentId();
          this.logger.info(`[RUNTIME] Successfully wrapped globalThis.__elizaRuntime with agent ID: ${agentId}`);
          return wrappedRuntime;
        } catch (error: unknown) {
          if (error instanceof Error) {
            this.logger.error(`[RUNTIME] Error with global runtime wrapper: ${error.message}`);
          } else {
            this.logger.error(`[RUNTIME] Error with global runtime wrapper: ${JSON.stringify(error)}`);
          }
        }
      }

      // Not ready yet, wait and increase delay with exponential backoff
      this.logger.trace(`[RUNTIME] Runtime not available yet, waiting ${delay}ms before retry...`);
      await new Promise(res => setTimeout(res, delay));
      delay = Math.min(delay * 1.5, maxDelay);
    }

    this.logger.error(`[RUNTIME] Runtime wait timed out after ${timeoutMs}ms`);
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
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`- getAgentId call failed: ${error.message}`);
      } else {
        this.logger.error(`- getAgentId call failed: ${JSON.stringify(error)}`);
      }
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
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.warn(`Error getting agent ID: ${error.message}`);
      } else {
        this.logger.warn(`Error getting agent ID: ${JSON.stringify(error)}`);
      }
    }

    return "unknown-agent";
  }
} 