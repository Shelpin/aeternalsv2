/**
 * Common types and interfaces for the telegram-multiagent package
 */

/**
 * Runtime interface for accessing ElizaOS core services
 */
export interface IAgentRuntime {
  getService(name: string): any;
  getAgentId(): string;
  registerService(name: string, service: any): void;
  getCharacter(): Character;
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
 * Plugin interface for ElizaOS plugin system
 */
export interface Plugin {
  initialize(runtime: IAgentRuntime): Promise<void>;
  shutdown(): Promise<void>;
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

/**
 * ElizaLogger interface for logging
 */
export interface ElizaLogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
} 