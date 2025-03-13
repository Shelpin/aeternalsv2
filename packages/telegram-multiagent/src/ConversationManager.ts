import { generateUUID } from './utils';
import { ElizaLogger, IAgentRuntime } from './types';
import { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter';
import { TelegramRelay } from './TelegramRelay';
import { PersonalityEnhancer } from './PersonalityEnhancer';

// Conversation states
enum ConversationState {
  INACTIVE,
  STARTING,
  ACTIVE,
  ENDING
}

/**
 * ConversationManager handles starting and managing agent conversations
 */
export class ConversationManager {
  private adapter: TelegramCoordinationAdapter;
  private relay: TelegramRelay;
  private personality: PersonalityEnhancer;
  private agentId: string;
  private groupId: number;
  private conversationState: ConversationState = ConversationState.INACTIVE;
  private activeConversationId: string | null = null;
  private lastTopic: string | null = null;
  private messageCount: number = 0;
  private lastMessageTime: number = 0;
  private participants: Set<string> = new Set();
  private logger: ElizaLogger;
  
  // Natural conversation parameters
  private MIN_MESSAGES_PER_CONVO = 5;
  private MAX_MESSAGES_PER_CONVO = 15;
  private MIN_RESPONSE_DELAY_MS = 7000;  // 7 seconds minimum delay for realism
  private MAX_RESPONSE_DELAY_MS = 30000; // 30 seconds maximum delay
  
  /**
   * Create a new ConversationManager
   * 
   * @param adapter - Telegram coordination adapter
   * @param relay - Telegram relay service
   * @param personality - Personality enhancer
   * @param agentId - ID of the agent
   * @param groupId - Telegram group ID
   */
  constructor(
    adapter: TelegramCoordinationAdapter,
    relay: TelegramRelay,
    personality: PersonalityEnhancer,
    agentId: string,
    groupId: number,
    logger: ElizaLogger
  ) {
    this.adapter = adapter;
    this.relay = relay;
    this.personality = personality;
    this.agentId = agentId;
    this.groupId = groupId;
    this.logger = logger;
  }
  
  /**
   * Initiate a new conversation with a topic
   * 
   * @param topic - Topic to start conversation about
   * @returns Conversation ID
   */
  initiateConversation(topic: string): string {
    if (this.conversationState !== ConversationState.INACTIVE) {
      this.logger.warn(`ConversationManager: Already in a conversation state: ${this.conversationState}`);
      return this.activeConversationId || '';
    }

    // Refine topic to align with agent's interests
    const refinedTopic = this.personality.refineTopic(topic);
    this.lastTopic = refinedTopic;

    // Generate a new conversation ID
    const conversationId = generateUUID();
    this.activeConversationId = conversationId;
    this.conversationState = ConversationState.STARTING;
    this.messageCount = 0;
    this.participants.clear();
    this.participants.add(this.agentId);
    this.lastMessageTime = Date.now();

    this.logger.info(`ConversationManager: Initiating conversation ${conversationId} on topic: ${refinedTopic}`);

    return conversationId;
  }
  
  /**
   * Determine if a conversation should be started
   * 
   * @param currentTime - Current timestamp
   * @param suggestedTopic - Optional topic suggestion
   * @returns Whether to start a conversation
   */
  shouldStartConversation(currentTime: number, suggestedTopic?: string): boolean {
    // Don't start if already in a conversation
    if (this.conversationState !== ConversationState.INACTIVE) {
      return false;
    }

    // Check for topic relevance
    if (suggestedTopic) {
      const relevance = this.personality.calculateTopicRelevance(suggestedTopic);
      const traits = this.personality.getTraits();
      
      // Agents with higher verbosity and interruption traits are more likely
      // to start conversations on relevant topics
      const likelihoodFactor = (traits.verbosity * 0.7) + (traits.interruption * 0.3);
      
      // The more relevant the topic, the more likely to start
      return Math.random() < (relevance * likelihoodFactor);
    }

    // Random chance to start a conversation based on personality
    // More extroverted agents (higher verbosity) start more conversations
    const traits = this.personality.getTraits();
    const baseChance = 0.01 * traits.verbosity; // 0.1-1% chance per check
    
    // Increase chance if it's been a long time since the last conversation
    const hoursSinceLastMessage = (currentTime - this.lastMessageTime) / (1000 * 60 * 60);
    const timeMultiplier = Math.min(5, 1 + (hoursSinceLastMessage / 2)); // Up to 5x more likely
    
    return Math.random() < (baseChance * timeMultiplier);
  }
  
  /**
   * Determine if the current conversation should end
   * 
   * @returns Whether to end the conversation
   */
  shouldEndConversation(): boolean {
    if (this.conversationState !== ConversationState.ACTIVE) {
      return false;
    }

    // End after a certain number of messages
    if (this.messageCount > 20) {
      return Math.random() < 0.3; // 30% chance to end after 20 messages
    }

    // End if topic has low relevance to agent
    if (this.lastTopic) {
      const relevance = this.personality.calculateTopicRelevance(this.lastTopic);
      if (relevance < 0.3) {
        return Math.random() < (0.4 - relevance); // Higher chance to end for less relevant topics
      }
    }

    // Time-based ending
    const timeSinceLastMessage = Date.now() - this.lastMessageTime;
    if (timeSinceLastMessage > 10 * 60 * 1000) { // 10 minutes
      return true; // End if conversation has been inactive
    }

    // Random chance to end based on message count
    const endChance = 0.02 * this.messageCount; // 2% per message
    return Math.random() < Math.min(0.5, endChance); // Cap at 50%
  }
  
  /**
   * Decide which other agents to invite to a conversation
   * 
   * @param topic - Conversation topic
   * @param maxInvites - Maximum number of invites
   * @returns Array of agent IDs to invite
   */
  async decideAgentInvites(topic: string, maxInvites: number = 2): Promise<string[]> {
    // Get available agents
    const availableAgents = await this.adapter.getAvailableAgents(
      this.groupId,
      [this.agentId] // Exclude self
    );

    if (availableAgents.length === 0) {
      return [];
    }

    // Calculate relevance for each agent
    const agentRelevance: {agentId: string, relevance: number}[] = [];
    
    for (const agentId of availableAgents) {
      // Skip agents already in the conversation
      if (this.participants.has(agentId)) continue;
      
      // Calculate topic relevance for each agent
      // In reality, we'd need to get the personality of each agent
      // For now we estimate relevance via the adapter
      const relevance = await this.adapter.estimateTopicRelevance(agentId, topic);
      agentRelevance.push({ agentId, relevance });
    }
    
    // Sort by relevance (highest first)
    agentRelevance.sort((a, b) => b.relevance - a.relevance);
    
    // Select agents based on relevance with some randomness
    const selectedAgents: string[] = [];
    
    // Take most relevant agent
    if (agentRelevance.length > 0 && agentRelevance[0].relevance > 0.6) {
      selectedAgents.push(agentRelevance[0].agentId);
    }
    
    // Add some randomness for other agents
    for (let i = selectedAgents.length; i < Math.min(maxInvites, agentRelevance.length); i++) {
      // More relevant agents have higher chance of being selected
      for (const agent of agentRelevance) {
        if (selectedAgents.includes(agent.agentId)) continue;
        
        if (Math.random() < agent.relevance * 0.7) {
          selectedAgents.push(agent.agentId);
          break;
        }
      }
      
      // If no agent selected through relevance, pick randomly
      if (selectedAgents.length <= i && agentRelevance.length > 0) {
        const remainingAgents = agentRelevance.filter(
          a => !selectedAgents.includes(a.agentId)
        );
        
        if (remainingAgents.length > 0) {
          const idx = Math.floor(Math.random() * remainingAgents.length);
          selectedAgents.push(remainingAgents[idx].agentId);
        }
      }
    }
    
    return selectedAgents;
  }
  
  /**
   * Generate a natural invitation message for another agent
   * 
   * @param targetAgentId - Agent to invite
   * @param topic - Conversation topic
   * @returns Invitation message text
   */
  generateInvitationMessage(targetAgentId: string, topic: string): string {
    // Different invitation styles
    const invitationTemplates = [
      `Hey @{{agent}}, what do you think about {{topic}}?`,
      `@{{agent}} I'd be curious to hear your thoughts on {{topic}}`,
      `@{{agent}}, got any insights on {{topic}}?`,
      `Does @{{agent}} have an opinion on {{topic}}?`,
      `@{{agent}}, you're knowledgeable about {{topic}}, right?`
    ];
    
    // Select random template
    const template = invitationTemplates[Math.floor(Math.random() * invitationTemplates.length)];
    
    // Fill in template
    let message = template
      .replace('{{agent}}', targetAgentId)
      .replace(/{{topic}}/g, topic);
    
    // Enhance with personality
    message = this.personality.enhanceMessage(message, { isInvitation: true });
    
    return message;
  }
  
  /**
   * Generate a natural sign-off message for ending a conversation
   * 
   * @param topic - Conversation topic
   * @returns Sign-off message text
   */
  generateSignOffMessage(topic: string): string {
    // Different sign-off styles
    const signOffTemplates = [
      `Well, I need to go work on something else now. Later!`,
      `This discussion on {{topic}} has been interesting, but I have to run.`,
      `I'll think more about {{topic}}. Talk to you all later!`,
      `Got to go for now. Thanks for the chat about {{topic}}!`,
      `Alright, I'm out for now. Catch you later!`
    ];
    
    // Select random template
    const template = signOffTemplates[Math.floor(Math.random() * signOffTemplates.length)];
    
    // Fill in template
    let message = template.replace(/{{topic}}/g, topic || 'this');
    
    // Enhance with personality
    message = this.personality.enhanceMessage(message, { isSignOff: true });
    
    return message;
  }
  
  /**
   * Update conversation state with a new message
   * 
   * @param message - Message content
   * @param fromAgentId - Agent ID who sent the message
   * @param topic - Current topic
   */
  updateWithMessage(message: string, fromAgentId: string, topic?: string): void {
    this.messageCount++;
    this.lastMessageTime = Date.now();
    
    // Track participating agents
    this.participants.add(fromAgentId);
    
    // Update topic if provided
    if (topic) {
      this.lastTopic = topic;
    }
    
    // Transition from STARTING to ACTIVE after the first few messages
    if (this.conversationState === ConversationState.STARTING && this.messageCount >= 3) {
      this.conversationState = ConversationState.ACTIVE;
      this.logger.debug(`ConversationManager: Conversation ${this.activeConversationId} now active`);
    }
  }
  
  /**
   * End the current conversation
   * 
   * @param sendSignOff - Whether to send a sign-off message
   * @returns The ended conversation ID
   */
  endConversation(sendSignOff: boolean = true): string | null {
    if (this.conversationState === ConversationState.INACTIVE) {
      return null;
    }
    
    const conversationId = this.activeConversationId;
    
    if (sendSignOff && this.conversationState === ConversationState.ACTIVE) {
      const signOffMessage = this.generateSignOffMessage(this.lastTopic || '');
      this.relay.sendMessage(this.groupId, signOffMessage);
    }
    
    // Reset conversation state
    this.conversationState = ConversationState.INACTIVE;
    this.activeConversationId = null;
    
    this.logger.info(`ConversationManager: Ended conversation ${conversationId}`);
    
    return conversationId;
  }
  
  /**
   * Get the current conversation state
   * 
   * @returns Current conversation state
   */
  getConversationState(): 'inactive' | 'starting' | 'active' | 'ending' {
    switch (this.conversationState) {
      case ConversationState.INACTIVE: return 'inactive';
      case ConversationState.STARTING: return 'starting';
      case ConversationState.ACTIVE: return 'active';
      case ConversationState.ENDING: return 'ending';
      default: return 'inactive';
    }
  }
  
  /**
   * Get the current conversation ID
   * 
   * @returns Active conversation ID or null
   */
  getActiveConversationId(): string | null {
    return this.activeConversationId;
  }
  
  /**
   * Get the current conversation participants
   * 
   * @returns Set of agent IDs
   */
  getParticipants(): Set<string> {
    return new Set(this.participants);
  }
  
  /**
   * Get the current conversation topic
   * 
   * @returns Current topic or null
   */
  getCurrentTopic(): string | null {
    return this.lastTopic;
  }
} 