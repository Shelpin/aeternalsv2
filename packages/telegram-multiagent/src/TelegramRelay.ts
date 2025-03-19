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
  private updatePollingInterval: ReturnType<typeof setInterval> | null = null;
  private eventHandlers: Record<string, Array<(data: any) => void>> = {};
  private lastPingTime = 0;
  private pingIntervalMs = 30000; // 30 seconds
  private updatePollingMs = 1000; // Poll for updates every second
  private lastUpdateId = 0; // Track the last update ID we've processed
  private messageHandler: ((message: any) => void) | null = null;
  
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
    this.updatePollingInterval = null;
    this.messageHandler = null;
    this.lastUpdateId = 0;
    this.pingIntervalMs = 30000; // 30 seconds
    this.updatePollingMs = 1000; // Poll for updates every second
    
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
    
    if (this.updatePollingInterval) {
      clearInterval(this.updatePollingInterval);
      this.updatePollingInterval = null;
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
      
      // Start polling for updates
      this.startUpdatePolling();
      
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
   * Send a message through the relay server
   * @param chatId - The chat ID to send to (can be a string or number)
   * @param text - The message text to send
   * @returns Promise resolving to the message ID or error
   */
  async sendMessage(chatId: string | number, text: string): Promise<any> {
    this.logger.info(`TelegramRelay: Sending message to chat ${chatId}: ${text.substring(0, 30)}...`);
    
    if (!this.connected) {
      this.logger.error('TelegramRelay: Cannot send message, not connected to relay server');
      throw new Error('Not connected to relay server');
    }
    
    try {
      // Prepare message payload
      const payload = {
        chat_id: chatId.toString(),
        text: text,
        agent_id: this.config.agentId,
        token: this.config.authToken,
        date: Math.floor(Date.now() / 1000)
      };
      
      this.logger.debug(`TelegramRelay: Sending payload to relay server: ${JSON.stringify(payload)}`);
      
      // Send request
      const response = await fetch(`${this.config.relayServerUrl}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        this.logger.error(`TelegramRelay: Failed to send message: ${response.status} ${response.statusText}`);
        const errorText = await response.text();
        this.logger.error(`TelegramRelay: Error response: ${errorText}`);
        throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      this.logger.info(`TelegramRelay: Message sent successfully, response: ${JSON.stringify(data)}`);
      return data;
    } catch (error) {
      this.logger.error(`TelegramRelay: Error sending message: ${error instanceof Error ? error.message : String(error)}`);
      this.logger.error(`TelegramRelay: Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
      throw error;
    }
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
  
  /**
   * Start polling for updates from the relay server
   */
  private startUpdatePolling(): void {
    if (this.updatePollingInterval) {
      clearInterval(this.updatePollingInterval);
    }
    
    this.updatePollingInterval = setInterval(() => {
      this.pollForUpdates();
    }, this.updatePollingMs);
    
    this.logger.info(`TelegramRelay: Started polling for updates every ${this.updatePollingMs}ms`);
  }
  
  /**
   * Poll for updates from the relay server
   */
  private async pollForUpdates(): Promise<void> {
    if (!this.connected) {
      return;
    }
    
    try {
      const requestUrl = `${this.config.relayServerUrl}/getUpdates?agent_id=${encodeURIComponent(this.config.agentId)}&token=${encodeURIComponent(this.config.authToken)}&offset=${this.lastUpdateId}`;
      this.logger.debug(`TelegramRelay: Polling for updates from: ${requestUrl}`);
      
      const response = await fetch(
        requestUrl,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.config.authToken}`
          }
        }
      );
      
      if (!response.ok) {
        this.logger.error(`TelegramRelay: Failed to get updates: ${response.status} ${response.statusText}`);
        try {
          const errorText = await response.text();
          this.logger.error(`TelegramRelay: Error response: ${errorText}`);
        } catch (e) {
          // Ignore error reading response
        }
        return;
      }
      
      const data = await response.json();
      
      if (!data.success) {
        this.logger.error(`TelegramRelay: Update request failed: ${data.error || 'Unknown error'}`);
        return;
      }
      
      const messages = data.messages || [];
      
      if (messages.length > 0) {
        this.logger.debug(`TelegramRelay: Received ${messages.length} new messages`);
        this.logger.debug(`TelegramRelay: Message details: ${JSON.stringify(messages)}`);
        
        // Update last update ID to only get newer messages next time
        const maxUpdateId = Math.max(...messages.map((msg: any) => msg.update_id || 0));
        if (maxUpdateId > 0) {
          this.lastUpdateId = maxUpdateId + 1;
          this.logger.debug(`TelegramRelay: Updated lastUpdateId to ${this.lastUpdateId}`);
        }
        
        // Process each message
        for (const message of messages) {
          this.logger.debug(`TelegramRelay: Processing message: ${JSON.stringify(message)}`);
          
          // Handle different message types
          if (message.message) {
            // This is a chat message
            this.logger.debug(`TelegramRelay: Handling chat message: ${JSON.stringify(message.message)}`);
            this.handleIncomingMessage(message.message);
          } else if (message.agent_updates) {
            // This is an agent status update
            this.logger.debug(`TelegramRelay: Handling agent updates: ${JSON.stringify(message.agent_updates)}`);
            for (const update of message.agent_updates) {
              this.emit('agentStatus', update);
            }
          } else if (message.text || message.content) {
            // This might be a direct message format
            this.logger.debug(`TelegramRelay: Handling direct message: ${JSON.stringify(message)}`);
            this.handleIncomingMessage(message);
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`TelegramRelay: Error polling for updates: ${errorMessage}`);
      this.logger.error(`TelegramRelay: Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    }
  }
  
  /**
   * Handle an incoming message from the relay server
   */
  private handleIncomingMessage(message: any): void {
    try {
      this.logger.debug(`TelegramRelay: Original incoming message: ${JSON.stringify(message)}`);
      
      // Transform the message to a standardized format
      const standardizedMessage = {
        id: message.message_id || message.id || `msg_${Date.now()}`,
        groupId: message.chat?.id?.toString() || message.groupId?.toString() || message.chat_id?.toString() || '-1002550618173', // Fallback to known group ID
        content: message.text || message.content || '',
        from: message.from || { username: message.sender_agent_id, is_bot: true },
        date: message.date || Date.now() / 1000,
        sender_agent_id: message.sender_agent_id || (message.from?.username ? message.from.username.replace('_bot', '') : null)
      };
      
      this.logger.debug(`TelegramRelay: Standardized message: ${JSON.stringify(standardizedMessage)}`);
      
      // Call the message handler if one is registered
      if (this.messageHandler) {
        try {
          this.logger.debug(`TelegramRelay: Calling message handler with: ${JSON.stringify(standardizedMessage)}`);
          this.messageHandler(standardizedMessage);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error(`TelegramRelay: Error in message handler: ${errorMessage}`);
          this.logger.error(`TelegramRelay: Handler error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
        }
      } else {
        this.logger.warn(`TelegramRelay: No message handler registered to process: ${JSON.stringify(standardizedMessage)}`);
      }
      
      // Also emit a message event
      this.emit('message', standardizedMessage);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`TelegramRelay: Error handling incoming message: ${errorMessage}`);
      this.logger.error(`TelegramRelay: Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    }
  }
  
  /**
   * Register a handler for incoming messages
   */
  onMessage(handler: (message: any) => void): void {
    this.messageHandler = handler;
    this.logger.info('TelegramRelay: Registered message handler');
  }
} 