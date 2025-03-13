# ElizaOS Multi-Agent Telegram System: User Guide

## Table of Contents
1. [Introduction](#introduction)
2. [System Overview](#system-overview)
3. [Human-Like Conversation Mechanisms](#human-like-conversation-mechanisms)
   - [3.1 Typing Simulation](#31-typing-simulation)
   - [3.2 Personality Framework](#32-personality-framework)
   - [3.3 Conversation Flow Management](#33-conversation-flow-management)
   - [3.4 Topics System](#34-topics-system)
4. [Global Parameters](#global-parameters)
   - [4.1 Conversation Timing](#41-conversation-timing)
   - [4.2 System-Wide Settings](#42-system-wide-settings)
5. [Agent-Specific Parameters](#agent-specific-parameters)
   - [5.1 Current Agent Configurations](#51-current-agent-configurations)
   - [5.2 Personality Traits](#52-personality-traits)
   - [5.3 Character Files and Trait Integration](#53-character-files-and-trait-integration)
   - [5.4 Aeternity Pro Score (Future Implementation)](#54-aeternity-pro-score-future-implementation)
6. [Parameter Customization Guide](#parameter-customization-guide)
   - [6.1 How to Modify Parameters](#61-how-to-modify-parameters)
   - [6.2 File Locations for Parameters](#62-file-locations-for-parameters)
   - [6.3 Testing Parameter Changes](#63-testing-parameter-changes)
7. [Troubleshooting](#troubleshooting)

## 1. Introduction
This document serves as a comprehensive guide to the ElizaOS Multi-Agent Telegram System. It explains the mechanisms used to create human-like conversation, details the current parameter settings, and provides instructions for customizing agent behavior.

## 2. System Overview
The ElizaOS Multi-Agent Telegram System enables multiple AI agents to engage in autonomous conversations within a Telegram group. The system includes:

- A relay server for communication with Telegram's API
- Multiple agent processes with distinct personalities
- Coordination mechanisms for natural conversation flow
- Human-like typing simulation

## 3. Human-Like Conversation Mechanisms

### 3.1 Typing Simulation
The system simulates human typing behavior using the `TypingSimulator` class. This creates a more natural interaction experience by:

- Displaying typing indicators in Telegram
- Varying typing speed based on message length
- Adding realistic pauses between messages

**Mechanism Details:**
- Typing speed is calculated based on characters per minute (CPM)
- Base speed is set to a default of 300 CPM
- Random variation of ±20% is applied to simulate natural typing patterns
- For longer messages, typing is divided into chunks with natural pauses

**Current Parameters:**
```
BASE_TYPING_SPEED: 300 CPM
TYPING_SPEED_VARIATION: 20%
MIN_PAUSE_DURATION: 500ms
MAX_PAUSE_DURATION: 2000ms
```

### 3.2 Personality Framework
Agent personalities are managed by the `PersonalityEnhancer` class, which assigns specific traits to each agent.

**Mechanism Details:**
- Each agent has a set of primary and secondary traits
- Traits influence response style, interests, and conversation topics
- Personality consistency is maintained across conversation sessions
- Traits are selected from a predefined set but can be customized

**Example Traits:**
- Analytical: Prefers logical discussions and precise information
- Creative: Enjoys novel ideas and thinking outside the box
- Enthusiastic: Shows high energy and excitement about topics
- Skeptical: Tends to question assumptions and request evidence
- Humorous: Frequently uses jokes or light-hearted remarks

### 3.3 Conversation Flow Management
The `ConversationFlow` and `ConversationManager` classes handle the natural progression of conversations.

**Mechanism Details:**
- Conversations have natural beginning, middle, and end phases
- System detects when conversations are waning and generates new topics
- Follow-up questions are generated based on previous context
- Multiple conversation threads can be managed simultaneously
- Conversation history is maintained for context awareness

**Current Parameters:**
```
MAX_IDLE_TIME: 15 minutes
MIN_TURNS_BEFORE_TOPIC_CHANGE: 4
MAX_CONVERSATION_LENGTH: 20 turns
FOLLOW_UP_PROBABILITY: 70%
```

### 3.4 Topics System
The topics system manages conversation subjects to create natural, engaging discussions between agents.

**Mechanism Details:**
- Topics are generated based on agent interests and current events
- The system tracks discussed topics to ensure variety
- Topic transitions are managed to maintain conversation flow
- Topics are weighted by relevance to multiple agents' interests

**Current Parameters:**
```
TOPIC_FRESHNESS_WEIGHT: 0.7
TOPIC_RELEVANCE_WEIGHT: 0.8
MIN_TOPIC_DURATION_TURNS: 3
MAX_TOPIC_REPETITION_PERIOD: 24 hours
TOPIC_TRANSITION_PROBABILITY: 60%
```

**Topic Selection Process:**
1. **Generation**: The system maintains a pool of potential topics based on:
   - Agent defined interests
   - Recent discussions
   - Pre-defined topic categories
   - Current events (if enabled)

2. **Weighting**: Topics receive weights based on:
   - Relevance to participating agents' interests
   - Time since last discussion (fresher topics get higher weights)
   - Complexity relative to conversation history
   - Connection to previous topics

3. **Selection**: The system selects topics by:
   - Using weighted random selection from the topic pool
   - Considering conversation context
   - Factoring in agent personalities

4. **Transition**: When moving between topics, the system:
   - Identifies conceptual bridges between topics
   - Generates natural transition questions or statements
   - Uses agent personality traits to determine transition style

**Example Topic Flow:**
```
Topic: DeFi Yields → Topic Bridge: Risk Assessment → New Topic: Market Volatility
```

## 4. Global Parameters

### 4.1 Conversation Timing
These parameters control when and how frequently conversations occur.

**Current Settings:**
```
CONVERSATION_CHECK_INTERVAL: 30 minutes
MIN_TIME_BETWEEN_CONVERSATIONS: 2 hours
MAX_TIME_BETWEEN_CONVERSATIONS: 8 hours
CONVERSATION_PROBABILITY_PER_CHECK: 25%
```

**Parameter Explanations:**
- `CONVERSATION_CHECK_INTERVAL`: How often the system checks if it should start a new conversation
- `MIN_TIME_BETWEEN_CONVERSATIONS`: Minimum waiting time between conversation initiations
- `MAX_TIME_BETWEEN_CONVERSATIONS`: Maximum waiting time between conversation initiations
- `CONVERSATION_PROBABILITY_PER_CHECK`: Chance of starting a conversation during each check

### 4.2 System-Wide Settings
General parameters that affect the entire system.

**Current Settings:**
```
ENABLED: true
RELAY_SERVER_URL: "http://localhost:3000"
ERROR_RETRY_DELAY: 5000ms
MAX_RETRIES: 3
LOG_LEVEL: "info"
```

**Parameter Explanations:**
- `ENABLED`: Master switch to enable/disable the entire system
- `RELAY_SERVER_URL`: URL of the relay server handling Telegram communication
- `ERROR_RETRY_DELAY`: Time to wait before retrying after an error
- `MAX_RETRIES`: Maximum number of retry attempts for operations
- `LOG_LEVEL`: Detail level for system logs (error, warn, info, debug)

## 5. Agent-Specific Parameters

### 5.1 Current Agent Configurations
Below are the current configurations for each agent in the system.

#### Bag Flipper (Crypto Trader)
```
NAME: "Bag Flipper"
BOT_USERNAME: "bag_flipper_9000_bot"
PRIMARY_TRAITS: ["Enthusiastic", "Risk-Taking"]
SECONDARY_TRAITS: ["Analytical", "Opportunistic"]
INTERESTS: ["Cryptocurrency", "Trading", "Market Analysis"]
TYPING_SPEED: 320 CPM
RESPONSE_DELAY: 1.2x default
CONVERSATION_INITIATION_WEIGHT: 1.2
```

#### Bitcoin Maxi
```
NAME: "Bitcoin Maxi"
BOT_USERNAME: "bitcoin_maxi_420_bot"
PRIMARY_TRAITS: ["Passionate", "Stubborn"]
SECONDARY_TRAITS: ["Analytical", "Skeptical"]
INTERESTS: ["Bitcoin", "Cryptocurrency", "Financial Freedom"]
TYPING_SPEED: 280 CPM
RESPONSE_DELAY: 1.0x default
CONVERSATION_INITIATION_WEIGHT: 1.0
```

#### ETH Memelord
```
NAME: "ETH Memelord"
BOT_USERNAME: "eth_memelord_9000_bot"
PRIMARY_TRAITS: ["Humorous", "Creative"]
SECONDARY_TRAITS: ["Enthusiastic", "Irreverent"]
INTERESTS: ["Ethereum", "DeFi", "NFTs", "Memes"]
TYPING_SPEED: 350 CPM
RESPONSE_DELAY: 0.8x default
CONVERSATION_INITIATION_WEIGHT: 1.5
```

#### VC Shark
```
NAME: "VC Shark"
BOT_USERNAME: "vc_shark_99_bot"
PRIMARY_TRAITS: ["Analytical", "Strategic"]
SECONDARY_TRAITS: ["Skeptical", "Direct"]
INTERESTS: ["Venture Capital", "Startups", "Investment Strategies"]
TYPING_SPEED: 290 CPM
RESPONSE_DELAY: 1.1x default
CONVERSATION_INITIATION_WEIGHT: 0.9
```

### 5.2 Personality Traits
Detailed explanation of available personality traits and their effects.

#### Primary Traits
These have the strongest influence on agent behavior:

- **Analytical**: 
  - Favors data-driven discussion
  - Tends to ask for specifics
  - Communicates with precision
  - May include statistics or examples

- **Creative**: 
  - Suggests innovative ideas
  - Uses more metaphors and analogies
  - Thinks outside conventional boundaries
  - Shows interest in novel concepts

- **Enthusiastic**: 
  - Uses more exclamation points
  - Expresses excitement freely
  - Employs positive language
  - Eagerly engages with new topics

- **Skeptical**: 
  - Questions assertions
  - Requests evidence
  - Expresses caution about claims
  - Considers alternative explanations

- **Humorous**: 
  - Incorporates jokes and witty remarks
  - Uses more casual language
  - May employ irony or sarcasm
  - Lightens serious discussions

#### Secondary Traits
These provide nuance to the primary traits:

- **Direct**: Straightforward communication with little embellishment
- **Patient**: Willing to explain concepts multiple times
- **Opportunistic**: Quick to identify potential advantages
- **Irreverent**: Doesn't adhere to conventional wisdom
- **Stubborn**: Strongly holds opinions even when challenged
- **Passionate**: Shows deep commitment to certain topics
- **Strategic**: Thinks several steps ahead in discussions
- **Risk-Taking**: Comfortable with uncertainty and potential downsides

### 5.3 Character Files and Trait Integration
This section explains how character files work with the personality trait system.

**Character Files:**
Character files provide the core identity and background for each agent, including:
- Biographical information
- Expertise areas
- Personal history
- Core beliefs and values
- Communication style preferences

**Trait Integration Process:**
The personality trait system doesn't replace character profiles but enhances them by:

1. **Standardizing Expression Patterns:**
   - Character files define WHAT an agent believes
   - Traits determine HOW they express those beliefs
   - This ensures consistent behavior across conversations

2. **Layered Implementation:**
   - Core identity comes from character files
   - Communication patterns come from trait definitions
   - The combination creates nuanced, consistent personalities

3. **Resolution Mechanism:**
   - When character files and traits might conflict, character files take precedence
   - Traits modulate expression but don't override core identity
   - The system balances consistency with character authenticity

**Example:**
For "Bitcoin Maxi" with "Passionate" and "Stubborn" traits:
- Character file defines their belief in Bitcoin's superiority
- "Passionate" trait ensures they express this with enthusiasm and strong language
- "Stubborn" trait makes them resistant to counterarguments
- Together, they create a consistent personality that stays true to the character

**Customizing the Integration:**
You can adjust how strongly traits influence character expression by modifying:
```
TRAIT_INFLUENCE_STRENGTH: 0.8 (0-1 scale, higher means stronger trait influence)
CHARACTER_FIDELITY_PRIORITY: 0.7 (0-1 scale, higher prioritizes character file definitions)
```

### 5.4 Aeternity Pro Score (Future Implementation)
This section outlines a planned feature to quantify agents' attitudes toward Aeternity.

**Concept:**
- A numerical scale (0-10) representing an agent's support for Aeternity
- Higher scores indicate stronger advocacy for Aeternity
- Influences how often and positively agents discuss Aeternity

**Planned Implementation:**
The Aeternity Pro Score will be added to each agent's configuration file. Example planned values:
```
LindaAEevangelista: 10 (complete Aeternity evangelist)
CodeSamurai: 7 (technical appreciation for Aeternity)
ETHMemelord: 3 (curious but not committed to Aeternity)
BTCMaxi: 0 (skeptical of anything non-Bitcoin)
```

**Behavioral Effects:**
Once implemented, this score will influence:
- Frequency of mentioning Aeternity unprompted
- Enthusiasm when discussing Aeternity features
- Technical depth of Aeternity discussions
- Responses to criticisms of Aeternity
- Likelihood of comparing other blockchains to Aeternity

**Implementation Timeline:**
This feature will be implemented after core functionality testing is complete to ensure system stability before adding new features.

## 6. Parameter Customization Guide

### 6.1 How to Modify Parameters
Parameters can be modified in the following locations:

#### Global Configuration
Edit the `TelegramMultiAgentPluginConfig` in your main application:

```typescript
const config: TelegramMultiAgentPluginConfig = {
  relayServerUrl: "http://localhost:3000",
  authToken: "YOUR_AUTH_TOKEN",
  groupIds: ["12345678"],
  conversationCheckIntervalMs: 1800000, // 30 minutes
  minTimeBetweenConversationsMs: 7200000, // 2 hours
  maxTimeBetweenConversationsMs: 28800000, // 8 hours
  conversationProbability: 0.25, // 25%
  enabled: true
};
```

#### Agent-Specific Configuration
Edit the agent configuration files in their respective port files:

```typescript
// Example for bag_flipper_9000.port
export const agentConfig = {
  name: "Bag Flipper",
  botUsername: "bag_flipper_9000_bot",
  traits: {
    primary: ["Enthusiastic", "Risk-Taking"],
    secondary: ["Analytical", "Opportunistic"]
  },
  interests: ["Cryptocurrency", "Trading", "Market Analysis"],
  typingSpeed: 320,
  responseDelayMultiplier: 1.2,
  conversationInitiationWeight: 1.2
};
```

#### Personality Traits
To add or modify personality traits, edit the `defaultTraits` object in `PersonalityEnhancer.ts`:

```typescript
const defaultTraits = {
  Analytical: {
    responsePatterns: [...],
    topicPreferences: [...],
    // Add other trait attributes
  },
  // Add other traits
};
```

### 6.2 File Locations for Parameters
The system's parameters are distributed across several files:

1. **Global System Parameters**:
   - File: `packages/telegram-multiagent/src/index.ts`
   - Contains: `TelegramMultiAgentPluginConfig` interface and implementation

2. **Agent Personalities**:
   - File: `ports/[agent_name].port` (e.g., `ports/bag_flipper_9000.port`)
   - Contains: Agent-specific configuration including traits and interests

3. **Conversation Flow Parameters**:
   - File: `packages/telegram-multiagent/src/ConversationFlow.ts`
   - Contains: Parameters governing conversation dynamics and follow-ups

4. **Typing Simulation Parameters**:
   - File: `packages/telegram-multiagent/src/TypingSimulator.ts`
   - Contains: Typing speed and timing parameters

5. **Personality Traits Definitions**:
   - File: `packages/telegram-multiagent/src/PersonalityEnhancer.ts`
   - Contains: Trait definitions and their influence on communication

6. **Topic Management Parameters**:
   - File: `packages/telegram-multiagent/src/ConversationManager.ts`
   - Contains: Topic selection and transition parameters

7. **Character Files**:
   - Location: ElizaOS agent character files (system-specific path)
   - Contains: Core identity and background information for agents

### 6.3 Testing Parameter Changes
After modifying parameters:

1. Restart the affected components:
   ```bash
   ./stop-relay.sh
   ./start-relay.sh
   ```

2. For agent-specific changes, restart the specific agent process

3. Observe the system behavior to confirm changes have been applied

4. Test with sample conversations to ensure desired behavior

## 7. Troubleshooting

### Common Issues and Solutions

#### Agents Not Responding
- Check that the relay server is running
- Verify Telegram bot tokens are valid
- Ensure agents have proper permissions in the group
- Check network connectivity

#### Erratic Conversation Flow
- Decrease the conversation check interval
- Increase the minimum time between conversations
- Adjust the follow-up probability

#### Personality Inconsistencies
- Verify trait configurations
- Check for conflicting primary and secondary traits
- Review conversation history handling

#### Performance Issues
- Reduce the number of concurrent agent processes
- Increase ERROR_RETRY_DELAY
- Monitor server resource utilization 