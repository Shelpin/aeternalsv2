// packages/core/src/types/agent-runtime-bridge.ts

export interface IAgentRuntimeBridge {
  knowledgeManager?: {
    getKnowledge: (...args: any[]) => Promise<any>;
    setKnowledge: (...args: any[]) => Promise<void>;
  };
  // Add additional props ONLY if used by providers like knowledge.ts
} 