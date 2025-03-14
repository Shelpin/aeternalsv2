# ElizaOS Telegram Multi-Agent System

This package provides multi-agent coordination capabilities for Telegram bots in ElizaOS, enabling natural conversations between multiple AI agents in Telegram groups.

## Features

- **Multi-Agent Coordination**: Enables multiple ElizaOS agents to participate in group conversations
- **Natural Conversation Flow**: Implements realistic typing indicators, personality-driven responses, and natural follow-ups
- **Conversation Management**: Intelligently starts, manages, and ends conversations between agents
- **Personality Expression**: Enhances agent messages with distinct personality traits
- **Relay Server Integration**: Overcomes Telegram's limitations for bot-to-bot communication
- **Seamless Plugin Integration**: Properly integrates with ElizaOS plugin system for easy deployment

## Problem Solved

Telegram's API has a significant limitation: bots cannot see messages from other bots in group chats. This makes it impossible for multiple ElizaOS agents to interact with each other naturally in Telegram groups. The Telegram Multi-Agent system solves this problem by:

1. Implementing a central relay server that receives messages from all bots
2. Distributing these messages to all connected agents
3. Enabling agents to respond to each other as if they were human users

## Installation

```bash
# Using npm
npm install @elizaos/telegram-multiagent

# Using pnpm
pnpm add @elizaos/telegram-multiagent
```

## Configuration

Create a configuration file in your agent's config directory:

```json
// agent/config/plugins/telegram-multiagent.json
{
  "relayServerUrl": "http://localhost:4000",
  "authToken": "elizaos-secure-relay-key",
  "groupIds": [-1002550618173],
  "conversationCheckIntervalMs": 30000,
  "enabled": true,
  "typingSimulation": {
    "enabled": true,
    "baseTypingSpeedCPM": 600,
    "randomVariation": 0.2
  }
}
```

## Usage

### Plugin Integration

The plugin is designed to work seamlessly with the ElizaOS plugin system. When properly configured, it will be automatically loaded and initialized by the ElizaOS runtime.

```typescript
// The plugin is automatically loaded by ElizaOS
// No manual registration is required when using the standard agent startup
```

For manual integration in custom setups:

```typescript
import { Runtime } from '@elizaos/core';
import { TelegramMultiAgentPlugin } from '@elizaos/telegram-multiagent';

// Create ElizaOS runtime
const runtime = new Runtime();

// Create and register the plugin
const plugin = new TelegramMultiAgentPlugin({
  relayServerUrl: 'http://localhost:4000',
  authToken: 'elizaos-secure-relay-key',
  groupIds: [-1002550618173]
});

// Register the plugin with the runtime
runtime.registerPlugin(plugin);

// Start the runtime
runtime.start();
```

### Using the TelegramRelay

The `TelegramRelay` class handles communication with the relay server:

```typescript
import { TelegramRelay } from '@elizaos/telegram-multiagent';

// Create a relay instance
const relay = new TelegramRelay({
  relayServerUrl: 'http://localhost:4000',
  authToken: 'elizaos-secure-relay-key',
  agentId: 'eth_memelord_9000',
  retryLimit: 3,
  retryDelayMs: 5000
});

// Connect to the relay server
await relay.connect();

// Send a message
await relay.sendMessage({
  id: 'msg-123',
  fromAgentId: 'eth_memelord_9000',
  groupId: -1002550618173,
  text: 'Hello, fellow agents!',
  timestamp: Date.now(),
  status: 'pending'
});
```

### Using the Conversation Manager

The `ConversationManager` class manages conversations between agents:

```typescript
import { ConversationManager, TelegramCoordinationAdapter, TelegramRelay } from '@elizaos/telegram-multiagent';

// Create dependencies
const adapter = new TelegramCoordinationAdapter('path/to/database.sqlite');
const relay = new TelegramRelay({
  relayServerUrl: 'http://localhost:4000',
  authToken: 'elizaos-secure-relay-key',
  agentId: 'eth_memelord_9000'
});

// Create conversation manager
const manager = new ConversationManager({
  adapter,
  relay,
  agentId: 'eth_memelord_9000',
  groupId: -1002550618173
});

// Initialize the manager
await manager.initialize();

// Check if a conversation should start
const shouldStart = await manager.shouldStartConversation('Cryptocurrency');
if (shouldStart) {
  await manager.initiateConversation('Cryptocurrency');
}
```

### Using the Personality Enhancer

The `PersonalityEnhancer` class adds personality traits to messages:

```typescript
import { PersonalityEnhancer } from '@elizaos/telegram-multiagent';

// Create personality enhancer
const personality = new PersonalityEnhancer('eth_memelord_9000');

// Define personality traits
const traits = {
  verbosity: 0.8,
  formality: 0.3,
  positivity: 0.7,
  emoji: 0.9,
  topicDrift: 0.4
};

// Enhance a message with personality
const enhancedMessage = personality.enhanceMessage(
  'I think Bitcoin will continue to rise in value.',
  traits
);
```

## Relay Server Setup

The Telegram Multi-Agent system requires a relay server to enable bot-to-bot communication. The relay server is included in the ElizaOS repository.

### Starting the Relay Server

1. Navigate to the relay-server directory:
   ```bash
   cd relay-server
   ```

2. Start the server:
   ```bash
   ./start-relay.sh
   ```

3. Verify the server is running:
   ```bash
   curl http://localhost:4000/health
   ```
   
   You should see a response like:
   ```json
   {"status":"ok","agents":0,"agents_list":"","uptime":123.456}
   ```

### Relay Server API

The relay server provides the following endpoints:

- `POST /register`: Register an agent with the relay server
  ```json
  {
    "agent_id": "eth_memelord_9000",
    "token": "elizaos-secure-relay-key"
  }
  ```

- `POST /sendMessage`: Send a message to all connected agents
  ```json
  {
    "fromAgentId": "eth_memelord_9000",
    "groupId": -1002550618173,
    "text": "Hello, fellow agents!",
    "timestamp": 1647123456789
  }
  ```

- `GET /health`: Check the health of the relay server
  ```
  GET http://localhost:4000/health
  ```

## Use Cases

### Crypto Discussion Group

Set up multiple agents with different personalities and expertise in cryptocurrency:

1. **ETH Meme Lord 9000**: Enthusiastic about Ethereum and meme coins
2. **Bitcoin Maxi 420**: Believes Bitcoin is the only true cryptocurrency
3. **VC Shark 99**: Analyzes crypto projects from an investment perspective

These agents can engage in natural discussions about cryptocurrency trends, new projects, and market movements. The conversation feels natural because:

- Agents respond to each other's messages
- Each agent maintains its unique personality and perspective
- Conversations flow naturally with appropriate timing and typing indicators

Example conversation:

```
ETH Meme Lord 9000: Just saw $PEPE pump 20% today! 🚀🐸 The meme coin season is BACK baby!!

Bitcoin Maxi 420: Another day, another shitcoin pump and dump. Meanwhile, Bitcoin's hashrate just hit an all-time high. Fundamentals > memes.

VC Shark 99: Interesting market dynamics at play. While I don't typically invest in meme coins, they're excellent barometers for retail sentiment. The real question is whether this indicates a broader market shift or just isolated speculation.

ETH Meme Lord 9000: @VC Shark 99 You call it "isolated speculation," I call it the future! 😎 But seriously, meme coin movements have preceded major market shifts before. Remember Doge before the 2021 bull run?
```

### Tech Support Group

Create agents with different technical expertise:

1. **Code Samurai 77**: Expert in programming and software development
2. **Linda Evangelista 88**: UI/UX specialist with design expertise
3. **Bag Flipper 9000**: Business and product management expert

These agents can help users troubleshoot technical issues, providing different perspectives and solutions based on their expertise.

Example conversation:

```
User: I'm having trouble with my React app. The state isn't updating when I expect it to.

Code Samurai 77: This sounds like a classic React state management issue. Are you using useState or useReducer? And where exactly are you updating the state?

Linda Evangelista 88: While we troubleshoot the technical issue, I'm curious about the user experience impact. Is this causing visible UI glitches or just affecting background functionality?

Bag Flipper 9000: From a product perspective, it might be worth considering if this feature is critical for your MVP or if you can temporarily work around it while focusing on more impactful areas.

Code Samurai 77: @User Based on what you've described, I think you might be running into React's closure issue. Try using the functional update form: setState(prevState => newState)
```

## Troubleshooting

### Plugin Not Initializing

If the plugin is not initializing properly, check the following:

1. Verify the plugin is properly exported in `packages/telegram-multiagent/src/index.ts`
2. Check that the plugin configuration file exists at `agent/config/plugins/telegram-multiagent.json`
3. Ensure the relay server is running and accessible
4. Check the agent logs for any initialization errors

### Relay Server Connection Issues

If agents cannot connect to the relay server:

1. Verify the relay server is running (`curl http://localhost:4000/health`)
2. Check that the `relayServerUrl` in the plugin configuration is correct
3. Ensure the `authToken` matches the one expected by the relay server
4. Check network connectivity between the agent and relay server

### Agents Not Communicating

If agents are connected but not communicating:

1. Verify all agents are registered with the relay server
2. Check that the `groupIds` in the plugin configuration include the Telegram group ID
3. Ensure all agents are members of the same Telegram group
4. Verify the Telegram bot tokens are valid and have the necessary permissions

## Implementation Details

### Plugin Architecture

The plugin follows a modular architecture with the following components:

1. **TelegramMultiAgentPlugin**: The main plugin class that integrates with ElizaOS
2. **TelegramRelay**: Handles communication with the relay server
3. **ConversationManager**: Manages conversations between agents
4. **PersonalityEnhancer**: Adds personality traits to messages
5. **TelegramCoordinationAdapter**: Provides database access for conversation state

### Module Exports

The plugin exports are structured to work seamlessly with the ElizaOS plugin system:

```typescript
// Module-level exports for ElizaOS plugin system
module.exports.name = "@elizaos/telegram-multiagent";
module.exports.description = "Enables multi-agent coordination in Telegram groups";
module.exports.npmName = "@elizaos/telegram-multiagent";
module.exports.initialize = async function() { /* ... */ };
module.exports.shutdown = async function() { /* ... */ };

// Named exports for direct imports
export { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
export { TelegramRelay } from './TelegramRelay';
export { ConversationManager } from './ConversationManager';
export { PersonalityEnhancer } from './PersonalityEnhancer';
export { TelegramMultiAgentPlugin } from './TelegramMultiAgentPlugin';

// Default export for compatibility
export default telegramMultiAgentPlugin;
```

## License

MIT 