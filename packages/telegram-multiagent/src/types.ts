/**
 * Common types for the telegram-multiagent package
 */

// Logger interface
export interface ElizaLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

// Agent runtime interface
export interface IAgentRuntime {
  registerPlugin(plugin: any): boolean;
  getAgentId(): string;
  getService(name: string): any;
  registerService?(name: string, service: any): void;
  getCharacter?(): Character;
}

// Plugin interface
export interface Plugin {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
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

// Conversation state
export type ConversationState = 'inactive' | 'starting' | 'active' | 'ending';

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
 * Runtime interface for ElizaOS core
 */
export interface Runtime {
  registerPlugin(name: string, plugin: Plugin): void;
  registerService(name: string, service: any): void;
  getService(name: string): any;
  start(): Promise<void>;
} 