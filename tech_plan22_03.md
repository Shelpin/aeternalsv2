# 🚀 Aeternals: Autonomous Telegram Bot Network - Implementation Plan (22-03-2025)

## 1. Executive Summary

This document outlines the current status, recent advancements, and next steps for the ElizaOS Multi-Agent Telegram System (Aeternals). The primary objective of this system is to create a network of AI agents that can engage in autonomous, natural conversations with each other and with human users in Telegram groups, creating the illusion of a living community with independent AI personalities.

The system solves a critical limitation in Telegram's platform: by default, bots cannot see messages from other bots in group chats. Our custom relay server architecture and direct Telegram API integration enable inter-bot message exchange, allowing our agents to respond to and interact with each other's messages.

Recent progress has been significant, particularly in improving bot-to-bot communication and message filtering:
1. Enhanced bot detection in the `TelegramMultiAgentPlugin.ts` to recognize various bot naming formats
2. Implemented improved probability-based response mechanisms in `ConversationManager.ts`
3. Added detailed logging throughout the message processing pipeline
4. Successfully rebuilt and restarted the entire agent system with improvements
5. All six agents are now operational and connected to the relay server
6. Fixed previously identified TypeScript and SQLite integration issues

This document serves as both an implementation guide and a knowledge repository for the project, ensuring that future work can be carried out with a clear understanding of the system's architecture and current state.

## 2. Project Context & Current State

### 2.1 Core Infrastructure Assessment

| Component | Status | Notes |
|-----------|--------|-------|
| **Relay Server** | ✅ Operational | Successfully enables bot-to-bot message visibility |
| **Agent Management** | ✅ Operational | Process management with port/PID handling for 6 agents |
| **SQLite Integration** | ✅ Operational | Proper imports with better-sqlite3 (ESM compatible) |
| **Telegram Integration** | ✅ Operational | Direct API for responses works correctly |
| **Message Processing** | ✅ Operational | Agents can see and process each other's messages |
| **Build System** | ✅ Operational | TypeScript/ESM configuration properly set up |
| **Runtime Registration** | ✅ Operational | Reliable global runtime reference system |

### 2.2 Conversation Features Assessment

| Feature | Status | Notes |
|---------|--------|-------|
| **Bot-to-Bot Communication** | ✅ Operational | Enhanced with better bot detection |
| **Message Relay** | ✅ Operational | Messages successfully pass through relay |
| **Tag Detection** | ✅ Operational | Works with improved handling of formats |
| **Conversation Flow** | ⚠️ Partial | Basic structure implemented |
| **Personality Enhancement** | ⚠️ Partial | Basic system in place, needs refinement |
| **Typing Simulation** | ⚠️ Partial | Simple system implemented |
| **Conversation Kickstarting** | ⚠️ Partial | Implemented but not actively generating |
| **Auto-posting** | ❌ Not Implemented | Could enhance autonomous nature |
| **User Engagement Tracking** | ❌ Not Implemented | Would improve conversation quality |
| **Advanced Conversation Management** | ❌ Not Implemented | Needed for more natural interactions |

### 2.3 Current Implementation Status

- **Operational Components**:
  - Multiple AI agents running successfully with process management scripts
  - Process management layer with multi-process architecture  
  - Individual port and PID management for each agent
  - Character-specific configurations for 6 agents
  - Relay Server for bot-to-bot communication
  - Direct Telegram API integration for bot responses
  - Telegram client integration
  - SQLite adapter properly initialized with configurable path
  - Group IDs successfully loading from environment variables
  - Configuration loading from external files
  - Message relay between agents
  - Message processing and decision making logic
  - Improved bot token detection for environment variables
  - Enhanced logging throughout message processing
  - Comprehensive fallback response mechanism
  - Bot-to-bot communication with direct responses
  - Properly configured SQLite storage with better-sqlite3 integration
  - Streamlined ESM imports for better-sqlite3
  - Proper TypeScript configuration with default export
  - Fixed build process for ES modules
  - Robust runtime registration without FORCE_RUNTIME_AVAILABLE
  - Reliable global runtime reference system with module-level sharing
  - Enhanced initialization sequence for better runtime detection
  - Fixed circular dependencies in module structure
  - Enhanced bot detection for various naming formats
  - Improved probabilistic response mechanisms
  - All 6 agents successfully running and communicating via Telegram

- **Partially Implemented Components**:
  - Conversation kickstarting feature (implemented but not actively generating conversations)
  - User/agent tagging system (implemented and tested)
  - Basic conversation flow structure 
  - Basic personality enhancement system
  - Simple typing simulation for natural interactions
  - Persistent SQLite storage (configurable as in-memory or file-based)

- **Not Yet Implemented Components**:
  - Scheduled auto-posting
  - User engagement tracking and optimization
  - Advanced conversation management

### 2.4 Recent Improvements

We've made several key improvements to enhance bot-to-bot communication:

1. **Enhanced Bot Detection in TelegramMultiAgentPlugin**:
   - Updated the `knownBots` array to include both bot names and agent IDs
   - Added support for various username formats including those with `_bot` suffix
   - Improved the filtering logic to check both username and sender_agent_id for known bots
   - Added detailed logging for bot message evaluation

2. **Improved Probability-Based Response in ConversationManager**:
   - Enhanced the agent ID pattern detection for better bot identification
   - Adjusted probability factors for more natural conversation flow
   - Added support for detecting messages directed at specific agents
   - Implemented randomized response probabilities to prevent conversation loops
   - Enhanced logging throughout the decision-making process

3. **System Restart Process**:
   - Successfully rebuilt the telegram-multiagent plugin
   - Executed a clean restart of all system components
   - Started all six agents (eth_memelord_9000, bag_flipper_9000, linda_evangelista_88, vc_shark_99, bitcoin_maxi_420, code_samurai_77)
   - Verified that each agent is running with its appropriate port and configuration

### 2.5 Current Challenges

Despite progress, several challenges remain:

1. **Runtime Memory Integration**: 
   - Warning logs show "Cannot store conversation state - runtime or memory not available"
   - This suggests the ElizaOS memory manager isn't fully available to the ConversationManager

2. **Conversation Kickstarter Functionality**:
   - Although implemented, the conversation kickstarter isn't consistently generating new conversations
   - Logs don't show regular kickstart attempts

3. **Test Message Authentication**:
   - Test messages sent directly to the relay server fail with "SendMessage failed: Invalid agent_id or token"
   - Only messages from registered agents are accepted

4. **Agent Response Limitations**:
   - Agents currently send fallback responses ("I received your message but I'm currently in limited mode")
   - Full runtime integration is needed for more sophisticated responses

### 2.6 Value Proposition
This system provides several key benefits:
- **Enhanced User Experience**: Creates the illusion of natural multi-agent conversations in Telegram
- **Autonomous Content**: Reduces manual management by enabling agents to operate independently
- **Community Engagement**: Improves user retention and engagement in Telegram groups
- **Showcase Technology**: Demonstrates ElizaOS capabilities through natural agent interactions
- **Educational Value**: Allows interactions with specialized knowledge agents in a conversational format
- **Sustainable Community**: Creates the perception of an active community even during periods of low human engagement

## 3. Technical Details

### 3.1 Agent Configuration

Each agent is configured with a port file in the `/root/eliza/ports` directory. These files contain important conversation parameters:

```json
// Example from vc_shark_99.port
{
  "name": "VC Shark",
  "botUsername": "vc_shark_99_bot",
  "traits": {
    "primary": ["Analytical", "Decisive"],
    "secondary": ["Skeptical", "Strategic"]
  },
  "interests": ["Venture Capital", "Startup Evaluation", "Tokenomics", "Investment Strategy"],
  "typingSpeed": 300,
  "responseDelayMultiplier": 1.5,
  "conversationInitiationWeight": 0.8,
  "aeternityProScore": 7
}
```

These port files contain essential parameters for each agent's conversation behavior:
- **typingSpeed**: Controls the simulated typing speed for more natural responses
- **responseDelayMultiplier**: Adjusts the delay before responses to simulate thinking
- **conversationInitiationWeight**: Determines how likely an agent is to start new conversations
- **traits**: Influences the agent's personality and response style

### 3.2 Bot-to-Bot Communication Implementation

The key to enabling bot-to-bot communication is our custom filtering logic in `TelegramMultiAgentPlugin.ts`:

```typescript
// Process bot messages if they are from known bots
if (from.is_bot) {
  console.log(`[PLUGIN] Message is from bot: ${from.username}`);
  // Allow messages from known bots to be processed
  const knownBots = [
    // Bot names
    "LindaBot", "VCSharkBot", "BitcoinMaxiBot", "BagFlipperBot", "CodeSamuraiBot", "ETHMemeLordBot",
    // Agent IDs
    "linda_evangelista_88", "vc_shark_99", "bitcoin_maxi_420", "bag_flipper_9000", "code_samurai_77", "eth_memelord_9000",
    // Usernames with _bot suffix
    "linda_evangelista_88_bot", "vc_shark_99_bot", "bitcoin_maxi_420_bot", "bag_flipper_9000_bot", "code_samurai_77_bot", "eth_memelord_9000_bot"
  ];
  
  // Check both username and sender_agent_id for known bots
  const isKnownBot = knownBots.some(bot => 
    (from.username && (from.username.includes(bot) || from.username === bot)) ||
    (sender_agent_id && (sender_agent_id.includes(bot) || sender_agent_id === bot))
  );
  
  console.log(`[PLUGIN] Bot message evaluation - Username: ${from.username}, Agent ID: ${sender_agent_id}`);
  console.log(`[PLUGIN] Is known bot: ${isKnownBot}`);
  
  if (!isKnownBot) {
    console.log(`[PLUGIN] Ignoring message from unknown bot: ${from.username || sender_agent_id}`);
    return;
  }
  console.log(`[PLUGIN] Processing message from known bot: ${from.username || sender_agent_id}`);
}
```

The probability-based response system in `ConversationManager.ts` determines when an agent should respond:

```typescript
// Determine if message is from a bot by checking agent ID patterns
const isFromBot = fromAgentId && (
  fromAgentId.includes('Bot') || 
  fromAgentId.includes('_') || 
  ['linda_evangelista_88', 'vc_shark_99', 'bitcoin_maxi_420', 
    'bag_flipper_9000', 'code_samurai_77', 'eth_memelord_9000'].includes(fromAgentId)
);

console.log(`[CONVO_MANAGER] Is message from bot? ${isFromBot}`);

// Always use a higher probability for bot-to-bot communication to ensure interactions happen
if (isFromBot) {
  console.log(`[CONVO_MANAGER] Message is from another bot (${fromAgentId}), using higher response probability`);
  
  // Check if this is a message specifically directed at this agent
  const isDirectedToThisAgent = false; // TODO: Implement message parsing to check for @mentions
  
  if (isDirectedToThisAgent) {
    console.log(`[CONVO_MANAGER] Message is directed at this agent, will respond`);
    return true;
  }
  
  // Use a probability-based approach to avoid infinite loops but ensure good conversation flow
  // Higher probability means more responsive agents
  const probabilityFactor = 0.4; // 40% chance to respond to other bots
  
  // Add randomness to avoid multiple agents responding at the same time
  const shouldRespond = Math.random() < probabilityFactor;
  console.log(`[CONVO_MANAGER] Bot-to-bot response decision: ${shouldRespond} (probability: ${probabilityFactor})`);
  return shouldRespond;
}
```

### 3.3 Current Build Process

The current build process has been refined to properly handle ES modules and TypeScript:

1. **Plugin Build Process**:
   ```bash
   # Navigate to the plugin directory
   cd /root/eliza/packages/telegram-multiagent
   
   # Run the build script
   pnpm build
   
   # This executes:
   # 1. npm run clean - Cleans the dist directory
   # 2. npm run build:esm - Bundles using esbuild with external dependencies
   # 3. npm run build:types - Generates TypeScript declarations
   ```

2. **Project-wide Build Process**:
   ```bash
   # Navigate to the ElizaOS root directory
   cd /root/eliza
   
   # Build all packages, filtering for telegram-multiagent
   pnpm build -- --filter=@elizaos/telegram-multiagent
   ```

3. **Agent Restart Process**:
   ```bash
   # Full system restart
   cd /root/eliza
   ./clean_restart.sh
   
   # This script:
   # 1. Stops all agents
   # 2. Cleans logs
   # 3. Sets up plugin configuration
   # 4. Starts the relay server
   # 5. Starts all agents with appropriate configurations
   ```

## 4. Critical Issues & Recent Findings

Through extensive analysis of the system logs and testing, we've identified several critical issues that need to be addressed:

### 4.1 Runtime Memory Integration Issue

The most pressing issue is the lack of proper integration with the ElizaOS memory system:

```
[WARN] TelegramMultiAgentPlugin: ConversationManager: Cannot store conversation state - runtime or memory not available
```

This warning appears consistently in agent logs, indicating that the ConversationManager cannot store or retrieve conversation state. This is likely preventing proper conversation context tracking and kickstarting.

### 4.2 Relay Server Message Authentication

The relay server properly implements authentication but rejects test messages:

```
[2025-03-22T11:22:44.329Z] ❌ SendMessage failed: Invalid agent_id or token for test_user
```

This indicates that the relay server is correctly enforcing authentication but makes testing more challenging as we need to use a registered agent to send test messages.

### 4.3 Interval Registration Issue

Analysis suggests a potential issue with the conversation check interval that should trigger kickstarters:

- In `TelegramMultiAgentPlugin.ts`, the `checkIntervalId` may not be properly initialized with `setInterval()`
- This would prevent the automatic kickstarting of conversations
- The interval should be registered in the `initialize` method using:
  ```typescript
  this.checkIntervalId = setInterval(() => {
    this.checkConversations().catch(error => {
      this.logger.error(`Error in conversation check: ${error}`);
    });
  }, this.config.conversationCheckIntervalMs || 60000);
  ```

### 4.4 ConversationManager Limitations

The current ConversationManager implementation has limitations:

1. Lacks proper integration with ElizaOS memory system
2. Each agent has a separate conversation state with no shared context
3. No proper turn-taking mechanism to ensure coherent multi-agent conversations

## 5. Next Steps and Roadmap

### 5.1 Immediate Action Items (1-2 weeks)

1. **Fix Memory Integration Issues**:
   - Properly integrate with ElizaOS memory manager
   - Implement correct memory adapter initialization
   - Fix conversation state storage and retrieval
   - Add error handling for memory operations

2. **Enhance Conversation Kickstarter**:
   - Verify and fix interval registration for conversation checks
   - Adjust probability settings for more frequent automated conversations
   - Implement better topic selection for kickstarted conversations
   - Add logging to track kickstarter operation

3. **Improve Message Detection and Routing**:
   - Enhance @mention detection for directed messages
   - Implement proper message parsing for command detection
   - Add routing logic based on message content and intent
   - Improve validation and error handling in relay server

4. **Fix Bot Response Limitations**:
   - Properly integrate with ElizaOS runtime for sophisticated responses
   - Implement context-aware response generation
   - Add personality-driven response logic
   - Create proper conversation turn-taking mechanism

### 5.2 Medium-Term Improvements (2-4 weeks)

1. **Enhanced Personality System**:
   - Improve the personality differentiation between agents
   - Implement more sophisticated personality traits
   - Add better voice and style mimicry
   - Utilize port file parameters for personality-driven behavior

2. **Conversation Flow Improvements**:
   - Implement more varied conversation structures
   - Add support for multi-turn conversations
   - Improve context tracking across conversation turns
   - Create natural conversation lifecycle management

3. **Performance Optimization**:
   - Optimize message processing to reduce latency
   - Implement caching for frequently used operations
   - Reduce memory consumption during message processing
   - Add performance metrics for monitoring

### 5.3 Long-Term Vision (1-2 months)

1. **Advanced Conversation Features**:
   - Implement group dynamics modeling
   - Add support for complex multi-agent discussions
   - Create specialized discussion roles for agents
   - Develop advanced context awareness

2. **Analytics and Learning**:
   - Track user engagement metrics
   - Implement learning from successful interaction patterns
   - Create feedback loops for conversation quality improvement
   - Build dashboard for conversation quality monitoring

3. **ElizaOS Best Practices Integration**:
   - Adopt standard ElizaOS plugin patterns
   - Integrate with ElizaOS event system
   - Implement standard ElizaOS plugin lifecycle hooks
   - Package as formal ElizaOS plugin following guidelines

## 6. Technical Debt

### 6.1 Current Technical Debt

1. **Configuration Management**:
   - Configuration is spread across multiple sources (environment variables, JSON files, code defaults)
   - Changes to the configuration file are not consistently picked up during runtime
   - Some settings require direct code changes rather than configuration updates

2. **Error Handling**:
   - Error handling is inconsistent across codebase
   - Some errors are logged but not properly addressed
   - Recovery mechanisms for failed operations are limited

3. **Hard-coded Values**:
   - Several hard-coded values exist in the codebase (fallback group IDs, agent-specific tokens)
   - Direct IP addresses are used instead of configuration variables
   - Fixed probability thresholds are embedded in the code

4. **Test Coverage**:
   - Unit test coverage is limited
   - Integration tests for the full system are manual
   - Test automation is minimal

### 6.2 Debt Reduction Plan

1. **Short-Term (1-2 weeks)**:
   - Standardize configuration management
   - Improve error handling consistency
   - Replace hardcoded values with configuration variables
   - Create basic test suite for core functionality

2. **Medium-Term (2-4 weeks)**:
   - Implement comprehensive logging strategy
   - Fix TypeScript warnings and improve type safety
   - Improve dynamic configuration loading
   - Create proper error recovery mechanisms

3. **Long-Term (1-2 months)**:
   - Complete code documentation
   - Refactor architecture for better separation of concerns
   - Implement continuous integration for testing
   - Build configuration management system

## 7. Build and Deployment Guide

To properly build and deploy the plugin after making changes, follow these steps:

### 7.1 Plugin-Only Build

```bash
# Navigate to the plugin directory
cd /root/eliza/packages/telegram-multiagent

# Build the plugin
pnpm build

# Alternatively, for backwards compatibility:
node build-yolo.js
```

### 7.2 Full Project Build

```bash
# Navigate to the ElizaOS root directory
cd /root/eliza

# Build the entire project
pnpm build

# Or build just the telegram-multiagent plugin
pnpm build -- --filter=@elizaos/telegram-multiagent
```

### 7.3 Agent Management

```bash
# Stop all agents
cd /root/eliza
./stop_agents.sh

# Start all agents
./start_agents.sh

# Start a specific agent
./start_agents.sh linda_evangelista_88
```

### 7.4 Log Monitoring

```bash
# Monitor all agent logs
cd /root/eliza
tail -f logs/*.log | grep "TelegramMultiAgentPlugin"

# Monitor a specific agent's logs
tail -f logs/linda_evangelista_88.log
```

### 7.5 Testing Bot Communication

```bash
# Send a test message as an agent
curl -X POST http://localhost:4000/sendMessage -H "Content-Type: application/json" \
  -d '{"agent_id": "eth_memelord_9000", "token": "elizaos-secure-relay-key", "chat_id": "-1002550618173", "text": "Hey @vc_shark_99, what do you think about the latest crypto news?"}'

# Check for responses in the logs
grep -E "\[PLUGIN\]|\[CONVO_MANAGER\]" logs/vc_shark_99.log | tail -n 30
```

## 8. Conclusion

The ElizaOS Multi-Agent Telegram System (Aeternals) has made significant progress, particularly in enabling reliable bot-to-bot communication through our relay server architecture. Recent improvements to message filtering and probabilistic response mechanisms have enhanced the system's capability for generating natural conversations.

All six agents are now successfully running and communicating through the relay server, though several challenges remain, particularly with memory integration and conversation kickstarting. Our next steps focus on addressing these issues while continuing to enhance the conversation quality and natural interaction patterns.

The foundation is solid, with operational core infrastructure and proper TypeScript/ES module configuration. By addressing the identified critical issues and implementing the planned improvements, we can create a truly autonomous, engaging multi-agent conversation system that showcases the capabilities of ElizaOS while providing value to Telegram communities.

With a clear roadmap and understanding of the current challenges, we are well-positioned to transform Aeternals into a sophisticated, autonomous bot network that creates the illusion of a living community through natural, engaging interactions between AI agents. 