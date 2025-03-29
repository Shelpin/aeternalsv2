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
import { SqliteAdapterProxy } from './SqliteAdapterProxy.js';
import { generateUUID } from './utils.js';
import { createRequire } from 'node:module';
import { config as initConfig } from 'dotenv';

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
  botToken: '',  // Telegram Bot API token (empty by default)
  groupIds: [],
  dbPath: './data/telegram-multiagent.db',
  logLevel: 'info',
  conversationCheckIntervalMs: 60000, // 1 minute
  maxRetries: 3,
  disablePolling: false,
  kickstarterConfig: {
    probabilityFactor: 0.2,
    minIntervalMs: 300000, // 5 minutes
    includeTopics: true,
    shouldTagAgents: true,
    maxAgentsToTag: 2
  }
};

// Added default agent ID constant
const DEFAULT_AGENT_ID = 'unknown_agent';

/**
 * Creates a minimal representation of a message object for logging
 * @param {any} msg - The message object to minimize
 * @return {object} - A minimal representation with just essential properties
 */
function logMinimalMsg(msg: any): any {
  if (!msg) return 'null';
  return {
    id: msg?.message_id,
    from: msg?.from?.username,
    text: msg?.text?.slice(0, 100),
    chatId: msg?.chat?.id
  };
}

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
  private sqliteProxies: Record<string, SqliteAdapterProxy> = {};
  private fallbackMemoryManagers: Record<string, FallbackMemoryManager> = {};
  private dbAdapter: any = null;
  private agentRegistry: any = null;
  private memoryManager: any = null;
  private telegramClient: any = null;
  private _eventHandlers: Record<string, Function[]> = {};
  
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
      
      // Use this.initializePromise to ensure initialization happens only once
      if (!this.initializePromise) {
        this.initializePromise = this.startInitialization(runtime);
      }
      
      return this;
    } catch (error) {
      this.logger.error(`[REGISTER] ${this.name}: Registration failed: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Start the initialization process in the background
   * This allows the register method to return immediately
   */
  private async startInitialization(runtime: IAgentRuntime): Promise<void> {
    try {
      // Wait for runtime to be fully initialized - increased timeout to 30 seconds
      await new Promise(resolve => setTimeout(resolve, 1000)); // Small initial delay
      
      // Wait for runtime to be fully available
      const wrappedRuntime = await this.waitForRuntime(30000);
      
      // Check for critical methods
      if (!wrappedRuntime || typeof wrappedRuntime.handleMessage !== 'function') {
        this.logger.warn(`[PLUGIN] Runtime handleMessage still not defined after wait.`);
      } else {
        this.logger.info(`[PLUGIN] Runtime handleMessage is now available.`);
      }
      
      // VALHALLA FIX: Normalize agent ID consistently
      const envAgentId = process.env.AGENT_ID;
      const runtimeAgentId = runtime?.client?.telegram?.botInfo?.username;
      const fallbackAgentId = wrappedRuntime.getAgentId();
      
      this.agentId = this.normalizeAgentId(
        envAgentId || runtimeAgentId || fallbackAgentId
      );
      
      // Add new code to check for character id/name as fallback
      if (!this.agentId || this.agentId === "unknown") {
        // Try to get agent ID from character
        if (this.character) {
          this.agentId = this.character.id || this.character.name || "unknown";
          this.logger.info(`[IDENTITY] Using character id/name as Agent ID: ${this.agentId}`);
        }
      }
      
      // Log the final agent ID that will be used for relay registration
      this.logger.info(`[IDENTITY] Agent ID for relay registration: ${this.agentId}`);
      
      // Continue initialization
      await this.initialize();
    } catch (error) {
      this.logger.error(`[PLUGIN] Initialization error: ${error.message}`);
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
        TELEGRAM_BOT_TOKEN=${process.env.TELEGRAM_BOT_TOKEN ? '(set)' : 'not set'}
        AGENT_ID=${process.env.AGENT_ID || 'not set'}
      `, '', '');
      
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
      
      // VALHALLA FIX: Look for Telegram bot token in environment variables
      // First try generic TELEGRAM_BOT_TOKEN
      if (process.env.TELEGRAM_BOT_TOKEN) {
        this.logger.info(`${this.name}: Using Telegram bot token from TELEGRAM_BOT_TOKEN environment variable`);
        this.config.botToken = process.env.TELEGRAM_BOT_TOKEN;
      } 
      // Then try agent-specific token format
      else if (process.env.AGENT_ID) {
        const agentId = process.env.AGENT_ID;
        const formattedAgentId = agentId.toUpperCase().replace(/-/g, '_');
        const tokenEnvVar = `TELEGRAM_BOT_TOKEN_${formattedAgentId}`;
        
        if (process.env[tokenEnvVar]) {
          this.logger.info(`${this.name}: Using Telegram bot token from ${tokenEnvVar} environment variable`);
          this.config.botToken = process.env[tokenEnvVar];
        } else {
          this.logger.warn(`${this.name}: No agent-specific bot token found in environment`);
        }
      }
      
      // If no botToken set but authToken is available, use it as fallback
      if (!this.config.botToken && this.config.authToken && 
          this.config.authToken.length > 30) { // Bot tokens are typically long
        this.logger.info(`${this.name}: Using authToken as fallback for botToken`);
        this.config.botToken = this.config.authToken;
      }
      
      const authToken = this.config.authToken; // Save from env
      
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
      this.logger.info('[PLUGIN] Initializing TelegramMultiAgentPlugin');
      
      // Make sure the runtime is available before proceeding
      if (!this.runtime) {
        // Try to get runtime one more time with a longer timeout
        try {
          this.runtime = await this.waitForRuntime(20000);
        } catch (runtimeError) {
          throw new Error(`Runtime not available: ${runtimeError.message}`);
        }
      }
      
      if (!this.runtime) {
        throw new Error('Runtime not available');
      }
      
      // Get the agent ID and normalize it for token lookup
      const rawAgentId = this.runtime.agentId || process.env.AGENT_ID || DEFAULT_AGENT_ID;
      
      // Log the raw agent ID for debugging
      this.logger.info(`[PLUGIN] Raw agent ID: ${rawAgentId}`);
      
      // Multiple approaches to construct environment variable names for token lookup
      const possibleEnvVars = [
        // Standard normalized format
        `TELEGRAM_BOT_TOKEN_${rawAgentId.replace(/[^a-zA-Z0-9]/g, '_')}`,
        
        // Character name-based lookup (common in Valhalla)
        `TELEGRAM_BOT_TOKEN_${this.getCharacterName()}`,
        
        // Upper case transformation
        `TELEGRAM_BOT_TOKEN_${rawAgentId.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
        
        // Camel case to snake case transformation
        `TELEGRAM_BOT_TOKEN_${this.normalizeAgentId(rawAgentId)}`,
        
        // Simple fallbacks
        'TELEGRAM_BOT_TOKEN',
        `TELEGRAM_BOT_TOKEN_${rawAgentId}`
      ];
      
      // Log the environment variables we're checking
      this.logger.info(`[PLUGIN] Checking for token in environment variables: ${possibleEnvVars.join(', ')}`);
      
      // Try to find a matching environment variable with a token
      let token = null;
      let matchedVar = null;
      
      for (const envVar of possibleEnvVars) {
        if (process.env[envVar]) {
          token = process.env[envVar];
          matchedVar = envVar;
          this.logger.info(`[PLUGIN] Found token in environment variable: ${envVar}`);
          break;
        }
      }
      
      // Also check config for token
      if (!token && this.config.botToken) {
        token = this.config.botToken;
        this.logger.info(`[PLUGIN] Using token from plugin config`);
      }
      
      // If still no token, throw error
      if (!token) {
        const envStr = possibleEnvVars.map(v => `${v}=...`).join(' or ');
        this.logger.error(`[PLUGIN] No bot token found. Please set ${envStr} environment variable or configure botToken in plugin config.`);
        throw new Error(`No bot token found for agent`);
      }
      
      // Set the token in the config for future use
      this.config.botToken = token;
      
      // Use just the beginning and end for logging (to avoid exposing full token)
      const tokenMasked = token ? `${token.substring(0, 5)}...${token.substring(token.length - 3)}` : 'undefined';
      this.logger.info(`[PLUGIN] Using bot token from ${matchedVar || 'config'}: ${tokenMasked}`);
      this.logger.info(`[PLUGIN] Resolved Telegram token: ${tokenMasked}`);
      
      // STEP 2 - Initialize the TelegramClient
      try {
        // First try a direct import (ES module)
        let TelegramClient = null;
        let loadedFrom = '';
        
        try {
          // Try direct import via require (CommonJS)
          const telegramModule = require('@elizaos-plugins/client-telegram');
          if (telegramModule && telegramModule.TelegramClient) {
            TelegramClient = telegramModule.TelegramClient;
            loadedFrom = '@elizaos-plugins/client-telegram (direct import)';
            this.logger.info(`[PLUGIN] Successfully loaded TelegramClient via direct import`);
          }
        } catch (directImportError) {
          this.logger.debug(`[PLUGIN] Direct import failed: ${directImportError.message}`);
          
          // If direct import fails, fallback to path resolution
          const possiblePaths = [
            // Direct import as expected by pnpm workspace
            '@elizaos-plugins/client-telegram',
            // Absolute paths with correct module name
            '/root/eliza/node_modules/@elizaos-plugins/client-telegram',
            '/root/eliza/node_modules/.pnpm/@elizaos-plugins+client-telegram@0.1.0/node_modules/@elizaos-plugins/client-telegram',
            // Relative paths from current directory
            path.resolve(process.cwd(), 'packages/clients/telegram'),
            path.resolve(process.cwd(), 'packages/clients/telegram/dist'),
            // Fallback paths with telegram subdirectory
            '../packages/clients/telegram',
            'packages/clients/telegram',
            'packages/clients/telegram/dist'
          ];
          
          // Try each path until we find the module
          for (const modulePath of possiblePaths) {
            try {
              if (fs.existsSync(modulePath)) {
                this.logger.info(`[PLUGIN] Attempting to load TelegramClient from ${modulePath}`);
                
                // If it's a directory, look for index file
                if (fs.statSync(modulePath).isDirectory()) {
                  const files = fs.readdirSync(modulePath);
                  this.logger.info(`[PLUGIN] Directory contents of ${modulePath}: ${files.join(', ')}`);
                  
                  // Try to load from different entry points
                  if (files.includes('index.js') || files.includes('index.ts')) {
                    // Try a standard import
                    const module = require(modulePath);
                    if (module && module.TelegramClient) {
                      TelegramClient = module.TelegramClient;
                      loadedFrom = modulePath;
                      break;
                    }
                  }
                } else {
                  // It's a file, try to load it directly
                  const module = require(modulePath);
                  if (module && module.TelegramClient) {
                    TelegramClient = module.TelegramClient;
                    loadedFrom = modulePath;
                    break;
                  }
                }
              }
            } catch (err) {
              this.logger.debug(`[PLUGIN] Failed to load from ${modulePath}: ${err.message}`);
              // Continue to the next path
            }
          }
        }
        
        if (TelegramClient) {
          this.logger.info(`[PLUGIN] Successfully loaded TelegramClient from ${loadedFrom}`);
          
          // Initialize the client with our config
          this.telegramClient = new TelegramClient({
            botToken: this.config.botToken,
            relayServerUrl: this.config.relayServerUrl,
            agentId: this.agentId,
            logger: this.logger
          });
          
          // Add simulateMessage method to telegramClient
          this.telegramClient.simulateMessage = (message) => {
            this.logger.info(`[PLUGIN][VALHALLA] Simulating message: ${message.text}`);
            // Handle the message through our standard flow
            this.handleIncomingMessage(message);
          };

          // Ensure runtime.clients exists and attach the client
          if (this.runtime) {
            this.runtime.clients ??= {};
            this.runtime.clients.telegram = this.telegramClient;
            this.logger.info(`[PLUGIN] Telegram client initialized and attached to runtime.clients.telegram`);
            
            // STEP 5 - Test with Simulated Message
            setTimeout(() => {
              this.logger.info(`[PLUGIN][VALHALLA] Running simulated message test...`);
              this.telegramClient.simulateMessage({
                chat: { id: 'test_chat' },
                text: 'What do you think about Ethereum?',
                from: { id: 123456, username: 'test_user' }
              });
            }, 5000); // Wait 5 seconds after initialization
          } else {
            this.logger.warn(`[PLUGIN] Runtime not available yet, client created but not attached`);
          }
        } else {
          throw new Error('TelegramClient not found in any of the expected locations');
        }
      } catch (error) {
        this.logger.error(`[PLUGIN] Failed to initialize Telegram client: ${error.message}`);
        this.logger.error(`[PLUGIN] Will try to create minimal client`);
        
        // Create minimal client
        this.createMinimalTelegramClient();
      }
      
      // STEP 7 - Add guard to prevent minimal client fallbacks - MOVED AFTER INITIALIZATION ATTEMPT
      if (!this.telegramClient || !this.telegramClient.sendMessage) {
        throw new Error(`Telegram client not initialized correctly for ${this.agentId}`);
      }
      
      // VALHALLA DEBUG: Log available clients in the runtime
      console.log('[VALHALLA] Runtime clients:', Object.keys(globalThis.__elizaRuntime?.clients || {}));
      
      // Wait for runtime to be ready first
      const runtime = await this.waitForRuntime(10000); // 10 second timeout
      if (!runtime) {
        throw new Error('Runtime not available after timeout');
      }
      
      this.logger.info(`[PLUGIN] Runtime ready, initializing plugin`);
      
      // VALHALLA INSPECTOR: Log available runtime methods
      this.logger.info('[VALHALLA] Runtime method registration check:', '', '');
      this.logger.info(`Available runtime methods: ${Object.keys(this.runtime).join(', ')}`, '', '');
      
      // Additional checks for specific methods
      if (this.runtime.agents) {
        this.logger.info(`[VALHALLA] Available runtime.agents methods: ${Object.keys(this.runtime.agents).join(', ')}`, '', '');
      } else {
        this.logger.warn('[VALHALLA] runtime.agents object not available', '', '');
      }
      
      // Log character config 
      if (this.runtime.character) {
        this.logger.info(`[VALHALLA] Character name: ${this.runtime.character.name}`, '', '');
        this.logger.info(`[VALHALLA] Character plugins: ${JSON.stringify(this.runtime.character.plugins || [])}`, '', '');
      } else {
        this.logger.warn('[VALHALLA] runtime.character not available', '', '');
      }

      // VALHALLA ACTION CHECK: Log available actions
      if (this.runtime.actions) {
        this.logger.info(`[VALHALLA] Available runtime.actions: ${JSON.stringify(Object.keys(this.runtime.actions))}`, '', '');
        
        // Check for specific action handlers
        const actionNames = Object.keys(this.runtime.actions);
        this.logger.info(`[VALHALLA] Inspecting ${actionNames.length} actions for handlers...`, '', '');
        
        // Inspect the structure of actions
        for (let i = 0; i < Math.min(actionNames.length, 5); i++) {
          const actionKey = actionNames[i];
          const action = this.runtime.actions[actionKey];
          this.logger.info(`[VALHALLA] Action ${actionKey} details:`, '', '');
          
          if (action) {
            if (action.name) this.logger.info(`[VALHALLA] Action ${actionKey} name: ${action.name}`, '', '');
            if (action.description) this.logger.info(`[VALHALLA] Action ${actionKey} description: ${action.description}`, '', '');
            if (typeof action.handler === 'function') {
              this.logger.info(`[VALHALLA] Action ${actionKey} has a function handler`, '', '');
              // Log the function's parameters if possible
              const funcStr = action.handler.toString().substring(0, 100);
              this.logger.info(`[VALHALLA] Action ${actionKey} handler signature: ${funcStr}...`, '', '');
            }
          }
        }
        
        // Try to find a message handling action
        const messageHandlers = actionNames.filter(key => {
          const action = this.runtime.actions[key];
          return action && 
                (action.name === 'handleMessage' || 
                action.name === 'processMessage' || 
                action.name === 'processCharacterMessage' || 
                action.name === 'sendMessage' ||
                (action.name && action.name.toLowerCase().includes('message')));
        });
        
        if (messageHandlers.length > 0) {
          this.logger.info(`[VALHALLA] Found ${messageHandlers.length} potential message handler actions`, '', '');
          messageHandlers.forEach(key => {
            const action = this.runtime.actions[key];
            this.logger.info(`[VALHALLA] Message handler action found: ${action.name}`, '', '');
          });
        } else {
          this.logger.warn('[VALHALLA] No message handler actions found', '', '');
        }
      } else {
        this.logger.warn('[VALHALLA] runtime.actions object not available', '', '');
      }
      
      // VALHALLA FIX: Check if runtime.handleMessage is defined
      if (!runtime || typeof runtime.handleMessage !== 'function') {
        this.logger.warn('[PLUGIN] Runtime handleMessage not defined. Plugin may not respond to messages.');
      } else {
        this.logger.info('[PLUGIN] Runtime handleMessage properly defined.', '', '');
      }

      // EXPERT FIX: Implement proper handleMessage directly on runtime
      if (!this.runtime.handleMessage) {
        this.logger.warn('[VALHALLA] runtime.handleMessage not found, implementing proper handler');
        this.runtime.handleMessage = async (message: any) => {
          const { text = "", userId = "", context = {} } = message || {};
          const formattedMessage = {
            text,
            userId,
            context
          };
          const response = await runtime.agent.respond(formattedMessage);
          return response;
        };
        this.logger.info('[VALHALLA] Expert-recommended handleMessage implementation added successfully');
      }
      
      // VALHALLA FIX: Fix client structure if needed
      if (!runtime.clients) {
        this.logger.warn('[PLUGIN] Runtime clients object not defined, creating it');
        runtime.clients = {};
      }
      
      // VALHALLA FIX: Dynamically attach the Telegram client if it's not available
      if (!this.telegramClient && this.runtime) {
        // Log available clients
        const clientsArray = Object.keys(this.runtime.clients || {});
        this.logger.info('[VALHALLA] Runtime clients:', clientsArray);
      }

      // Log completion of initialization
      this.logger.info('[PLUGIN] Plugin fully initialized');
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
   * Wrapper function to safely call runtime.handleMessage with fallback
   */
  private async callRuntimeHandleMessage(message: any): Promise<any> {
    try {
      const runtime = this.runtimeProxy || this.runtime;
      
      // VALHALLA FIX: Add more detailed logging about runtime state
      this.logger.info(`[PLUGIN][VALHALLA][FLOW] Runtime check before handleMessage:
        Has runtime: ${Boolean(runtime)}
        Has handleMessage: ${Boolean(runtime?.handleMessage)}
        handleMessage type: ${typeof runtime?.handleMessage}
      `, '', '');
      
      if (runtime?.handleMessage && typeof runtime.handleMessage === 'function') {
        // Extract key details for logging
        const from = message.from;
        const senderId = from?.username || from?.id || 'unknown';
        const text = message.text || '[no text]';
        
        // Create context object for logging
        const context = {
          messageId: message.message_id,
          chatId: message.chat?.id,
          fromUser: senderId,
          isBot: from?.is_bot || false,
          text: text.substring(0, 50) + (text.length > 50 ? '...' : '')
        };
        
        // Log exact payload being sent to runtime - ADDED AS PER ACTION PLAN
        this.logger.info(`[DEBUG] Calling runtime.handleMessage with text="${text}", userId="${senderId}", context=${JSON.stringify(context)}`);
        
        // Call runtime's handleMessage method
        const startTime = Date.now();
        const response = await runtime.handleMessage(message);
        const duration = Date.now() - startTime;
        
        // VALHALLA FIX: Log detailed response information
        if (response) {
          this.logger.info(`[PLUGIN][VALHALLA][FLOW] Runtime.handleMessage returned in ${duration}ms:
            Has text: ${Boolean(response.text)}
            Text length: ${response.text?.length || 0}
            Action: ${response.content?.action || 'none'}
            Content: ${JSON.stringify(response.content || {}).substring(0, 100)}...
          `, '', '');
          
          if (response.text) {
            this.logger.info(`[PLUGIN][VALHALLA][FLOW] Response text (first 150 chars): ${response.text?.substring(0, 150)}...`, '', '');
          }
        } else {
          this.logger.warn(`[PLUGIN][VALHALLA][FLOW] Runtime.handleMessage returned null or undefined after ${duration}ms`, '', '');
        }
        
        return response;
      } else {
        // VALHALLA FIX: Provide detailed diagnostics when handleMessage is missing
        this.logger.error(`[PLUGIN][VALHALLA][FLOW] runtime.handleMessage not available!
          Runtime type: ${runtime ? runtime.constructor?.name || typeof runtime : 'undefined'}
          Available methods: ${runtime ? Object.keys(runtime).join(', ') : 'none'}
          Global __elizaRuntime available: ${Boolean(globalThis.__elizaRuntime)}
        `, '', '');
        
        // Use a simple echo response as fallback if handleMessage is missing
        this.logger.warn('[PLUGIN][VALHALLA][FLOW] Using fallback response handler', '', '');
        return {
          text: `I received your message: "${message.text?.substring(0, 50) || 'empty message'}..."`,
          content: {
            action: "SAY", // Explicitly set SAY to ensure message is sent
            text: `I received your message: "${message.text?.substring(0, 50) || 'empty message'}..."`
          },
          userId: message.from?.id
        };
      }
    } catch (err) {
      this.logger.error(`[PLUGIN][VALHALLA][FLOW] Error calling runtime.handleMessage: ${err.message}`, '', '');
      this.logger.error(`[PLUGIN][VALHALLA][FLOW] Stack trace: ${err.stack}`, '', '');
      
      // VALHALLA FIX: Return an error response with SAY action to ensure it's displayed
      return {
        text: `Sorry, I encountered an error processing your message. Please try again.`,
        content: {
          action: "SAY", // Explicitly use SAY to bypass filtering
          text: `Sorry, I encountered an error processing your message. Please try again.`
        },
        userId: message.from?.id,
        error: true
      };
    }
  }
  
  /**
   * Handle an incoming message from Telegram or the relay
   */
  async handleIncomingMessage(message: RelayMessage): Promise<void> {
    try {
      if (!message) {
        this.logger.warn(`[PLUGIN] handleIncomingMessage called with empty message`, '', '');
        return;
      }
      
      // VALHALLA FIX: Add clear logging for debugging message flow
      this.logger.info(`[PLUGIN][VALHALLA][FLOW] handleIncomingMessage triggered for message ID: ${message.message_id}, from ${message.from?.username || 'unknown'}`, '', '');
      
      // Enhanced logging for message debugging
      this.logger.info(`[DEBUG] Incoming message: ${logMinimalMsg(message)}`);
      
      // Better sender extraction
      const from = message.from;
      const senderId = from?.username || from?.id || 'unknown';
      const senderName = from?.first_name || from?.username || 'Anonymous';
      
      // Validate necessary fields
      if (!message.text) {
        this.logger.warn(`[PLUGIN][VALHALLA][FLOW] Message has no text content`, '', '');
      }
      
      if (!message.chat?.id) {
        this.logger.warn(`[PLUGIN][VALHALLA][FLOW] Message has no chat.id`, '', '');
      }
      
      // Skip own messages - crucial to avoid loops
      if (message.sender_agent_id === this.agentId) {
        this.logger.info(`[PLUGIN][VALHALLA][FLOW] Ignoring message from self (${this.agentId})`, '', '');
        return;
      }
      
      // Store message in memory if memory manager exists
      if (this.fallbackMemory) {
        try {
          this.logger.info(`[PLUGIN][VALHALLA][FLOW] Storing message in memory`, '', '');
          this.logger.info(`[MEMORY] Current memory backend: ${this.fallbackMemory.getUseSqlite ? 'SQLite' : 'In-Memory'}`, '', '');
          
          // VALHALLA FIX: Simplify memory creation to avoid type errors
          await this.fallbackMemory.createMemory({
            content: { 
              text: message.text || ''
              // No additional fields to avoid type errors
            },
            type: 'message',
            userId: String(message.from?.id || 'user'),
            roomId: String(message.chat?.id || 'default')
            // No metadata to avoid type errors
          });
          
          this.logger.info(`[PLUGIN][VALHALLA][FLOW] Memory created successfully`, '', '');
        } catch (memoryError) {
          this.logger.error(`[PLUGIN][VALHALLA][FLOW] Memory creation error: ${memoryError.message}`, '', '');
        }
      } else {
        this.logger.warn(`[PLUGIN][VALHALLA][FLOW] No memory manager available for message storage`, '', '');
      }
      
      // VALHALLA FIX: Check if we should reply to the message using enhanced logic
      let shouldRespond = true;
      const isBotMessage = message.from?.is_bot || this.knownAgents.has(message.sender_agent_id || '');
      
      if (isBotMessage) {
        // Calculate random probability for bot-to-bot responses
        // This prevents infinite loops between bots while still allowing some interaction
        if (Math.random() > 0.5) { // 50% chance to respond to other bots
          shouldRespond = false;
          this.logger.info(`[PLUGIN][VALHALLA][FLOW] Randomly choosing NOT to respond to bot message`, '', '');
        }
      }
      
      if (!shouldRespond) {
        this.logger.info(`[PLUGIN][VALHALLA][FLOW] Skipping response based on bot policy`, '', '');
        return;
      }
      
      // Call runtime to handle the message
      this.logger.info(`[PLUGIN][VALHALLA][FLOW] Calling runtime.handleMessage() for processing`, '', '');
      const response = await this.callRuntimeHandleMessage(message);
      
      // VALHALLA FIX: Log the response status and content
      if (response) {
        this.logger.info(`[PLUGIN][VALHALLA][FLOW] Runtime returned response: ${JSON.stringify({
          hasText: Boolean(response.text), 
          textLength: response.text?.length || 0,
          action: response.content?.action || 'unknown'
        })}`, '', '');
        
        if (response.text) {
          this.logger.info(`[PLUGIN][VALHALLA][FLOW] Response text preview: "${response.text.substring(0, 100)}..."`, '', '');
          
          // If there's text, send it to the group
          if (response.text.trim().length > 0) {
            // Check if the response has a (NONE) action but contains valid text
            if (response.content?.action?.toUpperCase() === 'NONE') {
              this.logger.info(`[PLUGIN][VALHALLA][FLOW] Bypassing action=NONE to force relay message`, '', '');
            }

            // Get the group ID from the message
            const groupId = message.chat?.id;
            
            if (!groupId) {
              this.logger.error(`[PLUGIN][VALHALLA][FLOW] No group ID found in message, cannot send response`, '', '');
              return;
            }
            
            // Clean the response text (remove action tags)
            const cleanedText = response.text.replace(/\(NONE\)$/i, '').trim();
            
            // Send the response to Telegram
            this.logger.info(`[PLUGIN][VALHALLA][FLOW] Sending response to group ${groupId}: "${cleanedText.substring(0, 50)}..."`, '', '');
            
            // Log token and chatId for debugging
            this.logger.warn(`[PLUGIN] Sending to Telegram: chatId=${groupId}, text=${cleanedText.substring(0, 30)}...`);

            // First try to use our properly initialized telegramClient
            if (this.telegramClient) {
              try {
                await this.telegramClient.sendMessage(groupId, cleanedText);
                this.logger.info(`[PLUGIN] Message sent via telegramClient successfully`);
                
                // Forward to relay so other bots can see it
                if (this.relay) {
                  await this.relay.sendMessage(groupId, cleanedText);
                  this.logger.info(`[PLUGIN][VALHALLA][FLOW] Message forwarded to relay for other bots`, '', '');
                }
                return;
              } catch (telegramError) {
                this.logger.error(`[PLUGIN] Error sending with telegramClient: ${telegramError.message}`);
              }
            }
            
            // If we have the Telegram client from ElizaOS, use it
            if (this.runtime?.client?.telegram) {
              try {
                // Send via ElizaOS client
                await this.runtime.client.telegram.sendMessage(groupId, cleanedText);
                this.logger.info(`[PLUGIN][VALHALLA][FLOW] Message sent via ElizaOS Telegram client`, '', '');
                
                // Forward to relay so other bots can see it
                if (this.relay) {
                  await this.relay.sendMessage(groupId, cleanedText);
                  this.logger.info(`[PLUGIN][VALHALLA][FLOW] Message forwarded to relay for other bots`, '', '');
                }
              } catch (telegramError) {
                this.logger.error(`[PLUGIN][VALHALLA][FLOW] Error sending message via ElizaOS client: ${telegramError.message}`, '', '');
                this.logger.error(`[PLUGIN][VALHALLA][FLOW] Stack trace: ${telegramError.stack}`, '', '');
                
                // Fallback to direct Telegram API if ElizaOS client failed
                try {
                  this.logger.info(`[PLUGIN][VALHALLA][FLOW] Attempting fallback to direct Telegram API`, '', '');
                  if (this.config.botToken) {
                    this.sendMessageToTelegram(this.config.botToken, Number(groupId), cleanedText);
                    this.logger.info(`[PLUGIN][VALHALLA][FLOW] Message sent via direct Telegram API fallback`, '', '');
                  } else {
                    this.logger.error(`[PLUGIN][VALHALLA][FLOW] No bot token available for direct API fallback`, '', '');
                  }
                } catch (fallbackError) {
                  this.logger.error(`[PLUGIN][VALHALLA][FLOW] Fallback also failed: ${fallbackError.message}`, '', '');
                }
              }
            } else {
              this.logger.error(`[PLUGIN][VALHALLA][FLOW] ElizaOS Telegram client not available`, '', '');
              this.logger.error(`[PLUGIN][VALHALLA][FLOW] Runtime client keys: ${this.runtime?.client ? Object.keys(this.runtime.client).join(', ') : 'No client object'}`, '', '');
              
              // Attempt to use direct Telegram API as fallback
              try {
                this.logger.info(`[PLUGIN][VALHALLA][FLOW] Attempting to use direct Telegram API since client is missing`, '', '');
                if (this.config.botToken) {
                  this.sendMessageToTelegram(this.config.botToken, Number(groupId), cleanedText);
                  this.logger.info(`[PLUGIN][VALHALLA][FLOW] Message sent via direct Telegram API`, '', '');
                } else {
                  this.logger.error(`[PLUGIN][VALHALLA][FLOW] No bot token available for direct API`, '', '');
                }
              } catch (directError) {
                this.logger.error(`[PLUGIN][VALHALLA][FLOW] Direct Telegram API failed: ${directError.message}`, '', '');
              }
              
              // Still forward to relay for other bots
              if (this.relay) {
                try {
                  await this.relay.sendMessage(groupId, cleanedText);
                  this.logger.info(`[PLUGIN][VALHALLA][FLOW] Message forwarded to relay despite Telegram client missing`, '', '');
                } catch (relayError) {
                  this.logger.error(`[PLUGIN][VALHALLA][FLOW] Relay forwarding failed: ${relayError.message}`, '', '');
                }
              }
            }
          } else {
            this.logger.info(`[PLUGIN][VALHALLA][FLOW] Response text is empty after trimming, not sending`, '', '');
          }
        } else {
          this.logger.info(`[PLUGIN][VALHALLA][FLOW] No response returned from runtime.handleMessage()`, '', '');
        }
      } else {
        this.logger.warn(`[PLUGIN][VALHALLA][FLOW] No response returned from runtime.handleMessage()`, '', '');
      }
    } catch (error) {
      this.logger.error(`[PLUGIN][VALHALLA][FLOW] Error in handleIncomingMessage: ${error.message}`, '', '');
      this.logger.error(`Stack trace: ${error.stack}`, '', '');
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

      this.logger.debug('[PLUGIN] Heartbeat sent successfully', '', '');
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

  // Fixed sendMessage helper to relay
  private async sendMessageToRelay(relay: any, agentId: string, text: string, originalMessage?: any): Promise<void> {
    // Enhanced validation before sending
    if (!relay || !agentId) {
      this.logger.warn(`[RELAY] Cannot send message: missing relay or agentId`, '', '');
      return;
    }

    try {
      await relay.sendMessage(agentId, text);
      this.logger.info(`[RELAY] Message sent to relay for agent ${agentId}`, '', '');
    } catch (error) {
      this.logger.error(`[RELAY] Error sending message: ${error.message}`, '', '');
    }
  }

  private async generateFallbackResponse(): Promise<string> {
    return "I'm sorry, I couldn't process your request at the moment. Please try again later.";
  }

  private sendMessageToTelegram(botToken: string, chatId: number, text: string): void {
    try {
      this.logger.info(`[TELEGRAM] Sending message to Telegram chat ${chatId}`, '', '');
      
      // Use the Telegram API to send the message
      if (!botToken) {
        this.logger.error(`[TELEGRAM] Cannot send message: missing bot token`, '', '');
        return;
      }
      
      // Send the message via fetch request to Telegram API
      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      }).then(response => {
        if (!response.ok) {
          this.logger.error(`[TELEGRAM] Error sending message: ${response.status} ${response.statusText}`, '', '');
        } else {
          this.logger.info(`[TELEGRAM] Message sent successfully to chat ${chatId}`, '', '');
        }
      }).catch(error => {
        this.logger.error(`[TELEGRAM] Error sending message: ${error.message}`, '', '');
      });
    } catch (error) {
      this.logger.error(`[TELEGRAM] Error in sendMessageToTelegram: ${error.message}`, '', '');
    }
  }

  /**
   * Safely initialize the memory manager with proper error handling
   * @private
   */
  private async initializeMemoryManager(): Promise<void> {
    try {
      this.logger.info(`[MEMORY] Initializing memory manager for agent ${this.agentId}`, '', '');
      
      // Initialize SQLite adapter if dbPath is provided
      if (this.config.dbPath) {
        try {
          this.logger.info(`[MEMORY] Initializing SQLite adapter with path: ${this.config.dbPath}`, '', '');
          
          // Initialize the SQLite adapter
          this.dbAdapter = await this.createSqliteAdapter(this.config.dbPath);
          
          if (!this.dbAdapter) {
            this.logger.error('[MEMORY] Failed to create SQLite adapter, falling back to in-memory storage', '', '');
          } else {
            this.logger.info('[MEMORY] SQLite adapter created successfully', '', '');
          }
        } catch (error) {
          this.logger.error(`[MEMORY] Error initializing SQLite adapter: ${error.message}`, '', '');
          this.logger.error(`[MEMORY] Stack trace: ${error.stack || 'No stack trace available'}`, '', '');
          this.dbAdapter = null;
        }
      } else {
        this.logger.info('[MEMORY] No dbPath provided, using in-memory storage only', '', '');
        this.dbAdapter = null;
      }
      
      // Create memory manager with or without SQLite adapter
      this.memoryManager = new FallbackMemoryManager(this.agentId, this.dbAdapter, this.logger);
      
      // Test SQLite connectivity if adapter is available
      if (this.dbAdapter) {
        this.logger.info('[MEMORY] Testing SQLite connectivity...', '', '');
        const sqliteTestResult = await this.memoryManager.testSqliteConnection();
        
        if (sqliteTestResult) {
          this.logger.info('[MEMORY] SQLite connectivity test passed, using SQLite storage', '', '');
        } else {
          this.logger.warn('[MEMORY] SQLite connectivity test failed, falling back to in-memory storage', '', '');
          // The memory manager will handle the fallback automatically
        }
      }
    } catch (error) {
      this.logger.error(`[MEMORY] Error initializing memory manager: ${error.message}`, '', '');
      this.logger.error(`[MEMORY] Stack trace: ${error.stack || 'No stack trace available'}`, '', '');
      
      // Create a fallback memory manager without SQLite in case of errors
      this.memoryManager = new FallbackMemoryManager(this.agentId, null, this.logger);
      this.logger.warn('[MEMORY] Created fallback memory manager without SQLite due to initialization error', '', '');
    }
  }

  /**
   * Create SQLite adapter with proper error handling
   * @private
   */
  private async createSqliteAdapter(dbPath: string): Promise<any> {
    try {
      this.logger.info(`[MEMORY] Creating SQLite adapter for database at: ${dbPath}`, '', '');
      
      // Import sqlite3 and sqlite dynamically
      const sqlite3 = (await import('sqlite3')).default;
      const { open } = await import('sqlite');
      
      // Open the database connection
      const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
      });
      
      this.logger.info('[MEMORY] SQLite database opened successfully', '', '');
      
      // Create a simple adapter object that wraps the sqlite operations
      return {
        async query(sql: string, params: any[] = []): Promise<any[]> {
          try {
            return await db.all(sql, params);
          } catch (error) {
            throw error;
          }
        },
        
        async execute(sql: string, params: any[] = []): Promise<void> {
          try {
            await db.run(sql, params);
          } catch (error) {
            throw error;
          }
        },
        
        async close(): Promise<void> {
          try {
            await db.close();
          } catch (error) {
            throw error;
          }
        }
      };
    } catch (error) {
      this.logger.error(`[MEMORY] Failed to create SQLite adapter: ${error.message}`, '', '');
      this.logger.error(`[MEMORY] Stack trace: ${error.stack || 'No stack trace available'}`, '', '');
      return null;
    }
  }

  /**
   * Safe method to normalize agent ID
   * Implements consistent agent ID normalization across the plugin
   */
  private normalizeAgentId(agentId: string): string {
    // Handle _bot suffix and convert to lowercase for consistency
    return agentId?.toLowerCase() || 'unknown';
  }

  /**
   * Force garbage collection if enabled
   */
  private forceGarbageCollection(): void {
    if (global.gc && process.env.FORCE_GC === '1') {
      try {
        this.logger.debug('[MEMORY] Forcing garbage collection');
        global.gc();
        
        // Log memory usage after GC
        const memUsage = process.memoryUsage();
        this.logger.debug(`[MEMORY] Usage after GC: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`);
      } catch (e) {
        this.logger.error(`[MEMORY] Error forcing garbage collection: ${e.message}`);
      }
    }
  }

  private async startRelayPolling(): Promise<void> {
    // VALHALLA FIX: Check if polling is disabled by environment variable
    if (process.env.DISABLE_POLLING === 'true') {
      this.logger.info('[RELAY][VALHALLA] Relay polling disabled by DISABLE_POLLING environment variable');
      return;
    }
    
    if (!this.config.relayServerUrl) {
      this.logger.warn('Relay server URL not configured, skipping relay polling');
      return;
    }
    
    this.logger.info(`[RELAY] Starting polling for agent ${this.agentId}`);
    
    // Set up interval for polling the relay server
    const pollingIntervalMs = this.config.pollingIntervalMs || 2000;
    
    // VALHALLA FIX: Only set up polling interval if not disabled
    this.logger.info(`[RELAY] Polling relay for messages...`);
    
    // POLLING FIX: Only set up interval if DISABLE_POLLING is not set or explicitly false
    if (!process.env.DISABLE_POLLING || process.env.DISABLE_POLLING === 'false') {
      setInterval(async () => {
        if (!this.relay) {
          this.logger.warn(`[RELAY] Relay not initialized for polling`);
          return;
        }
        
        try {
          // Poll the relay for any new messages for this agent
          const messages = await this.relay.getRelayUpdates();
          
          if (messages && messages.length > 0) {
            this.logger.info(`[RELAY] Found ${messages.length} new messages via polling`);
            
            for (const message of messages) {
              this.logger.info(`[RELAY] Processing polled message: "${message.text?.substring(0, 50)}..."`);
              await this.handleIncomingMessage(message);
            }
          }
        } catch (error) {
          this.logger.error(`[RELAY] Error in message polling: ${error.message}`);
        }
      }, pollingIntervalMs);
      this.logger.info(`[RELAY] Polling interval set to ${pollingIntervalMs}ms`);
    } else {
      this.logger.info(`[RELAY] Polling interval NOT created due to DISABLE_POLLING=${process.env.DISABLE_POLLING}`);
    }
  }

  // New helper method to create a minimal Telegram client implementation
  private createMinimalTelegramClient(): void {
    this.logger.warn('[VALHALLA] Creating minimal Telegram client implementation as fallback');
    
    try {
      // Create a minimal implementation with just the required methods
      const minimalTelegramClient = {
        botInfo: {
          username: process.env.AGENT_ID ? process.env.AGENT_ID + '_bot' : 'unknown_bot'
        },
        
        // Mock methods for minimal functionality
        sendMessage: async (chatId: number | string, text: string, options: any = {}) => {
          this.logger.info(`[VALHALLA][TELEGRAM] Would send to ${chatId}: ${text.substring(0, 50)}...`);
          return { message_id: Date.now() };
        },
        
        // Add simulateMessage method for testing
        simulateMessage: (message: any) => {
          this.logger.info(`[VALHALLA][TELEGRAM] Simulating message from minimal client: ${message.text}`);
          this.handleIncomingMessage(message);
        },
        
        on: (event: string, handler: Function) => {
          this.logger.info(`[VALHALLA][TELEGRAM] Registered handler for ${event} event`);
          // Store the handler to allow emit to work
          if (!this._eventHandlers) {
            (this as any)._eventHandlers = {};
          }
          if (!this._eventHandlers[event]) {
            (this as any)._eventHandlers[event] = [];
          }
          (this as any)._eventHandlers[event].push(handler);
          return minimalTelegramClient; // Return this for chaining
        },
        
        // Add emit method to simulate events
        emit: (event: string, ...args: any[]) => {
          this.logger.info(`[VALHALLA][TELEGRAM] Emitting event: ${event}`);
          if ((this as any)._eventHandlers && (this as any)._eventHandlers[event]) {
            for (const handler of (this as any)._eventHandlers[event]) {
              try {
                handler(...args);
              } catch (err) {
                this.logger.error(`[VALHALLA][TELEGRAM] Error in event handler: ${err.message}`);
              }
            }
          } else {
            this.logger.warn(`[VALHALLA][TELEGRAM] No handlers registered for event: ${event}`);
          }
          return true;
        },
        
        // Method to support Telegram Bot launch functionality
        launch: () => {
          this.logger.info(`[VALHALLA][TELEGRAM] Minimal client 'launched' - this is a stub`);
          return Promise.resolve();
        },
        
        getChat: async (chatId: number | string) => {
          return { id: chatId, type: 'group', title: 'Mock Group' };
        }
      };
      
      // Attach to runtime and save locally
      if (this.runtime && this.runtime.clients) {
        this.runtime.clients.telegram = minimalTelegramClient;
        this.telegramClient = minimalTelegramClient;
        this.logger.info('[VALHALLA] Created and attached minimal Telegram client to runtime.clients.telegram');
      } else {
        this.logger.error('[VALHALLA] Could not attach minimal client - runtime or clients object is undefined');
      }
    } catch (error) {
      this.logger.error(`[VALHALLA] Failed to create minimal Telegram client: ${error.message}`);
    }
  }

  // Add this new function near the testMessage method
  /**
   * Run a direct manual test with properly formatted message
   */
  async runValhallaMeanualTest(): Promise<void> {
    try {
      // Create a test message with valid format and structure
      const testChatId = process.env.TELEGRAM_TEST_CHAT_ID || "-1002550618173"; // Use configured group
      
      // Parse the chat ID to ensure it's in the correct format
      const chatId = typeof testChatId === 'string' ? parseInt(testChatId, 10) : testChatId;
      
      // Multiple test messages to check different responses
      const testMessages = [
        {
          message_id: 999991,
          from: { id: 12345, is_bot: false, first_name: "ValhallaTester", username: "valhalla_test" },
          chat: { id: chatId, type: "group", title: "Valhalla Test Group" },
          date: Math.floor(Date.now() / 1000),
          text: "What's your opinion on Ethereum's future?",
        },
        {
          message_id: 999992,
          from: { id: 12345, is_bot: false, first_name: "ValhallaTester", username: "valhalla_test" },
          chat: { id: chatId, type: "group", title: "Valhalla Test Group" },
          date: Math.floor(Date.now() / 1000),
          text: "Do you think Bitcoin is better than Ethereum?",
        },
        {
          message_id: 999993,
          from: { id: 12345, is_bot: false, first_name: "ValhallaTester", username: "valhalla_test" },
          chat: { id: chatId, type: "group", title: "Valhalla Test Group" },
          date: Math.floor(Date.now() / 1000),
          text: "What's the price of ETH going to be next year?",
        },
        {
          message_id: 999994,
          from: { id: 12345, is_bot: false, first_name: "ValhallaTester", username: "valhalla_test" },
          chat: { id: chatId, type: "group", title: "Valhalla Test Group" },
          date: Math.floor(Date.now() / 1000),
          text: "Hello, I'm new to crypto! Any tips?",
        }
      ];
      
      this.logger.info(`[VALHALLA] DIRECT TEST: Running ${testMessages.length} test messages with chat ID: ${chatId}`);
      
      // Test each message
      for (let i = 0; i < testMessages.length; i++) {
        const testMessage = testMessages[i];
        
        this.logger.info(`[VALHALLA] DIRECT TEST: Testing message ${i+1}/${testMessages.length}: "${testMessage.text}"`);
        
        // First try direct handleMessage on runtime
        if (this.runtime && this.runtime.handleMessage) {
          this.logger.info(`[VALHALLA] DIRECT TEST: Calling runtime.handleMessage directly for test ${i+1}`);
          
          try {
            // Handle the message directly and wait for response
            const response = await this.runtime.handleMessage(testMessage);
            
            this.logger.info(`[VALHALLA] DIRECT TEST: Response ${i+1}: ${JSON.stringify(response?.text)}`);
            
            // If we have a response and a telegramClient, attempt to send it
            if (response && response.text && this.telegramClient && this.config.botToken) {
              try {
                this.logger.info(`[VALHALLA] DIRECT TEST: Attempting to send response ${i+1} via Telegram API`);
                
                // Send message directly to Telegram API
                this.sendMessageToTelegram(this.config.botToken, chatId, response.text);
              } catch (sendError) {
                this.logger.error(`[VALHALLA] DIRECT TEST: Error sending Telegram response ${i+1}: ${sendError.message}`);
              }
            }
          } catch (testError) {
            this.logger.error(`[VALHALLA] DIRECT TEST: Error testing message ${i+1}: ${testError.message}`);
          }
          
          // Add a small delay between tests
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          this.logger.error('[VALHALLA] DIRECT TEST: No runtime.handleMessage available, trying handleIncomingMessage');
          
          // Try our handleIncomingMessage method as fallback
          await this.handleIncomingMessage(testMessage);
        }
      }
      
      this.logger.info(`[VALHALLA] DIRECT TEST: Manual test complete for all messages`);
    } catch (error) {
      this.logger.error(`[VALHALLA] DIRECT TEST: Error in direct test: ${error.message}`);
      if (error.stack) {
        this.logger.error(`[VALHALLA] DIRECT TEST: Stack trace: ${error.stack}`);
      }
    }
  }

  /**
   * Get character name from runtime for token lookup
   */
  private getCharacterName(): string {
    try {
      // Try to get character name from runtime
      if (this.runtime && this.runtime.character && this.runtime.character.name) {
        const name = this.runtime.character.name;
        return name.replace(/\s+/g, '');
      }
      
      // Try to get from environment
      if (process.env.CHARACTER_NAME) {
        return process.env.CHARACTER_NAME.replace(/\s+/g, '');
      }
      
      // Try to infer from AGENT_ID
      if (process.env.AGENT_ID) {
        // Common pattern in Valhalla: vc_shark_99, eth_memelord_9000
        const match = process.env.AGENT_ID.match(/([a-z]+_[a-z]+)/i);
        if (match) {
          return match[1].replace('_', '');
        }
        return process.env.AGENT_ID;
      }
      
      // Fallback
      return "unknown";
    } catch (error) {
      return "unknown";
    }
  }
}