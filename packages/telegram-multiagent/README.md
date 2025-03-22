# @elizaos/telegram-multiagent

Multi-agent coordination for Telegram bots in ElizaOS. This plugin enables multiple ElizaOS agents to participate in group conversations in Telegram, creating more engaging and natural interactions.

## Features

- 🤝 **Multi-Agent Coordination**: Enables conversations between different agents in Telegram groups
- 🗣️ **Turn Taking**: Intelligent turn-taking system to prevent all agents from responding simultaneously
- 🧠 **Memory-Based State Tracking**: Uses ElizaOS memory system for persistent conversation state
- 🚀 **Conversation Kickstarter**: Automatically initiates conversations between agents on interesting topics
- ⚙️ **Fully Configurable**: Extensive configuration options for customizing behavior

## Installation

```bash
npm install @elizaos/telegram-multiagent
```

## Configuration

Configure the plugin in your agent's configuration file:

```json
{
  "plugins": {
    "telegram-multiagent": {
      "enabled": true,
      "relayServerUrl": "https://your-relay-server.com",
      "authToken": "your-auth-token",
      "groupIds": ["123456789", "987654321"],
      "conversationCheckIntervalMs": 60000,
      "kickstarterConfig": {
        "probabilityFactor": 0.2,
        "minIntervalMs": 300000,
        "includeTopics": true,
        "shouldTagAgents": true,
        "maxAgentsToTag": 2
      }
    }
  }
}
```

### Environment Variables

You can also configure the plugin using environment variables:

- `TELEGRAM_MULTIAGENT_ENABLED`: Enable/disable the plugin (`true`/`false`)
- `TELEGRAM_RELAY_SERVER_URL`: URL of the Telegram relay server
- `TELEGRAM_AUTH_TOKEN`: Authentication token for the relay server
- `TELEGRAM_GROUP_IDS`: Comma-separated list of group IDs to monitor
- `TELEGRAM_DB_PATH`: Path to the database file
- `TELEGRAM_LOG_LEVEL`: Log level (`debug`, `info`, `warn`, `error`)

## Usage

The plugin automatically registers with the ElizaOS runtime when installed. It will:

1. Connect to the Telegram relay server
2. Register the agent for message reception
3. Monitor configured groups for messages
4. Respond to messages based on conversation state
5. Periodically initiate new conversations if conditions are right

### Programmatic Usage

You can also use components of the plugin directly in your code:

```typescript
import { TelegramRelay, ConversationManager } from '@elizaos/telegram-multiagent';

// Create a relay instance
const relay = new TelegramRelay({
  relayServerUrl: 'https://your-relay-server.com',
  authToken: 'your-auth-token',
  agentId: 'your-agent-id'
}, logger);

// Connect to the relay server
await relay.connect();

// Send a message
await relay.sendMessage('123456789', 'Hello from my agent!');
```

## Conversation Kickstarter

The plugin includes a conversation kickstarter that periodically initiates new conversations between agents. You can configure:

- Probability of starting conversations
- Minimum time between conversation attempts
- Whether to tag other agents
- Maximum number of agents to tag
- Whether to include topics

## Memory Management

The plugin uses the ElizaOS memory system to store:

- Conversation states
- Message history
- Agent participation information

This allows for persistent state across plugin restarts and provides context for the agent's responses.

## Development

### Building the Plugin

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Run tests
npm test
```

### Running with Docker

```bash
docker run -e TELEGRAM_AUTH_TOKEN=your-token -e TELEGRAM_GROUP_IDS=123456789 elizaos/telegram-multiagent
```

## License

MIT License

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 