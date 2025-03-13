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
  private readonly pingIntervalMs = 30000; // 30 seconds
  
  /**
   * Create a new TelegramRelay
   * 
   * @param config - Relay configuration
   * @param logger - Logger instance
   */
  constructor(config: TelegramRelayConfig, logger: ElizaLogger) {
    this.config = {
      ...config,
      retryLimit: config.retryLimit || 3,
      retryDelayMs: config.retryDelayMs || 5000
    };
    this.logger = logger;
    
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
   * 
   * @returns Promise that resolves when connected
   */
  async connect(): Promise<boolean> {
    if (this.connected) {
      return true;
    }
    
    try {
      const response = await fetch(`${this.config.relayServerUrl}/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`
        },
        body: JSON.stringify({
          agentId: this.config.agentId
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to connect: ${response.status} ${response.statusText}`);
      }
      
      this.connected = true;
      this.logger.info(`TelegramRelay: Connected to relay server at ${this.config.relayServerUrl}`);
      
      // Clear any reconnect timeout
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = null;
      }
      
      // Emit connected event
      this.emit('connected', { agentId: this.config.agentId });
      
      return true;
    } catch (error: unknown) {
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`TelegramRelay: Connection error: ${errorMessage}`);
      
      // Set up reconnection
      if (!this.reconnectTimeout) {
        this.reconnectTimeout = setTimeout(() => {
          this.reconnectTimeout = null;
          this.connect();
        }, 10000); // 10 second reconnect delay
      }
      
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
      await fetch(`${this.config.relayServerUrl}/disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`
        },
        body: JSON.stringify({
          agentId: this.config.agentId
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
          const response = await fetch(`${this.config.relayServerUrl}/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.authToken}`
            },
            body: JSON.stringify({
              messageId: message.id,
              fromAgentId: message.fromAgentId,
              groupId: message.groupId,
              text: message.text,
              timestamp: message.timestamp
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
      return;
    }
    
    try {
      const response = await fetch(`${this.config.relayServerUrl}/ping`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`
        },
        body: JSON.stringify({
          agentId: this.config.agentId,
          timestamp: Date.now()
        })
      });
      
      if (!response.ok) {
        this.connected = false;
        this.logger.warn(`TelegramRelay: Ping failed: ${response.status} ${response.statusText}`);
        
        // Reconnect
        this.connect();
      }
    } catch (error: unknown) {
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`TelegramRelay: Ping error: ${errorMessage}`);
      
      // Reconnect
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