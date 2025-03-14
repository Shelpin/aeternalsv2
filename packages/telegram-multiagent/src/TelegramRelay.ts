import { ElizaLogger } from './types';

/**
 * Message relay status
 */
export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed'
}

/**
 * Message structure for the relay
 */
export interface RelayMessage {
  id: string;
  fromAgentId: string;
  groupId: number;
  text: string;
  timestamp: number;
  status: MessageStatus;
  retries?: number;
}

/**
 * Configuration for the relay
 */
export interface TelegramRelayConfig {
  relayServerUrl: string;
  authToken: string;
  agentId: string;
  retryLimit?: number;
  retryDelayMs?: number;
}

/**
 * TelegramRelay handles communication with the relay server to send messages
 * between Telegram bots and coordinate multi-agent conversations
 */
export class TelegramRelay {
  private config: TelegramRelayConfig;
  private logger: ElizaLogger;
  private messageQueue: RelayMessage[] = [];
  private processingQueue: boolean = false;
  private connected: boolean = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private eventHandlers: Record<string, Array<(data: any) => void>> = {};
  private lastPingTime = 0;
  private pingIntervalMs = 30000; // 30 seconds
  
  /**
   * Constructor overloads for TelegramRelay
   */
  constructor(config: TelegramRelayConfig);
  constructor(config: TelegramRelayConfig, logger: ElizaLogger);
  constructor(config: TelegramRelayConfig, logger?: ElizaLogger) {
    this.config = {
      retryLimit: 3,
      retryDelayMs: 5000,
      ...config
    };
    
    this.logger = logger || {
      debug: (msg: string) => console.log(`[DEBUG] ${msg}`),
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      warn: (msg: string) => console.log(`[WARN] ${msg}`),
      error: (msg: string) => console.log(`[ERROR] ${msg}`)
    };
    
    this.connected = false;
    this.eventHandlers = {};
    this.lastPingTime = 0;
    this.messageQueue = [];
    this.processingQueue = false;
    this.reconnectTimeout = null;
    this.pingInterval = null;
    this.pingIntervalMs = 30000; // 30 seconds
    
    // Start queue processing
    this.processQueue();
    
    // Set up ping interval
    this.setupPingInterval();
  }
  
  /**
   * Set up the ping interval for keeping the connection alive
   */
  private setupPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    this.pingInterval = setInterval(() => {
      this.ping();
    }, this.pingIntervalMs);
    
    // Record first ping time
    this.lastPingTime = Date.now();
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
  }
  
  /**
   * Connect to the relay server
   * @returns True if connected successfully, false otherwise
   */
  async connect(): Promise<boolean> {
    console.log(`[RELAY_CONNECT] TelegramRelay: Connecting to relay server at ${this.config.relayServerUrl}`);
    console.log(`[RELAY_CONNECT] TelegramRelay: Agent ID: ${this.config.agentId}`);
    console.log(`[RELAY_CONNECT] TelegramRelay: Auth token length: ${this.config.authToken ? this.config.authToken.length : 0}`);
    
    if (!this.config.agentId) {
      console.error(`[RELAY_CONNECT] TelegramRelay: No agent ID provided, cannot connect`);
      return false;
    }
    
    try {
      // Test relay server availability first
      try {
        console.log(`[RELAY_CONNECT] TelegramRelay: Testing server availability at ${this.config.relayServerUrl}/health`);
        const healthResponse = await fetch(`${this.config.relayServerUrl}/health`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (healthResponse.ok) {
          const healthData = await healthResponse.json();
          console.log(`[RELAY_CONNECT] TelegramRelay: Server is available, current stats: ${JSON.stringify(healthData)}`);
        } else {
          console.warn(`[RELAY_CONNECT] TelegramRelay: Server health check failed with status ${healthResponse.status}`);
        }
      } catch (healthError) {
        console.warn(`[RELAY_CONNECT] TelegramRelay: Server health check failed: ${healthError.message}`);
      }
      
      // Prepare the registration payload
      const payload = {
        agent_id: this.config.agentId,
        token: this.config.authToken
      };
      
      console.log(`[RELAY_CONNECT] TelegramRelay: Registration payload prepared for agent: ${this.config.agentId}`);
      
      // Send registration request to the relay server
      console.log(`[RELAY_CONNECT] TelegramRelay: Sending registration request to ${this.config.relayServerUrl}/register`);
      const response = await fetch(`${this.config.relayServerUrl}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`
        },
        body: JSON.stringify(payload)
      });
      
      console.log(`[RELAY_CONNECT] TelegramRelay: Registration response status: ${response.status}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[RELAY_CONNECT] TelegramRelay: Registration failed: Status ${response.status}, Response: ${errorText}`);
        return false;
      }
      
      let data;
      try {
        data = await response.json();
        console.log(`[RELAY_CONNECT] TelegramRelay: Registration successful: ${JSON.stringify(data)}`);
      } catch (jsonError) {
        const rawText = await response.text();
        console.log(`[RELAY_CONNECT] TelegramRelay: Could not parse response as JSON: ${rawText}`);
        console.log(`[RELAY_CONNECT] TelegramRelay: Parse error: ${jsonError.message}`);
      }
      
      // Verify registration by checking health again
      try {
        console.log(`[RELAY_CONNECT] TelegramRelay: Verifying registration via health check`);
        const verifyResponse = await fetch(`${this.config.relayServerUrl}/health`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        });
        
        if (verifyResponse.ok) {
          const healthData = await verifyResponse.json();
          console.log(`[RELAY_CONNECT] TelegramRelay: Post-registration server stats: ${JSON.stringify(healthData)}`);
          
          if (healthData.agents > 0 && healthData.agents_list && healthData.agents_list.includes(this.config.agentId)) {
            console.log(`[RELAY_CONNECT] TelegramRelay: Agent ${this.config.agentId} successfully verified as connected`);
          } else {
            console.warn(`[RELAY_CONNECT] TelegramRelay: Agent ${this.config.agentId} not found in connected agents list`);
          }
        }
      } catch (verifyError) {
        console.warn(`[RELAY_CONNECT] TelegramRelay: Verification check failed: ${verifyError.message}`);
      }
      
      this.connected = true;
      console.log(`[RELAY_CONNECT] TelegramRelay: Connection established successfully`);
      return true;
    } catch (error) {
      console.error(`[RELAY_CONNECT] TelegramRelay: Connection error: ${error.message}`);
      console.error(`[RELAY_CONNECT] TelegramRelay: Error stack: ${error.stack}`);
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
      await fetch(`${this.config.relayServerUrl}/unregister`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`
        },
        body: JSON.stringify({
          agent_id: this.config.agentId
        })
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`TelegramRelay: Disconnect error: ${errorMessage}`);
    }
    
    this.connected = false;
    
    // Clear timers
    this.clearTimers();
    
    // Emit disconnected event
    this.emit('disconnected', { agentId: this.config.agentId });
  }
  
  /**
   * Send a message to a Telegram group
   * 
   * @param groupId - Telegram group ID
   * @param text - Message text
   * @returns Message ID
   */
  sendMessage(groupId: number, text: string): string {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Create message
    const message: RelayMessage = {
      id: messageId,
      fromAgentId: this.config.agentId,
      groupId,
      text,
      timestamp: Date.now(),
      status: MessageStatus.PENDING,
      retries: 0
    };
    
    // Add to queue
    this.messageQueue.push(message);
    
    // Trigger queue processing
    this.processQueue();
    
    return messageId;
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
      // Ensure we're connected
      if (!this.connected) {
        await this.connect();
        
        if (!this.connected) {
          this.processingQueue = false;
          return;
        }
      }
      
      // Process messages
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue[0];
        
        try {
          const response = await fetch(`${this.config.relayServerUrl}/sendMessage`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.authToken}`
            },
            body: JSON.stringify({
              agent_id: message.fromAgentId,
              token: this.config.authToken,
              chat_id: message.groupId,
              text: message.text
            })
          });
          
          if (!response.ok) {
            throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
          }
          
          // Remove from queue
          this.messageQueue.shift();
          
          // Update status
          message.status = MessageStatus.SENT;
          
          // Emit sent event
          this.emit('messageSent', message);
          
          this.logger.debug(`TelegramRelay: Message ${message.id} sent to group ${message.groupId}`);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`TelegramRelay: Error sending message ${message.id}: ${errorMessage}`);
          
          // Increment retry count
          message.retries = (message.retries || 0) + 1;
          
          if (message.retries >= (this.config.retryLimit || 3)) {
            // Max retries reached, remove from queue
            this.messageQueue.shift();
            
            // Update status
            message.status = MessageStatus.FAILED;
            
            // Emit failed event
            this.emit('messageFailed', { ...message, error: errorMessage });
            
            this.logger.error(`TelegramRelay: Message ${message.id} failed after ${message.retries} retries`);
          } else {
            // Move to end of queue for retry
            this.messageQueue.shift();
            this.messageQueue.push(message);
            
            this.logger.warn(`TelegramRelay: Message ${message.id} will be retried (${message.retries}/${this.config.retryLimit})`);
          }
          
          // Add delay between retries
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
        }
      }
    } finally {
      this.processingQueue = false;
    }
  }
  
  /**
   * Ping the relay server to keep the connection alive
   */
  private async ping(): Promise<void> {
    // Record ping time
    this.lastPingTime = Date.now();
    
    if (!this.connected) {
      console.log('[DEBUG] TelegramRelay: Skipping ping because relay is not connected');
      return;
    }
    
    try {
      console.log(`[DEBUG] TelegramRelay: Sending heartbeat to ${this.config.relayServerUrl}/heartbeat for agent ${this.config.agentId}`);
      
      const response = await fetch(`${this.config.relayServerUrl}/heartbeat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`
        },
        body: JSON.stringify({
          agent_id: this.config.agentId,
          token: this.config.authToken,
          timestamp: Date.now()
        })
      });
      
      console.log(`[DEBUG] TelegramRelay: Heartbeat response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        this.connected = false;
        console.log(`[WARN] TelegramRelay: Ping failed: ${response.status} ${response.statusText}`);
        
        try {
          const errorText = await response.text();
          console.log(`[DEBUG] TelegramRelay: Heartbeat error response: ${errorText}`);
        } catch (e) {
          console.log(`[DEBUG] TelegramRelay: Could not read heartbeat error response`);
        }
        
        // Reconnect
        console.log('[INFO] TelegramRelay: Attempting to reconnect after failed heartbeat');
        this.connect();
      } else {
        console.log('[DEBUG] TelegramRelay: Heartbeat successful');
      }
    } catch (error: unknown) {
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`[WARN] TelegramRelay: Ping error: ${errorMessage}`);
      console.log(`[DEBUG] TelegramRelay: Ping error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      
      // Reconnect
      console.log('[INFO] TelegramRelay: Attempting to reconnect after heartbeat error');
      this.connect();
    }
  }
  
  /**
   * Register an event handler
   * 
   * @param event - Event name
   * @param handler - Event handler function
   */
  on(event: string, handler: (data: any) => void): void {
    if (!this.eventHandlers[event]) {
      this.eventHandlers[event] = [];
    }
    
    this.eventHandlers[event].push(handler);
  }
  
  /**
   * Emit an event to all registered handlers
   * 
   * @param event - Event name
   * @param data - Event data
   */
  private emit(event: string, data: any): void {
    const handlers = this.eventHandlers[event] || [];
    
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`TelegramRelay: Error in event handler for '${event}': ${errorMessage}`);
      }
    }
  }
  
  /**
   * Get message queue status
   * 
   * @returns Queue status information
   */
  getQueueStatus(): { pending: number, processing: boolean } {
    return {
      pending: this.messageQueue.length,
      processing: this.processingQueue
    };
  }
  
  /**
   * Check if connected to relay server
   * 
   * @returns Connection status
   */
  isConnected(): boolean {
    return this.connected;
  }
} 