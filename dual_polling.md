# Dual Polling Issue Analysis - Telegram Bot System

## Current Status

### Issue Overview
Our Telegram bot system is currently experiencing memory issues due to dual polling mechanisms:

1. **Standard Telegram Plugin Polling**
   - Handles direct Telegram API communication
   - Manages basic bot functionality
   - Runs on the standard Telegram client plugin

2. **TelegramMultiAgentPlugin Polling**
   - Handles inter-agent communication through relay server
   - Currently implementing its own polling mechanism
   - Running simultaneously with the standard plugin's polling

### Evidence from Logs
```
[DEBUG] TelegramMultiAgentPlugin: [RELAY] Polling relay for messages...  
[DEBUG] TelegramMultiAgentPlugin: [RELAY] Received 0 updates  
[DEBUG] TelegramMultiAgentPlugin: [RELAY] Polling relay for messages...  
[DEBUG] TelegramMultiAgentPlugin: [RELAY] Received 0 updates  
```

### Impact
- Memory leaks due to duplicate polling
- Exit code 137 (Out of Memory) errors
- Agents terminating after 2-3 minutes of operation
- Memory usage reaching ~94MB before termination

## Previous Decision

We had previously decided to keep polling exclusively at the Telegram standard plugin level to avoid this double-polling issue. However, this change was not fully implemented, leading to the current problems.

## Current Implementation

### TelegramMultiAgentPlugin Polling
```typescript
this.checkIntervalId = setInterval(async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const res = await fetch(`${this.config.relayServerUrl}/getUpdates?agent_id=${this.agentId}`, {
      signal: controller.signal
    });
    // ... rest of polling code
  } catch (err) {
    // ... error handling
  }
}, 2000);
```

## Proposed Solution

### 1. Remove Polling from TelegramMultiAgentPlugin
- Eliminate the custom polling mechanism
- Rely on the standard Telegram plugin's polling
- Use event-based updates instead

### 2. Implement Event-Based Updates
```typescript
// Instead of polling, use event listeners
this.telegramPlugin.on('message', async (message) => {
  // Process message and relay to other agents
  await this.processRelayUpdates(message);
});
```

### 3. WebSocket Implementation
```typescript
private startRelayWebSocket(): void {
  const wsUrl = this.config.relayServerUrl.replace('http://', 'ws://');
  const ws = new WebSocket(`${wsUrl}/ws?agent_id=${this.agentId}`);
  
  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);
    await this.processRelayUpdates(data);
  };
}
```

## Benefits of Change

1. **Memory Efficiency**
   - Eliminates duplicate polling
   - Reduces memory usage
   - Prevents memory leaks

2. **System Stability**
   - More reliable message handling
   - Better resource utilization
   - Reduced risk of OOM errors

3. **Performance**
   - Faster message processing
   - Lower network overhead
   - Better scalability

## Implementation Steps

1. **Remove Polling Code**
   - Delete the polling interval implementation
   - Clean up related error handling
   - Remove polling configuration options

2. **Add Event Listeners**
   - Implement message event handlers
   - Set up relay server event processing
   - Add error handling for event processing

3. **WebSocket Integration**
   - Set up WebSocket connection
   - Implement connection management
   - Add reconnection logic

4. **Testing**
   - Verify message routing
   - Test memory usage
   - Monitor system stability

## Monitoring Plan

1. **Memory Usage**
   - Track memory consumption
   - Monitor for memory leaks
   - Set up alerts for high memory usage

2. **Message Flow**
   - Verify message delivery
   - Monitor relay server communication
   - Track message processing times

3. **System Health**
   - Monitor agent uptime
   - Track error rates
   - Watch for connection issues

## Next Steps

1. **Immediate Actions**
   - Remove polling from TelegramMultiAgentPlugin
   - Implement event-based updates
   - Set up WebSocket connection

2. **Testing**
   - Run memory usage tests
   - Verify message routing
   - Monitor system stability

3. **Deployment**
   - Deploy changes gradually
   - Monitor for issues
   - Roll back if needed

## Conclusion

The dual polling issue is causing significant memory problems in our system. By removing the custom polling from TelegramMultiAgentPlugin and implementing event-based updates with WebSocket support, we can resolve the memory issues and improve system stability.

This change aligns with our previous decision to keep polling at the standard plugin level and will help prevent the exit code 137 errors we're currently experiencing. 