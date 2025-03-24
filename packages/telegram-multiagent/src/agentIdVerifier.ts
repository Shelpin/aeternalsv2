/**
 * Agent ID Verifier
 * 
 * This is a simple debugging tool to verify that agent ID is available from runtime
 * It helps diagnose runtime initialization issues
 */

import { IAgentRuntime } from './types.js';

export class AgentIdVerifier {
  /**
   * Verify if agent ID is available from runtime
   * 
   * @param runtime - The agent runtime to test
   * @returns Object with verification results
   */
  static verify(runtime: IAgentRuntime | null): {
    hasRuntime: boolean;
    hasAgentId: boolean;
    hasGetAgentId: boolean;
    agentId?: string;
    error?: string;
  } {
    const result = {
      hasRuntime: false,
      hasAgentId: false,
      hasGetAgentId: false,
      agentId: undefined,
      error: undefined
    };
    
    if (!runtime) {
      result.error = 'Runtime is null';
      return result;
    }
    
    result.hasRuntime = true;
    
    // Check if getAgentId method exists
    if (typeof runtime.getAgentId !== 'function') {
      result.error = 'getAgentId is not a function';
      return result;
    }
    
    result.hasGetAgentId = true;
    
    // Try to get agent ID
    try {
      const agentId = runtime.getAgentId();
      result.agentId = agentId;
      result.hasAgentId = Boolean(agentId);
      
      if (!agentId) {
        result.error = 'Agent ID is empty or undefined';
      }
    } catch (error) {
      result.error = `Error getting agent ID: ${error.message}`;
    }
    
    return result;
  }
  
  /**
   * Create a full diagnostic report for runtime
   * 
   * @param runtime - The agent runtime to test
   * @returns Array of diagnostic messages
   */
  static diagnose(runtime: IAgentRuntime | null): string[] {
    const messages: string[] = [];
    
    messages.push('=== Runtime Diagnostics Report ===');
    
    if (!runtime) {
      messages.push('❌ ERROR: Runtime is null');
      return messages;
    }
    
    messages.push('✅ Runtime object exists');
    
    // Check common runtime methods
    const methods = [
      'getAgentId',
      'getLogger',
      'getCharacter',
      'handleMessage',
      'registerService'
    ];
    
    for (const method of methods) {
      if (typeof runtime[method] === 'function') {
        messages.push(`✅ runtime.${method} is a function`);
      } else {
        messages.push(`❌ runtime.${method} is NOT a function`);
      }
    }
    
    // Check memory manager
    if (runtime.memoryManager) {
      messages.push('✅ runtime.memoryManager exists');
      
      if (typeof runtime.memoryManager.createMemory === 'function') {
        messages.push('✅ runtime.memoryManager.createMemory is a function');
      } else {
        messages.push('❌ runtime.memoryManager.createMemory is NOT a function');
      }
      
      if (typeof runtime.memoryManager.getMemories === 'function') {
        messages.push('✅ runtime.memoryManager.getMemories is a function');
      } else {
        messages.push('❌ runtime.memoryManager.getMemories is NOT a function');
      }
    } else {
      messages.push('❌ runtime.memoryManager is undefined');
    }
    
    // Try to get agent ID
    try {
      const agentId = runtime.getAgentId();
      if (agentId) {
        messages.push(`✅ Agent ID: ${agentId}`);
      } else {
        messages.push('❌ Agent ID is empty or undefined');
      }
    } catch (error) {
      messages.push(`❌ Error getting agent ID: ${error.message}`);
    }
    
    return messages;
  }
}

export default AgentIdVerifier; 