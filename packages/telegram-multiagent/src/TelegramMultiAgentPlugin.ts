import {
  IAgentRuntime,
  ElizaLogger,
  Plugin,
  TelegramMultiAgentConfig,
  RelayMessage,
  MemoryData,
  Character
} from './types.js';
import { ConversationManager } from './ConversationManager.js';
import { TelegramRelay } from './TelegramRelay.js';
import { ConversationKickstarter } from './ConversationKickstarter.js';
import { PersonalityEnhancer } from './PersonalityEnhancer.js';
import { PluginComponent } from './PluginComponent.js';
import path from 'path';
import fs from 'fs';
import { FallbackMemoryManager } from './FallbackMemoryManager.js';

// Extend the Character interface to include additional properties
declare module './types.js' {
  interface Character {
    traits?: string[];
    personality?: {
      conversationInitiationWeight?: number;
      [key: string]: any;
    };
  }
}

// Default configuration values
const DEFAULT_CONFIG: TelegramMultiAgentConfig = {
  enabled: true,
  relayServerUrl: 'http://207.180.245.243:4000',
  authToken: 'elizaos-secure-relay-key',
  groupIds: [],
  dbPath: './data/telegram-multiagent.db',
  logLevel: 'info',
  conversationCheckIntervalMs: 60000, // 1 minute
  maxRetries: 3,
  kickstarterConfig: {
    probabilityFactor: 0.2,
    minIntervalMs: 300000, // 5 minutes
    includeTopics: true,
    shouldTagAgents: true,
    maxAgentsToTag: 2
  }
};

/**
 * Telegram Multi-Agent Plugin
 * 
 * This plugin enables agents to participate in group conversations
 * with other agents in Telegram, creating more dynamic and interesting
 * interactions.
 */
export class TelegramMultiAgentPlugin extends PluginComponent implements Plugin {
  name = 'telegram-multiagent';
  description = 'Multi-agent coordination for Telegram bots in ElizaOS';
  npmName = '@elizaos/telegram-multiagent';
  
  private config: TelegramMultiAgentConfig;
  private relay: TelegramRelay | null = null;
  private conversationManager: ConversationManager;
  private kickstarters: Map<string, ConversationKickstarter> = new Map();
  private knownAgents: Set<string> = new Set();
  private character: Character | null = null;
  private checkIntervalId: ReturnType<typeof setInterval> | null = null;
  private initialized = false;
  private agentId: string = "unknown";
  private initializePromise: Promise<void> | null = null;
  private lastResponseTimes: Map<string, number> = new Map();
  private lastSpeaker: Map<string, string> = new Map();
  private recentSpeakers: Map<string, { agentId: string; time: number }[]> = new Map();
  private fallbackMemory: FallbackMemoryManager | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private runtimeProxy: IAgentRuntime | null = null;
  
  /**
   * Create a new TelegramMultiAgentPlugin
   * Constructor should only handle basic setup, not accessing runtime
   * 
   * @param options - Configuration options
   */
  constructor(options?: Partial<TelegramMultiAgentConfig>) {
    // Create a default logger before we get the real one from the runtime
    const defaultLogger: ElizaLogger = {
      trace: (message: string, ...args: any[]) => 
        console.log(`[TRACE] TelegramMultiAgentPlugin: ${message}`, ...args),
      debug: (message: string, ...args: any[]) => 
        console.log(`[DEBUG] TelegramMultiAgentPlugin: ${message}`, ...args),
      info: (message: string, ...args: any[]) => 
        console.log(`[INFO] TelegramMultiAgentPlugin: ${message}`, ...args),
      warn: (message: string, ...args: any[]) => 
        console.warn(`[WARN] TelegramMultiAgentPlugin: ${message}`, ...args),
      error: (message: string, ...args: any[]) => 
        console.error(`[ERROR] TelegramMultiAgentPlugin: ${message}`, ...args)
    };
    
    super(defaultLogger);
    
    console.log("[CONSTRUCTOR] TelegramMultiAgentPlugin: Constructor called");
    
    // VALHALLA FIX: Set agentId from environment variable if available
    // This is our canonical agent ID throughout the plugin
    if (process.env.AGENT_ID) {
      this.agentId = process.env.AGENT_ID;
      console.log(`[CONSTRUCTOR] Using AGENT_ID from environment: ${this.agentId}`);
    }
    
    // Only set basic config here, don't do any initialization
    this.config = {
      ...DEFAULT_CONFIG,
      ...options
    };
    
    console.log(`[CONFIG] Using default relay server: ${this.config.relayServerUrl}`);
    console.log(`[CONFIG] Using default auth token: ${this.config.authToken ? this.config.authToken.substring(0, 6) + '****' : 'not set'}`);

    this.logger = defaultLogger;
    
    // Just create a reference without initialization
    // The actual initialization will happen in initialize()
    this.conversationManager = new ConversationManager(this.logger);
  }
  
  /**
   * Register the plugin with the ElizaOS runtime
   * Only store the runtime reference without accessing methods
   * 
   * @param runtime - ElizaOS runtime
   * @returns Plugin instance or false on failure
   */
  register(runtime: IAgentRuntime): Plugin | boolean {
    try {
      this.logger.info(`[REGISTER] ${this.name}: Register method called`);
      
      // Store runtime reference even if null
      super.setRuntime(runtime);
      
      if (!runtime) {
        this.logger.warn(`[REGISTER] ${this.name}: Received null runtime, will attempt to obtain later`);
        return this;
      }
      
      // VALHALLA FIX: Normalize agent ID consistently
      const envAgentId = process.env.AGENT_ID;
      const runtimeAgentId = runtime.client?.telegram?.botInfo?.username;
      const fallbackAgentId = runtime.getAgentId();
      
      this.agentId = this.normalizeAgentId(
        envAgentId || runtimeAgentId || fallbackAgentId
      );
      
      this.logger.info(`[IDENTITY] Using normalized agent ID: ${this.agentId}`);
      
      // VALHALLA FIX: Hook into ElizaOS core's message events with enhanced logging
      if (runtime.client?.telegram) {
        runtime.client.telegram.on('message', async (message) => {
          // Enhanced message logging
          this.logger.info(`[RECEIVE] From ${message.from.username} | Text: ${message.text}`);
          
          // Convert Telegram message to our RelayMessage format
          const relayMessage = {
            message_id: message.message_id,
            from: message.from,
            chat: message.chat,
            date: message.date,
            text: message.text || '',
            sender_agent_id: message.from.username
          };
          
          // Log message journey
          this.logger.debug(`[FLOW] Message journey:
            Source: Telegram
            Stage: Core Client Reception
            From: ${message.from.username}
            To: ${this.agentId}
            Text: ${message.text?.substring(0, 50)}...
          `);
          
          await this.handleIncomingMessage(relayMessage);
        });
        this.logger.info(`[PLUGIN] Hooked into ElizaOS Telegram client message events`);
      } else {
        this.logger.warn(`[REGISTER] ${this.name}: ElizaOS Telegram client not available`);
      }
      
      return this;
    } catch (error) {
      this.logger.error(`[ERROR] ${this.name}: Unexpected error during plugin registration: ${error}`);
      return false;
    }
  }
  
  /**
   * Load configuration from file if present
   * Will merge with default configuration
   */
  private async loadConfig(): Promise<void> {
    try {
      // Start with default config
      this.config = { ...DEFAULT_CONFIG };
      
      let configPath = './agent/config/plugins/telegram-multiagent.json';
      
      // Log environment variables for debugging
      this.logger.debug(`${this.name}: Environment variables:
        RELAY_SERVER_URL=${process.env.RELAY_SERVER_URL || 'not set'}
        RELAY_AUTH_TOKEN=${process.env.RELAY_AUTH_TOKEN ? '(set)' : 'not set'}
        AGENT_ID=${process.env.AGENT_ID || 'not set'}
      `);
      
      // First check for environment variables - highest priority
      if (process.env.RELAY_SERVER_URL) {
        this.logger.info(`${this.name}: Using relay server URL from environment: ${process.env.RELAY_SERVER_URL}`);
        this.config.relayServerUrl = process.env.RELAY_SERVER_URL;
      }
      
      if (process.env.RELAY_AUTH_TOKEN) {
        this.logger.info(`${this.name}: Using auth token from RELAY_AUTH_TOKEN environment variable`);
        this.config.authToken = process.env.RELAY_AUTH_TOKEN;
      } else if (process.env.RELAY_API_KEY) {
        this.logger.info(`${this.name}: Using auth token from RELAY_API_KEY environment variable`);
        this.config.authToken = process.env.RELAY_API_KEY;
      }
      
      // Check if config file exists - second priority
      if (fs.existsSync(configPath)) {
        this.logger.info(`${this.name}: Loading configuration from ${configPath}`);
        
        try {
          const configData = fs.readFileSync(configPath, 'utf8');
          const fileConfig = JSON.parse(configData);
          
          // Remember environment values
          const relayServerUrl = this.config.relayServerUrl; // Save from env
          const authToken = this.config.authToken; // Save from env
          
          // Merge with file config
          this.config = {
            ...this.config,
            ...fileConfig
          };
          
          // Environment variables override file config
          if (process.env.RELAY_SERVER_URL) {
            this.config.relayServerUrl = relayServerUrl;
          }
          
          if (process.env.RELAY_AUTH_TOKEN || process.env.RELAY_API_KEY) {
            this.config.authToken = authToken;
          }
          
          this.logger.info(`${this.name}: Configuration loaded successfully`);
        } catch (error) {
          this.logger.error(`${this.name}: Error parsing config file: ${error}`);
          // Continue with defaults and env vars
        }
      } else {
        this.logger.warn(`${this.name}: No configuration file found at ${configPath}, using defaults and environment variables`);
      }
      
      // Log what we're using
      this.logger.info(`${this.name}: Using relay server URL: ${this.config.relayServerUrl}`);
      const authTokenLength = this.config.authToken ? this.config.authToken.length : 0;
      this.logger.debug(`${this.name}: Using auth token, length: ${authTokenLength}`);
    } catch (error) {
      this.logger.error(`${this.name}: Error loading configuration: ${error}`);
    }
  }
  
  /**
   * Initialize the plugin
   */
  async initialize(): Promise<void> {
    try {
      // Wait for runtime to be ready first
      const runtime = await this.waitForRuntime(10000); // 10 second timeout
      if (!runtime) {
        throw new Error('Runtime not available after timeout');
      }
      
      this.logger.info(`[PLUGIN] Runtime ready, initializing plugin`);
      
      // VALHALLA FIX: Check if runtime.handleMessage is defined
      if (!runtime || typeof runtime.handleMessage !== 'function') {
        this.logger.warn('[PLUGIN] Runtime handleMessage not defined. Plugin may not respond to messages.');
      } else {
        this.logger.info('[PLUGIN] Runtime handleMessage properly defined.');
      }
      
      // Get Telegram bot username for relay registration
      let telegramAgentId = '';
      
      // First try getting from environment variables
      if (process.env.TELEGRAM_BOT_USERNAME) {
        telegramAgentId = process.env.TELEGRAM_BOT_USERNAME;
        this.logger.info(`[RELAY] Using TELEGRAM_BOT_USERNAME: ${telegramAgentId}`);
      } else if (process.env.AGENT_ID) {
        const agentIdFromEnv = process.env.AGENT_ID;
        telegramAgentId = agentIdFromEnv.endsWith('_bot') ? agentIdFromEnv : `${agentIdFromEnv}_bot`;
        this.logger.info(`[RELAY] Using derived bot username from AGENT_ID: ${telegramAgentId}`);
      }
      
      this.logger.info(`[IDENTITY] Agent ID for relay registration: ${telegramAgentId}`);
      
      // VALHALLA FIX: Override this.agentId with telegramAgentId to ensure consistency
      this.agentId = telegramAgentId;
      this.logger.info(`[IDENTITY] Setting canonical agent ID to: ${this.agentId}`);
      
      // Initialize relay with explicit Telegram bot username
      this.relay = new TelegramRelay({
        relayServerUrl: this.config.relayServerUrl,
        authToken: this.config.authToken,
        agentId: telegramAgentId 
      }, this.logger);
      
      this.logger.info(`[RELAY] Agent ${telegramAgentId} relay instance created`);
      
      // Set up relay message handling
      this.relay.onMessage(this.handleIncomingMessage.bind(this));
      
      // VALHALLA FIX: Remove custom Telegram polling and rely on ElizaOS core
      this.logger.info(`[PLUGIN] Using ElizaOS core for Telegram polling`);
      
      // Connect to relay
      const connected = await this.relay.connect();
      if (!connected) {
        throw new Error('Failed to connect to relay server');
      }
      
      // VALHALLA FIX: Check if runtime.handleMessage is defined
      if (!runtime || typeof runtime.handleMessage !== 'function') {
        this.logger.warn('[PLUGIN] Runtime handleMessage not defined. Plugin may not respond to messages.');
      } else {
        this.logger.info('[PLUGIN] Runtime handleMessage properly defined.');
      }
      
      this.initialized = true;
      this.logger.info(`${this.name}: Plugin initialized successfully`);
    } catch (error) {
      this.logger.error(`${this.name}: Initialization failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Test method to quickly confirm plugin health
   */
  test(): void {
    try {
      if (!this.runtime) {
        console.log("[TEST] Runtime reference is missing");
        return;
      }
      
      // Log the runtime constructor name
      console.log("Runtime class:", this.runtime.constructor?.name || "unknown");
      
      // Test runtime methods
      this.logger.info("[PROXY] runtime.getAgentId exists:", typeof this.runtime.getAgentId === "function");
      this.logger.info("[PROXY] runtime.getLogger exists:", typeof this.runtime.getLogger === "function");
      this.logger.info("[PROXY] runtime.memoryManager exists:", !!this.runtime.memoryManager);
      
      // Test agent ID retrieval
      try {
        const agentId = this.runtime.getAgentId();
        this.logger.info(`[TEST] Runtime proxy test: Agent ID = ${agentId}`);
      } catch (error) {
        this.logger.error(`[TEST] Agent ID test failed: ${error.message}`);
      }
      
      // Check if runtime methods are bound correctly
      try {
        const getAgentId = this.runtime.getAgentId;
        const unboundAgentId = getAgentId?.();
        this.logger.info(`[TEST] Unbound method test: ${unboundAgentId || 'Failed'}`);
      } catch (error) {
        this.logger.error(`[TEST] Unbound method test failed: ${error.message}`);
      }
    } catch (error) {
      console.error(`[TEST] Error during test: ${error}`);
    }
  }
  
  /**
   * Safe method to normalize agent ID
   * Implements consistent agent ID normalization across the plugin
   */
  private normalizeAgentId(agentId: string): string {
    // VALHALLA FIX: Handle _bot suffix more robustly and convert to lowercase
    return agentId?.replace('_bot', '').toLowerCase() || '';
  }
  
  /**
   * Safe method to get agent ID with fallback
   * Implements the expert's recommendation for defensive runtime checks
   */
  protected getAgentIdSafe(): string {
    // First try environment variable
    if (process.env.AGENT_ID) {
      return this.normalizeAgentId(process.env.AGENT_ID);
    }
    
    // Then try runtime
    if (!this.runtime?.getAgentId) {
      this.logger.warn("Runtime is still invalid — fallback triggered");
      return this.agentId || "unknown";
    }
    
    try {
      const agentId = this.runtime.getAgentId();
      
      if (!agentId) {
        this.logger.warn("Runtime.getAgentId() returned empty value");
        return this.agentId || "unknown";
      }
      
      return this.normalizeAgentId(agentId);
    } catch (error) {
      this.logger.error(`Error getting agent ID: ${error.message}`);
      return this.agentId || "unknown";
    }
  }
  
  /**
   * Internal initialization implementation
   */
  private async _initialize(): Promise<void> {
    try {
      if (this.initialized) {
        this.logger.info(`${this.name}: Already initialized, skipping`);
        return;
      }
      
      // Log initialization start
      this.logger.info(`${this.name}: Initializing (v0.25.9)...`);
      
      // Load configuration
      await this.loadConfig();
      
      // Add debugging route (Agent HTTP Exposure - from reviewed action plan)
      if (globalThis.__elizaRuntime?.app) {
        const app = globalThis.__elizaRuntime.app;
        app.get('/status', (req, res) => {
          const status = {
            plugin: this.name,
            version: '0.25.9',
            agent_id: this.getAgentIdSafe(),
            initialized: this.initialized,
            relay_connected: this.relay?.isConnected() || false,
            known_agents: Array.from(this.knownAgents),
            config: {
              relay_url: this.config.relayServerUrl,
              enabled: this.config.enabled,
              group_ids: this.config.groupIds
            }
          };
          res.json(status);
          this.logger.info(`[HTTP] Status endpoint accessed: ${JSON.stringify(status)}`);
        });
        
        this.logger.info(`[HTTP] Added /status endpoint for diagnostics`);
      } else {
        this.logger.warn(`[HTTP] Cannot add status endpoint: app not available`);
      }
      
      // Step 2: Wait for runtime with maximum timeout
      // This will throw an error if the runtime cannot be obtained in time
      try {
        // Wait for runtime with timeout
        this.logger.debug(`${this.name}: Waiting for runtime to be available and ready (timeout: 30000ms)`);
        await this.waitForRuntime(30000);
        
        // Verify runtime is properly wrapped with adapter
        this.logger.info(`[RUNTIME] Adapter wrapping status: runtime.getAgentId=${typeof this.runtime?.getAgentId === 'function' ? 'function' : 'missing'}`);
        
        // Defensive runtime check (just in case the adapter didn't work)
        if (!this.runtime?.getLogger) {
          this.logger.warn("[RUNTIME] Runtime adapter failed - getLogger not available");
          throw new Error("Runtime methods not available despite adapter");
        }
        
        // Update logger with the one from the runtime
        this.logger = this.runtime.getLogger(this.name);
        
        // Update agentId from runtime using safe method
        this.agentId = this.getAgentIdSafe();
        this.logger.info(`[AGENT] Using agent ID from adapter: ${this.agentId}`);
        
      } catch (error) {
        this.logger.error(`[RUNTIME] ${error.message}`);
        throw new Error(`${this.name}: Runtime initialization failed: ${error.message}`);
      }
      
      // Signal that the plugin is ready for external verification
      globalThis.__telegramMultiAgentPluginReady = true;
      
      // Test runtime functionality to ensure methods are ready
      this.testRuntime();
      
      // ONLY NOW initialize components with runtime
      this.conversationManager = new ConversationManager(this.logger);
      this.conversationManager.setRuntime(this.runtime);
      await this.conversationManager.initialize();
      
      // Get agent ID using safe method
      this.agentId = this.getAgentIdSafe(); 
      if (!this.agentId || this.agentId === "unknown-agent") {
        this.logger.error("[RELAY] Cannot register with relay — agentId not available");
        throw new Error("Agent ID not available for relay registration");
      }
      
      this.logger.info(`[RELAY] Will register agent ${this.agentId}`);
      
      // CRITICAL FIX: Prior to passing to TelegramRelay, ensure we're using the Telegram bot's
      // username format, not the UUID, for agent ID
      let telegramAgentId = this.agentId;
      
      // First try getting from environment variables
      if (process.env.TELEGRAM_BOT_USERNAME) {
        telegramAgentId = process.env.TELEGRAM_BOT_USERNAME;
        this.logger.info(`[RELAY] Using TELEGRAM_BOT_USERNAME: ${telegramAgentId}`);
      } else if (process.env.AGENT_ID) {
        const agentIdFromEnv = process.env.AGENT_ID;
        telegramAgentId = agentIdFromEnv.endsWith('_bot') ? agentIdFromEnv : `${agentIdFromEnv}_bot`;
        this.logger.info(`[RELAY] Using derived bot username from AGENT_ID: ${telegramAgentId}`);
      }
      
      this.logger.info(`[IDENTITY] Agent ID for relay registration: ${telegramAgentId}`);
      
      // VALHALLA FIX: Override this.agentId with telegramAgentId to ensure consistency
      // This ensures all further operations use the same ID format
      this.agentId = telegramAgentId;
      this.logger.info(`[IDENTITY] Setting canonical agent ID to: ${this.agentId}`);
      
      // Initialize relay with explicit Telegram bot username
      this.relay = new TelegramRelay({
        relayServerUrl: this.config.relayServerUrl,
        authToken: this.config.authToken,
        agentId: telegramAgentId 
      }, this.logger);
      
      this.logger.info(`[RELAY] Agent ${telegramAgentId} relay instance created`);
      
      // Set up relay message handling
      this.relay.onMessage(this.handleIncomingMessage.bind(this));
      
      // VALHALLA FIX: Remove custom Telegram polling and rely on ElizaOS core
      this.logger.info(`[PLUGIN] Using ElizaOS core for Telegram polling`);
      
      // Connect to relay
      await this.relay.connect();
      
      this.initialized = true;
      this.logger.info(`${this.name}: Plugin initialized successfully`);
    } catch (error) {
      this.logger.error(`${this.name}: Initialization failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Schedule reconnection attempts to the relay server
   */
  private scheduleReconnect(): void {
    // Only schedule if we have a relay instance
    if (!this.relay) return;
    
    const relay = this.relay;
    const reconnectDelay = 10000; // 10 seconds
    
    this.logger.info(`${this.name}: Scheduling reconnect attempt in ${reconnectDelay/1000} seconds`);
    
    setTimeout(async () => {
      this.logger.info(`${this.name}: Attempting to reconnect to relay server`);
      try {
        const connected = await relay.connect();
        if (connected) {
          this.logger.info(`${this.name}: Successfully reconnected to relay server`);
        } else {
          this.logger.warn(`${this.name}: Reconnect attempt failed, scheduling another attempt`);
          this.scheduleReconnect();
        }
      } catch (error) {
        this.logger.error(`${this.name}: Error during reconnection attempt: ${error}`);
        this.scheduleReconnect();
      }
    }, reconnectDelay);
  }
  
  /**
   * Create a simple personality enhancer
   */
  private createPersonalityEnhancer(): any {
    try {
      // Create a real personality enhancer if possible
      if (this.runtime) {
        const enhancer = new PersonalityEnhancer(this.getAgentIdSafe(), this.runtime, this.logger);
        return enhancer;
      }
    } catch (error) {
      this.logger.warn(`${this.name}: Could not create full PersonalityEnhancer: ${error}`);
    }
    
    // Fallback to a simplified personality enhancer
    return {
      refineTopic: (topic: string): string => {
        if (!this.character) return topic;
        
        // If the agent has a character, adjust the topic to match interests
        const interests = this.character.topics || [];
        const isRelevant = interests.some(interest => 
          topic.toLowerCase().includes(interest.toLowerCase())
        );
        
        if (isRelevant) {
          return `${topic}, which is something I'm particularly interested in`;
        }
        
        return topic;
      },
      
      generateTopic: (): string => {
        if (!this.character || !this.character.topics || this.character.topics.length === 0) {
          return "blockchain technology and its applications";
        }
        
        // Get a random topic from the character's interests
        const randomIndex = Math.floor(Math.random() * this.character.topics.length);
        return this.character.topics[randomIndex];
      }
    };
  }
  
  /**
   * Set up periodic check for conversation opportunities
   */
  private setupConversationCheck(): void {
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
    }
    
    // Set up interval for checking conversation opportunities
    const intervalMs = this.config.conversationCheckIntervalMs || 60000;
    this.checkIntervalId = setInterval(() => {
      this.checkConversations().catch(error => {
        this.logger.error(`${this.name}: Error in conversation check: ${error}`);
      });
    }, intervalMs);
    
    this.logger.info(`${this.name}: Set up conversation check interval every ${intervalMs}ms`);
  }
  
  /**
   * Start all kickstarters
   */
  private startKickstarters(): void {
    for (const [groupId, kickstarter] of this.kickstarters.entries()) {
      kickstarter.start();
      this.logger.info(`${this.name}: Started kickstarter for group ${groupId}`);
    }
  }
  
  /**
   * Check conversations for all configured groups
   */
  private async checkConversations(): Promise<void> {
    // Get runtime and verify it's ready
    let runtime: IAgentRuntime;
    try {
      runtime = await this.waitForRuntime(5000); // 5 second timeout is enough for periodic check
      // Verify runtime has required methods
      if (typeof runtime.getAgentId !== 'function') {
        this.logger.warn(`${this.name}: Runtime not fully ready for conversation check - missing getAgentId`);
        return; // Skip this check cycle
      }
    } catch (error) {
      this.logger.error(`${this.name}: Failed to get runtime for conversation check: ${error.message}`);
      return; // Skip this check cycle
    }
    
    this.logger.debug(`${this.name}: Checking conversations...`);
    
    // Check each group
    for (const groupId of this.config.groupIds) {
      try {
        // Get conversation state
        const isActive = await this.conversationManager.isConversationActive(groupId);
        
        // Log state
        this.logger.debug(`${this.name}: Group ${groupId} conversation active: ${isActive}`);
        
        // If we have a kickstarter for this group, update it
        const groupIdStr = groupId.toString();
        const kickstarter = this.kickstarters.get(groupIdStr);
        if (kickstarter) {
          // Check if kickstarter needs to be activated/deactivated
          if (isActive) {
            // No need to kickstart if conversation is active
            kickstarter.stop();
          } else {
            // Start kickstarter if not already running
            kickstarter.start();
          }
        }
      } catch (error) {
        this.logger.error(`${this.name}: Error checking conversation for group ${groupId}: ${error}`);
      }
    }
  }
  
  /**
   * Helper method to safely call runtime.handleMessage with fallback handling
   * This addresses the issue with undefined handleMessage function
   */
  private async callRuntimeHandleMessage(message: any): Promise<any> {
    try {
      const runtime = this.runtimeProxy || this.runtime;
      if (runtime?.handleMessage && typeof runtime.handleMessage === 'function') {
        this.logger.info(`[PLUGIN] runtime.handleMessage was called`);
        return await runtime.handleMessage(message);
      } else {
        this.logger.warn('[PLUGIN] runtime.handleMessage not available');
        return null;
      }
    } catch (err) {
      this.logger.error(`Error calling runtime.handleMessage: ${err.message}`);
      return null;
    }
  }
  
  /**
   * Handle an incoming message from Telegram or the relay
   */
  async handleIncomingMessage(message: RelayMessage): Promise<void> {
    try {
      // First, log the received message with truncation to avoid huge logs
      this.logger.debug(`[PLUGIN] Received message: ${JSON.stringify(message).substring(0, 300)}...`, '', '');
      
      const { message_id, from, chat, text, sender_agent_id } = message;
      const groupId = chat.id.toString();
      
      // VALHALLA FIX: Normalize agent IDs for comparison
      const normalizedSenderId = (sender_agent_id || from.username || '').toLowerCase();
      const normalizedAgentId = this.agentId.toLowerCase();
      
      // Add to known agents list with normalized ID
      if (sender_agent_id && !this.knownAgents.has(normalizedSenderId)) {
        this.knownAgents.add(normalizedSenderId);
        this.logger.info(`[PLUGIN] Added new known agent: ${sender_agent_id}`);
      }
      
      // VALHALLA FIX: Enhanced agent ID comparison using includes() for more robust matching
      if (normalizedSenderId.includes(normalizedAgentId) || normalizedAgentId.includes(normalizedSenderId)) {
        this.logger.info(`[PLUGIN] Skipping message from self (${normalizedSenderId})`);
        return;
      }
      
      // Get runtime for message handling
      const runtime = await this.waitForRuntime();
      
      // Record this message in conversation manager
      try {
        await this.conversationManager.recordMessage(
          groupId,
          sender_agent_id || from.username,
          text || ''
        );
        
        this.logger.debug(`Recorded message in conversation manager`);
      } catch (error) {
        this.logger.error(`Failed to record message in conversation manager: ${error.message}`);
      }
      
      // Store the message in the memory manager for context if available
      try {
        // ✅ MEMORY MANAGER FALLBACK: Check if memory manager exists and use fallback if not
        let memoryManager;
        if (runtime.memoryManager) {
          memoryManager = runtime.memoryManager;
        } else {
          this.logger.warn(`[MEMORY] Runtime memory manager not available, using fallback`);
          // Create fallback memory manager if it doesn't exist
          if (!this.fallbackMemory) {
            this.logger.info(`[MEMORY] Creating fallback memory manager`);
            this.fallbackMemory = new FallbackMemoryManager();
          }
          memoryManager = this.fallbackMemory;
        }
        
        const memoryData: MemoryData = {
          roomId: groupId,
          userId: sender_agent_id || from.username,
          content: {
            text,
            metadata: {
              conversationType: 'group',
              messageId: message_id,
              senderName: from.first_name,
              senderUsername: from.username,
              isBot: from.is_bot,
              groupId,
              agentId: sender_agent_id
            }
          },
          type: 'telegram-message'
        };
        
        await memoryManager.createMemory(memoryData);
        this.logger.debug(`[MEMORY] Stored message from ${sender_agent_id || from.username} in group ${groupId}`);
      } catch (error) {
        this.logger.error(`Failed to store message in memory: ${error.message}`);
      }
      
      // VALHALLA FIX: Check relay health before sending response
      const relayHealthy = await this.ensureRelayConnection();
      if (!relayHealthy) {
        this.logger.warn(`[RELAY] Server unhealthy, message handling may be affected`);
      }
      
      // IMPORTANT: Now implement proper response decision logic
      // Extract a canonical agent ID for clean comparison (normalized to lowercase)
      const canonicalAgentId = this.agentId.toLowerCase().replace(/_/g, '');
      const canonicalSenderId = (sender_agent_id || from.username || '').toLowerCase().replace(/_/g, '');
      
      // 1. Skip if message is from self
      if (canonicalSenderId === canonicalAgentId) {
        this.logger.info(`[PLUGIN] Skipping message from self (${canonicalSenderId})`);
        return;
      }
      
      // 2. Check if we should respond based on plugin logic
      // Determine if this is a direct mention
      const normalizedText = (text || '').toLowerCase();
      const botMentions = [
        `@${this.agentId.toLowerCase()}`,
        `@${this.agentId.toLowerCase()}_bot`,
        this.agentId.toLowerCase()
      ];
      
      const isDirect = botMentions.some(mention => normalizedText.includes(mention));
      
      // Higher chance to respond if it's a direct mention
      let respondChance = isDirect ? 0.9 : 0.4;
      
      // Reduce chance if from another bot and not directly mentioned
      if (from.is_bot && !isDirect) {
        respondChance = 0.3;
      }
      
      const shouldRespond = Math.random() < respondChance;
      
      this.logger.info(`[PLUGIN] Message from ${from.is_bot ? 'bot' : 'user'} ${sender_agent_id || from.username}, ` + 
                      `${isDirect ? 'is direct mention' : 'not direct'}, response chance: ${respondChance}, will respond: ${shouldRespond}`);
      
      if (!shouldRespond) {
        this.logger.info(`[PLUGIN] Decided not to respond to this message`);
        return;
      }
      
      // If we get here, we've decided to respond
      this.logger.info(`[PLUGIN] Will respond to message in group ${groupId}`);
        
      try {
        // Simulate typing for more natural feel
        if (this.config.typingSimulation?.enabled) {
          try {
            // Find bot token
            const botToken = this.findBotToken();
            if (botToken) {
              // Send typing indicator to Telegram
              await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: groupId,
                  action: 'typing'
                })
              });
              this.logger.debug(`[TELEGRAM] Sent typing indicator to group ${groupId}`);
              
              // Calculate a natural delay based on message length and typing speed
              const baseTypingSpeed = this.config.typingSimulation.baseTypingSpeedCPM || 300; // chars per minute
              const charsPerSecond = baseTypingSpeed / 60;
              
              // Simulate reading + thinking time plus typing time
              // Randomize within a range for more natural feel
              const randomFactor = 1 + (Math.random() * 0.4 - 0.2); // 0.8 to 1.2
              const expectedMessageLength = 100; // Assume an average response length
              
              // Calculate reading delay + typing delay
              const readingTimeMs = 1000; // 1 second base reading time
              const typingTimeMs = (expectedMessageLength / charsPerSecond) * 1000;
              
              // Cap the delay to reasonable limits (2-8 seconds)
              const totalDelayMs = Math.min(8000, Math.max(2000, (readingTimeMs + typingTimeMs) * randomFactor));
              
              this.logger.debug(`[TELEGRAM] Simulating ${Math.round(totalDelayMs)}ms typing delay`);
              await new Promise(resolve => setTimeout(resolve, totalDelayMs));
            }
          } catch (error) {
            this.logger.warn(`[TELEGRAM] Error simulating typing: ${error.message}`);
            // Continue execution even if typing simulation fails
          }
        }
        
        // Create a context object for the runtime
        const context = {
          roomId: groupId,
          platform: 'telegram',
          conversationType: 'group',
          participantCount: this.knownAgents.size + 1, // Include self
          messageHistory: await this.getMessageHistory(groupId)
        };
        
        this.logger.debug(`[PLUGIN] Calling runtime.handleMessage with context: ${JSON.stringify(context)}`, '', '');
        
        // Call the runtime to handle the message using our safe helper
        let response = await this.callRuntimeHandleMessage({
          text: text || '',
          userId: sender_agent_id || from?.username || 'unknown',
          name: from?.first_name || 'Unknown',
          context
        });
        
        // If no response or response has no text, generate a fallback
        if (!response || !response.text) {
          this.logger.info(`[PLUGIN] No valid response from runtime, using fallback`);
          response = { text: await this.generateFallbackResponse() };
        }
        
        this.logger.debug(`[PLUGIN] Got response from runtime: ${JSON.stringify(response)}`, '', '');
        
        // VALHALLA FIX: Always send response regardless of action as long as there's text
        if (response?.text) {
          // Remove any (NONE) tag from the end
          let cleanedText = response.text;
          if (cleanedText.toUpperCase().endsWith('(NONE)')) {
            cleanedText = cleanedText.substring(0, cleanedText.length - 6).trim();
            this.logger.info(`[PLUGIN] Removed (NONE) tag, cleaned text: "${cleanedText}"`);
          }
          
          const action = response.content?.action?.toUpperCase() || 'UNKNOWN';
          if (action === 'NONE') {
            this.logger.info(`[PLUGIN] Bypassing action=NONE to relay message`);
          }
          
          if (cleanedText.length > 0) {
            this.logger.info(`[PLUGIN] Forcing relay send of content: "${cleanedText.substring(0, 50)}..."`);
            await this.sendResponse(groupId, cleanedText);
          } else {
            this.logger.warn(`[PLUGIN] Empty response after cleaning (NONE) tag, not sending`);
          }
        } else {
          this.logger.warn(`[PLUGIN] Runtime returned response with no text`);
        }
      } catch (error) {
        this.logger.error(`Error getting response from runtime: ${error.message}`);
      }
    } catch (error) {
      this.logger.error(`[PLUGIN] Error handling incoming message: ${error.message}`);
    }
  }
  
  /**
   * Plugin-level decision logic for responses (Layer 2)
   * This applies additional filters after the LLM has decided to respond
   */
  private pluginShouldRespond(
    groupId: string, 
    agentId: string,
    fromAgentId: string, 
    messageText: string
  ): boolean {
    try {
      this.logger.debug(`[PLUGIN] Layer 2 decision for ${agentId} responding to ${fromAgentId}`);
      
      // 1. Anti-flood protection
      const now = Date.now();
      const lastResponseTime = this.lastResponseTimes.get(groupId) || 0;
      const timeSinceLastResponse = now - lastResponseTime;
      
      if (timeSinceLastResponse < 5000) {
        this.logger.debug(`[PLUGIN] Anti-flood: Last response was ${timeSinceLastResponse}ms ago, too recent`);
        return false;
      }
      
      // 2. Check for direct mentions which override other rules
      const normalizedAgentId = agentId.toLowerCase().replace(/_/g, '');
      const normalizedMessage = messageText.toLowerCase();
      
      const possibleMentions = [
        `@${normalizedAgentId}`,
        `@${this.getAgentNameFromId(agentId).toLowerCase()}`,
        this.getAgentNameFromId(agentId).toLowerCase()
      ];
      
      const isDirect = possibleMentions.some(mention => normalizedMessage.includes(mention));
      
      if (isDirect) {
        this.logger.info(`[PLUGIN] Direct mention detected, will respond`);
        this.trackResponse(groupId, agentId);
        return true;
      }
      
      // 3. Conversation rhythm check - try to maintain natural flow
      if (this.lastSpeaker.get(groupId) === agentId) {
        this.logger.debug(`[PLUGIN] Conversation rhythm: Agent was the last speaker, letting others respond`);
        return false;
      }
      
      // 4. Check character-specific response patterns
      const character = this.getCharacter();
      if (character) {
        // Personality-based response rate
        const chattyScore = this.getChattyScore(character);
        const randomFactor = Math.random();
        
        // Higher chatty score = more likely to jump into conversations
        if (randomFactor > chattyScore) {
          this.logger.debug(`[PLUGIN] Character is not chatty enough to respond (${chattyScore} vs ${randomFactor})`);
          return false;
        }
        
        // Topic interest match
        if (character.topics && messageText) {
          const topicMatched = this.messageMatchesTopics(messageText, character.topics);
          if (topicMatched) {
            this.logger.info(`[PLUGIN] Topic match detected, more likely to respond`);
            // Topic match increases chance but doesn't guarantee
          }
        }
      }
      
      // 5. Prevent bot circular conversations
      if (this.isBot(fromAgentId) && this.wasRecentSpeaker(groupId, agentId)) {
        const coinFlip = Math.random() > 0.7; // 30% chance to break the rule
        if (!coinFlip) {
          this.logger.debug(`[PLUGIN] Avoiding bot circular conversation`);
          return false;
        }
      }
      
      // Track this response
      this.trackResponse(groupId, agentId);
      return true;
    } catch (error) {
      this.logger.error(`[PLUGIN] Error in pluginShouldRespond: ${error.message}`);
      return false; // Default to not responding on error
    }
  }
  
  /**
   * Get a chatty score for a character (0-1)
   * Higher value = more talkative
   */
  private getChattyScore(character: Character): number {
    // Default medium chatty score
    let score = 0.5;
    
    // Check for relevant traits
    if (character.traits) {
      if (character.traits.includes('talkative') || character.traits.includes('extroverted')) {
        score += 0.2;
      }
      if (character.traits.includes('quiet') || character.traits.includes('introverted')) {
        score -= 0.2;
      }
    }
    
    // Check for personality config
    if (character.personality && typeof character.personality === 'object') {
      // If the character has a conversationInitiationWeight property
      if ('conversationInitiationWeight' in character.personality) {
        const weight = character.personality.conversationInitiationWeight;
        if (typeof weight === 'number' && weight >= 0 && weight <= 1) {
          // Direct value overrides calculated score
          return weight;
        }
      }
    }
    
    // Clamp between 0.1 and 0.9 to prevent never/always speaking
    return Math.max(0.1, Math.min(0.9, score));
  }
  
  /**
   * Check if a message contains topics of interest to the character
   */
  private messageMatchesTopics(message: string, topics: string[]): boolean {
    const normalizedMessage = message.toLowerCase();
    
    return topics.some(topic => 
      normalizedMessage.includes(topic.toLowerCase())
    );
  }
  
  /**
   * Check if an agent ID belongs to a bot
   */
  private isBot(agentId: string): boolean {
    if (!agentId) return false;
    
    // Common bot patterns
    const botPatterns = [
      '_bot',
      'vc_shark',
      'linda_evangelista',
      'bitcoin_maxi',
      'bag_flipper',
      'code_samurai',
      'eth_memelord'
    ];
    
    return botPatterns.some(pattern => 
      agentId.toLowerCase().includes(pattern)
    );
  }
  
  /**
   * Get a human-readable name from an agent ID
   */
  private getAgentNameFromId(agentId: string): string {
    // Try to get from character if available
    const character = this.getCharacter();
    if (character?.name) return character.name;
    
    // Otherwise pretty format the ID
    return agentId
      .split('_')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
      .replace(/\d+$/, ''); // Remove trailing numbers
  }
  
  /**
   * Track a response for conversation flow purposes
   */
  private trackResponse(groupId: string, agentId: string): void {
    const now = Date.now();
    this.lastResponseTimes.set(groupId, now);
    this.lastSpeaker.set(groupId, agentId);
    
    // Keep a history of recent speakers
    let recentSpeakers = this.recentSpeakers.get(groupId) || [];
    recentSpeakers.unshift({ agentId, time: now });
    
    // Keep only the last 5 speakers
    if (recentSpeakers.length > 5) {
      recentSpeakers = recentSpeakers.slice(0, 5);
    }
    
    this.recentSpeakers.set(groupId, recentSpeakers);
  }
  
  /**
   * Check if an agent was one of the recent speakers
   */
  private wasRecentSpeaker(groupId: string, agentId: string): boolean {
    const recentSpeakers = this.recentSpeakers.get(groupId) || [];
    
    // Check if the agent spoke in the last 3 turns
    const recentlySpoke = recentSpeakers
      .slice(0, 3)
      .some(speaker => speaker.agentId === agentId);
      
    return recentlySpoke;
  }
  
  /**
   * Generate a fallback response when the runtime fails to generate one
   */
  private async generateFallbackResponse(): Promise<string> {
    try {
      // Try to get character-specific fallback
      const runtime = await this.waitForRuntime();
      const { character } = runtime;
      
      if (character) {
        const traits = character.traits || [];
        const style = character.style || {};
        
        // Generate a more personalized fallback based on character
        if (traits.includes('helpful')) {
          return "I'd like to respond in more detail, but I'm currently in limited mode. I'll get back to you soon!";
        }
        
        if (traits.includes('technical')) {
          return "Due to a temporary processing constraint, I'm unable to generate a complete response at this time.";
        }
        
        if (traits.includes('friendly')) {
          return "Hey there! I got your message but I'm a bit tied up at the moment. I'll jump back in soon!";
        }
      }
    } catch (error) {
      this.logger.debug(`${this.name}: Error generating character-specific fallback: ${error}`);
    }
    
    // Default fallback
    return "I received your message but I'm currently in limited mode. Please try again later.";
  }
  
  /**
   * Get recent message history for a group
   */
  private async getMessageHistory(groupId: string): Promise<string> {
    try {
      // Get runtime
      const runtime = await this.waitForRuntime();
      
      // Query for recent messages
      const messages = await runtime.memoryManager.getMemories({
        roomId: groupId,
        type: 'telegram-message',
        count: 10
      });
      
      if (!messages || messages.length === 0) {
        return "No message history available.";
      }
      
      // Sort messages by time (oldest first)
      const sortedMessages = [...messages].sort((a, b) => {
        const aDate = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const bDate = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return aDate.getTime() - bDate.getTime();
      });
      
      // Format messages
      const formatted = sortedMessages.map(message => {
        const sender = message.userId;
        const text = message.content.text;
        return `${sender}: ${text}`;
      }).join('\n');
      
      return formatted;
    } catch (error) {
      this.logger.error(`${this.name}: Error getting message history: ${error}`);
      return "Error retrieving message history.";
    }
  }
  
  /**
   * Shutdown the plugin
   */
  async shutdown(): Promise<void> {
    this.logger.info(`${this.name}: Shutting down`);
    
    // Stop the conversation check interval
    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }
    
    // Stop all kickstarters
    for (const [groupId, kickstarter] of this.kickstarters.entries()) {
      try {
        await kickstarter.shutdown();
        this.logger.info(`${this.name}: Stopped kickstarter for group ${groupId}`);
      } catch (error) {
        this.logger.error(`${this.name}: Error stopping kickstarter for group ${groupId}: ${error}`);
      }
    }
    
    // Shutdown conversation manager
    try {
      await this.conversationManager.shutdown();
      this.logger.info(`${this.name}: Conversation manager shutdown complete`);
    } catch (error) {
      this.logger.error(`${this.name}: Error shutting down conversation manager: ${error}`);
    }
    
    // Disconnect from relay server
    try {
      await this.relay.disconnect();
      this.logger.info(`${this.name}: Disconnected from relay server`);
    } catch (error) {
      this.logger.error(`${this.name}: Error disconnecting from relay server: ${error}`);
    }
    
    this.logger.info(`${this.name}: Shutdown complete`);
  }
  
  /**
   * Setup kickstarters for each group
   * 
   * @param groupIds - Group IDs to create kickstarters for
   * @param relay - Telegram relay
   * @param character - Character information
   */
  private async setupKickstarters(
    groupIds: string[],
    relay: TelegramRelay,
    character: Character | null
  ): Promise<void> {
    if (!groupIds || groupIds.length === 0) {
      this.logger.warn(`${this.name}: No group IDs configured, skipping kickstarter setup`);
      return;
    }
    
    try {
      // Wait for runtime to be available
      await this.waitForRuntime();
      
      // Log successful runtime access
      this.logger.info(`[RUNTIME] Runtime methods: getAgentId=available`);
      
      // Get agent ID safely
      const agentId = this.getAgentIdSafe();
      this.logger.info(`[AGENT] Agent ID: ${agentId}`);
      
      // Log successful relay registration
      this.logger.info(`[RELAY] Successfully registered ${agentId}`);
      
      for (const groupId of groupIds) {
        // Create personality enhancer with runtime
        const personality = this.createPersonalityEnhancer();
        
        // Create conversation kickstarter
        const kickstarter = new ConversationKickstarter(
          this.logger,
          this.conversationManager,
          relay,
          this.config.kickstarterConfig || {
            probabilityFactor: 0.2,
            minIntervalMs: 300000, // 5 minutes
            includeTopics: true,
            shouldTagAgents: true,
            maxAgentsToTag: 2
          },
          groupId,
          personality
        );
        
        // Set runtime
        kickstarter.setRuntime(this.runtime);
        
        // Initialize the kickstarter
        await kickstarter.initialize();
        
        // Store kickstarter
        this.kickstarters.set(groupId, kickstarter);
        
        this.logger.info(`${this.name}: Created kickstarter for group ${groupId}`);
        console.log(`[KICKSTARTER] ${this.name}: Created kickstarter for group ${groupId}`);
      }
    } catch (error) {
      this.logger.error(`${this.name}: Error setting up kickstarters: ${error}`);
      console.log(`[ERROR] ${this.name}: Error setting up kickstarters: ${error}`);
    }
  }

  /**
   * Get the current character
   * @returns The character from runtime or local storage
   */
  private getCharacter(): Character | null {
    try {
      // First try from runtime
      if (this.runtime?.character) {
        return this.runtime.character;
      }
      
      // Then try local copy
      if (this.character) {
        return this.character;
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error getting character: ${error.message}`);
      return null;
    }
  }

  /**
   * Send a response to a Telegram group
   * @param groupId - The group ID
   * @param text - The message text to send
   */
  private async sendResponse(groupId: string | number, text: string): Promise<void> {
    try {
      if (!this.relay) {
        this.logger.error('[PLUGIN] Cannot send response: Relay server not initialized');
        return;
      }
      
      // First send to Telegram directly
      const botToken = this.findBotToken();
      if (botToken) {
        try {
          // Send to Telegram
          const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: groupId,
              text: text,
              parse_mode: 'Markdown'
            })
          });
          
          if (!telegramResponse.ok) {
            const errorText = await telegramResponse.text();
            this.logger.error(`[TELEGRAM] Error sending message to Telegram: ${errorText}`);
          } else {
            const responseData = await telegramResponse.json();
            if (responseData.ok) {
              this.logger.info(`[TELEGRAM] Message sent to Telegram, message ID: ${responseData.result?.message_id}`);
            }
          }
        } catch (error) {
          this.logger.error(`[TELEGRAM] Error sending to Telegram: ${error.message}`);
        }
      } else {
        this.logger.error('[TELEGRAM] No bot token found, cannot send to Telegram');
      }
      
      // Then also send via relay to inform other bots
      // Convert groupId to string if it's a number
      const groupIdStr = groupId.toString();
      await this.relay.sendMessage(groupIdStr, text);
      this.logger.info(`[RELAY] Message forwarded to relay: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
      
      // Track this response to avoid immediate repeat responses
      this.lastResponseTimes.set(groupIdStr, Date.now());
      this.lastSpeaker.set(groupIdStr, this.agentId);
      this.trackResponse(groupIdStr, this.agentId);
    } catch (error) {
      this.logger.error(`[PLUGIN] Error sending response: ${error.message}`);
    }
  }

  /**
   * Find the bot token for this agent
   */
  private findBotToken(): string | null {
    // Each agent process should have its own TELEGRAM_BOT_TOKEN set by start_agents.sh
    // The token lookup was changed to use a custom format, but we need to respect the
    // multi-process architecture where each agent has its own process with its own
    // TELEGRAM_BOT_TOKEN env var
    
    // First try the direct environment variable that should be set for each agent process
    if (process.env.TELEGRAM_BOT_TOKEN) {
      this.logger.info(`[TOKEN] Using process-specific TELEGRAM_BOT_TOKEN`);
      return process.env.TELEGRAM_BOT_TOKEN;
    }
    
    // Fallback to prefixed environment variables
    const agentId = process.env.AGENT_ID;
    if (agentId) {
      const envVar = `TELEGRAM_BOT_TOKEN_${agentId}`;
      this.logger.debug(`[TOKEN] Looking for token using AGENT_ID: ${envVar}`);
      
      if (process.env[envVar]) {
        this.logger.info(`[TOKEN] Found token using AGENT_ID: ${envVar}`);
        return process.env[envVar];
      }
    }
    
    // Log available token env vars for debugging
    const tokenVars = Object.keys(process.env).filter(k => 
      k.includes('TELEGRAM_BOT_TOKEN') || k.includes('BOT_TOKEN')
    );
    
    this.logger.error(`[TOKEN] No bot token found for agent ${this.agentId}`);
    this.logger.debug(`[TOKEN] Available token env vars: ${tokenVars.join(', ')}`);
    
    return null;
  }

  /**
   * Ensure relay connection is healthy, re-register if needed
   */
  private async ensureRelayConnection(): Promise<boolean> {
    if (!this.relay) {
      this.logger.warn('[PLUGIN] Relay not initialized, cannot check connection');
      return false;
    }

    try {
      // First check if already connected
      if (this.relay.isConnected()) {
        // Check relay server health directly 
        const health = await fetch(`${this.config.relayServerUrl}/health`);
        
        if (health.ok) {
          const healthData = await health.json();
          
          // Check if our agent is in the online agents list
          if (healthData.agents_list && 
              healthData.agents_list.includes(this.agentId)) {
            this.logger.debug('[PLUGIN] Relay connection is healthy');
            return true;
          }
          
          this.logger.info('[PLUGIN] Agent not found in online agents list, will re-register');
        } else {
          this.logger.warn(`[PLUGIN] Relay server health check failed: ${health.status}`);
        }
      } else {
        this.logger.warn('[PLUGIN] Relay not connected, attempting to reconnect');
      }
      
      // Try to re-register with relay
      this.logger.info('[PLUGIN] Re-registering with relay server');
      
      const connected = await this.relay.connect();
      if (connected) {
        this.logger.info('[PLUGIN] Successfully re-registered with relay');
        
        // Send immediate heartbeat
        try {
          await this.sendHeartbeat();
          this.logger.info('[PLUGIN] Heartbeat sent after re-registration');
        } catch (error) {
          this.logger.warn(`[PLUGIN] Failed to send heartbeat after re-registration: ${error.message}`);
        }
        
        return true;
      } else {
        this.logger.error('[PLUGIN] Failed to re-register with relay');
        return false;
      }
    } catch (e) {
      this.logger.error(`[PLUGIN] Error ensuring relay connection: ${e.message}`);
      return false;
    }
  }

  /**
   * Send heartbeat to relay server
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.relay) {
      this.logger.warn('[PLUGIN] Cannot send heartbeat: relay not initialized');
      return;
    }

    try {
      const response = await fetch(`${this.config.relayServerUrl}/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`
        },
        body: JSON.stringify({
          agent_id: this.agentId,
          port: process.env.PORT || 'unknown'
        })
      });

      if (!response.ok) {
        throw new Error(`Heartbeat failed with status ${response.status}`);
      }

      this.logger.debug('[PLUGIN] Heartbeat sent successfully');
    } catch (error) {
      this.logger.error(`[PLUGIN] Heartbeat error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Run a simple manual test message to verify if agents respond
   */
  async testMessage(): Promise<void> {
    try {
      // Create a test message
      const groupId = this.config.groupIds[0] || "-1002550618173"; // Use first configured group or default
      
      // Ensure chat.id is a number as required by RelayMessage type
      const chatId = typeof groupId === 'string' ? parseInt(groupId, 10) : groupId;
      
      const testMessage = {
        message_id: 999999,
        from: {
          id: 12345,
          is_bot: false,
          first_name: "Test",
          username: "ETHMemeLord9000"
        },
        chat: {
          id: chatId, // Now a number as required by RelayMessage type
          type: "group",
          title: "Test Group"
        },
        date: Math.floor(Date.now() / 1000),
        text: `@${this.agentId} what do you think about crypto?`,
        sender_agent_id: "ETHMemeLord9000"
      };
      
      this.logger.info(`[TEST] Sending test message to ${this.agentId}: "${testMessage.text}"`);
      
      // Process the test message
      await this.handleIncomingMessage(testMessage);
      
      this.logger.info(`[TEST] Test message sent and processed`);
    } catch (error) {
      this.logger.error(`[TEST] Error sending test message: ${error.message}`);
    }
  }

  /**
   * Verify that all fixes have been applied correctly
   * Run this to validate fixes from knock_knock_debug.md
   */
  async verifyFixes(): Promise<void> {
    try {
      this.logger.info('======= VALHALLA FIX VERIFICATION =======');
      
      // 1. Check if runtime is available
      const runtime = await this.waitForRuntime(5000);
      this.logger.info(`[VERIFY] Runtime available: ${!!runtime}`);
      
      // 2. Check if runtime.handleMessage is defined
      const handleMessageExists = runtime && typeof runtime.handleMessage === 'function';
      this.logger.info(`[VERIFY] runtime.handleMessage exists: ${handleMessageExists}`);
      
      // 3. Verify callback registration
      this.logger.info(`[VERIFY] callRuntimeHandleMessage helper: ${typeof this.callRuntimeHandleMessage === 'function' ? 'Implemented' : 'Missing'}`);
      
      // 4. Check agent ID normalization
      const agentId = this.agentId;
      const normalizedAgentId = this.normalizeAgentId(agentId);
      this.logger.info(`[VERIFY] Agent ID: ${agentId}, Normalized: ${normalizedAgentId}`);
      
      // 5. Check if relay is connected
      const relayConnected = this.relay?.isConnected();
      this.logger.info(`[VERIFY] Relay connected: ${relayConnected}`);
      
      // 6. Test runtime.handleMessage directly with minimal input
      try {
        if (handleMessageExists) {
          const testResult = await runtime.handleMessage({ 
            text: 'This is a test message',
            userId: 'test_user' 
          });
          this.logger.info(`[VERIFY] Direct runtime.handleMessage call successful: ${!!testResult}`);
          this.logger.info(`[VERIFY] Response contains text: ${!!testResult?.text}`);
        } else {
          this.logger.warn(`[VERIFY] Cannot test runtime.handleMessage directly - not defined`);
        }
      } catch (error) {
        this.logger.error(`[VERIFY] Direct runtime.handleMessage test failed: ${error.message}`);
      }
      
      // 7. Test callRuntimeHandleMessage helper
      try {
        const helperResult = await this.callRuntimeHandleMessage({
          text: 'This is a helper test',
          userId: 'test_user'
        });
        this.logger.info(`[VERIFY] callRuntimeHandleMessage helper call successful: ${!!helperResult}`);
        this.logger.info(`[VERIFY] Helper returned response: ${JSON.stringify(helperResult || {})}`);
      } catch (error) {
        this.logger.error(`[VERIFY] callRuntimeHandleMessage helper test failed: ${error.message}`);
      }
      
      // 8. Test generateFallbackResponse
      const fallbackResponse = await this.generateFallbackResponse();
      this.logger.info(`[VERIFY] Fallback response: "${fallbackResponse.substring(0, 50)}..."`);
      
      this.logger.info('======= VERIFICATION COMPLETE =======');
      this.logger.info(`Next step: Run a test message with plugin.testMessage()`);
    } catch (error) {
      this.logger.error(`[VERIFY] Error during verification: ${error.message}`);
    }
  }
}