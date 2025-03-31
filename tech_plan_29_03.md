# æternals Multi-Agent System Technical Plan (March 29)

## 1. Executive Summary

The æternals project is an advanced multi-agent AI system designed to create an autonomous network of intelligent Telegram bots capable of engaging in natural conversations with users and with each other. These agents, built on the ElizaOS framework, leverage large language models to generate personalized responses, maintain consistent personalities, and interact in a human-like manner across Telegram chats and groups.

The system has been progressively stabilized in terms of memory usage and agent registration. All six agents have successfully registered with the relay server and maintain their connections without Out-of-Memory (OOM) crashes. However, we've encountered significant build dependency issues and message delivery remains broken - agents can correctly process messages and generate appropriate responses but cannot deliver these responses to users via Telegram.

### 1.1 Core Objectives

1. **Autonomous Operation**: Create AI agents that can function independently with minimal human intervention
2. **Natural Conversations**: Enable fluid, contextually-appropriate interactions between agents and with human users
3. **Distinct Personalities**: Maintain consistent character personas across all interactions
4. **Inter-Agent Communication**: Facilitate direct communication between different AI agents
5. **Telegram Integration**: Provide seamless integration with the Telegram messaging platform
6. **Robust Memory Management**: Ensure reliable operation without memory leaks or performance degradation
7. **Consistent Build Process**: Establish reliable build pipelines for all components

### 1.2 System Status Summary (Updated March 29)

#### Working Components
- ✅ Memory optimization through OOM fixes
- ✅ Agent registration with relay server (all 6 agents)
- ✅ Relay server operation and agent monitoring
- ✅ Message processing via custom runtime.handleMessage implementation
- ✅ SQLite database initialization and memory schema
- ✅ Agent-specific character response generation
- ✅ Root tsconfig.json with proper configuration
- ✅ Initialization database script path correction
- ✅ Workspace dependencies for tsup and esbuild added
- ✅ client-direct source files exist but need building

#### Critical Issues
- ❌ Bot tokens not accessible to plugin instances (verified in logs)
- ❌ Telegram client initialization incomplete
- ❌ Message delivery to Telegram users failing
- ❌ Dependency on missing runtime methods
- ❌ Build errors in @elizaos/agent package
- ❌ Missing built files for @elizaos/client-direct package (dist/index.js)
- ❌ tsup build failures in multiple packages
- ❌ Port conflict for relay server (EADDRINUSE on port 4000)

## 2. System Architecture

### 2.1 High-Level Architecture

The Valhalla system follows a modular architecture with the following core components:

```
┌─────────────────┐      ┌──────────────┐      ┌─────────────────┐
│ Telegram Client │◄────►│ Relay Server │◄────►│ Agent Instances │
└─────────────────┘      └──────────────┘      └─────────────────┘
         ▲                      ▲                      ▲
         │                      │                      │
         ▼                      ▼                      ▼
┌─────────────────┐      ┌──────────────┐      ┌─────────────────┐
│  Telegram API   │      │   SQLite DB  │      │  Memory System  │
└─────────────────┘      └──────────────┘      └─────────────────┘
```

### 2.2 Core Components

1. **Agent Runtime**: The underlying ElizaOS framework that powers each agent
2. **TelegramMultiAgentPlugin**: Plugin that connects agents to Telegram
3. **Relay Server**: Central hub for message routing between agents
4. **SQLite Memory System**: Persistent storage for agent memories
5. **Character Configuration**: JSON files defining agent personalities
6. **Token Management**: System for handling Telegram API authentication
7. **Build System**: tsup-based bundling for all TypeScript packages

### 2.3 Message Flow

Messages in the Valhalla system follow this processing sequence:

1. **Reception**: Telegram message received via Telegram API or relay
2. **Routing**: Message routed to appropriate agent(s) based on mentions
3. **Processing**: Agent processes message using runtime.handleMessage
4. **Generation**: Character-appropriate response generated
5. **Delivery**: Response sent back through Telegram client or API
6. **Memory**: Interaction stored in SQLite database for future context

## 3. Implementation Progress

### 3.1 Phase 1: Memory Stabilization (Completed)
- ✅ Implemented OOM fixes documented in oom_post_world_fixes.md
- ✅ Added FORCE_GC environment variable to enable garbage collection
- ✅ Fixed polling logic for the TelegramMultiAgentPlugin
- ✅ Implemented proper database cleanup in launch_valhalla.sh

### 3.2 Phase 2: Message Handling (Completed)
- ✅ Added robust fallback for runtime.handleMessage implementation
- ✅ Implemented character-specific response generation 
- ✅ Added thorough diagnostic logging to track runtime method availability
- ✅ Fixed SQLite schema initialization for memories table

### 3.3 Phase 3: Message Delivery (In Progress)
- ❌ Resolve bot token access issue
- ❌ Fix Telegram client initialization
- ❌ Implement direct API fallback when client unavailable

### 3.4 Phase 4: Build System Fixes (In Progress)
- ✅ Added tsup to root workspace dependencies
- ✅ Added esbuild to root workspace dependencies
- ✅ Fixed database path in init_database.js
- ❌ Build @elizaos/client-direct package
- ❌ Fix TypeScript errors in @elizaos/agent

### 3.5 Agent Configuration

The system currently includes six agents with distinct personalities:

1. **ETH Memelord 9000**: Ethereum enthusiast who loves memes and crypto culture
2. **Bag Flipper 9000**: Crypto trader focused on quick profits and market movements
3. **Linda Evangelista 88**: Fashion-focused AI with interests in luxury brands and trends
4. **VC Shark 99**: Venture capitalist character looking for promising investments
5. **Code Samurai 77**: Tech expert specializing in software development and coding
6. **Bitcoin Maxi 420**: Bitcoin maximalist who believes in BTC supremacy

Each agent is defined by a JSON configuration file that includes:
- Personality traits and character background
- Response templates and conversation styles
- Topics of interest and expertise
- Memory configuration
- API connection details

## 4. Diagnostic Findings

### 4.1 Runtime Method Status
```
[VALHALLA] FINAL CHECK: Message Handler Status:
================================================================
Runtime ready: true
Has runtime.handleMessage?: true
Has runtime.processCharacterMessage?: true
Has runtime.processMessage?: false
Has runtime.sendMessage?: false
Has runtime.agents.handleMessage?: false
Has runtime.actions?: true
Has runtime.llm?: false
Has telegramClient?: true
Bot token available?: false
Telegram relay connected?: true
Memory manager available?: true
Memory manager type: Runtime
================================================================
```

### 4.2 Agent Registration Status
All six agents successfully register with the relay server:
```
[2025-03-28T20:36:20.497Z] ✅ Agent registered: bitcoin_maxi_420_bot
[2025-03-28T20:36:20.497Z] ℹ️ Total connected agents: 6
[2025-03-28T20:36:20.497Z] 🔄 Connected agents: eth_memelord_9000_bot, bag_flipper_9000_bot, linda_evangelista_88_bot, vc_shark_99_bot, code_samurai_77_bot, bitcoin_maxi_420_bot
```

### 4.3 Message Delivery Failures
Despite processing messages correctly, delivery fails with specific errors:
```
[ERROR] TelegramMultiAgentPlugin: [PLUGIN][VALHALLA][FLOW] ElizaOS Telegram client not available  
[ERROR] TelegramMultiAgentPlugin: [PLUGIN][VALHALLA][FLOW] Runtime client keys: No client object  
[ERROR] TelegramMultiAgentPlugin: [PLUGIN][VALHALLA][FLOW] No bot token available for direct API  
[INFO] TelegramMultiAgentPlugin: [PLUGIN][VALHALLA][FLOW] Attempting to use direct Telegram API since client is missing  
[ERROR] TelegramMultiAgentPlugin: [PLUGIN][VALHALLA][FLOW] No bot token available for direct API  
[INFO] TelegramMultiAgentPlugin: [PLUGIN][VALHALLA][FLOW] Message forwarded to relay despite Telegram client missing
```

### 4.4 Build System Issues (New)
During our attempts to run the agents, we encountered several build-related issues:

```
Error: Cannot find module '/root/eliza/packages/core/node_modules/tsup/dist/cli-default.js'
```

This indicated that tsup wasn't properly installed or accessible to the packages that needed it.

```
Error: Cannot find module '/root/eliza/packages/agent/node_modules/@elizaos/client-direct/dist/index.js' imported from /root/eliza/packages/agent/src/index.ts
```

This showed that the client-direct package either wasn't built correctly or wasn't being found by the agent.

```
Error: listen EADDRINUSE: address already in use :::4000
```

This showed that the relay server port was already in use by another process.

## 5. Technical Action Plan (Updated March 29)

### 5.1 Fix Bot Token Access (Priority: High)
- **Issue:** Bot tokens are set in the environment but not accessible to the TelegramMultiAgentPlugin
- **Implementation:** 
  ```typescript
  // Add to TelegramMultiAgentPlugin.ts in initialize method
  const agentId = process.env.AGENT_ID || '';
  const tokenKey = `${agentId.toUpperCase()}_BOT_TOKEN`;
  const botToken = process.env.TELEGRAM_BOT_TOKEN || process.env[tokenKey];
  
  if (botToken) {
    this.logger.info(`[TELEGRAM] Successfully loaded bot token: ${botToken.substring(0, 6)}...`);
    this.config.botToken = botToken;
  } else {
    this.logger.error(`[TELEGRAM] Failed to load bot token. Checked TELEGRAM_BOT_TOKEN and ${tokenKey}`);
    this.logger.debug(`[TELEGRAM] Available env vars: ${Object.keys(process.env).filter(k => k.includes('TOKEN')).join(', ')}`);
  }
  ```

### 5.2 Fix Telegram Client Initialization (Priority: High)
- **Issue:** Telegram client shows as available but is inaccessible at runtime
- **Implementation:**
  ```typescript
  // Add to TelegramMultiAgentPlugin.ts in initialize method
  let telegramClientInitialized = false;
  
  // Try to access the client via runtime.client.telegram
  if (this.runtime?.client?.telegram) {
    try {
      // Test client with a simple method call
      const me = await this.runtime.client.telegram.getMe();
      if (me && me.id) {
        this.logger.info(`[TELEGRAM] Client initialized and connected as: ${me.username || me.id}`);
        telegramClientInitialized = true;
      }
    } catch (err) {
      this.logger.error(`[TELEGRAM] Client exists but failed test: ${err.message}`);
    }
  }
  
  // Create fallback client if needed
  if (!telegramClientInitialized && this.config.botToken) {
    try {
      const { Telegraf } = await import('telegraf');
      this.directClient = new Telegraf(this.config.botToken);
      this.logger.info(`[TELEGRAM] Created direct fallback client`);
    } catch (err) {
      this.logger.error(`[TELEGRAM] Failed to create fallback client: ${err.message}`);
    }
  }
  ```

### 5.3 Implement Robust Message Delivery (Priority: Medium)
- **Issue:** Multiple message delivery pathways failing with cascade failures
- **Implementation:** (Same as previous plan)

### 5.4 Fix Build Dependencies (Priority: High) (New)
- **Issue:** tsup and esbuild dependencies missing or not properly linked
- **Implementation:** 
  ```bash
  # Add tsup and esbuild to workspace dependencies
  pnpm add -Dw tsup esbuild
  
  # Build all packages in correct order
  pnpm -r build
  
  # If specific package build fails, build it individually
  pnpm --filter @elizaos/client-direct build
  ```

### 5.5 Resolve Port Conflicts (Priority: Medium) (New)
- **Issue:** Relay server fails to start due to port 4000 already in use
- **Implementation:**
  ```bash
  # Find process using port 4000
  lsof -i :4000
  
  # Kill the process if appropriate
  kill -9 [PID]
  
  # If necessary, modify relay-server config to use a different port
  # In server.js:
  const PORT = process.env.RELAY_PORT || 4001;
  
  # Then update all references to this port in launch scripts and agent configs
  ```

### 5.6 Fix TypeScript Errors in Agent Package (Priority: High) (New)
- **Issue:** The agent package has TypeScript errors preventing successful build
- **Implementation:**
  1. Run TypeScript in verbose mode to identify all errors
  2. Fix interface implementation errors
  3. Address missing property errors in mock classes
  4. Ensure all imports are correctly resolved

### 5.7 Add Comprehensive Error Recovery (Priority: Medium)
- **Issue:** System crashes or fails silently when errors occur
- **Implementation:** (Same as previous plan)

## 6. Testing and Validation Plan (Updated)

### 6.1 Phase 1: Build System Verification (New)
1. Verify that all packages can be built successfully with tsup
2. Confirm that dist folders contain the expected built files
3. Check that imports between packages correctly resolve

### 6.2 Phase 2: Token Access Verification
1. Modify the TelegramMultiAgentPlugin to log all available environment variables
2. Verify tokens are correctly loaded from the environment
3. Test token availability with a simple Telegram API call

### 6.3 Phase 3: Client Initialization Testing
1. Implement explicit client testing during initialization
2. Add detailed logging of client object structure
3. Test standalone client creation as fallback

### 6.4 Phase 4: End-to-End Message Testing
1. Send test messages to each agent
2. Monitor logs for message processing
3. Verify response generation
4. Confirm delivery via different pathways

## 7. System Dependencies and Build Process (New)

### 7.1 Package Manager
The project uses pnpm for package management with a workspace configuration to handle multiple packages.

### 7.2 Build Dependencies
- **tsup**: Version 8.3.5 - Used for TypeScript bundling
- **esbuild**: Version ^0.25.1 - Used by tsup for fast JS/TS bundling
- **typescript**: Version 5.6.3 - For type checking and transpilation
- **ts-node**: Version 10.9.2 - For running TypeScript files directly

### 7.3 Build Process
1. The build process starts from core dependencies and works upward
2. Each package has its own tsconfig.json for package-specific configurations
3. The root tsconfig.json provides base configurations inherited by all packages
4. tsup is used for bundling with both ESM and CommonJS formats
5. Custom build scripts may exist in certain packages for specialized build steps

### 7.4 Key Build Commands
```bash
# Build all packages
pnpm -r build

# Build a specific package
pnpm --filter @elizaos/client-direct build

# Clean build artifacts
pnpm -r clean

# Build and watch for changes
pnpm -r build --watch
```

## 8. Future Enhancements

### 8.1 Short-Term Improvements (1-2 weeks)
- Add conversation kickstarting for autonomous discussions
- Implement advanced memory management with context retention
- Add typing indicators and read receipts for more natural interactions
- Enhance character differentiation in responses
- Improve build system reliability with better error handling
- Create automated build order determination

### 8.2 Medium-Term Features (1-2 months)
- Add image and media handling capabilities
- Implement multi-turn conversation tracking
- Create dynamic personality adjustments based on user interactions
- Add topic suggestion system for autonomous discussion generation
- Establish CI/CD pipeline for automated testing and deployment

### 8.3 Long-Term Vision (3+ months)
- Implement cross-platform support beyond Telegram
- Add voice message processing and generation
- Create dynamic character evolution based on interactions
- Implement multi-agent collaborative tasks and group activities

## 9. Technical Dependencies

### 9.1 Core Dependencies
- Node.js v16+ with ESM support
- Telegraf library for Telegram API interaction
- SQLite 3 with better-sqlite3 adapter
- ElizaOS framework components
- tsup and esbuild for TypeScript bundling

### 9.2 Infrastructure Requirements
- Minimum 512MB RAM per agent instance
- Reliable network connection for Telegram API
- Persistent storage for SQLite databases
- Process monitoring for agent health checks

## 10. Current Debugging Progress (March 29)

### 10.1 Issues Addressed
- ✅ Added tsup to workspace dependencies
- ✅ Added esbuild to workspace dependencies
- ✅ Fixed database initialization path in init_database.js
- ✅ Verified client-direct source file exists at /root/eliza/packages/client-direct/src/index.ts

### 10.2 Issues Pending
- ❌ Fix relay server port conflict (EADDRINUSE on port 4000)
- ❌ Build missing client-direct package distribution files
- ❌ Resolve TypeScript errors in agent package
- ❌ Address missing runtime methods in agent implementation
- ❌ Fix bot token access issues in TelegramMultiAgentPlugin

### 10.3 Next Steps
1. Kill any processes using port 4000
2. Build @elizaos/client-direct and other required packages
3. Correct TypeScript errors in @elizaos/agent
4. Test agent startup with correct configuration
5. Verify relay server connection

## 11. Conclusion

The Valhalla multi-agent system has achieved stable registration and processing capabilities but requires targeted fixes for both build dependencies and message delivery through Telegram. By implementing the steps outlined in this plan, we should be able to restore full functionality and enable agents to respond to user messages through Telegram.

The core issues are a mix of build system configuration problems and connectivity issues that can be solved with proper dependency management, token handling, client initialization, and robust fallback mechanisms. With these fixes in place, the system will demonstrate the viability of autonomous multi-agent networks operating in real-world messaging platforms.

## 12. Appendices

### 12.1. Available Agent Endpoints

| Agent | Port | Chat ID |
|-------|------|---------|
| eth_memelord_9000 | 3000 | eth_memelord_9000_bot |
| bag_flipper_9000 | 3001 | bag_flipper_9000_bot |
| linda_evangelista_88 | 3002 | linda_evangelista_88_bot |
| vc_shark_99 | 3003 | vc_shark_99_bot |
| code_samurai_77 | 3004 | code_samurai_77_bot |
| bitcoin_maxi_420 | 3005 | bitcoin_maxi_420_bot |

### 12.2. System Management Commands

```bash
# View all logs
tail -f logs/*.log

# View relay server logs
tail -f logs/relay-server.log

# View specific agent logs
tail -f logs/eth_memelord_9000.log

# Check memory usage
ps aux --sort -rss | grep node

# Restart the system
./stop_agents.sh all && ./launch_valhalla.sh

# Restart a specific agent
./stop_agents.sh eth_memelord_9000 && ./start_single_agent.sh eth_memelord_9000 3000
```

### 12.3. Build Debugging Commands (New)

```bash
# Check node_modules structure
find packages -name node_modules -type d | sort

# Verify tsup installation
ls -la node_modules/.bin/tsup

# View TypeScript errors in detail
cd packages/agent && npx tsc --noEmit

# Find processes using specific ports
lsof -i :4000

# Clean all node_modules and reinstall
rm -rf node_modules
rm -rf */**/node_modules
pnpm install --no-frozen-lockfile

# Rebuild specific package with verbose logging
DEBUG=tsup pnpm --filter @elizaos/client-direct build
``` 