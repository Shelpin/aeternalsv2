// src/knowledge-bridge.ts
import type { IAgentRuntimeBridge } from "./api/types";
import knowledge from "./knowledge";

export function callKnowledgeSet(runtime: IAgentRuntimeBridge, item: any) {
  return knowledge.set(runtime, item);
}

export function callKnowledgeGet(runtime: IAgentRuntimeBridge, message: any) {
  return knowledge.get(runtime, message);
} 