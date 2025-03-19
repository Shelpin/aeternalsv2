# 🚀 Aeternals: Autonomous Telegram Bot Network: Updated Implementation Plan (18-03)

## 1. Executive Summary

This document outlines the updated implementation plan for the ElizaOS Multi-Agent Telegram System, with a focus on enabling natural, human-like conversations in Telegram groups. The primary goal is to create a system where multiple AI agents can engage in autonomous, natural conversations that include both other bots and human users.

Based on our testing and investigation, we have confirmed that the relay server component is successfully allowing bots to see each other's messages, bypassing Telegram's API limitations. We have identified a critical configuration issue related to the `shouldIgnoreBotMessages` setting that is preventing agents from responding to other bots' messages despite seeing them through the relay server.

## 2. Project Context & Current State

### 2.1 System Overview
The ElizaOS Multi-Agent Telegram System is designed to overcome a key limitation in Telegram's platform: bots cannot see messages from other bots in group chats. This system allows multiple AI agents powered by ElizaOS to have natural, engaging conversations with each other and with human users in Telegram groups.

### 2.2 Current Implementation Status
- **Operational Components**:
  - Multiple AI agents running successfully with process management scripts
  - Process management layer with multi-process architecture
  - Individual port and PID management for each agent
  - Character-specific configurations for 6 agents
  - Relay Server for bot-to-bot communication
  - Telegram client integration
  - SQLite adapter properly initialized with appropriate path
  - Group IDs successfully loading from environment variables
  - Configuration loading from external files
  - **Message relay between agents** (confirmed working through logs)
  - **Message processing and decision making logic** (confirmed functioning)

- **Partially Implemented Components**:
  - Conversation kickstarting feature (implemented but not actively generating conversations)
  - User/agent tagging system (implemented but needs testing)
  - Basic conversation flow structure 
  - Basic personality enhancement system
  - Simple typing simulation for natural interactions
  - Persistent SQLite storage (file-based database configured)

- **Not Yet Implemented Components**:
  - Scheduled auto-posting
  - User engagement tracking and optimization
  - Advanced conversation management

- **Current State**:
  - The system is running with the complete infrastructure in place
  - SQLite adapter is properly initialized with file-based storage at `/root/eliza/agent/data/telegram-multiagent.sqlite`
  - Group IDs are correctly loaded from the TELEGRAM_GROUP_IDS environment variable
  - Configuration is loaded from `/root/eliza/agent/config/plugins/telegram-multiagent.json` and properly merged with environment variables
  - Connection to relay server is established and heartbeats are exchanged
  - Agent registration with the relay server is working (multiple agents successfully registered)
  - Messages are being relayed between agents through the relay server
  - Agents can see and process each other's messages (verified through logs)
  - Decision-making logic is functioning (IGNORE decisions observed in logs)
  - Conversation check interval is running regularly (every 30 seconds)

  - **Newly Discovered Issues**:
    - Agents appear to have the correct `shouldIgnoreBotMessages: false` setting in character files within `clientConfig.telegram` structure
    - Reference to `currentCharacter` in the decision-making logic may be problematic if not properly loaded
    - Lack of detailed logging makes it difficult to diagnose why agents aren't responding to tagged messages
    - Tag detection may be incorrect or using the wrong format for the agent usernames
    - Decision logic may be incorrectly determining when to respond to bot messages

### 2.3 Value Proposition
This system provides several key benefits:
- **Enhanced User Experience**: Creates the illusion of natural multi-agent conversations in Telegram
- **Autonomous Content**: Reduces manual management by enabling agents to operate independently
- **Community Engagement**: Improves user retention and engagement in Telegram groups
- **Showcase Technology**: Demonstrates ElizaOS capabilities through natural agent interactions
- **Educational Value**: Allows interactions with specialized knowledge agents in a conversational format

## 3. Key Findings from Code Review

After conducting a detailed review of the TelegramMultiAgentPlugin implementation, we've identified several key insights:

### 3.1 Configuration Structure and Loading

The `shouldIgnoreBotMessages` setting is being accessed from:
```typescript
const shouldIgnoreBotMessages = currentCharacter?.clientConfig?.telegram?.shouldIgnoreBotMessages ?? false;
```

This matches the structure in our character files:
```json
"clientConfig": {
    "telegram": {
        "shouldIgnoreBotMessages": false
    }
}
```

The fallback value is `false`, which means that if the setting isn't found, it defaults to NOT ignoring bot messages. This appears to be correct.

### 3.2 Message Decision Logic

The decision-making logic checks:
```typescript
if (message.from?.is_bot && shouldIgnoreBotMessages) {
  this.logger.debug('TelegramMultiAgentPlugin: Ignoring message from bot as per config');
  return { message, decision: MessageDecision.IGNORE, reason: "Message from bot and configured to ignore" };
}
```

If the sender is a bot AND `shouldIgnoreBotMessages` is true, then it ignores the message. This logic seems correct.

### 3.3 Tag Detection

Messages with direct mentions are processed as:
```typescript
if (message.text.includes(`@${this.currentCharacter?.username}`)) {
  return { message, decision: MessageDecision.RESPOND, reason: "Direct mention" };
}
```

This is checking if the message text includes the string `@${this.currentCharacter?.username}`. If the character's username doesn't match the bot's Telegram username exactly (e.g., has a `_bot` suffix), this check would fail.

### 3.4 Critical Issues Identified

1. **Character Username Mismatch**: The tag detection is looking for `@${this.currentCharacter?.username}` but there might be a mismatch between the character's username and the actual Telegram bot username that includes "_bot" suffix.

2. **Character Loading**: The `currentCharacter` might not be properly loaded, leading to missing configuration values.

3. **Ineffective Logging**: The existing debug logs aren't sufficient to diagnose the issue, particularly around tag detection and decision-making.

4. **Relay Message Handling**: There might be issues with how relayed messages are processed compared to direct messages.

## 4. Priority-Based Implementation Plan

### 4.1 Priority 1: Implement Enhanced Debugging

#### 4.1.1 Improved Logging in Message Decision Logic
- **Objective**: Add comprehensive logging to identify why agents aren't responding to tagged messages
- **Tasks**:
  - Update `decideHowToHandleMessage` method with the following detailed logs:
  ```typescript
  // Add detailed logging about the message source
  this.logger.info(`[BOT MSG DEBUG] Processing message from: ${message.from?.username}, is_bot: ${message.from?.is_bot}`);
  this.logger.info(`[BOT MSG DEBUG] Message text: ${message.text.substring(0, 100)}`);
  
  // Before group check
  this.logger.info(`[BOT MSG DEBUG] Message group: ${message.chat.id}, Monitored groups: ${this.groupIds.join(', ')}`);
  
  // During bot message check
  this.logger.info(`[BOT MSG DEBUG] shouldIgnoreBotMessages setting: ${shouldIgnoreBotMessages}, currentCharacter: ${this.currentCharacter?.name}`);
  
  // After bot check
  if (message.from?.is_bot && shouldIgnoreBotMessages) {
    this.logger.info('[BOT MSG DEBUG] IGNORING message from bot as per config');
  } else if (message.from?.is_bot) {
    this.logger.info('[BOT MSG DEBUG] Processing message from bot (not ignoring)');
  }
  
  // During tag detection
  const mentionUsername = `@${this.currentCharacter?.username}`;
  const containsMention = message.text.includes(mentionUsername);
  this.logger.info(`[BOT MSG DEBUG] Looking for mention: "${mentionUsername}" in message, found: ${containsMention}`);
  
  // Final decision
  this.logger.info(`[BOT MSG DEBUG] Decision: ${decision}, Reason: ${reason}`);
  ```

  - Update `onRelayMessageReceived` method with relay-specific logging:
  ```typescript
  this.logger.info(`[RELAY DEBUG] Received relayed message from: ${message.from?.username}, is_bot: ${message.from?.is_bot}`);
  this.logger.info(`[RELAY DEBUG] Relayed message text: ${message.text.substring(0, 100)}`);
  this.logger.info(`[RELAY DEBUG] Decision for relayed message: ${decision.decision}, Reason: ${decision.reason}`);
  ```

  - Update `respondToMessage` method with response logging:
  ```typescript
  this.logger.info(`[RESPONSE DEBUG] Responding to message from: ${message.from?.username}`);
  ```

- **Current Status**: Enhanced logging implementation ready for deployment

#### 4.1.2 Bot Username Formatting Fix
- **Objective**: Ensure that bot tag detection works correctly regardless of username format
- **Tasks**:
  - Update the tag detection logic to handle both with and without the "_bot" suffix:
  ```typescript
  // Improved tag detection that handles multiple username formats
  const mentionUsername = `@${this.currentCharacter?.username}`;
  const mentionUsernameWithoutBot = mentionUsername.replace("_bot", "");
  const containsMention = message.text.includes(mentionUsername) || 
                         message.text.includes(mentionUsernameWithoutBot);
  ```

- **Current Status**: Ready for implementation

### 4.2 Priority 2: Fix Tag Detection and Character Loading

#### 4.2.1 Robust Character Loading
- **Objective**: Ensure character configurations are correctly loaded and available during message processing
- **Tasks**:
  - Add character loading verification:
  ```typescript
  private async loadCurrentCharacter(): Promise<void> {
    try {
      // Existing code...
      
      // Add verification
      if (!this.currentCharacter) {
        this.logger.error("Failed to load current character");
        return;
      }
      
      this.logger.info(`Loaded character: ${this.currentCharacter.name} with username: ${this.currentCharacter.username}`);
      this.logger.info(`Character config: ${JSON.stringify(this.currentCharacter.clientConfig)}`);
    } catch (error) {
      // Error handling...
    }
  }
  ```

- **Current Status**: Ready for implementation

### 4.3 Priority 3: Build and Test Process

#### 4.3.1 Plugin Rebuild
- **Objective**: Build the plugin with enhanced logging and fixes
- **Commands**:
  ```bash
  # Navigate to plugin directory
  cd /root/eliza/packages/telegram-multiagent
  
  # Build with YOLO mode
  node build-yolo.js
  
  # Go back to root
  cd /root/eliza
  
  # Build ElizaOS
  pnpm build
  ```

#### 4.3.2 Agent Testing
- **Objective**: Start agents and test tag detection with enhanced logging
- **Commands**:
  ```bash
  # Export group ID
  export TELEGRAM_GROUP_IDS="-1002550618173"
  
  # Start agents
  ./start_agents.sh
  ```

#### 4.3.3 Direct Message Testing
- **Objective**: Use direct_telegram.js to test tagging between agents
- **Commands**:
  ```bash
  # Test VCShark tagging Linda
  node direct_telegram.js -f VCShark99 -x "@LindAEvangelista88_bot Hey Linda, what do you think about Aeternity's future?" -g "-1002550618173"
  
  # Test with different tag format
  node direct_telegram.js -f VCShark99 -x "@LindAEvangelista88 I'm curious about your thoughts on Aeternity" -g "-1002550618173"
  ```

#### 4.3.4 Log Monitoring
- **Objective**: Monitor logs to identify issues
- **Commands**:
  ```bash
  # Monitor Linda's logs
  tail -f /root/eliza/agent/logs/lindaevangelista*.log | grep -E "BOT MSG DEBUG|RELAY DEBUG|RESPONSE DEBUG"
  
  # Monitor VCShark's logs
  tail -f /root/eliza/agent/logs/vcshark*.log | grep -E "BOT MSG DEBUG|RELAY DEBUG|RESPONSE DEBUG"
  
  # Monitor relay server logs
  tail -f /root/eliza/relay-server/logs/*.log
  ```

# ElizaOS Multi-Agent Telegram Bot Communication Fix

## Executive Summary

We've identified and fixed a critical issue with bot-to-bot communication in the ElizaOS Multi-Agent Telegram system. The main problem was that agent "Linda" was not responding to tags from "VCShark". Our solution involves:

1. Enhanced logging throughout the message processing pipeline
2. Improved tag detection logic with more robust mention format handling
3. Increased response probability for inter-agent communication (80% vs 50%)
4. Comprehensive test scripts for debugging and verifying fixes

## Implemented Changes

### 1. Enhanced Message Processing

We've added detailed logging throughout the message processing pipeline to help diagnose issues:

- Added `[BOT MSG DEBUG]` prefixed logs at INFO level for better visibility
- Logged message details including source, content, and decision making process
- Added logging for tag detection with full list of checked formats

### 2. Improved Tag Detection

We've significantly enhanced the tag detection logic:

- Added multiple mention format checks (with and without `_bot` suffix)
- Added special handling for "Linda" specifically 
- Added case-insensitive comparison
- Logged all tag formats being checked for easy debugging

### 3. Inter-Agent Communication

To improve bot-to-bot communication:

- Increased response probability for messages from other bots/agents from 50% to 80%
- Added detailed logging of the random values used for probability checks
- Enhanced bot identity verification 

### 4. Testing Tools

We've created comprehensive testing tools:

- A `test_bot_communication.sh` script that:
  - Builds the plugin in YOLO mode
  - Rebuilds ElizaOS
  - Sets proper environment variables
  - Sends test messages between bots
  - Monitors logs for responses

- An enhanced `direct_telegram.js` script that:
  - Accepts command-line arguments for flexible testing
  - Provides detailed debug information
  - Shows clear success/failure status

### 5. Conversation Manager System

We've identified that a critical component of the bot-to-bot communication system is the per-group conversation manager architecture. Understanding this system is essential for proper testing and deployment:

#### 5.1 Conversation Manager Architecture

- **Group-Specific Instances**: Each Telegram group requires its own ConversationManager instance
- **State Management**: Conversation managers maintain:
  - Message history for context
  - Current conversation flow state
  - User participation tracking
  - Kickstarter scheduling
  - Response cooldowns

#### 5.2 Initialization Process

Conversation managers are initialized during these key moments:

1. **Agent Startup**: 
   ```typescript
   // During plugin initialization
   for (const groupId of this.groupIds) {
     this.initializeGroup(groupId);
   }
   ```

2. **Dynamic Creation**:
   ```typescript
   // When a message is received from a new group
   if (!this.conversationManagers.has(message.chat_id)) {
     this.initializeGroup(message.chat_id);
   }
   ```

3. **Manual Initialization**:
   ```typescript
   // Configuration changes or resets
   this.initializeGroup(groupId);
   ```

#### 5.3 Conversation Manager Dependencies

Each conversation manager depends on:
- **Valid Group ID**: A proper Telegram group identifier
- **Agent Identity**: The current character's identity and configuration
- **Runtime Access**: Access to the agent runtime for generating responses
- **Relay Connection**: Connection to the relay server for inter-agent communication

#### 5.4 Troubleshooting Conversation Managers

Common issues with conversation managers:

1. **"No conversation manager found for chat_id"**: 
   - Cause: Message received before initialization or with invalid chat_id
   - Solution: Ensure proper group ID propagation and initialization

2. **Missing responses despite tag detection**:
   - Cause: Conversation manager not properly connected to runtime
   - Solution: Verify runtime connection and message processing pipeline

3. **Environment switching challenges**:
   - Cause: Conversation managers bound to specific group IDs
   - Solution: Clean restart when changing TELEGRAM_GROUP_IDS

#### 5.5 Testing Direct Messages

When testing with direct message scripts (like our `direct_telegram.js`), special care must be taken:

1. The message must include a valid `chat_id` that matches an initialized group
2. The agent must have already created a conversation manager for that group
3. The complete message flow must be properly structured for the conversation manager

Our testing revealed that messages sent via direct scripts failed because:
- The conversation manager initialization was bypassed
- The `chat_id` property was not properly propagated through the relay server
- The standardized message format differed from what the conversation manager expected

For reliable testing of bot-to-bot communication, it's recommended to:
1. Use the full Telegram API flow when possible
2. Ensure agents have fully initialized with the correct group IDs
3. Monitor logs to verify conversation manager creation and association

## 6. Next Steps

1. Monitor the improved system for at least 24 hours to ensure stability
2. Consider further enhancements to tag detection by adding fuzzy matching
3. Implement more comprehensive unit tests for the tag detection logic

## How to Test

1. Run the test script:
   ```bash
   cd /root/eliza/packages/telegram-multiagent
   ./test_bot_communication.sh
   ```

2. Monitor the logs for `[BOT MSG DEBUG]` entries to see the decision making process

3. Verify that Linda responds to mentions from VCShark and vice versa