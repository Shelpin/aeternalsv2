import { ElizaLogger, IAgentRuntime, Plugin, TelegramMultiAgentPluginConfig } from './types';
import { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
import { TelegramRelay } from './TelegramRelay';
import { ConversationManager } from './ConversationManager';
import { PersonalityEnhancer } from './PersonalityEnhancer';

/**
 * TelegramMultiAgentPlugin enables multi-agent coordination in Telegram groups
 */
export class TelegramMultiAgentPlugin implements Plugin {
  private config: TelegramMultiAgentPluginConfig;
  private logger: ElizaLogger;
  private isInitialized = false;

  /**
   * Create a new TelegramMultiAgentPlugin
   * 
   * @param config - Plugin configuration
   */
  constructor(config: TelegramMultiAgentPluginConfig) {
    this.config = {
      conversationCheckIntervalMs: 60000, // 1 minute default
      enabled: true,
      ...config
    };
    
    // Create a default logger if none is provided
    this.logger = {
      debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
      info: (msg: string) => console.info(`[INFO] ${msg}`),
      warn: (msg: string) => console.warn(`[WARN] ${msg}`),
      error: (msg: string) => console.error(`[ERROR] ${msg}`)
    };
  }

  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    if (!this.config.enabled) {
      this.logger.info('TelegramMultiAgentPlugin: Plugin is disabled, skipping initialization');
      return;
    }
    
    try {
      this.logger.info('TelegramMultiAgentPlugin: Initializing plugin');
      
      // In a real implementation, this would initialize the components
      // and set up the coordination between agents
      
      this.isInitialized = true;
      this.logger.info('TelegramMultiAgentPlugin: Initialization complete');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`TelegramMultiAgentPlugin: Initialization error: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Shutdown the plugin
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }
    
    this.logger.info('TelegramMultiAgentPlugin: Shutting down');
    
    // In a real implementation, this would clean up resources
    // and disconnect from the relay server
    
    this.isInitialized = false;
    this.logger.info('TelegramMultiAgentPlugin: Shutdown complete');
  }
} 