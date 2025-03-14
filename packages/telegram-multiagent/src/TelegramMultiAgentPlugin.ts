import { ElizaLogger, IAgentRuntime, Plugin } from './types';
import { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
import { TelegramRelay } from './TelegramRelay';
import { ConversationManager } from './ConversationManager';
import { PersonalityEnhancer } from './PersonalityEnhancer';
import { TelegramMultiAgentPluginConfig } from './index';

/**
 * TelegramMultiAgentPlugin enables multi-agent coordination in Telegram groups
 */
export class TelegramMultiAgentPlugin implements Plugin {
  // Required Plugin properties
  public name: string = 'TelegramMultiAgentPlugin';
  public description: string = 'Enables multi-agent coordination in Telegram groups';
  public npmName: string = '@elizaos/telegram-multiagent';
  
  private config: any;
  private logger: ElizaLogger;
  private isInitialized = false;
  private relay: TelegramRelay | null = null;
  private runtime: IAgentRuntime | null = null;
  private agentId: string = '';

  /**
   * Create a new TelegramMultiAgentPlugin
   * 
   * @param config - Plugin configuration
   */
  constructor(config: any) {
    // Use console.log directly to ensure messages are captured
    console.log('[CONSTRUCTOR] TelegramMultiAgentPlugin: Constructor called directly');
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: Plugin name is '${this.name}'`);
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: Plugin description is '${this.description}'`);
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: Plugin npmName is '${this.npmName}'`);
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: typeof this=${typeof this}, constructor=${this.constructor.name}`);
    
    // Debug the plugin interface properties
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: has initialize=${typeof this.initialize === 'function'}`);
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: has shutdown=${typeof this.shutdown === 'function'}`);
    
    this.config = {
      conversationCheckIntervalMs: 60000, // 1 minute default
      enabled: true,
      ...config
    };
    
    // Debug the config
    console.log(`[CONSTRUCTOR] TelegramMultiAgentPlugin: config=${JSON.stringify(this.config)}`);
    
    // Create a default logger that uses console directly
    this.logger = {
      debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      warn: (msg: string) => console.log(`[WARN] ${msg}`),
      error: (msg: string) => console.log(`[ERROR] ${msg}`)
    };
  }

  // Override toString method to make debugging easier
  toString(): string {
    return `[TelegramMultiAgentPlugin name=${this.name} description=${this.description} npmName=${this.npmName}]`;
  }

  /**
   * Load configuration from environment or config file
   */
  private loadConfig(): TelegramMultiAgentPluginConfig {
    // Get agent ID from environment or config
    this.agentId = process.env.AGENT_ID || this.config.agentId || '';
    
    if (!this.agentId) {
      console.log('[ERROR] TelegramMultiAgentPlugin: No agent ID provided');
      console.log('[DEBUG] TelegramMultiAgentPlugin: config=', JSON.stringify(this.config, null, 2));
      throw new Error('No agent ID provided');
    }
    
    // Initialize relay with environment variables
    const relayServerUrl = process.env.RELAY_SERVER_URL || this.config.relayServerUrl || 'http://localhost:4000';
    const authToken = process.env.RELAY_AUTH_TOKEN || this.config.authToken || 'elizaos-secure-relay-key';
    
    return {
      relayServerUrl,
      authToken,
      groupIds: this.config.groupIds || [],
      conversationCheckIntervalMs: this.config.conversationCheckIntervalMs || 60000,
      enabled: this.config.enabled !== false
    };
  }

  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    console.log('[INITIALIZE] TelegramMultiAgentPlugin: initialize() method called');
    
    if (this.isInitialized) {
      console.log('[INITIALIZE] TelegramMultiAgentPlugin: Already initialized, skipping');
      return;
    }

    try {
      console.log('[INITIALIZE] TelegramMultiAgentPlugin: Starting initialization');
      
      // Load configuration from environment or config file
      const config = this.loadConfig();
      console.log(`[INITIALIZE] TelegramMultiAgentPlugin: Loaded config with relay URL: ${config.relayServerUrl}`);
      
      if (!config.enabled) {
        console.log('[INITIALIZE] TelegramMultiAgentPlugin: Plugin is disabled in config, skipping initialization');
        return;
      }

      // Create the relay
      this.relay = new TelegramRelay({
        relayServerUrl: config.relayServerUrl,
        authToken: config.authToken,
        agentId: this.agentId,
        retryLimit: 3,
        retryDelayMs: 5000
      });
      console.log('[INITIALIZE] TelegramMultiAgentPlugin: Created TelegramRelay instance');

      // Connect to the relay server
      await this.relay.connect();
      console.log('[INITIALIZE] TelegramMultiAgentPlugin: Connected to relay server');

      this.isInitialized = true;
      console.log('[INITIALIZE] TelegramMultiAgentPlugin: Initialization complete');
    } catch (error) {
      console.error('[INITIALIZE] TelegramMultiAgentPlugin: Error during initialization:', error);
      this.logger.error(`Failed to initialize TelegramMultiAgentPlugin: ${error.message}`);
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
    
    // Disconnect from relay server
    if (this.relay) {
      await this.relay.disconnect();
    }
    
    this.isInitialized = false;
    this.logger.info('TelegramMultiAgentPlugin: Shutdown complete');
  }
} 