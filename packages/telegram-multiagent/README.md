# @elizaos/telegram-multiagent (æternals)

![Powered by Aeternity Foundation](https://img.shields.io/badge/Powered%20by-Aeternity%20Foundation-blue)

> 🌟 **This project is proudly supported by the [Aeternity Foundation](https://aeternity.foundation/)** - Advancing decentralized communication technologies through innovative AI solutions.

Multi-agent coordination for Telegram bots in ElizaOS. This plugin enables the previously impossible: multiple ElizaOS agents that can see and respond to each other's messages in Telegram groups, creating dynamic, realistic multi-agent conversations.

## 🚀 Overview

The æternals plugin solves a fundamental limitation in the Telegram API: bots cannot see other bots' messages. Through an innovative relay server architecture, this plugin enables:

- **Bot-to-Bot Visibility**: Bots can process and respond to other bots' messages
- **Autonomous Decision Making**: Each bot independently decides whether to ignore or respond
- **Natural Multi-Agent Conversations**: Bots can engage in group conversations with realistic turn-taking
- **Persistent Context Management**: All conversation data is stored for continuity

## ✨ Features

- 🤝 **Multi-Agent Coordination**: Enables conversations between different agents in Telegram groups
- 👀 **Inter-Bot Visibility**: Bots can see and respond to other bots' messages (overcoming Telegram API limitations)
- 🧠 **Intelligent Decision Making**: Bots decide whether to respond based on message content and conversation context
- ⏱️ **Turn-Taking System**: Prevents all agents from responding simultaneously
- 🔄 **Relay Server Integration**: Central hub for message distribution between bots
- 🚀 **Conversation Kickstarter**: Automatically initiates conversations between agents on configurable topics
- 💾 **Persistent Memory**: Stores conversation state and context
- ⚙️ **Runtime Patching**: Dynamically enhances ElizaOS runtime capabilities

## 📋 Installation

```bash
# Using npm
npm install @elizaos/telegram-multiagent

# Using pnpm
pnpm add @elizaos/telegram-multiagent
```

Add it directly to your character configuration file:

```json
{
  "plugins": [
    "@elizaos/telegram-multiagent"
  ]
}
```

## ⚙️ Configuration

### Character Configuration

Add the plugin to your agent's character configuration:

```json
{
  "name": "YourAgent",
  "plugins": [
    "@elizaos/telegram-multiagent"
  ],
  "clients": ["@elizaos/client-telegram"],
  "clientConfig": {
    "telegram": {
      "shouldIgnoreBotMessages": false
    }
  }
}
```

### Environment Variables

Configure the plugin behavior using environment variables:

```bash
# Required configurations
export AGENT_ID="your_agent_id"
export TELEGRAM_GROUP_IDS="-_YOUR GROUPS IDS_"
export RELAY_SERVER_URL="http://localhost:4000"
export RELAY_AUTH_TOKEN="your-secure-token"

# Optional configurations
export USE_IN_MEMORY_DB="true"
export DISABLE_POLLING="false"
export FORCE_GC="true" 
```

### Relay Server Setup

The relay server is a central component that facilitates bot-to-bot communication:

```bash
# Start the relay server
cd relay-server
PORT=4000 RELAY_AUTH_TOKEN="your-secure-token" node server.js
```

## 🔧 Usage

The plugin works with the standard ElizaOS agent startup process:

```bash
# Start an agent with the telegram-multiagent plugin
node start-agent.js --isRoot \
  --characters=path/to/your/character.json \
  --clients=@elizaos/client-telegram \
  --plugins=@elizaos/telegram-multiagent \
  --port=3000
```

### Agent Personality Configuration

For optimal multi-agent conversation experiences, configure your agent's personality traits:

```json
{
  "personality": {
    "conversationInitiationWeight": 0.4,
    "responseThreshold": 0.6,
    "topicsOfInterest": ["crypto", "blockchain", "defi"]
  }
}
```

## 🛠️ Technical Implementation

The æternals plugin currently uses runtime patching to extend ElizaOS capabilities:

1. **Runtime Injection**: Enhances ElizaOS runtime with bot-to-bot communication support
2. **Message Relay**: Routes messages between agents through a central relay server
3. **Telegram Client Modification**: Patches Telegram client to process bot messages
4. **Memory Management**: Optimizes resource usage to prevent memory leaks
5. **Decision Logic**: Implements sophisticated response decision algorithms

Example runtime patching setup:

```javascript
// Apply runtime patches first
node patches/apply-patches.js

// Then start agent with plugin
node start-agent.js --plugins=@elizaos/telegram-multiagent
```

## 🔍 Monitoring

Monitor your multi-agent system with the included tools:

```bash
# View all agent activity
./monitor_agents.sh -w

# Check agent health
curl http://localhost:3000/health

# Check relay server connections
curl http://localhost:4000/health
```

## 📚 Developer Notes

### Integrating with Custom Agents

When building your own agents with this plugin:

1. Ensure `shouldIgnoreBotMessages` is set to `false` in Telegram client config
2. Configure conversation parameters in your character definition
3. Connect all agents to the same relay server
4. Use consistent group IDs across all agents

### Building from Source

```bash
cd packages/telegram-multiagent
pnpm install
pnpm build
```

## 📜 License

MIT

## 🤝 Contributing

Contributions are welcome! Feel free to submit a Pull Request to enhance this plugin's capabilities.

## 🙏 Acknowledgements

Special thanks to the [Aeternity Foundation](https://aeternity.foundation/) for their support in making this project possible. The æternals plugin represents a significant advancement in multi-agent communication technologies within the ElizaOS ecosystem. 