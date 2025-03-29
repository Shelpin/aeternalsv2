import { 
  RelayMessage, 
  TelegramRelayConfig,
  MessageStatus,
  ElizaLogger
} from './types.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Message structure for the relay
 */
export interface QueuedMessage {
  id: string;
  fromAgentId: string;
  groupId: number | string;
  text: string;
  timestamp: number;
  status: MessageStatus;
  retries?: number;
}

/**
 * TelegramRelay handles communication with the relay server to send messages
 * between Telegram bots and coordinate multi-agent conversations
 */
export class TelegramRelay {
  private config: TelegramRelayConfig;
  private logger: ElizaLogger;
  private messageQueue: QueuedMessage[] = [];
  private processingQueue: boolean = false;
  private connected: boolean = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPingTime = 0;
  private messageHandlers: Array<(message: RelayMessage) => void> = [];
  private agentUpdateHandlers: Array<(agents: string[]) => void> = [];
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 5;
  private updatePollingInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Create a new TelegramRelay
   * 
   * @param config - Relay configuration
   * @param logger - Logger instance
   */
  constructor(config: TelegramRelayConfig, logger: ElizaLogger) {
    this.config = {
      retryLimit: 3,
      retryDelayMs: 5000,
      ...config
    };
    
    this.logger = logger;
    
    // Start queue processing immediately
    this.processQueue();
  }

  /**
   * Register the agent with the relay server
   * @returns True if registered successfully, false otherwise
   */
  private async registerAgent(): Promise<boolean> {
    try {
      this.logger.info(`Registering agent ${this.config.agentId} with relay server`);
      
      // VALHALLA FIX: Add more detailed logging for the registration request
      const requestBody = {
        agent_id: this.config.agentId,
        token: this.config.authToken
      };
      
      this.logger.debug(`[RELAY] Registration request: ${JSON.stringify({
        url: `${this.config.relayServerUrl}/register`,
        agent_id: this.config.agentId,
        auth_token_length: this.config.authToken?.length || 0
      })}`);
      
      // VALHALLA FIX: Explicitly ensure proper headers are set
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.authToken}`
      };
      
      this.logger.debug(`[RELAY] Registration headers: Content-Type and Authorization (${this.config.authToken?.substring(0, 6)}****) set`);
      
      const response = await this.fetchWithTimeout(
        `${this.config.relayServerUrl}/register`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        },
        8000 // 8 second timeout for registration
      );
      
      // Log full response status 
      this.logger.debug(`[RELAY] Registration response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        let errorDetails = '';
        try {
          // Try to get more detailed error information
          const errorText = await response.text();
          errorDetails = errorText;
          this.logger.error(`[RELAY] Registration error response: ${errorText}`);
        } catch (e) {
          this.logger.error(`[RELAY] Could not read error response: ${e.message}`);
        }
        
        this.logger.error(`[RELAY] Failed to register agent with status ${response.status} ${response.statusText}: ${errorDetails}`);
        return false;
      }
      
      // Try to parse response
      try {
        const data = await response.json();
        
        // VALHALLA FIX: Log the full response data for debugging
        this.logger.debug(`[RELAY] Registration response: ${JSON.stringify(data)}`);
        
        // VALHALLA FIX: Strictly check for success property
        if (data.success !== true) {
          this.logger.error(`[RELAY] Registration failed: Server returned success=${data.success}, error: ${data.error || 'Unknown error'}`);
          return false;
        }
        
        this.logger.info(`[RELAY] Agent ${this.config.agentId} registered successfully with response success=${data.success}`);
        
        // Log additional registration details if available
        if (data.agent_id) {
          this.logger.info(`[RELAY] Confirmed agent ID: ${data.agent_id}`);
          
          // VALHALLA FIX: Verify the returned agent_id matches what we sent
          if (data.agent_id !== this.config.agentId) {
            this.logger.warn(`[RELAY] Server registered a different agent ID than requested: ${data.agent_id} vs ${this.config.agentId}`);
          }
        }
        
        if (data.expires_at) {
          this.logger.info(`[RELAY] Registration expires at: ${new Date(data.expires_at).toISOString()}`);
        }
        
        return true;
      } catch (parseError) {
        this.logger.error(`[RELAY] Error parsing registration response: ${parseError.message}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`[RELAY] Error registering agent: ${error.message}`);
      
      // Check if retry is possible
      if (this.connectionAttempts < this.maxConnectionAttempts) {
        this.logger.info(`[RELAY] Registration retry ${this.connectionAttempts}/${this.maxConnectionAttempts} will be attempted shortly`);
        return false;
      }
      
      this.logger.error(`[RELAY] Maximum registration attempts (${this.maxConnectionAttempts}) reached, giving up`);
      return false;
    }
  }

  /**
   * Connect to the relay server
   * @returns True if connected successfully, false otherwise
   */
  async connect(): Promise<boolean> {
    // Reset connection state
    this.connected = false;
    
    this.logger.info(`[RELAY] Connecting to relay server at ${this.config.relayServerUrl}`);
    
    if (!this.config.agentId) {
      this.logger.error('[RELAY] No agent ID provided, cannot connect');
      return false;
    }
    
    // VALHALLA FIX: Ensure agent ID is lowercase for consistency with relay server
    const agentIdForRegistration = this.config.agentId.toLowerCase();
    if (agentIdForRegistration !== this.config.agentId) {
      this.logger.info(`[RELAY] Converting agent ID to lowercase for registration: ${agentIdForRegistration}`);
      this.config.agentId = agentIdForRegistration;
    }
    
    try {
      // Register with the relay
      if (!(await this.registerAgent())) {
        this.logger.error('[RELAY] Failed to register with relay server');
        return false;
      }
      
      this.connected = true;
      this.connectionAttempts = 0;
      
      // Start heartbeat
      this.setupPingInterval();
      
      // VALHALLA FIX: Check if polling should be disabled
      const disablePolling = process.env.DISABLE_POLLING === 'true';
      if (disablePolling) {
        this.logger.info('[RELAY] Polling disabled by DISABLE_POLLING environment variable');
      } else {
        // Start polling for relay updates
        this.startRelayPolling();
        this.logger.info('[RELAY] Polling started for updates');
      }
      
      this.logger.info('[RELAY] Connected successfully');
      
      return true;
    } catch (error) {
      this.logger.error(`[RELAY] Connection error: ${error.message}`);
      return false;
    }
  }

  /**
   * Disconnect from the relay server
   */
  async disconnect(): Promise<void> {
    this.logger.info('[RELAY] Disconnecting from relay server');
    
    this.connected = false;
    this.clearTimers();
    
    // Clear all handlers
    this.messageHandlers = [];
    this.agentUpdateHandlers = [];
  }

  /**
   * Send a message through the relay
   * 
   * @param groupId - Telegram group ID
   * @param text - Message text
   * @returns Message ID
   */
  async sendMessage(groupId: number | string, text: string): Promise<string> {
    const messageId = uuidv4();
    
    // Add to queue
    this.messageQueue.push({
      id: messageId,
      fromAgentId: this.config.agentId,
      groupId,
      text,
      timestamp: Date.now(),
      status: MessageStatus.PENDING
    });
    
    // Trigger queue processing if not already running
    if (!this.processingQueue) {
      this.processQueue();
    }
    
    return messageId;
  }

  /**
   * Register a handler for incoming messages
   * 
   * @param handler - Message handler function
   */
  onMessage(handler: (message: RelayMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Register a message handler for incoming relay messages
   * VALHALLA FIX: Added as an alias to onMessage for clearer API
   * 
   * @param handler Function to call when a message is received
   */
  registerMessageHandler(handler: (message: RelayMessage) => void): void {
    this.messageHandlers.push(handler);
    this.logger.info(`[RELAY] Handler registered. Total: ${this.messageHandlers.length}`);
  }

  /**
   * Register a handler for agent updates
   * 
   * @param handler - Agent update handler function
   */
  onAgentUpdate(handler: (agents: string[]) => void): void {
    this.agentUpdateHandlers.push(handler);
  }

  /**
   * Process the message queue
   */
  private async processQueue(): Promise<void> {
    if (this.processingQueue || this.messageQueue.length === 0) {
      return;
    }
    
    this.processingQueue = true;
    
    try {
      // Take first pending message
      const message = this.messageQueue.find(m => m.status === MessageStatus.PENDING);
      if (!message) {
        this.processingQueue = false;
        return;
      }
      
      try {
        // Send the message
        const success = await this.sendMessageToRelay(message);
        
        if (success) {
          // Remove from queue
          this.messageQueue = this.messageQueue.filter(m => m.id !== message.id);
        } else {
          // Increment retry count
          message.retries = (message.retries || 0) + 1;
          
          // Mark as failed if retries exhausted
          if (message.retries >= (this.config.retryLimit || 3)) {
            message.status = MessageStatus.FAILED;
            this.logger.error(`Message failed after ${message.retries} retries: ${message.text.substring(0, 50)}...`);
          }
        }
      } catch (error) {
        this.logger.error(`Error sending message: ${error.message}`);
        
        // Increment retry count
        message.retries = (message.retries || 0) + 1;
        
        // Mark as failed if retries exhausted
        if (message.retries >= (this.config.retryLimit || 3)) {
          message.status = MessageStatus.FAILED;
        }
      }
    } finally {
      this.processingQueue = false;
      
      // Continue processing if more messages
      if (this.messageQueue.some(m => m.status === MessageStatus.PENDING)) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }

  /**
   * Send a message to the relay server
   * 
   * @param message - The message to send
   * @returns True if sent successfully, false otherwise
   */
  private async sendMessageToRelay(message: QueuedMessage): Promise<boolean> {
    if (!this.connected) {
      // Try to reconnect
      const reconnected = await this.connect();
      if (!reconnected) {
        return false;
      }
    }
    
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.relayServerUrl}/sendMessage`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.authToken}`
          },
          body: JSON.stringify({
            agent_id: this.config.agentId,
            chat_id: message.groupId,
            text: message.text
          })
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Failed to send message: ${errorText}`);
        return false;
      }
      
      const data = await response.json();
      if (!data.success) {
        this.logger.error(`Failed to send message: ${data.error || 'Unknown error'}`);
        return false;
      }
      
      this.logger.debug(`Message sent successfully: ${message.text.substring(0, 50)}...`);
      return true;
    } catch (error) {
      this.logger.error(`Error sending message to relay: ${error.message}`);
      return false;
    }
  }

  /**
   * Set up the ping interval for keeping the connection alive
   */
  private setupPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    // VALHALLA FIX: Add initial delay before starting heartbeats
    setTimeout(() => {
      // Send initial heartbeat
      this.sendHeartbeat().catch(error => {
        this.logger.warn(`[RELAY] Initial heartbeat failed: ${error.message}`);
      });
      
      // Set up regular heartbeat interval
      this.pingInterval = setInterval(() => {
        this.sendHeartbeat().catch(error => {
          this.logger.warn(`[RELAY] Heartbeat failed: ${error.message}`);
        });
      }, 30000); // Every 30 seconds
      
      this.logger.info('[RELAY] Heartbeat interval established');
    }, 5000); // 5 second initial delay
  }

  /**
   * Send a heartbeat to the relay server
   */
  private async sendHeartbeat(): Promise<void> {
    if (!this.connected) {
      return;
    }
    
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.relayServerUrl}/heartbeat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.authToken}`
          },
          body: JSON.stringify({
            agent_id: this.config.agentId
          })
        }
      );
      
      if (!response.ok) {
        this.logger.warn(`Heartbeat failed: ${response.status}`);
        return;
      }
      
      const data = await response.json();
      if (!data.success) {
        this.logger.warn(`Heartbeat failed: ${data.error || 'Unknown error'}`);
        return;
      }
      
      this.lastPingTime = Date.now();
      this.logger.debug('Heartbeat sent successfully');
    } catch (error) {
      this.logger.error(`Error sending heartbeat: ${error.message}`);
      // Check if we should reconnect
      const timeSinceLastPing = Date.now() - this.lastPingTime;
      if (timeSinceLastPing > 60000) {
        this.logger.warn('No heartbeat response for 60 seconds, reconnecting...');
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Get updates from the relay server
   * @returns Array of messages from the relay
   */
  async getRelayUpdates(): Promise<any[]> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.relayServerUrl}/getUpdates?agent_id=${this.config.agentId}&offset=0`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.authToken}`
          }
        },
        10000 // 10-second timeout
      );
      
      if (!response.ok) {
        this.logger.warn(`[RELAY] Failed to poll relay updates: ${response.status} ${response.statusText}`);
        return [];
      }
      
      const data = await response.json();
      
      if (!data.success) {
        this.logger.warn(`[RELAY] Relay update polling failed: ${data.error || 'Unknown error'}`);
        return [];
      }
      
      return data.messages || [];
    } catch (error) {
      this.logger.error(`[RELAY] Error getting relay updates: ${error.message}`);
      return [];
    }
  }

  /**
   * Schedule a reconnect after disconnect
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    this.reconnectTimeout = setTimeout(async () => {
      this.logger.info('Attempting to reconnect to relay server...');
      await this.connect();
    }, 5000);
  }

  /**
   * Clean up all timers
   */
  private clearTimers(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (this.updatePollingInterval) {
      clearInterval(this.updatePollingInterval);
      this.updatePollingInterval = null;
    }
  }

  /**
   * Fetch with timeout to prevent hanging requests
   * @param url - URL to fetch
   * @param options - Fetch options
   * @param timeoutMs - Timeout in milliseconds
   * @returns Response
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeoutMs: number = 8000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      // Enhance error message if it's an abort error
      if (error.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      }
      
      throw error;
    }
  }

  /**
   * Get available agents from the relay server
   * 
   * @returns List of agent IDs
   */
  async getAvailableAgents(): Promise<string[]> {
    try {
      this.logger.debug(`Fetching available agents from: ${this.config.relayServerUrl}/health`);
      
      const response = await this.fetchWithTimeout(
        `${this.config.relayServerUrl}/health`,
        { method: 'GET' }
      );
      
      if (!response.ok) {
        this.logger.warn(`Failed to fetch available agents: ${response.status}`);
        return [];
      }
      
      const data = await response.json();
      this.logger.debug(`Health response: ${JSON.stringify(data)}`);
      
      if (data.agents_list && typeof data.agents_list === 'string') {
        const agents = data.agents_list.split(',').filter(Boolean);
        return agents;
      }
      
      return [];
    } catch (error) {
      this.logger.error(`Error fetching available agents: ${error.message}`);
      return [];
    }
  }

  /**
   * Check if the relay server is connected
   * @returns True if connected to the relay server, false otherwise
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Start polling for relay updates
   * VALHALLA FIX: Added as separate method to poll for relay updates
   */
  private startRelayPolling(): void {
    // Clear any existing polling interval
    if (this.updatePollingInterval) {
      clearInterval(this.updatePollingInterval);
      this.updatePollingInterval = null;
    }
    
    // Start with an immediate poll
    this.pollRelayServer();
    
    // Set up interval for regular polling
    this.updatePollingInterval = setInterval(() => {
      this.pollRelayServer();
    }, 2000); // Poll every 2 seconds
    
    this.logger.info('[RELAY] Started polling relay server for updates');
  }
  
  /**
   * Poll the relay server for updates
   * VALHALLA FIX: Extracted method for better error handling and memory management
   */
  private async pollRelayServer(): Promise<void> {
    try {
      this.logger.debug('[RELAY] Polling relay for messages...');
      
      const updates = await this.getRelayUpdates();
      
      this.logger.debug(`[RELAY] Received ${updates.length} updates`);
      
      // Process each update
      for (const update of updates) {
        for (const handler of this.messageHandlers) {
          try {
            handler(update);
          } catch (error) {
            this.logger.error(`[RELAY] Error in message handler: ${error.message}`);
          }
        }
      }
      
      // Force garbage collection if environment variable is set
      if (process.env.FORCE_GC === 'true' && global.gc) {
        try {
          global.gc();
          this.logger.debug('[RELAY] Forced garbage collection after polling');
        } catch (error) {
          this.logger.error(`[RELAY] Error during forced GC: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`[RELAY] Error polling relay server: ${error.message}`);
    }
  }

  /**
   * Process updates from the relay server
   * This method is called by the Telegram client plugin when messages are received
   * @param message The message that was received
   */
  processUpdate(message: RelayMessage): void {
    // VALHALLA FIX: Process a single message from the Telegram client plugin
    if (!message) {
      this.logger.debug('[RELAY] Received null message from Telegram client');
      return;
    }
    
    this.logger.debug(`[RELAY] Processing update from Telegram client: ${JSON.stringify({
      message_id: message.message_id,
      from: message.from?.username || 'unknown',
      text: message.text?.substring(0, 50)
    })}`);
    
    // Call all registered handlers
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        this.logger.error(`[RELAY] Error in message handler: ${error.message}`);
      }
    }
  }
}