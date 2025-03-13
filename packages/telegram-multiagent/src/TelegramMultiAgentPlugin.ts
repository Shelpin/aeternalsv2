import { ElizaLogger, Plugin, IAgentRuntime } from './types';
import { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';

/**
 * Options for the Telegram Multi-Agent plugin
 */
export interface TelegramMultiAgentPluginOptions {
  /**
   * Authentication token for the relay server
   */
  authToken: string;
  
  /**
   * List of Telegram group IDs to enable multi-agent functionality
   */
  groupIds: number[];
  
  /**
   * URL of the relay server
   * Default: http://localhost:3000
   */
  relayServerUrl?: string;
  
  /**
   * Whether the plugin is enabled
   * Default: true
   */
  enabled?: boolean;
}

/**
 * TelegramMultiAgentPlugin provides multi-agent coordination for Telegram bots
 */
export class TelegramMultiAgentPlugin implements Plugin {
  private options: TelegramMultiAgentPluginOptions;
  private adapter: TelegramCoordinationAdapter | null = null;
  private runtime: IAgentRuntime | null = null;
  private logger: ElizaLogger;
  
  /**
   * Create a new TelegramMultiAgentPlugin
   * 
   * @param options - Plugin options
   * @param logger - ElizaOS logger instance
   */
  constructor(options: TelegramMultiAgentPluginOptions, logger: ElizaLogger) {
    this.options = {
      relayServerUrl: options.relayServerUrl || 'http://localhost:3000',
      enabled: options.enabled !== false, // Default to true
      groupIds: options.groupIds || [],
      authToken: options.authToken
    };
    this.logger = logger;
  }
  
  /**
   * Initialize the plugin
   * 
   * @param runtime - ElizaOS runtime
   */
  async initialize(runtime: IAgentRuntime): Promise<void> {
    this.runtime = runtime;
    
    if (!this.options.enabled) {
      this.logger.info('Telegram Multi-Agent plugin is disabled, skipping initialization');
      return;
    }
    
    if (this.options.groupIds.length === 0) {
      this.logger.warn('Telegram Multi-Agent plugin has no group IDs configured');
    }
    
    try {
      // Initialize the coordination adapter
      this.adapter = new TelegramCoordinationAdapter(
        runtime.getAgentId(),
        runtime,
        this.logger
      );
      
      // Register the adapter with the runtime
      runtime.registerService('telegramCoordinationAdapter', this.adapter);
      
      this.logger.info('Telegram Multi-Agent plugin initialized successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize Telegram Multi-Agent plugin: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Shutdown the plugin
   */
  async shutdown(): Promise<void> {
    try {
      if (this.adapter) {
        await this.adapter.close();
        this.adapter = null;
      }
      
      this.logger.info('Telegram Multi-Agent plugin shut down successfully');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error shutting down Telegram Multi-Agent plugin: ${errorMessage}`);
    }
  }
  
  /**
   * Get the coordination adapter
   * 
   * @returns The TelegramCoordinationAdapter instance
   */
  getAdapter(): TelegramCoordinationAdapter | null {
    return this.adapter;
  }
  
  /**
   * Get the plugin options
   * 
   * @returns The plugin options
   */
  getOptions(): TelegramMultiAgentPluginOptions {
    return this.options;
  }
} 