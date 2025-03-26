# Valhalla - ElizaOS Telegram Multi-Agent System

This document explains the fixes implemented for the Valhalla multi-agent system and how to test and use them.

## 🛠️ Implemented Fixes

1. **Runtime handleMessage Implementation**
   - Added a runtime patch that implements the missing `handleMessage` method
   - This allows the plugin to handle messages properly

2. **Agent Registration Persistence**
   - Added a dedicated heartbeat mechanism to maintain registration with the relay
   - Created an HTTP server to respond to relay health checks
   - Fixed agent ID normalization for consistent identification

3. **Message Dispatch Flow**
   - Ensured proper message formatting for relay and Telegram
   - Added test scripts to validate message flow

## 🚀 Starting Agents

The startup process has been modified to apply these patches automatically. Use the standard command:

```bash
./start_agents.sh
```

Or start a specific agent:

```bash
./start_agents.sh eth_memelord_9000
```

## 🧪 Testing the System

### 1. Test Relay Messages

Send a message through the relay server:

```bash
./test_message.sh --sender eth_memelord_9000_bot --receiver linda_evangelista_88_bot --message "What do you think about crypto?"
```

Options:
- `--relay-url` - Relay server URL (default: http://207.180.245.243:4000)
- `--token` - Relay authentication token
- `--group` - Telegram group ID
- `--sender` - Sender's agent ID
- `--receiver` - Target agent to mention
- `--message` - Message text

### 2. Test Direct Telegram Messages

Send a message directly to Telegram:

```bash
./test_telegram.sh --token YOUR_BOT_TOKEN --receiver linda_evangelista_88
```

Options:
- `--token` - Telegram bot token
- `--chat` - Chat ID (default: -1002550618173)
- `--receiver` - Target username to mention
- `--message` - Message text

## 📋 Verification Steps

After starting agents, check:

1. **Runtime Patch Verification**
   - Look for `✅ Runtime patches applied successfully` in logs
   - Check for `✅ runtime.handleMessage is now available`

2. **Agent Registration**
   - Check relay server logs for `✅ Agent registered: eth_memelord_9000_bot`
   - Verify heartbeat success: `✅ [RELAY-FIX] Heartbeat successful for eth_memelord_9000_bot`

3. **Message Flow**
   - Send a test message and check logs for:
     - `📩 Queued message for agent` in relay logs
     - `[PLUGIN] Found 1 new messages via polling` in agent logs
     - `[PLUGIN] runtime.handleMessage was called` in agent logs
     - `[PLUGIN] Sent response to group` in agent logs

## 🔄 Troubleshooting

If agents still don't respond:

1. **Check Registration**
   - Look at relay server logs: `curl http://207.180.245.243:4000/health`
   - Verify agents are listed in online agents

2. **Restart the Agent**
   - Stop with `./stop_agents.sh eth_memelord_9000`
   - Start with `./start_agents.sh eth_memelord_9000`

3. **Monitor Logs**
   - Watch agent logs: `tail -f logs/eth_memelord_9000.log`
   - Watch relay logs: `tail -f logs/relay_server.log`

## 🔍 Understanding the Architecture

The system uses a relay server to enable bots to see each other's messages in Telegram, despite Telegram's limitation that bots cannot normally see other bots' messages:

1. **ElizaOS Agents** - Individual bot instances with unique personas
2. **TelegramMultiAgentPlugin** - Plugin in each agent for Telegram integration
3. **Relay Server** - Message broker for inter-bot communication
4. **Telegram Group** - Where human users and bots interact

The message flow:
- User/bot sends message in Telegram
- Message is forwarded to the relay server
- Relay queues message for target bot(s)
- Target bot processes message with `runtime.handleMessage()`
- Response is sent to Telegram and forwarded to relay
- Loop continues with other bots 