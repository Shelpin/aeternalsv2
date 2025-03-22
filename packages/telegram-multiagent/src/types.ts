/**
 * Common types for the telegram-multiagent package
 */

// Logger interface
export interface ElizaLogger {
  trace(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}

/**
 * Interface representing an agent runtime environment
 */
export interface IAgentRuntime {
  // Core Agent properties
  agent?: {
    name?: string;
    [key: string]: any;
  };
  registerPlugin?: (plugin: any) => boolean;
  getAgentId(): string;
  getService(name: string): any;
  registerService?(name: string, service: any): void;
  getCharacter?(): Character;
  
  // Memory management
  memoryManager?: {
    createMemory: (data: MemoryData) => Promise<any>;
    getMemories: (options: MemoryQuery) => Promise<Memory[]>;
    addEmbeddingToMemory?: (memoryId: string, embedding: number[]) => Promise<void>;
  };
  
  // Response handling
  handleMessage?: (message: any) => Promise<any>;
  composeState?: (options: any) => Promise<any>;
  
  // Allow for additional properties
  [key: string]: any;
}

/**
 * Memory data structure for storing messages
 */
export interface MemoryData {
  id?: string;
  roomId: string;
  userId: string;
  content: {
    text: string;
    facts?: any[];
    goal?: string;
    metadata?: {
      conversationType?: string;
      agentId?: string;
      groupId?: string;
      [key: string]: any;
    };
  };
  type?: string;
}

/**
 * Memory query options
 */
export interface MemoryQuery {
  roomId: string;
  userId?: string;
  count?: number;
  unique?: boolean;
  type?: string;
}

/**
 * Memory structure for retrieved memories
 */
export interface Memory {
  id: string;
  roomId: string;
  userId: string;
  content: {
    text: string;
    facts?: any[];
    goal?: string;
    metadata?: any;
  };
  createdAt: Date;
  type?: string;
}

// Plugin interface - simplified
export interface Plugin {
  name: string;
  description: string;
  npmName?: string;
  register?: (runtime: IAgentRuntime) => Plugin | boolean;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * Telegram Multi-Agent Plugin Configuration
 */
export interface TelegramMultiAgentConfig {
  enabled?: boolean;
  relayServerUrl?: string;
  authToken?: string;
  groupIds?: string[];
  dbPath?: string;
  logLevel?: string;
  conversationCheckIntervalMs?: number;
  maxRetries?: number;
  kickstarterConfig?: KickstarterConfig;
}

/**
 * Kickstarter configuration for conversation initiation
 */
export interface KickstarterConfig {
  // Probability factor (0-1) that affects how likely a kickstart is to happen
  probabilityFactor: number;
  
  // Minimum time between kickstarts (ms)
  minIntervalMs: number;
  
  // Should include topics in kickstarted messages
  includeTopics: boolean;
  
  // Should tag other agents in kickstarter messages
  shouldTagAgents: boolean;
  
  // Maximum number of agents to tag in a message
  maxAgentsToTag: number;
}

// Personality traits
export interface PersonalityTraits {
  verbosity: number;
  formality: number;
  positivity: number;
  responseSpeed: number;
  emoji: number;
  interruption: number;
  topicDrift: number;
  questionFrequency: number;
}

// Personality voice
export interface PersonalityVoice {
  voicePatterns: string[];
  commonEmojis: string[];
  slang: string[];
}

// Message status
export enum MessageStatus {
  PENDING = 'pending',
  SENT = 'sent',
  FAILED = 'failed'
}

// Relay message
export interface RelayMessage {
  message_id: number;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username: string;
  };
  chat: {
    id: number;
    type: string;
    title: string;
  };
  date: number;
  text: string;
  sender_agent_id?: string;
}

// Telegram relay configuration
export interface TelegramRelayConfig {
  relayServerUrl: string;
  authToken: string;
  agentId: string;
  retryLimit?: number;
  retryDelayMs?: number;
}

// Detailed conversation state tracking
export interface ConversationStateTracking {
  status: 'inactive' | 'starting' | 'active' | 'ending';
  lastMessageTimestamp: number;
  lastSpeakerId?: string;
  messageCount: number;
  participants: string[];
  currentTopic?: string;
  lastUpdated: number;
}

// Follow-up type
export enum FollowUpType {
  QUESTION = 'question',
  AGREEMENT = 'agreement',
  DISAGREEMENT = 'disagreement',
  ELABORATION = 'elaboration',
  CHANGE_TOPIC = 'change_topic'
}

/**
 * Character definition as used in ElizaOS
 */
export interface Character {
  id?: string;
  name: string;
  username?: string;
  bio: string;
  lore: string;
  knowledge?: string[];
  messageExamples?: string[];
  postExamples?: string[];
  topics: string[];
  style: {
    voice: string;
    persona: string;
    emojis?: string[];
  };
  adjectives: string[];
  clients?: any;
  plugins?: any;
  modelProvider?: any;
  secrets?: any;
  settings?: any;
  system?: string;
}

/**
 * Topic for conversation
 */
export interface Topic {
  id?: string;
  name: string;
  title?: string;
  description?: string;
  relevance?: number;
  groupId?: string;
  tags?: string[];
}

/**
 * Runtime interface for ElizaOS core
 */
export interface Runtime {
  registerPlugin(name: string, plugin: Plugin): void;
  registerService(name: string, service: any): void;
  getService(name: string): any;
  start(): Promise<void>;
  memory: {
    query: (query: MemoryQuery) => Promise<MemoryData[]>;
    store: (data: MemoryData) => Promise<void>;
    getNamespaces: () => Promise<string[]>;
    ensureNamespace: (namespace: string) => Promise<void>;
  };
}

export const EmptyLogger: ElizaLogger = {
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
}; 