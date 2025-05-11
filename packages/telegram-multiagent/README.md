# @elizaos/telegram-multiagent (æternals)

![Powered by Aeternity Foundation](https://img.shields.io/badge/Powered%20by-Aeternity%20Foundation-blue)

> 🌟 **This project is proudly supported by the [Aeternity Foundation](https://aeternity.foundation/)** - Advancing decentralized communication technologies.

A Telegram multi-agent coordination plugin for ElizaOS that enables agents to:

- See and respond to each other's messages
- Manage shared conversations with unique IDs and participant tracking
- Exhibit distinct personalities and realistic behaviors

## 🚀 Overview

Telegram bots cannot normally see other bots' messages. This plugin works with a relay server to:

1. **Relay Messages**: Forward messages between agents
2. **Manage Conversations**: Assign conversation IDs, track state, and persist history
3. **Control Turn-Taking**: Enforce reply order via FIFO, round-robin, or LLM-assisted strategies
4. **Enhance Personality**: Style messages with traits, emojis, and tone using PersonalityEnhancer
5. **Simulate Typing**: Show typing indicators and variable delays for natural pacing
6. **Persist Context**: Use in-memory state for speed and SQLite for durability

## ✨ Features

- 🤝 **Multi-Agent Coordination**: Enable group discussions among multiple bots
- 👀 **Inter-Bot Visibility**: Overcome Telegram API limitations with a relay server
- 🧠 **Intelligent Decision Making**: Decide to ignore or respond based on content and context
- ⏱️ **Turn-Taking System**: Prevent overlapping replies with configurable strategies
- 🔄 **Relay Server Integration**: Central hub for reliable message distribution
- 🚀 **Conversation Kickstarter**: Configurable automatic initiation of new topics
- 💾 **Persistent Memory**: Hybrid in-memory + SQLite storage for full conversation history
- 🎭 **Personality Enhancer**: Apply tone, emojis, and phrasing for each agent
- 👀 **Typing Simulation**: Realistic typing indicators and response delays
- ⚙️ **Runtime Patching**: Dynamically extend ElizaOS runtime capabilities

## 📦 Installation

Install via pnpm or npm:

```bash
pnpm add @elizaos/telegram-multiagent
# or
npm install @elizaos/telegram-multiagent
```

## 🔧 Configuration

### Character Configuration

Add to your agent's character JSON:

```json
{
  "plugins": ["@elizaos/telegram-multiagent"],
  "clients": ["@elizaos/client-telegram"],
  "pluginConfig": {
    "telegram-multiagent": {
      "relayServerUrl": "http://localhost:4000",
      "authToken": "<your-relay-token>",
      "groupIds": ["-1001234567890"],
      "disablePolling": false,
      "maxRetries": 3,
      "conversationCheckIntervalMs": 60000,
      "dbPath": "./data/telegram-multiagent.db",
      "kickstarterConfig": {
        "probabilityFactor": 0.1,
        "minIntervalMs": 300000
      }
    }
  }
}
```

### Environment Variables

| Variable                       | Description                                     | Default                |
|--------------------------------|-------------------------------------------------|------------------------|
| `AGENT_ID`                     | Unique identifier for the agent                 | (required)             |
| `TELEGRAM_GROUP_IDS`           | Comma-separated Telegram group IDs              | (required)             |
| `RELAY_SERVER_URL`             | URL of the relay server                         | `http://localhost:4000`|
| `RELAY_AUTH_TOKEN`             | Authentication token for relay server           | (required)             |
| `USE_IN_MEMORY_DB`             | Use in-memory state instead of SQLite           | `false`                |
| `DISABLE_POLLING`              | Disable Telegram polling                        | `false`                |

## 🔍 Quick Start

1. **Start Relay Server**

   ```bash
   cd relay-server
   PORT=4000 RELAY_AUTH_TOKEN="<your-relay-token>" node server.js
   ```

2. **Start Agent**

   ```bash
   pnpm start -- --plugins="@elizaos/telegram-multiagent" \
     --clients="@elizaos/client-telegram" --port=3000
   ```

3. **Verify**

   - Relay health: `curl http://localhost:4000/health`
   - Agent logs: `tail -f logs/agent.log`

## 📚 API Reference

### `TelegramMultiAgentPlugin`

- `register(runtime: IAgentRuntime)`: Attach plugin to ElizaOS runtime
- `initialize()`: Set up Telegram client, relay, and sub-components
- `shutdown()`: Disconnect relay and stop polling
- `forwardToRelay(chatId: string, text: string)`: Forward custom messages

### `ConversationManager`

- `handleMessage(message: RelayMessage, currentAgentId?)`: Process incoming messages
- `shouldAgentRespond(...)`: Determine if agent should reply
- `setTurnStrategy(strategy)`: Configure reply order

### `PersonalityEnhancer`

- `enhanceMessage(text, context?)`: Apply personality effects
- `calculateResponseDelay(context?)`: Compute realistic delays

## 🤝 Contributing

Contributions welcome! Please open issues or pull requests.

## ⚖️ License

MIT

## 🤝 Contributing

Contributions are welcome! Feel free to submit a Pull Request to enhance this plugin's capabilities.

## 🙏 Acknowledgements

Special thanks to the [Aeternity Foundation](https://aeternity.foundation/) for their support in making this project possible. The æternals plugin represents a significant advancement in multi-agent communication technologies within the ElizaOS ecosystem. 