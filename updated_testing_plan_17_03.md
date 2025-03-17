# Testing Plan for ElizaOS Telegram Multi-Agent Plugin

This testing plan outlines the process for validating the functionality of the ElizaOS Telegram Multi-Agent Plugin, focusing on the conversation kickstarting, agent tagging, and multi-agent interaction features.

## Prerequisites

Before starting testing, ensure you have:

1. ElizaOS development environment properly set up
2. Access to a Telegram bot token and at least one test group
3. SQLite installed for database testing
4. Multiple agent identities configured for testing multi-agent interactions

## Environment Setup

### 1. Stop Currently Running Agents

```bash
# Find running ElizaOS processes
ps aux | grep elizaos

# Or use the provided script
./stop_agents.sh
```

### 2. Prepare Development Environment

```bash
# Ensure you're on the correct branch
git checkout main  # or your development branch

# Build the project
pnpm build
```

### 3. Start the Agents

```bash
# Start all agents
./start_agents.sh
```

## Progress and Status

### Completed Steps
- ✅ Installed and confirmed the better-sqlite3 dependency works properly
- ✅ Successfully initialized the SQLite adapter with file-based storage
- ✅ Configured group IDs to load from environment variables
- ✅ Verified that the TELEGRAM_GROUP_IDS environment variable is set correctly
- ✅ Confirmed that agents are parsing the group IDs correctly
- ✅ Verified the connection to the relay server with heartbeat messages

### Current Issues
- ❌ Conversation kickstarting not initiating actual conversations
- ❌ Not able to observe agent tagging functionality
- ⚠️ Bootstrap plugin initialization warning (not critical)
- ⚠️ TypeScript warnings in build process (currently bypassed with YOLO mode)

### Next Testing Tasks
- ⏳ Test `/kickstart` command manually in Telegram
- ⏳ Verify agent tagging in kickstarted conversations
- ⏳ Test multi-agent interactions in the Telegram group
- ⏳ Verify SQLite data persistence across restarts

## Testing Scenarios

### 1. Basic Connection and Plugin Initialization

**Test 1.1: Plugin Initialization**
- **Action**: Start the agent with the plugin enabled
- **Expected**: Log messages should indicate successful initialization
- **Verification**:
  - Check console output for "[INITIALIZE] TelegramMultiAgentPlugin: Initialization complete"
  - Verify SQLite database file is created at the configured path
- **Status**: ✅ PASS - Plugin initializes successfully with file-based database at `/root/eliza/agent/data/telegram-multiagent.sqlite`

**Test 1.2: Relay Connection**
- **Action**: Monitor connection to the Telegram relay server
- **Expected**: Agent should connect to relay server without errors
- **Verification**: 
  - Check logs for "Connected to relay server" message
  - Monitor heartbeat messages with the relay server
- **Status**: ✅ PASS - Heartbeat messages are being exchanged with relay server regularly

**Test 1.3: Group ID Configuration**
- **Action**: Configure group IDs through environment variables
- **Expected**: Agent should load group IDs from environment variables
- **Verification**:
  - Check logs for "Found TELEGRAM_GROUP_IDS environment variable" message
  - Verify "Parsed X group IDs from environment" message shows the correct IDs
- **Status**: ✅ PASS - Group IDs are correctly loaded from the TELEGRAM_GROUP_IDS environment variable

### 2. Conversation Kickstarter Testing

**Test 2.1: Manual Kickstarting (Command-Based)**
- **Action**: 
  - Send `/kickstart` command in Telegram group
  - Send `/kickstart artificial intelligence trends` in Telegram group
- **Expected**: 
  - Agent should immediately start a conversation
  - The second command should start a conversation about the specified topic
- **Verification**:
  - Agent responds with a conversation starter message
  - Message includes the specified topic for the second command
- **Status**: ⏳ PENDING - Ready for testing

**Test 2.2: Conversation Topic Selection**
- **Action**: Trigger multiple kickstarts without specifying topics
- **Expected**: Agent should select topics based on relevance and personality
- **Verification**:
  - Check variety of topics selected
  - Verify topics align with agent personality traits
- **Status**: ⏳ PENDING - Ready for testing after Test 2.1 passes

**Test 2.3: Automatic Kickstarting**
- **Action**: Run the agent for 30-60 minutes
- **Expected**: Agent should automatically initiate conversations
- **Verification**:
  - Monitor Telegram group for new conversation topics
  - Check logs for conversation initiation messages
  - Verify conversations are initiated within the configured time interval
- **Status**: ⏳ PENDING - Requires debugging of automatic kickstarting mechanism

### 3. Agent Tagging System

**Test 3.1: Basic Tagging**
- **Action**: Configure multiple agents in the same group and trigger kickstart
- **Expected**: Conversation starter should include @mentions of other agents
- **Verification**:
  - Check message text for @username formatting
  - Verify the number of tagged agents doesn't exceed maxAgentsToTag (default: 2)
- **Status**: ⏳ PENDING - Ready for testing after Test 2.1 passes

**Test 3.2: Agent Response to Tags**
- **Action**: Monitor agent responses after being tagged
- **Expected**: Tagged agents should respond to the conversation
- **Verification**:
  - Check if tagged agents engage with the topic
  - Verify conversation flow appears natural
- **Status**: ⏳ PENDING - Ready for testing after Test 3.1 passes

### 4. SQLite Database Integration

**Test 4.1: Database File Creation**
- **Action**: Start an agent with the SQLite adapter enabled
- **Expected**: Database file should be created at the configured path
- **Verification**:
  - Check for the presence of the file at `/root/eliza/agent/data/telegram-multiagent.sqlite`
  - Verify file permissions are correct
- **Status**: ✅ PASS - Database file is created correctly

**Test 4.2: Conversation Recording**
- **Action**: Trigger several conversations using the `/kickstart` command
- **Expected**: Conversations should be recorded in the database
- **Verification**:
  ```bash
  sqlite3 /root/eliza/agent/data/telegram-multiagent.sqlite "SELECT * FROM agent_conversations;"
  ```
  - Check for conversation records with correct agent IDs, topics, and timestamps
- **Status**: ⏳ PENDING - Need to test after successful kickstart

**Test 4.3: Database Persistence**
- **Action**: After creating conversations, restart the agent
- **Expected**: Database data should persist across restarts
- **Verification**:
  - Check database contents after restart
  - Verify conversation history is maintained
- **Status**: ⏳ PENDING - Need to test after successful kickstart and data recording

### 5. Multi-Agent Interaction

**Test 5.1: Two-Agent Conversation**
- **Action**: Configure two agents in the same group and trigger kickstart
- **Expected**: Two agents should have a coherent conversation
- **Verification**:
  - Monitor messages between the two agents
  - Verify contextual awareness in responses
  - Check that conversation flows naturally
- **Status**: ⏳ PENDING - Need to test after successful kickstart

**Test 5.2: Multiple Agent Conversation**
- **Action**: Configure 3+ agents in the same group and trigger kickstart
- **Expected**: Multiple agents should participate in a coherent conversation
- **Verification**:
  - Monitor participation from all agents
  - Verify conversation makes sense with multiple participants
  - Check that agents don't all respond simultaneously
- **Status**: ⏳ PENDING - Need to test after Test 5.1 passes

### 6. Error Handling and Edge Cases

**Test 6.1: Database Resilience**
- **Action**: Temporarily make the database inaccessible during operation
- **Expected**: Plugin should handle database errors gracefully
- **Verification**:
  - Create a situation where the database is temporarily unavailable
  - Check for appropriate error logs
  - Verify operation resumes when database access is restored
- **Status**: ⏳ PENDING - To be tested after database operations confirmed working

**Test 6.2: Long-Running Stability**
- **Action**: Run the system for an extended period (24+ hours)
- **Expected**: System should remain stable without resource leaks
- **Verification**:
  - Monitor memory usage over time
  - Check for error accumulation in logs
  - Verify conversations continue to be kickstarted according to schedule
- **Status**: ⏳ PENDING - To be tested after basic functionality verified

## 7. Advanced Feature Testing

This section covers specific tests for the Retrieval-Augmented Generation (RAG) functionality, character enhancements, and persistent storage features described in the `rag_considerations.md` document.

### 7.1 RAG Functionality Testing

**Test 7.1.1: Message History Storage**
- **Action**: Send multiple messages in a Telegram group with agents present
- **Expected**: Messages should be stored in the database with appropriate metadata
- **Verification**:
  ```bash
  sqlite3 /root/eliza/agent/data/telegram-multiagent.sqlite "SELECT * FROM agent_message_history ORDER BY sent_at DESC LIMIT 10;"
  ```
  - Verify messages are being recorded with correct agent_id, group_id, and content
- **Status**: ⏳ PENDING - Need to confirm message recording functionality

**Test 7.1.2: Context Retrieval**
- **Action**: 
  1. Have an agent participate in a conversation
  2. Wait for the agent to respond to a message that references something mentioned earlier
- **Expected**: Agent should appropriately reference earlier conversation elements
- **Verification**:
  - Check log entries for context retrieval operations
  - Verify that agent responses incorporate information from earlier messages
- **Status**: ⏳ PENDING - Requires message history functionality

**Test 7.1.3: RAG-Enhanced Kickstarting**
- **Action**: After several conversations in a group, trigger a kickstart
- **Expected**: The kickstarted conversation should relate to previously discussed topics
- **Verification**:
  - Check if kickstarted topic relates to recent group conversations
  - Analyze logs for evidence of RAG-based topic selection
- **Status**: ⏳ PENDING - Requires successful kickstart implementation

### 7.2 Character Enhancement Testing

**Test 7.2.1: Personality Trait Application**
- **Action**: Compare messages from different agents with different personalities
- **Expected**: Messages should reflect the different personality traits of each agent
- **Verification**:
  - ETH Memelord should use more emojis and casual language
  - Bitcoin Maxi might use more decisive and opinionated language
  - VC Shark would use more business and analytical terminology
- **Status**: ⏳ PENDING - Ready for testing after successful kickstart

**Test 7.2.2: Consistent Voice Patterns**
- **Action**: Monitor multiple messages from the same agent over time
- **Expected**: Agent should maintain consistent voice patterns and style
- **Verification**:
  - Check for consistent use of introductory and concluding phrases
  - Verify emoji usage patterns remain consistent with personality
  - Check that formality level remains consistent
- **Status**: ⏳ PENDING - Ready for testing after successful kickstart

**Test 7.2.3: Context-Appropriate Enhancement**
- **Action**: Observe agent responses in different conversation contexts (technical discussions vs casual chat)
- **Expected**: Enhancement should adapt to conversation context while maintaining character
- **Verification**:
  - In technical discussions, enhancements should be more subtle
  - In casual conversations, personality can be more prominent
- **Status**: ⏳ PENDING - Requires multiple conversation types

### 7.3 Persistent Storage Testing

**Test 7.3.1: Restart Conversation Continuity**
- **Action**:
  1. Start a conversation with multiple agents
  2. Stop all agents using `./stop_agents.sh`
  3. Restart agents using `./start_agents.sh`
  4. Continue the conversation
- **Expected**: Conversation should continue naturally with context preserved
- **Verification**:
  - Agents should refer to topics discussed before restart
  - No repetition of already covered points
- **Status**: ⏳ PENDING - Requires successful conversation initiation

**Test 7.3.2: Long-Term Memory**
- **Action**:
  1. Have specific interactions with agents
  2. After 24+ hours, reference those interactions
- **Expected**: Agents should recall previous interactions
- **Verification**:
  - Agents remember user preferences/topics from previous days
  - Verify database retention of older messages
- **Status**: ⏳ PENDING - Long-term test

**Test 7.3.3: Database Performance**
- **Action**: 
  1. Generate substantial message history (100+ messages)
  2. Measure query performance for context retrieval
- **Expected**: Queries should remain performant even with larger history
- **Verification**:
  - Monitor database query times in logs
  - Check for any lag in agent responses due to database operations
- **Status**: ⏳ PENDING - Requires substantial data accumulation

## 8. RAG and Character Enhancement Commands

Additional commands for testing advanced features:

### RAG Testing Commands
```bash
# Check message history table
sqlite3 /root/eliza/agent/data/telegram-multiagent.sqlite "SELECT COUNT(*) FROM agent_message_history;"

# Check recent messages for a specific agent
sqlite3 /root/eliza/agent/data/telegram-multiagent.sqlite "SELECT sent_at, content FROM agent_message_history WHERE agent_id = 'eth_memelord_9000' ORDER BY sent_at DESC LIMIT 5;"

# Check conversation topics
sqlite3 /root/eliza/agent/data/telegram-multiagent.sqlite "SELECT * FROM conversation_topics ORDER BY created_at DESC LIMIT 5;"
```

### Character Enhancement Testing Commands
```bash
# Search logs for personality trait application
grep "PersonalityEnhancer" /root/eliza/logs/eth_memelord_9000.log | tail -n 20

# Compare message enhancements across different agents
grep "enhanceMessage" /root/eliza/logs/eth_memelord_9000.log | tail -n 5
grep "enhanceMessage" /root/eliza/logs/bag_flipper_9000.log | tail -n 5

# Check character trait extraction
grep "Extracted traits" /root/eliza/logs/eth_memelord_9000.log | tail -n 10
```

### Persistence Testing Commands
```bash
# Check database file stats
ls -la /root/eliza/agent/data/telegram-multiagent.sqlite

# Monitor database size over time
du -h /root/eliza/agent/data/telegram-multiagent.sqlite

# Check database schema
sqlite3 /root/eliza/agent/data/telegram-multiagent.sqlite ".schema"

# Backup database for testing
cp /root/eliza/agent/data/telegram-multiagent.sqlite /root/eliza/agent/data/backup_$(date +%Y%m%d).sqlite
```

## 9. Integration Test Scenarios

These scenarios test how RAG, character enhancement, and persistence work together:

**Scenario 9.1: Topic Continuity Across Sessions**
1. Start a conversation about a specific cryptocurrency topic
2. Allow multiple agents to contribute
3. Restart all agents
4. Reference the topic again
5. Verify agents recall previous points and continue naturally

**Scenario 9.2: Character-Appropriate RAG Utilization**
1. Have different agents discuss the same technical topic
2. Observe how each agent's personality affects how they incorporate retrieved context
3. Verify technical agents provide more details, while casual agents simplify

**Scenario 9.3: Multi-Day Conversation Evolution**
1. Start conversations on several topics
2. Continue over multiple days with system restarts
3. Observe how agents reference older conversations
4. Verify personality consistency throughout the extended period

## Testing Commands

Here are specific commands to help with testing:

### Verify Running Agents
```bash
# Check running agents
ps aux | grep elizaos | grep -v grep

# Check logs for specific agent
tail -n 100 logs/eth_memelord_9000.log
```

### Testing Kickstart Command
1. Join the Telegram group with the ID defined in the TELEGRAM_GROUP_IDS environment variable
2. Send the following commands to test manual kickstarting:
   - `/kickstart` - Should start a conversation with a random topic
   - `/kickstart crypto` - Should start a conversation about crypto
   - `/kickstart ethereum vs solana` - Should start a conversation comparing these blockchains

### Checking SQLite Database
```bash
# Check if database file exists
ls -la /root/eliza/agent/data/telegram-multiagent.sqlite

# Use SQLite CLI to examine tables
sqlite3 /root/eliza/agent/data/telegram-multiagent.sqlite ".tables"

# Query specific tables
sqlite3 /root/eliza/agent/data/telegram-multiagent.sqlite "SELECT * FROM sqlite_master;"
```

### Checking Group IDs Configuration
```bash
# Verify environment variable is set
echo $TELEGRAM_GROUP_IDS

# Check logs for group ID parsing
grep "Parsed .* group IDs from environment" logs/eth_memelord_9000.log
```

### Testing Relay Server
```bash
# Check relay server is running
ps aux | grep relay-server

# Check relay logs
tail -n 100 logs/relay_server.log
```

## Troubleshooting Guide

Based on our current findings, here are key troubleshooting steps for common issues:

### Conversation Kickstarting Issues

1. **Kickstart Command Not Working**:
   - Check if the command handler is registered by looking for "command" or "kickstart" in the logs
   - Verify the command format (it should be `/kickstart` or `/kickstart topic`)
   - Check for errors in logs immediately after sending the command
   - Try restarting the agent with `./stop_agents.sh && ./start_agents.sh`

2. **No Automatic Kickstarting**:
   - Check logs for "Checking conversations" messages (should appear every 30 seconds)
   - Verify that the ConversationKickstarter class is being properly initialized
   - Check the kickstarterConfig settings in logs vs configuration file
   - Monitor logs for any errors related to the kickstarter functionality

### Configuration Issues

1. **Group ID Issues**:
   - Verify the TELEGRAM_GROUP_IDS environment variable is set correctly in start_agents.sh
   - Check logs for "Found TELEGRAM_GROUP_IDS environment variable" and "Parsed X group IDs from environment"
   - Ensure the group ID format is correct (should be a number)

2. **Database Configuration**:
   - Check logs for "Initializing SQLite adapter with db path"
   - Verify the database file exists and is writable
   - Check for SQLite-related errors in logs

## Next Steps

Based on the current status, these are the priority testing tasks:

1. Test the `/kickstart` command in Telegram to verify basic conversation initiation
2. Debug why automatic kickstarting is not working
3. Test the agent tagging functionality to see if agents respond to tags
4. Verify database operations for conversation recording
5. Test multi-agent interactions with different agent personalities

## Expected Results

When the system is functioning correctly, you should observe:

1. Agents initiating conversations periodically (every 30-60 minutes)
2. Agents tagging each other naturally in conversations
3. Tagged agents responding to conversations
4. Natural, coherent interactions between multiple agents
5. Conversations being stored in the SQLite database for future reference
6. System remains stable during extended operation

## Test Reporting

For each test, document:
- Test name and ID
- Date and time executed
- Test result (PASS/FAIL/BLOCKED)
- Observations and logs
- Any follow-up actions needed 