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
  private updatePollingInterval: ReturnType<typeof setInterval> | null = null;
  private lastPingTime = 0;
  private lastUpdateId = 0;
  private messageHandlers: Array<(message: RelayMessage) => void> = [];
  private agentUpdateHandlers: Array<(agents: string[]) => void> = [];
  private connectionAttempts: number = 0;
  private maxConnectionAttempts: number = 5;

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
   * Register agent with the relay server with retries
   * @returns True if registered successfully
   */
  private async registerAgent(): Promise<boolean> {
    if (!this.config.agentId) {
      this.logger.error('No agent ID provided, cannot register');
      return false;
    }
    
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
      attempt++;
      this.logger.info(`Registration attempt ${attempt}/${maxRetries}`);
      
      try {
        const payload = {
          agent_id: this.config.agentId
        };
        
        this.logger.debug(`Registration payload: ${JSON.stringify(payload)}`);
        console.log(`[RELAY] Sending registration for agent: ${this.config.agentId}`);
        
        // If URL is localhost and contains underscores, warn about potential issues
        if (this.config.relayServerUrl.includes('localhost') && this.config.agentId.includes('_')) {
          this.logger.warn('Using localhost with agent ID containing underscores may cause registration issues');
          console.log('[RELAY] Warning: Using localhost with agent ID containing underscores may cause registration issues');
        }
        
        const response = await this.fetchWithTimeout(
          `${this.config.relayServerUrl}/register`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.authToken}`
            },
            body: JSON.stringify(payload)
          },
          10000 // 10 second timeout
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Registration failed: Status ${response.status}, Response: ${errorText}`);
          console.log(`[RELAY] Registration failed: ${response.status}, Response: ${errorText}`);
          
          // Wait before retrying
          if (attempt < maxRetries) {
            const delay = attempt * 2000; // Exponential backoff
            this.logger.info(`Retrying registration in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
          }
          continue;
        }
        
        const data = await response.json();
        
        if (!data.success) {
          this.logger.error(`Registration failed: ${data.error || 'Unknown error'}`);
          console.log(`[RELAY] Registration failed: ${data.error || 'Unknown error'}`);
          
          // Wait before retrying
          if (attempt < maxRetries) {
            const delay = attempt * 2000; // Exponential backoff
            this.logger.info(`Retrying registration in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
          }
          continue;
        }
        
        this.logger.info(`Successfully registered with relay server: ${JSON.stringify(data)}`);
        console.log(`[RELAY] Successfully registered with relay server`);
        return true;
      } catch (error) {
        this.logger.error(`Registration error: ${error.message}`);
        console.log(`[RELAY] Registration error: ${error.message}`);
        
        if (attempt < maxRetries) {
          const delay = attempt * 2000; // Exponential backoff
          this.logger.info(`Retrying registration in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    
    this.logger.error(`Failed to register after ${maxRetries} attempts`);
    console.log(`[RELAY] Failed to register after ${maxRetries} attempts`);
    return false;
  }

  /**
   * Connect to the relay server
   * @returns True if connected successfully, false otherwise
   */
  async connect(): Promise<boolean> {
    this.logger.info(`Connecting to relay server at ${this.config.relayServerUrl}`);
    console.log(`[RELAY] Attempting to connect to relay server at ${this.config.relayServerUrl}`);
    console.log(`[RELAY] Using auth token: ${this.config.authToken.slice(0, 6)}****`);
    
    if (!this.config.agentId) {
      this.logger.error('No agent ID provided, cannot connect');
      return false;
    }
    
    // Increment connection attempts counter
    this.connectionAttempts++;
    
    // Log connection attempt with counter
    this.logger.info(`Connection attempt ${this.connectionAttempts}/${this.maxConnectionAttempts}`);
    
    // Reset connected state for fresh attempt
    this.connected = false;
    
    try {
      // Check if the server is available
      let healthCheck;
      try {
        healthCheck = await this.fetchWithTimeout(
          `${this.config.relayServerUrl}/health`,
          { method: 'GET' },
          5000  // 5 second timeout for health check
        );
      } catch (error) {
        this.logger.error(`Health check failed: ${error.message}`);
        console.log(`[RELAY] Health check failed: ${error.message}`);
        if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
          this.logger.warn('Connection issue detected. Please check if relay server is running and network is accessible');
          console.log('[RELAY] Connection issue detected. Please check if relay server is running and network is accessible');
        }
        return false;
      }
      
      if (!healthCheck.ok) {
        this.logger.warn(`Relay server health check failed with status ${healthCheck.status}`);
        const responseText = await healthCheck.text();
        this.logger.error(`Health check response: ${responseText}`);
        return false;
      }
      
      this.logger.debug(`Health check succeeded, registering agent: ${this.config.agentId}`);
      
      // Register the agent with retries
      const registered = await this.registerAgent();
      if (!registered) {
        return false;
      }
      
      this.connected = true;
      
      // Reset connection attempts on success
      this.connectionAttempts = 0;
      
      // Start ping interval
      this.setupPingInterval();
      
      // Start update polling
      this.startUpdatePolling();
      
      return true;
    } catch (error) {
      this.logger.error(`Unexpected error connecting to relay server: ${error.message}`);
      if (error.stack) {
        this.logger.debug(`Error stack: ${error.stack}`);
      }
      console.log(`[RELAY] Unexpected error connecting to relay server: ${error.message}`);
      return false;
    }
  }

  /**
   * Disconnect from the relay server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }
    
    try {
      // Clear all intervals
      this.clearTimers();
      
      // Unregister from the relay server
      await this.fetchWithTimeout(
        `${this.config.relayServerUrl}/unregister`,
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
      
      this.connected = false;
      this.logger.info('Disconnected from relay server');
    } catch (error) {
      this.logger.error(`Error during disconnect: ${error.message}`);
    }
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
   * Start polling for updates
   */
  private startUpdatePolling(): void {
    if (this.updatePollingInterval) {
      clearInterval(this.updatePollingInterval);
    }
    
    this.updatePollingInterval = setInterval(async () => {
      if (!this.connected) {
        return;
      }
      
      try {
        await this.pollForUpdates();
      } catch (error) {
        this.logger.error(`Error polling for updates: ${error.message}`);
      }
    }, 1000);
  }

  /**
   * Poll the relay server for updates
   */
  private async pollForUpdates(): Promise<void> {
    this.logger.debug(`Polling for updates from: ${this.config.relayServerUrl}/getUpdates?agent_id=${this.config.agentId}&offset=${this.lastUpdateId}`);
    
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.relayServerUrl}/getUpdates?agent_id=${this.config.agentId}&offset=${this.lastUpdateId}`,
        { 
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.config.authToken}`
          }
        }
      );
      
      if (!response.ok) {
        this.logger.warn(`Failed to poll for updates: ${response.status}`);
        return;
      }
      
      const data = await response.json();
      if (!data.success) {
        this.logger.warn(`Failed to poll for updates: ${data.error || 'Unknown error'}`);
        return;
      }
      
      // Process messages
      if (data.messages && data.messages.length > 0) {
        for (const update of data.messages) {
          this.lastUpdateId = Math.max(this.lastUpdateId, update.update_id + 1);
          
          // Handle agent updates
          if (update.agent_updates) {
            for (const agentUpdate of update.agent_updates) {
              this.logger.info(`Agent update: ${agentUpdate.agent_id} is now ${agentUpdate.status}`);
            }
            
            // Get list of available agents
            const availableAgents = await this.getAvailableAgents();
            
            // Notify handlers
            for (const handler of this.agentUpdateHandlers) {
              handler(availableAgents);
            }
          }
          
          // Handle message updates
          if (update.message) {
            this.logger.debug(`Received message: ${update.message.text}`);
            
            // Skip messages from self
            if (update.message.sender_agent_id === this.config.agentId) {
              continue;
            }
            
            // Notify handlers
            for (const handler of this.messageHandlers) {
              handler(update.message);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error polling for updates: ${error.message}`);
    }
  }

  /**
   * Set up the ping interval for keeping the connection alive
   */
  private setupPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    this.pingInterval = setInterval(async () => {
      await this.sendHeartbeat();
    }, 30000);
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
   * Schedule a reconnect attempt
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
} 