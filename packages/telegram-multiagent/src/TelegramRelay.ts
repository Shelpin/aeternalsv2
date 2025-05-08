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

      // Log the masked token
      this.logger.debug(`[RELAY] Registration headers: Content-Type and Authorization (${this.config.authToken?.substring(0, 6)}****) set`);

      // >>> NEW DEBUG LOGGING: Log the actual token being sent <<<
      this.logger.debug(`[RELAY_AUTH_DEBUG] EXACT Auth Token Sent: [${this.config.authToken}]`);
      // >>> END NEW DEBUG LOGGING <<<

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
        } catch (e: unknown) {
          this.logger.error(`[RELAY] Could not read error response: ${e instanceof Error ? e.message : JSON.stringify(e)}`);
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
        if (typeof data === 'object' && data !== null && 'success' in data) {
          if (!(data as any).success) {
            this.logger.error(`[RELAY] Registration failed: Server returned success=${(data as any).success}, error: ${(data as any).error || 'Unknown error'}`);
            return false;
          }

          this.logger.info(`[RELAY] Agent ${this.config.agentId} registered successfully with response success=${(data as any).success}`);

          // Log additional registration details if available
          if ((data as any).agent_id) {
            this.logger.info(`[RELAY] Confirmed agent ID: ${(data as any).agent_id}`);

            // VALHALLA FIX: Verify the returned agent_id matches what we sent
            if ((data as any).agent_id !== this.config.agentId) {
              this.logger.warn(`[RELAY] Server registered a different agent ID than requested: ${(data as any).agent_id} vs ${this.config.agentId}`);
            }
          }

          if ((data as any).expires_at) {
            this.logger.info(`[RELAY] Registration expires at: ${(data as any).expires_at}`);
          }

          return true;
        } else {
          this.logger.error(`[RELAY] Error parsing registration response: ${typeof data === 'object' && data !== null ? JSON.stringify(data) : 'Unknown format'}`);
          return false;
        }
      } catch (parseError) {
        if (parseError instanceof Error) {
          this.logger.error(`[RELAY] Error parsing registration response: ${parseError.message}`);
        } else {
          this.logger.error(`[RELAY] Error parsing registration response: ${JSON.stringify(parseError)}`);
        }
        return false;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[RELAY] Error registering agent: ${error.message}`);
      } else {
        this.logger.error(`[RELAY] Error registering agent: ${JSON.stringify(error)}`);
      }

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
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[RELAY] Connection error: ${error.message}`);
      } else {
        this.logger.error(`[RELAY] Connection error: ${JSON.stringify(error)}`);
      }
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
  private processQueue: () => Promise<void> = async (): Promise<void> => {
    if (this.processingQueue || this.messageQueue.length === 0) {
      return;
    }
    this.processingQueue = true;
    try {
      const message = this.messageQueue.find((m: QueuedMessage) => m.status === MessageStatus.PENDING);
      if (!message) {
        this.processingQueue = false;
        return;
      }
      try {
        const success = await this.sendMessageToRelay(message);
        if (success) {
          this.messageQueue = this.messageQueue.filter((m: QueuedMessage) => m.id !== message.id);
        } else {
          message.retries = (message.retries || 0) + 1;
          if (message.retries >= (this.config.retryLimit || 3)) {
            message.status = MessageStatus.FAILED;
            this.logger.error(`Message failed after ${message.retries} retries: ${message.text.substring(0, 50)}...`);
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.error(`Error sending message: ${error.message}`);
        } else {
          this.logger.error(`Error sending message: ${JSON.stringify(error)}`);
        }
        message.retries = (message.retries || 0) + 1;
        if (message.retries >= (this.config.retryLimit || 3)) {
          message.status = MessageStatus.FAILED;
        }
      }
    } finally {
      this.processingQueue = false;
      if (this.messageQueue.some((m: QueuedMessage) => m.status === MessageStatus.PENDING)) {
        setTimeout(() => this.processQueue(), 100);
      }
    }
  };

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
      if (typeof data === 'object' && data !== null && 'success' in data) {
        if (!(data as any).success) {
          this.logger.error(`Failed to send message: ${(data as any).error || 'Unknown error'}`);
          return false;
        }

        this.logger.debug(`Message sent successfully: ${message.text.substring(0, 50)}...`);
        return true;
      } else {
        this.logger.error(`[RELAY] Unexpected response format from sendMessage: ${typeof data === 'object' && data !== null ? JSON.stringify(data) : 'Unknown format'}`);
        return false;
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Error sending message to relay: ${error.message}`);
      } else {
        this.logger.error(`Error sending message to relay: ${JSON.stringify(error)}`);
      }
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
      this.sendHeartbeat().catch((error: unknown) => {
        if (error instanceof Error) {
          this.logger.warn(`[RELAY] Initial heartbeat failed: ${error.message}`);
        } else {
          this.logger.warn(`[RELAY] Initial heartbeat failed: ${JSON.stringify(error)}`);
        }
      });

      // Set up regular heartbeat interval
      this.pingInterval = setInterval(() => {
        this.sendHeartbeat().catch((error: unknown) => {
          if (error instanceof Error) {
            this.logger.warn(`[RELAY] Heartbeat failed: ${error.message}`);
          } else {
            this.logger.warn(`[RELAY] Heartbeat failed: ${JSON.stringify(error)}`);
          }
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
      if (typeof data === 'object' && data !== null && 'success' in data) {
        if (!(data as any).success) {
          this.logger.warn(`Heartbeat failed: ${(data as any).error || 'Unknown error'}`);
          return;
        }

        this.lastPingTime = Date.now();
        this.logger.debug('Heartbeat sent successfully');
      } else {
        this.logger.error(`[RELAY] Unexpected response format from heartbeat: ${typeof data === 'object' && data !== null ? JSON.stringify(data) : 'Unknown format'}`);
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Error sending heartbeat: ${error.message}`);
      } else {
        this.logger.error(`Error sending heartbeat: ${JSON.stringify(error)}`);
      }
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

      if (typeof data === 'object' && data !== null && 'success' in data) {
        if (!(data as any).success) {
          this.logger.warn(`[RELAY] Relay update polling failed: ${(data as any).error || 'Unknown error'}`);
          return [];
        }
        return (data as any).messages || [];
      } else {
        this.logger.warn('[RELAY] Unexpected response format from relay updates');
        return [];
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[RELAY] Error getting relay updates: ${error.message}`);
      } else {
        this.logger.error(`[RELAY] Error getting relay updates: ${JSON.stringify(error)}`);
      }
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
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      // Enhance error message if it's an abort error
      if (error instanceof Error && (error as any).name === 'AbortError') {
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
      if (typeof data === 'object' && data !== null && 'agents_list' in data && typeof (data as any).agents_list === 'string') {
        const agents = (data as any).agents_list.split(',').filter(Boolean);
        return agents;
      }
      return [];
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`Error fetching available agents: ${error.message}`);
      } else {
        this.logger.error(`Error fetching available agents: ${JSON.stringify(error)}`);
      }
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
  private pollRelayServer: () => Promise<void> = async (): Promise<void> => {
    try {
      this.logger.debug('[RELAY] Polling relay for messages...');
      const updates = await this.getRelayUpdates();
      this.logger.debug(`[RELAY] Received ${updates.length} updates`);
      for (const update of updates) {
        for (const handler of this.messageHandlers) {
          try {
            handler(update);
          } catch (error: unknown) {
            if (error instanceof Error) {
              this.logger.error(`[RELAY] Error in message handler: ${error.message}`);
            } else {
              this.logger.error(`[RELAY] Error in message handler: ${JSON.stringify(error)}`);
            }
          }
        }
      }
      if (process.env.FORCE_GC === 'true' && global.gc) {
        try {
          global.gc();
          this.logger.debug('[RELAY] Forced garbage collection after polling');
        } catch (error: unknown) {
          if (error instanceof Error) {
            this.logger.error(`[RELAY] Error during forced GC: ${error.message}`);
          } else {
            this.logger.error(`[RELAY] Error during forced GC: ${JSON.stringify(error)}`);
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error(`[RELAY] Error polling relay server: ${error.message}`);
      } else {
        this.logger.error(`[RELAY] Error polling relay server: ${JSON.stringify(error)}`);
      }
    }
  };

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
      } catch (error: unknown) {
        if (error instanceof Error) {
          this.logger.error(`[RELAY] Error in message handler: ${error.message}`);
        } else {
          this.logger.error(`[RELAY] Error in message handler: ${JSON.stringify(error)}`);
        }
      }
    }
  }
}