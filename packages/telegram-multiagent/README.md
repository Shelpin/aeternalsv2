# ElizaOS Telegram Multi-Agent System

This package provides multi-agent coordination capabilities for Telegram bots in ElizaOS, enabling natural conversations between multiple AI agents in Telegram groups.

## Features

- **Multi-Agent Coordination**: Enables multiple ElizaOS agents to participate in group conversations
- **Natural Conversation Flow**: Implements realistic typing indicators, personality-driven responses, and natural follow-ups
- **Conversation Management**: Intelligently starts, manages, and ends conversations between agents
- **Personality Expression**: Enhances agent messages with distinct personality traits
- **Relay Server Integration**: Overcomes Telegram's limitations for bot-to-bot communication

## Installation

```bash
npm install @elizaos/telegram-multiagent
```

## Usage

### Basic Setup

```typescript
import { Runtime } from '@elizaos/core';
import { registerPlugin } from '@elizaos/telegram-multiagent';

// Create ElizaOS runtime
const runtime = new Runtime();

// Register the Telegram Multi-Agent plugin
registerPlugin(runtime, {
  dbPath: 'path/to/database.sqlite',
  relayServerUrl: 'http://your-relay-server.com'
});

// Start the runtime
runtime.start();
```

### Using the Coordination Adapter

```typescript
import { TelegramCoordinationAdapter, ConversationStatus } from '@elizaos/telegram-multiagent';

// Create and initialize the adapter
const adapter = new TelegramCoordinationAdapter('path/to/database.sqlite');
await adapter.initialize();

// Create a new conversation
const conversationId = await adapter.createConversation({
  id: 'conv-123',
  groupId: 'telegram-group-123',
  status: ConversationStatus.ACTIVE,
  startedAt: Date.now(),
  initiatedBy: 'agent-1',
  topic: 'Cryptocurrency trends',
  messageCount: 0
});

// Add participants
await adapter.addParticipant(conversationId, {
  agentId: 'agent-1',
  joinedAt: Date.now(),
  messageCount: 0,
  lastActive: Date.now()
});
```

### Using the Conversation Manager

```typescript
import { ConversationManager, TelegramCoordinationAdapter, TelegramRelay, PersonalityEnhancer } from '@elizaos/telegram-multiagent';

// Create dependencies
const adapter = new TelegramCoordinationAdapter('path/to/database.sqlite');
const relay = new TelegramRelay({
  relayServerUrl: 'http://your-relay-server.com',
  agentId: 'agent-1',
  token: 'your-telegram-token'
});
const personality = new PersonalityEnhancer('agent-1', runtime);

// Create conversation manager
const manager = new ConversationManager({
  adapter,
  relay,
  personality,
  agentId: 'agent-1',
  groupId: 'telegram-group-123'
});

// Start the manager
await manager.initialize();

// Check if a conversation should start
const shouldStart = await manager.shouldStartConversation('Cryptocurrency');
if (shouldStart) {
  await manager.initiateConversation('Cryptocurrency');
}
```

### Using the Personality Enhancer

```typescript
import { PersonalityEnhancer } from '@elizaos/telegram-multiagent';

// Create personality enhancer
const personality = new PersonalityEnhancer('agent-1', runtime);

// Enhance a message with personality
const enhancedMessage = personality.enhanceMessage(
  'I think Bitcoin will continue to rise in value.',
  { topicOfInterest: 'cryptocurrency' }
);
```

## Relay Server

The Telegram Multi-Agent system requires a relay server to enable bot-to-bot communication. The relay server acts as a bridge between Telegram bots, allowing them to communicate with each other in group chats.

### Setting Up the Relay Server

1. Clone the relay server repository:
   ```bash
   git clone https://github.com/elizaos/telegram-relay-server.git
   ```

2. Install dependencies:
   ```bash
   cd telegram-relay-server
   npm install
   ```

3. Configure the server:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

4. Start the server:
   ```bash
   npm start
   ```

## License

MIT 