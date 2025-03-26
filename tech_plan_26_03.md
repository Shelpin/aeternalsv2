# 🚀 Aeternals: Autonomous Telegram Bot Network - Technical Plan (26-03-2025)

## 1. Executive Summary

This document builds upon the previous technical plan (24-03-2025) and outlines the recent advancements, current status, and next steps for the ElizaOS Multi-Agent Telegram System (Aeternals). The primary objective remains to create a network of AI agents that can engage in autonomous, natural conversations with each other and with human users in Telegram groups.

**Major Progress Since Last Technical Plan (24-03):**

1. **Critical Relay Server Fix Implemented**: 
   - Resolved the persistent failure of agents to register with the relay server
   - Implemented auto-registration during heartbeat, allowing agents to reconnect seamlessly
   - Enhanced the health endpoint with detailed agent status information

2. **Inter-Agent Communication Validated**:
   - Verified successful message exchange between multiple agents
   - Confirmed proper message delivery with mention detection
   - Demonstrated multi-party conversations with three agents

3. **System Resilience Improvements**:
   - Added better error handling for agent registration
   - Implemented more robust connection verification
   - Created advanced logging for system diagnostics

Despite these advancements, we still face a critical dependency issue preventing the ElizaOS runtime from initializing properly - the `@elizaos/core` package cannot be found in the current environment.

**Key Next Steps:**
- Resolve the ElizaOS core dependency issue
- Complete the integration between relay server and agent runtime
- Validate full end-to-end communication with actual running agents

This document updates the implementation roadmap and technical details based on our recent findings and successful fixes.

## 2. Project Context & Current State

### 2.1 Core Infrastructure Assessment

| Component | Status (24-03) | Status (26-03) | Progress | Notes |
|-----------|--------|---------|----------|-------|
| **Plugin Architecture** | ⚠️ In Progress | ⚠️ In Progress | 85% | Core architecture implemented but runtime access issue persists |
| **Relay Server** | ✅ Operational | ✅ Enhanced | 100% | Fixed auto-registration and improved health monitoring |
| **Agent Management** | ✅ Operational | ✅ Operational | 100% | Process management working properly |
| **SQLite Integration** | ✅ Operational | ✅ Operational | 100% | Proper imports with better-sqlite3 (ESM compatible) |
| **Telegram Integration** | ✅ Operational | ✅ Operational | 100% | Direct API for responses works correctly |
| **Message Processing** | ⚠️ In Progress | ⚠️ In Progress | 80% | Message processing logic works but agents can't access runtime for responses |
| **Build System** | ✅ Operational | ✅ Operational | 100% | TypeScript/ESM configuration properly set up |
| **Runtime Registration** | ❌ Not Working | ⚠️ Partial | 85% | Relay server registration fixed, but runtime dependency issue remains |
| **Memory Integration** | ❌ Not Working | ❌ Not Working | 70% | Cannot access memory due to runtime dependency issues |
| **Error Handling** | ⚠️ Partial | ✅ Enhanced | 90% | Improved error handling in relay server and plugin connection |

### 2.2 Conversation Features Assessment

| Feature | Status (24-03) | Status (26-03) | Notes |
|---------|--------|---------|-------|
| **Bot-to-Bot Communication** | ❌ Not Working | ✅ Verified | Relay server properly routes messages between agents |
| **Message Relay** | ✅ Operational | ✅ Enhanced | Added auto-registration and better connection resilience |
| **Tag Detection** | ✅ Operational | ✅ Operational | Properly detects mentions in messages |
| **Conversation Flow** | ⚠️ Partial | ⚠️ Partial | Basic structure implemented |
| **Personality Enhancement** | ⚠️ Partial | ⚠️ Partial | Refactored with proper runtime access pattern |
| **Typing Simulation** | ⚠️ Partial | ⚠️ Partial | Simple system implemented |
| **Conversation Kickstarting** | ❌ Not Working | ❌ Not Working | Dependent on runtime access |
| **Auto-posting** | ❌ Not Implemented | ❌ Not Implemented | Could enhance autonomous nature |
| **User Engagement Tracking** | ❌ Not Implemented | ❌ Not Implemented | Would improve conversation quality |
| **Advanced Conversation Management** | ❌ Not Implemented | ❌ Not Implemented | Needed for more natural interactions |

### 2.3 Current Implementation Status

- **New Operational Components (26-03)**:
  - Auto-registration during heartbeat mechanism
  - Enhanced registration endpoint with better error handling
  - Improved health endpoint with detailed agent status information
  - Bot-to-bot message routing through the relay server
  - Successful verification of multi-agent conversations
  - Advanced logging for relay server operations
  - Enhanced relay server validation in startup scripts

- **Recently Enhanced Components**:
  - Relay server registration and heartbeat system
  - Message routing and delivery
  - Agent status monitoring
  - Error handling and reporting
  - System diagnostic capabilities
  - Plugin initialization and restart processes

- **Still Pending Resolution**:
  - The `@elizaos/core` dependency issue preventing runtime initialization
  - Full integration between fixed relay server and running agents
  - Integration between agent runtime and memory system
  - Conversation kickstarting with actual agents

### 2.4 Recent Architectural Improvements

In addition to the previously implemented architectural improvements, we've made significant enhancements to the relay server architecture:

1. **Auto-Registration System**:
   - Created heartbeat endpoint with automatic agent registration
   - Implemented connection recovery for agents that lose registration
   - Added notification system for other agents when new agents register
   - Enhanced connection tracking with timestamps

2. **Improved Monitoring**:
   - Enhanced health endpoint with detailed agent information
   - Added agent status tracking with last seen timestamps
   - Implemented better cleanup for inactive agents
   - Created robust logging throughout the registration process

3. **Message Routing Enhancements**:
   - Improved target agent resolution with better error handling
   - Enhanced message queue management
   - Added support for group broadcasting
   - Better handling of message formats and validations

### 2.5 Critical Issues Status

#### 2.5.1 Previously Identified Issues & Status

1. **Runtime Method Access Issue**:
   - **Status (24-03)**: Critical issue preventing agent operation
   - **Status (26-03)**: Still pending but less critical as relay server now works independently
   - **Resolution Path**: Will be addressed after dependency issue is resolved

2. **Plugin Loading Sequence**:
   - **Status (24-03)**: Order of initialization creating problems
   - **Status (26-03)**: Still relevant but testing delayed until runtime dependency fixed
   - **Resolution Path**: Will implement adapter pattern once runtime is available

3. **Prototype Chain Issue**:
   - **Status (24-03)**: Methods available in prototype but not accessible
   - **Status (26-03)**: Remains an issue but testing delayed
   - **Resolution Path**: Will implement adapter pattern as previously designed

#### 2.5.2 New Critical Issue

4. **ElizaOS Core Dependency Missing**:
   - **Status**: Critical - prevents agent startup
   - **Error**: `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@elizaos/core'`
   - **Impact**: Agents cannot initialize, preventing full system testing
   - **Resolution Path**: Need to properly install or link the missing package

### 2.6 Solutions Implemented and Validated

#### 2.6.1 Relay Server Auto-Registration

The following solution was implemented and successfully validated:

```javascript
// Send a heartbeat to keep the connection alive
app.post('/heartbeat', (req, res) => {
  const { agent_id } = req.body;
  
  if (!agent_id) {
    logWithTime(`❌ Heartbeat failed: Missing agent_id`);
    return res.json({ success: false, error: 'Missing agent_id' });
  }
  
  // Check if agent exists
  const agent = connectedAgents.get(agent_id);
  if (!agent) {
    logWithTime(`⚠️ Heartbeat for unregistered agent: ${agent_id}. Auto-registering...`);
    
    // Auto-register the agent
    connectedAgents.set(agent_id, { 
      token: 'via-auto-register',
      lastSeen: Date.now(),
      updateOffset: 0
    });
    
    // Initialize message queue for this agent
    if (!messageQueue.has(agent_id)) {
      messageQueue.set(agent_id, []);
    }
    
    logWithTime(`✅ Agent auto-registered during heartbeat: ${agent_id}`);
    
    // Notify other agents about the new agent
    for (const [id, messages] of messageQueue.entries()) {
      if (id !== agent_id) {
        messages.push({
          update_id: updateId++,
          agent_updates: [{ agent_id, status: 'connected' }]
        });
      }
    }
    
    return res.json({ 
      success: true,
      auto_registered: true
    });
  }
  
  // Update last seen time
  agent.lastSeen = Date.now();
  
  return res.json({ success: true });
});
```

This implementation successfully:
- Detects unregistered agents attempting to send heartbeats
- Auto-registers them within the relay server
- Creates the necessary message queue for the agent
- Notifies other agents about the new connection
- Updates the last seen timestamp for tracking

#### 2.6.2 Enhanced Health Monitoring

The improved health endpoint provides detailed information about agent status:

```javascript
// Health check endpoint
app.get('/health', (req, res) => {
  // Get a list of all registered agents with their last seen timestamp
  const agentDetails = Array.from(connectedAgents.entries()).map(([id, data]) => ({
    id,
    last_seen: new Date(data.lastSeen).toISOString(),
    age_seconds: Math.floor((Date.now() - data.lastSeen) / 1000)
  }));
  
  // Get a list of just the agent IDs
  const agentsList = agentDetails.map(agent => agent.id);
  
  logWithTime(`ℹ️ Health check - Agents online: ${connectedAgents.size}`);
  
  return res.json({ 
    status: 'ok', 
    agents: connectedAgents.size,
    agents_list: agentsList,
    agents_details: agentDetails,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.1.0-valhalla'
  });
});
```

This enhanced endpoint now provides:
- Total number of connected agents
- Complete list of agent IDs
- Detailed agent information including last seen timestamps
- Age of each agent's last activity in seconds
- Server uptime and version information

### 2.7 Value Proposition (Updated)

The system now provides these improved benefits:
- **Enhanced Reliability**: Agents can recover from connection issues automatically
- **Improved Monitoring**: Better visibility into agent status and system health
- **Resilient Communication**: Messages are reliably delivered between agents
- **Easier Maintenance**: Better diagnostics and error reporting
- **Autonomous Operation**: System can recover from many failure modes without intervention

## 3. Technical Details

### 3.1 Agent Configuration

The agent configuration remains consistent with the previous technical plan, using port files in the `/root/eliza/ports` directory.

### 3.2 Key Architectural Patterns

#### 3.2.1 New Auto-Registration Pattern

The auto-registration pattern follows these steps:

1. Agent sends a heartbeat to the relay server
2. Server checks if the agent is registered
3. If not registered, server automatically creates a registration
4. Server initializes necessary data structures for the agent
5. Server notifies other agents about the new connection
6. Server confirms registration to the agent

This pattern eliminates the need for explicit registration before sending heartbeats, making the system more resilient to connection issues and restart scenarios.

#### 3.2.2 Enhanced Error Handling Pattern

The enhanced error handling pattern includes:

1. More detailed error reporting with specific error codes
2. Automatic recovery attempts for common failure modes
3. Tiered fallback strategies for critical operations
4. Comprehensive logging with timestamps and context
5. Better validation of input parameters

### 3.3 Bot-to-Bot Communication Implementation (Updated)

The bot-to-bot communication flow has been enhanced:

1. **Agent Heartbeat with Auto-Registration**:
   ```javascript
   // Send heartbeat with auto-registration fallback
   await fetch(`${relayServerUrl}/heartbeat`, {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'Authorization': `Bearer ${authToken}`
     },
     body: JSON.stringify({
       agent_id: agentId
     })
   }).then(response => response.json())
     .then(data => {
       if (data.auto_registered) {
         logger.info(`Agent was auto-registered during heartbeat: ${agentId}`);
       }
     });
   ```

2. **Enhanced Message Relay**:
   ```javascript
   // Send message via relay server with improved error handling
   try {
     const response = await fetch(`${relayServerUrl}/sendMessage`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${authToken}`
       },
       body: JSON.stringify({
         agent_id: agentId,
         chat_id: chatId,
         text: text
       })
     });
     
     const data = await response.json();
     
     if (data.success) {
       logger.info(`Message sent successfully to ${data.recipient_count} recipients`);
       return true;
     } else {
       logger.error(`Failed to send message: ${data.error}`);
       // Try to recover from common errors
       if (data.error === 'Agent not registered') {
         // Attempt re-registration
         logger.info('Attempting to re-register agent');
         return await registerAndRetry();
       }
       return false;
     }
   } catch (error) {
     logger.error(`Error sending message: ${error.message}`);
     return false;
   }
   ```

3. **Improved Update Retrieval**:
   ```javascript
   // Get updates with better error handling
   try {
     const response = await fetch(
       `${relayServerUrl}/getUpdates?agent_id=${encodeURIComponent(agentId)}`,
       {
         headers: {
           'Authorization': `Bearer ${authToken}`
         }
       }
     );
     
     const data = await response.json();
     
     if (data.success) {
       if (data.messages && data.messages.length > 0) {
         logger.info(`Received ${data.messages.length} updates`);
         return data.messages;
       }
       return [];
     } else {
       logger.error(`Failed to get updates: ${data.error}`);
       return [];
     }
   } catch (error) {
     logger.error(`Error getting updates: ${error.message}`);
     return [];
   }
   ```

### 3.4 Current Build Process

The build process remains consistent with the previous technical plan.

## 4. Critical Issues & Solutions (Updated)

### 4.1 Resolved Issue: Relay Registration

The critical relay registration issue has been resolved with the auto-registration implementation. Agents that attempt to send heartbeats but are not registered will now be automatically registered by the relay server.

### 4.2 Current Critical Issue: ElizaOS Core Dependency

The most pressing issue is now the missing `@elizaos/core` dependency:

```
❌ Error applying patches: Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@elizaos/core' imported from /root/eliza/patches/runtime-patch.js
```

Potential solutions include:

1. **Local Installation**:
   ```bash
   cd /root/eliza
   npm install @elizaos/core
   ```

2. **Local Package Creation**:
   ```bash
   cd /root/eliza
   mkdir -p node_modules/@elizaos/core
   # Create minimal implementation
   ```

3. **Path Configuration**:
   ```javascript
   // Add to runtime-patch.js
   import { createRequire } from 'module';
   const require = createRequire(import.meta.url);
   const path = require('path');
   
   // Add custom resolution path
   import { addPath } from 'module-alias';
   addPath(path.join(__dirname, '../custom_modules'));
   ```

4. **Module Mocking**:
   ```javascript
   // Create a mock implementation
   import * as coreModule from './mock-elizaos-core.js';
   globalThis.__elizaCoreModule = coreModule;
   ```

### 4.3 Runtime Access with Adapter Pattern

The previously designed adapter pattern solution remains the recommended approach for the runtime access issue, once the dependency issue is resolved:

```typescript
/**
 * Create a runtime wrapper that adapts the actual runtime structure 
 * to match the expected IAgentRuntime interface
 */
protected createRuntimeWrapper(runtime: any): IAgentRuntime {
  // Create a wrapper that adapts the actual runtime structure to our expected interface
  return {
    // Direct property access for ID
    getAgentId: () => runtime.agentId,
    
    // Create logger wrapper
    getLogger: (name: string) => {
      // If there's a logging system available, use it
      if (runtime.logger || runtime.loggerService) {
        return (runtime.logger || runtime.loggerService).getLogger(name);
      }
      
      // Fallback to console logging
      return {
        trace: (message: string, ...args: any[]) => console.log(`[TRACE] ${name}: ${message}`, ...args),
        debug: (message: string, ...args: any[]) => console.log(`[DEBUG] ${name}: ${message}`, ...args),
        info: (message: string, ...args: any[]) => console.log(`[INFO] ${name}: ${message}`, ...args),
        warn: (message: string, ...args: any[]) => console.warn(`[WARN] ${name}: ${message}`, ...args),
        error: (message: string, ...args: any[]) => console.error(`[ERROR] ${name}: ${message}`, ...args)
      };
    },
    
    // Pass through existing properties
    ...runtime
  };
}
```

## 5. Next Steps and Roadmap (Updated)

### 5.1 Immediate Action Items (1-2 days)

1. **Resolve ElizaOS Core Dependency Issue**:
   - Investigate package structure and requirements
   - Implement one of the proposed solutions for the missing dependency
   - Validate that agents can start with the core dependency resolved
   - Document the solution for future reference

2. **Complete Runtime Integration**:
   - Implement the adapter pattern for runtime access
   - Enable proper agent startup with the relay server
   - Validate registration and heartbeat with actual running agents
   - Test message exchange with runtime-powered agents

3. **Full End-to-End Testing**:
   - Start multiple agents with the updated system
   - Verify automatic registration and heartbeat
   - Test message exchange between running agents
   - Validate conversation flow with actual agent processing

### 5.2 Medium-Term Improvements (2-7 days)

1. **Enhance Conversation Quality**:
   - Fine-tune conversation kickstarting parameters
   - Adjust response probabilities for more natural conversations
   - Implement better conversation topic selection

2. **Add Conversation Flow Features**:
   - Implement multi-turn conversations
   - Add support for different conversation styles
   - Create topic-focused discussions

3. **Improve Agent Personalities**:
   - Enhance personality differentiation between agents
   - Implement interest-based response weighting
   - Add personality-specific conversation starters

### 5.3 Long-Term Vision (1-2 weeks)

The long-term vision remains consistent with the previous technical plan.

## 6. Technical Debt (Updated)

### 6.1 Current Technical Debt

1. **Auto-Registration Temporary Token**:
   - The auto-registration currently uses a fixed token ('via-auto-register')
   - A proper token management system is needed for security
   - Token validation should be enhanced

2. **Hard-coded Values**:
   - Several hard-coded values still exist in the codebase
   - Configuration should be externalized properly
   - Environment variables should be used consistently

3. **Error Handling in Agent Runtime**:
   - Error handling for the core dependency issue is limited
   - Better diagnostics needed for module resolution problems
   - Recovery mechanisms for failed agent startup are minimal

4. **Test Coverage**:
   - While the relay server has been manually tested, automated tests are missing
   - End-to-end tests for the complete system are needed
   - Component-level tests would improve reliability

### 6.2 Debt Reduction Plan

1. **Short-Term (1-2 days)**:
   - Document all workarounds implemented for the core dependency issue
   - Create a list of hard-coded values that need to be externalized
   - Improve error handling for agent startup failures

2. **Medium-Term (3-7 days)**:
   - Replace fixed 'via-auto-register' token with proper token management
   - Create a configuration management system for the relay server
   - Add basic automated tests for core functionality

3. **Long-Term (1-2 weeks)**:
   - Implement comprehensive error handling and recovery
   - Create a full suite of automated tests
   - Refactor for better maintainability and extensibility

## 7. Questions for ElizaOS Expert (Updated)

To properly resolve the remaining issues, we need answers to the following questions:

### 7.1 Questions on ElizaOS Core Dependency

1. **Core Package Structure**:
   - What is the correct path to install or link the `@elizaos/core` package?
   - Is this package available in a public or private repository?
   - What version of the package is required for compatibility?

2. **Module Resolution**:
   - How should the module resolution be configured for ElizaOS packages?
   - Are there specific environment variables needed for proper resolution?
   - Is there a specific build or installation step required?

3. **Package Dependencies**:
   - What are the dependencies of the `@elizaos/core` package?
   - Are there other related packages that need to be installed?
   - Is there a known compatibility issue with the current Node.js version?

### 7.2 Original Questions on Runtime Methods

The questions from the previous technical plan regarding runtime method access remain relevant and will be addressed once the dependency issue is resolved.

## 8. Conclusion

The ElizaOS Multi-Agent Telegram System (Aeternals) has made significant progress with the resolution of the critical relay server registration issue. The implementation of auto-registration during heartbeat operations has greatly improved system resilience and simplified the agent connection process.

While we've successfully demonstrated inter-agent communication through the relay server, the system is not yet fully operational due to the unresolved `@elizaos/core` dependency issue that prevents agent processes from starting properly.

Our next immediate focus is to resolve this dependency issue, which will allow us to implement the previously designed adapter pattern solution for runtime access. Once these final technical hurdles are overcome, we'll be able to demonstrate the full capabilities of the autonomous agent network in Telegram.

The successful resolution of the relay server issues provides a strong foundation for the remaining work, as it proves that our inter-agent communication architecture is sound. The lessons learned from fixing these issues have informed our approach to the remaining challenges, particularly around error handling and system resilience.

With the completion of the immediate action items outlined in this plan, the Aeternals system will provide a compelling demonstration of autonomous agent technology in a real-world social media environment. 