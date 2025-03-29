# 🔍 OOM Memory Analysis: Exit Code 137 Investigation

## 📊 Executive Summary

The ElizaOS Multi-Agent Telegram System is experiencing critical memory issues resulting in **exit code 137** terminations. Despite implementing multiple memory optimization strategies from the Valhalla Plan, all agents are consistently being terminated by the OS after running for only 2-3 minutes. This comprehensive report details our findings, monitoring strategies, and proposed solutions to resolve these persistent memory issues.

**Critical Findings:**
- All agents terminate with exit code 137 (OOM kill) after ~3 minutes
- Memory growth occurs primarily during relay polling operations
- Existing memory optimizations (connection pooling, explicit GC, etc.) are insufficient
- Agents reach ~94MB reported memory just before termination, suggesting unreported memory allocation
- The issue affects ALL agents consistently with identical patterns

## 🔬 Current Status Analysis

### Agent Termination Pattern (All Agents)

```
[DEBUG] TelegramMultiAgentPlugin: Heartbeat sent successfully
[DEBUG] TelegramMultiAgentPlugin: [RELAY] Polling relay for messages...  
[DEBUG] TelegramMultiAgentPlugin: [RELAY] Received 0 updates  
[DEBUG] TelegramMultiAgentPlugin: [RELAY] Polling relay for messages...  
[DEBUG] TelegramMultiAgentPlugin: [RELAY] Received 0 updates  
Killed
Exit status 137
Agent process exited with code 137
```

### Memory Usage Just Before Termination

```
eth_memelord_9000        RUNNING   PID: 141045  Runtime: 2m 58s      Mem: 94.3MB    CPU: 0.9%
bag_flipper_9000         RUNNING   PID: 141157  Runtime: 2m 47s      Mem: 93.7MB    CPU: 0.7%
linda_evangelista_88     RUNNING   PID: 141253  Runtime: 2m 40s      Mem: 94.5MB    CPU: 0.8%
vc_shark_99              RUNNING   PID: 141359  Runtime: 3m 08s      Mem: 93.2MB    CPU: 0.7%
bitcoin_maxi_420         RUNNING   PID: 141266  Runtime: 3m 18s      Mem: 94.1MB    CPU: 0.8%
code_samurai_77          RUNNING   PID: 141169  Runtime: 3m 27s      Mem: 94.9MB    CPU: 0.7%
```

### Relay Server Status

```
=== Relay Server Status ===
Relay Server URL: http://localhost:4000
Relay Server Port: 4000
Authentication: eli...key
✅ Relay server is reachable
Uptime: 2 hours
Connected Agents: 0
Server Process: PID: 4084371, Memory: 76.4MB, CPU: 0.2%
```

## 🧠 Understanding Exit Code 137

Exit code 137 (128 + 9) specifically indicates the process was terminated by SIGKILL (signal 9), typically triggered by the OS Out-Of-Memory (OOM) killer. This occurs when a process exceeds memory limits set either by the system or the application.

According to research: "Exit code 137 is a signal that occurs when a container's memory exceeds the memory limit... When a container consumes too much memory, [the system] kills it to protect it from consuming too many resources" [Source: Refine.dev](https://refine.dev/blog/kubernetes-exit-code-137/).

What makes this situation unusual is that the reported memory usage (~94MB) is significantly below our configured limit (768MB), suggesting:

1. Memory allocation that isn't being properly tracked or reported
2. Memory fragmentation causing inefficient memory utilization
3. Hidden memory leaks in the polling mechanism

## 🛠️ Previously Implemented Optimizations

### 1. Memory Leak Prevention

We've already implemented several optimizations to prevent memory leaks:

```javascript
// AbortController for fetch timeouts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 5000);

// Explicit reference clearing
if (data?.messages) {
  // Process messages
  await this.processRelayUpdates(data);
  
  // Clear references after use
  for (let i = 0; i < data.messages.length; i++) {
    data.messages[i] = null;
  }
  data.messages = null;
}
```

### 2. SQLite Connection Pooling

To prevent SQLite connection leaks, we implemented a connection pool:

```typescript
private connectionPool = {
  connections: [] as Array<{conn: any, inUse: boolean}>,
  maxSize: 5,
  getConnection() { /* implementation */ },
  addConnection(conn: any) { /* implementation */ },
  releaseConnection(conn: any) { /* implementation */ }
};

// With proper connection management in queries
try {
  const result = await conn.query(searchSql, searchParams);
  this.connectionPool.releaseConnection(conn);
  // Process results...
} catch (error) {
  this.connectionPool.releaseConnection(conn);
  throw error;
}
```

### 3. Increased Memory Limits

Increased Node.js memory limit from 512MB to 768MB:

```bash
export NODE_OPTIONS="--max-old-space-size=768"
```

### 4. Explicit Garbage Collection

Added forced garbage collection after message processing:

```typescript
private forceGarbageCollection(): void {
  if (process.env.FORCE_GC === '1' && global.gc) {
    try {
      global.gc();
    } catch (e) {
      this.logger.error(`Error forcing GC: ${e.message}`);
    }
  }
}
```

### 5. SQLite Schema Initialization Improvements

Enhanced schema initialization with retry mechanism:

```typescript
const maxRetries = 3;
let retryCount = 0;

while (retryCount < maxRetries) {
  try {
    // Attempt to create schema and verify...
    return true;
  } catch (error) {
    retryCount++;
    // Exponential backoff between retries...
  }
}
```

### 6. Enhanced Process Management

Improved port cleanup and process management:

```bash
# Aggressive process termination for ports
for PORT in "${PORTS[@]}"; do
  PIDS=$(lsof -ti :$PORT 2>/dev/null)
  if [ -n "$PIDS" ]; then
    for PID in $PIDS; do
      kill -9 $PID 2>/dev/null || echo "Failed to kill process $PID"
    done
  fi
done
```

## 🔬 Memory Issue Analysis

Despite these optimizations, all agents continue to be terminated with exit code 137. The consistent pattern across all agents suggests a fundamental issue with the way memory is being managed in the polling operation.

### Key Observations:

1. **Timing Pattern**: All agents are killed after approximately 2-3 minutes of operation
2. **Memory Reporting Discrepancy**: Reported memory (~94MB) is well below our 768MB limit
3. **Consistent Failure During Polling**: All terminations occur during relay polling operations
4. **No Error Logs**: No specific error messages appear before termination
5. **No Memory Plateauing**: Memory usage doesn't appear to plateau despite our optimization efforts

## 🔍 Detailed Memory Monitoring Implementation

To precisely identify the memory growth pattern, we need to implement targeted monitoring. Here's the implementation we recommend:

### 1. Real-time Memory Tracing Script

```bash
#!/bin/bash
# memory_tracer.sh - Track detailed memory metrics until OOM

# Start a single agent for focused testing
AGENT_NAME="eth_memelord_9000"
PORT=3000

# Prepare logging
mkdir -p memory_logs
LOG_FILE="memory_logs/memory_trace_${AGENT_NAME}_$(date +%s).log"
POLL_INTERVAL=1 # seconds

echo "Starting memory tracer for $AGENT_NAME on port $PORT" | tee -a $LOG_FILE
echo "Time,PID,VSZ(KB),RSS(KB),PMEM(%),PCPU(%),Heap(MB),HeapUsed(MB),External(MB),ArrayBuffers(MB)" | tee -a $LOG_FILE

# Add memory reporting to TelegramMultiAgentPlugin.js by patching it
echo "Patching TelegramMultiAgentPlugin.ts with memory reporting..."
# (Patching implementation)

# Start the agent with additional debug flags
NODE_OPTIONS="--max-old-space-size=768 --expose-gc --inspect=9229" \
FORCE_GC=1 MEMORY_DEBUG=1 pnpm start --character="characters/${AGENT_NAME}.json" \
       --clients=@elizaos-plugins/client-telegram \
       --plugins=@elizaos/telegram-multiagent \
       --log-level=debug \
       --port=$PORT &

AGENT_PID=$!
echo "Agent started with PID: $AGENT_PID" | tee -a $LOG_FILE

# Monitor memory usage until process dies
while kill -0 $AGENT_PID 2>/dev/null; do
    # Get detailed memory stats
    PS_STATS=$(ps -o pid,vsz,rss,pmem,pcpu,cmd -p $AGENT_PID --no-headers)
    
    # Try to get Node.js heap stats through exposed API
    NODE_STATS=$(curl -s http://localhost:9229/json/list | jq '.[0].id' | xargs -I{} curl -s http://localhost:9229/json/heap/stats/{} 2>/dev/null)
    
    HEAP_TOTAL=$(echo "$NODE_STATS" | jq -r '.total_heap_size / 1024 / 1024' 2>/dev/null || echo "N/A")
    HEAP_USED=$(echo "$NODE_STATS" | jq -r '.used_heap_size / 1024 / 1024' 2>/dev/null || echo "N/A")
    EXTERNAL_MEM=$(echo "$NODE_STATS" | jq -r '.external_memory / 1024 / 1024' 2>/dev/null || echo "N/A")
    ARRAY_BUFFERS=$(echo "$NODE_STATS" | jq -r '.array_buffers_size / 1024 / 1024' 2>/dev/null || echo "N/A")
    
    TIMESTAMP=$(date +"%H:%M:%S.%N" | cut -c1-12)
    
    echo "$TIMESTAMP,$PS_STATS,$HEAP_TOTAL,$HEAP_USED,$EXTERNAL_MEM,$ARRAY_BUFFERS" | tee -a $LOG_FILE
    
    # Also check OOM killer messages
    OOM_MSGS=$(dmesg | grep -i "Out of memory\|killed process" | tail -1)
    if [ ! -z "$OOM_MSGS" ]; then
        echo "OOM KILLER MESSAGE: $OOM_MSGS" | tee -a $LOG_FILE
    fi
    
    sleep $POLL_INTERVAL
done

echo "Process $AGENT_PID terminated at $(date +"%H:%M:%S")" | tee -a $LOG_FILE

# Capture final kernel messages
echo "Final OOM messages:" | tee -a $LOG_FILE
dmesg | grep -i "Out of memory\|killed process" | tail -5 | tee -a $LOG_FILE
```

### 2. Heap Snapshot Analysis

```bash
#!/bin/bash
# heap_profiler.sh - Take heap snapshots to identify memory leaks

AGENT_NAME="eth_memelord_9000"
PORT=3000
SNAPSHOT_DIR="heap_snapshots"
mkdir -p $SNAPSHOT_DIR

# Start agent with Inspector
NODE_OPTIONS="--max-old-space-size=768 --expose-gc --inspect=9229" \
FORCE_GC=1 pnpm start --character="characters/${AGENT_NAME}.json" \
         --clients=@elizaos-plugins/client-telegram \
         --plugins=@elizaos/telegram-multiagent \
         --log-level=debug \
         --port=$PORT &

AGENT_PID=$!
echo "Agent started with PID: $AGENT_PID"
echo "Connect to chrome://inspect to take manual heap snapshots"

# Take automated heap snapshots
SNAPSHOT_INTERVAL=30 # seconds
COUNTER=1

while kill -0 $AGENT_PID 2>/dev/null; do
    echo "Taking snapshot $COUNTER after ${SNAPSHOT_INTERVAL}s..."
    sleep $SNAPSHOT_INTERVAL
    
    # Use Chrome DevTools Protocol to take heap snapshot
    curl -s -X POST "http://localhost:9229/json/list" | jq -r '.[0].id' | xargs -I{} \
      curl -s -X POST "http://localhost:9229/json/HeapProfiler.takeHeapSnapshot/{}" \
      -o "$SNAPSHOT_DIR/snapshot_${COUNTER}_$(date +%s).heapsnapshot" 
      
    echo "Heap snapshot $COUNTER saved"
    COUNTER=$((COUNTER+1))
    
    # Force GC to see if memory can be recovered
    curl -s -X POST "http://localhost:9229/json/list" | jq -r '.[0].id' | xargs -I{} \
      curl -s -X POST "http://localhost:9229/json/HeapProfiler.collectGarbage/{}"
    echo "Garbage collection forced"
done

echo "Process terminated. Snapshots available in $SNAPSHOT_DIR"
```

### 3. Memory Leak Investigation via Node.js Profiling

```javascript
// Add to TelegramMultiAgentPlugin.ts
private reportMemoryUsage(): void {
  if (process.memoryUsage) {
    const memUsage = process.memoryUsage();
    this.logger.info(`[MEMORY] Usage: RSS=${Math.round(memUsage.rss/1024/1024)}MB, ` +
                     `Heap=${Math.round(memUsage.heapTotal/1024/1024)}MB, ` +
                     `Used=${Math.round(memUsage.heapUsed/1024/1024)}MB, ` +
                     `External=${Math.round(memUsage.external/1024/1024)}MB, ` + 
                     `ArrayBuffers=${Math.round(memUsage.arrayBuffers/1024/1024)}MB`);
  }
}

// Call before and after each polling operation
private async startRelayPolling(): Promise<void> {
  // ... existing code

  this.checkIntervalId = setInterval(async () => {
    this.reportMemoryUsage(); // Report BEFORE polling
    
    try {
      // Existing polling code
    } catch (err) {
      // Error handling
    } finally {
      this.reportMemoryUsage(); // Report AFTER polling
      
      // Check for abnormal growth
      const currentMemory = process.memoryUsage().rss;
      if (!this._lastMemoryUsage) {
        this._lastMemoryUsage = currentMemory;
      } else {
        const growth = currentMemory - this._lastMemoryUsage;
        if (growth > 1024 * 1024 * 5) { // More than 5MB growth
          this.logger.warn(`[MEMORY] Abnormal growth detected: +${Math.round(growth/1024/1024)}MB`);
        }
        this._lastMemoryUsage = currentMemory;
      }
    }
  }, this.config.pollingIntervalMs || 2000);
}
```

## 🔧 Recommended Solutions

Based on the above analysis, we recommend implementing the following solutions:

### 1. Replace Polling with WebSockets

The continuous polling pattern appears to be the primary culprit for memory growth. Replacing this with a WebSocket connection would significantly reduce memory overhead:

```javascript
// Implement in TelegramMultiAgentPlugin.ts
private startRelayWebSocket(): void {
  const wsUrl = this.config.relayServerUrl.replace('http://', 'ws://').replace('https://', 'wss://');
  const fullWsUrl = `${wsUrl}/ws?agent_id=${this.agentId}&token=${this.config.authToken}`;
  
  this.logger.info(`[RELAY] Connecting to WebSocket: ${wsUrl}/ws`);
  
  const connectWebSocket = () => {
    const ws = new WebSocket(fullWsUrl);
    
    ws.onopen = () => {
      this.logger.info(`[RELAY] WebSocket connected`);
      
      // Send initial heartbeat
      ws.send(JSON.stringify({ type: 'heartbeat', agent_id: this.agentId }));
      
      // Set up regular heartbeats
      const heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'heartbeat', agent_id: this.agentId }));
        }
      }, 30000); // 30 second heartbeat
      
      // Store for cleanup
      this._wsHeartbeatInterval = heartbeatInterval;
    };
    
    ws.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.messages && data.messages.length > 0) {
          await this.processRelayUpdates(data);
          
          // Force garbage collection after processing
          if (global.gc) global.gc();
        }
      } catch (err) {
        this.logger.error(`[RELAY] Error processing WebSocket message: ${err.message}`);
      }
    };
    
    ws.onclose = () => {
      this.logger.warn(`[RELAY] WebSocket connection closed, attempting to reconnect...`);
      clearInterval(this._wsHeartbeatInterval);
      
      // Reconnect with exponential backoff
      setTimeout(connectWebSocket, this._wsReconnectDelay);
      this._wsReconnectDelay = Math.min(30000, this._wsReconnectDelay * 1.5);
    };
    
    ws.onerror = (error) => {
      this.logger.error(`[RELAY] WebSocket error: ${error.message}`);
    };
    
    this._ws = ws;
  };
  
  // Initialize reconnect delay
  this._wsReconnectDelay = 1000;
  
  // Start connection
  connectWebSocket();
}

// Also implement cleanup
public async cleanup(): Promise<void> {
  if (this._ws) {
    this.logger.info(`[RELAY] Closing WebSocket connection`);
    this._ws.close();
    this._ws = null;
  }
  
  if (this._wsHeartbeatInterval) {
    clearInterval(this._wsHeartbeatInterval);
    this._wsHeartbeatInterval = null;
  }
  
  // Force GC on cleanup
  if (global.gc) global.gc();
}
```

### 2. Implement Exponential Backoff for Polling

If WebSockets aren't feasible, implement exponential backoff for polling:

```javascript
// Replace polling mechanism in TelegramMultiAgentPlugin.ts
private startRelayPolling(): void {
  if (this.checkIntervalId) {
    clearInterval(this.checkIntervalId);
    this.checkIntervalId = null;
  }
  
  let pollInterval = 2000; // Start with 2 seconds
  let failureCount = 0;
  
  const poll = async () => {
    // Force GC before polling
    if (global.gc) global.gc();
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.config.relayServerUrl}/getUpdates?agent_id=${this.agentId}`, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.authToken}`
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Process messages
      if (data?.messages && data.messages.length > 0) {
        await this.processRelayUpdates(data);
      }
      
      // Aggressive cleanup
      if (data && data.messages) {
        // Explicitly null each message object
        for (let i = 0; i < data.messages.length; i++) {
          data.messages[i] = null;
        }
        data.messages = null;
      }
      
      // Reset failure count on success
      failureCount = 0;
      pollInterval = 2000; // Reset to base interval
    } catch (err) {
      failureCount++;
      this.logger.error(`[RELAY] Polling error: ${err.message}`);
      
      // Increase poll interval with exponential backoff (max 30 seconds)
      pollInterval = Math.min(30000, pollInterval * 1.5);
    }
    
    // Force GC after polling
    if (global.gc) global.gc();
    
    // Schedule next poll using dynamic interval
    this.checkIntervalId = setTimeout(poll, pollInterval);
  };
  
  // Start polling
  poll();
}
```

### 3. Implement Stricter Memory Management

Add more aggressive memory management throughout the agent lifecycle:

```javascript
// Add to TelegramMultiAgentPlugin.ts
private cleanupMemory(): void {
  // Clear any object caches
  this._messageCache = {};
  this._pendingMessages = [];
  
  // Clear references to temporary data
  this._lastPollingData = null;
  this._tempStorage = null;
  
  // Clear closures
  this._callbacks = {};
  
  // Force multiple garbage collections
  if (global.gc) {
    global.gc();
    setTimeout(() => global.gc(), 100);
    setTimeout(() => global.gc(), 500);
  }
}

// Add periodic memory cleanup
setInterval(() => {
  this.logger.debug('[MEMORY] Running scheduled memory cleanup');
  this.cleanupMemory();
}, 60000); // Every minute
```

### 4. Reduce In-Memory Queue Sizes

Lower the maximum memory threshold for queues:

```javascript
// Modify FallbackMemoryManager.ts
this.maxMemories = 100; // Down from 1000
```

### 5. Single Agent Testing

Run a single agent with extreme memory debugging to isolate the issue:

```bash
#!/bin/bash
# Run a single agent with extensive memory debugging

# Create memory monitoring directory
mkdir -p memory_debug

# Set up memory flags
export NODE_OPTIONS="--max-old-space-size=768 --expose-gc --trace-gc --trace-gc-verbose"
export FORCE_GC=1
export DEBUG_MEMORY=1

# Run a single agent
echo "Starting single agent with memory debugging..."
pnpm start --character="characters/eth_memelord_9000.json" \
         --clients=@elizaos-plugins/client-telegram \
         --plugins=@elizaos/telegram-multiagent \
         --log-level=debug \
         --port=3000 \
         2>&1 | tee memory_debug/agent_debug_$(date +%s).log
```

## ❓ Questions for ElizaOS Expert

1. **Memory Management Architecture**:
   - How does ElizaOS handle memory for long-running network operations?
   - Are there known memory leak patterns in the ElizaOS framework, especially with fetch or networking?
   - Does the ElizaOS runtime have any special memory tracking tools or APIs?

2. **Polling Best Practices**:
   - What's the recommended pattern for implementing polling in ElizaOS agents?
   - Are there any alternatives to HTTP polling that would be more memory-efficient?
   - Are there specific memory management techniques recommended for polling patterns?

3. **Specific ElizaOS Tuning**:
   - Are there specific Node.js flags that work best with ElizaOS for memory-constrained environments?
   - Is there a recommended maximum agent count per server for our hardware specifications?
   - Are there ElizaOS-specific configuration options to improve garbage collection?

## 🚀 Conclusion

The exit code 137 issue affecting our ElizaOS Multi-Agent Telegram System is a classic case of memory exhaustion, but with unusual characteristics given the low reported memory usage before termination. By implementing the detailed memory monitoring scripts in this report, we'll be able to precisely identify where memory is growing and why it's not being properly released.

Our recommended approach is to:

1. **Monitor** - Implement the memory tracing scripts to capture detailed metrics
2. **Analyze** - Use heap snapshots to identify memory growth patterns
3. **Replace** - Switch from polling to WebSockets if possible
4. **Refine** - Implement exponential backoff and stricter memory management
5. **Optimize** - Tune memory limits based on findings from monitoring

These steps should help us identify and resolve the persistent exit code 137 issues, allowing the agents to run for extended periods without memory exhaustion.

---

## 📚 References

1. [Understanding and Troubleshooting Out-of-Memory Error Code 137](https://www.stackstate.com/blog/understanding-and-troubleshooting-out-of-memory-error-code-137/)
2. [What Exit Code 137 means for Kubernetes](https://refine.dev/blog/kubernetes-exit-code-137/)
3. [Kubernetes Troubleshooting: Exit Code 137](https://www.groundcover.com/kubernetes-troubleshooting/exit-code-137) 