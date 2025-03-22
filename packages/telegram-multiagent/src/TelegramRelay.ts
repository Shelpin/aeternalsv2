import { ElizaLogger, TelegramRelayConfig, MessageStatus, RelayMessage } from './types';
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
   * Connect to the relay server
   * @returns True if connected successfully, false otherwise
   */
  async connect(): Promise<boolean> {
    this.logger.info(`Connecting to relay server at ${this.config.relayServerUrl}`);
    
    if (!this.config.agentId) {
      this.logger.error('No agent ID provided, cannot connect');
      return false;
    }
    
    try {
      // Check if the server is available
      const healthCheck = await this.fetchWithTimeout(
        `${this.config.relayServerUrl}/health`,
        { method: 'GET' }
      );
      
      if (!healthCheck.ok) {
        this.logger.warn(`Relay server health check failed with status ${healthCheck.status}`);
        return false;
      }
      
      this.logger.debug(`Health check succeeded, registering agent: ${this.config.agentId}`);
      
      // Register with the relay server
      const payload = {
        agent_id: this.config.agentId,
        token: this.config.authToken
      };
      
      this.logger.debug(`Registration payload: ${JSON.stringify(payload)}`);
      
      const response = await this.fetchWithTimeout(
        `${this.config.relayServerUrl}/register`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Registration failed: Status ${response.status}, Response: ${errorText}`);
        return false;
      }
      
      const data = await response.json();
      
      if (!data.success) {
        this.logger.error(`Registration failed: ${data.error || 'Unknown error'}`);
        return false;
      }
      
      this.logger.info(`Successfully registered with relay server: ${JSON.stringify(data)}`);
      this.connected = true;
      
      // Start ping interval
      this.setupPingInterval();
      
      // Start update polling
      this.startUpdatePolling();
      
      // Fetch available agents
      const agents = await this.getAvailableAgents();
      this.logger.info(`Available agents: ${agents.join(', ')}`);
      
      // Notify agent update handlers
      this.agentUpdateHandlers.forEach(handler => handler(agents));
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to connect to relay server: ${error.message}`);
      this.scheduleReconnect();
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
      await fetch(`${this.config.relayServerUrl}/unregister`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`
        },
        body: JSON.stringify({
          agent_id: this.config.agentId,
          token: this.config.authToken
        })
      });
      
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
   * @param message - Message to send
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
            token: this.config.authToken,
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
    this.logger.debug(`Polling for updates from: ${this.config.relayServerUrl}/getUpdates?agent_id=${this.config.agentId}&token=${this.config.authToken}&offset=${this.lastUpdateId}`);
    
    try {
      const response = await this.fetchWithTimeout(
        `${this.config.relayServerUrl}/getUpdates?agent_id=${this.config.agentId}&token=${this.config.authToken}&offset=${this.lastUpdateId}`,
        { method: 'GET' }
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
            agent_id: this.config.agentId,
            token: this.config.authToken
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
   * Fetch with a timeout
   * 
   * @param url - URL to fetch
   * @param options - Fetch options
   * @param timeout - Timeout in milliseconds
   * @returns Response
   */
  private async fetchWithTimeout(url: string, options: RequestInit, timeout: number = 10000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      return response;
    } finally {
      clearTimeout(timeoutId);
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