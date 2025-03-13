import { ElizaLogger } from './types';
import { TypingSimulator } from './TypingSimulator';
import { PersonalityEnhancer } from './PersonalityEnhancer';

/**
 * Types of follow-up messages that can be generated
 */
export enum FollowUpType {
  CLARIFICATION = 'clarification',
  ADDITIONAL_THOUGHT = 'additional_thought',
  QUESTION = 'question',
  EMPHASIS = 'emphasis',
  NONE = 'none'
}

/**
 * ConversationFlow manages dynamic conversation interactions
 * making agent conversations more natural and engaging
 */
export class ConversationFlow {
  private typingSimulator: TypingSimulator;
  private personalityEnhancer: PersonalityEnhancer;
  private telegramClient: any;
  private chatId: string;
  private lastMessageTimestamp: number = 0;
  private followUpTimeout: ReturnType<typeof setTimeout> | null = null;
  private conversationContext: Map<string, any> = new Map();
  private logger: ElizaLogger;
  
  // Follow-up message configuration
  private FOLLOW_UP_CHANCE = 0.4;         // Base chance of follow-up
  private MIN_FOLLOW_UP_DELAY = 3000;     // Min time before follow-up (ms)
  private MAX_FOLLOW_UP_DELAY = 12000;    // Max time before follow-up (ms)
  private FOLLOW_UP_VARIANTS: Record<FollowUpType, number> = {
    [FollowUpType.CLARIFICATION]: 0.25,
    [FollowUpType.ADDITIONAL_THOUGHT]: 0.35,
    [FollowUpType.QUESTION]: 0.25,
    [FollowUpType.EMPHASIS]: 0.15,
    [FollowUpType.NONE]: 0   // Used internally
  };
  
  /**
   * Create a new ConversationFlow
   * 
   * @param telegramClient - ElizaOS Telegram client instance
   * @param chatId - Telegram chat ID
   * @param personalityEnhancer - Personality enhancer instance
   * @param logger - ElizaOS logger instance
   */
  constructor(
    telegramClient: any,
    chatId: string,
    personalityEnhancer: PersonalityEnhancer,
    logger: ElizaLogger
  ) {
    this.telegramClient = telegramClient;
    this.chatId = chatId;
    this.personalityEnhancer = personalityEnhancer;
    this.logger = logger;
    this.typingSimulator = new TypingSimulator(telegramClient, chatId, logger);
  }
  
  /**
   * Send a message with natural typing simulation and personality enhancements
   * 
   * @param message - Original message text
   * @param context - Conversation context metadata
   * @returns Promise resolving when message is sent
   */
  async sendEnhancedMessage(message: string, context: Record<string, any> = {}): Promise<void> {
    try {
      // Store context for potential follow-ups
      this.updateContext(context);
      
      // Enhance message with personality
      const enhancedMessage = this.personalityEnhancer.enhanceMessage(message, context);
      
      // Simulate typing based on message length
      await this.typingSimulator.simulateTyping(enhancedMessage.length);
      
      // Send the message
      await this.telegramClient.sendMessage(this.chatId, enhancedMessage);
      this.lastMessageTimestamp = Date.now();
      
      // Schedule potential follow-up
      this.scheduleFollowUp(message, context);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error sending enhanced message: ${errorMessage}`);
    }
  }
  
  /**
   * Update conversation context for richer interactions
   * 
   * @param context - Context data to store
   */
  private updateContext(context: Record<string, any>): void {
    for (const [key, value] of Object.entries(context)) {
      this.conversationContext.set(key, value);
    }
  }
  
  /**
   * Schedule a potential follow-up message based on personality
   * 
   * @param originalMessage - The message that might need a follow-up
   * @param context - Message context
   */
  private scheduleFollowUp(originalMessage: string, context: Record<string, any>): void {
    // Clean up any existing follow-up
    if (this.followUpTimeout) {
      clearTimeout(this.followUpTimeout);
    }
    
    // Determine if we should send a follow-up based on personality
    const followUpChance = this.FOLLOW_UP_CHANCE * 
      (this.personalityEnhancer.getTraits().verbosity / 0.5);
    
    if (Math.random() < followUpChance) {
      // Determine follow-up type and delay
      const followUpType = this.determineFollowUpType(context);
      
      if (followUpType !== FollowUpType.NONE) {
        const delay = this.MIN_FOLLOW_UP_DELAY + 
          Math.random() * (this.MAX_FOLLOW_UP_DELAY - this.MIN_FOLLOW_UP_DELAY);
        
        this.logger.debug(`Scheduling ${followUpType} follow-up in ${delay}ms`);
        
        this.followUpTimeout = setTimeout(() => {
          this.sendFollowUp(originalMessage, followUpType, context);
        }, delay);
      }
    }
  }
  
  /**
   * Determine what type of follow-up to send
   * 
   * @param context - Message context
   * @returns Type of follow-up to send
   */
  private determineFollowUpType(context: Record<string, any>): FollowUpType {
    // Consider message length, topic relevance, and other factors
    const traits = this.personalityEnhancer.getTraits();
    
    // Adjust probabilities based on personality
    const adjustedVariants: Record<FollowUpType, number> = {
      [FollowUpType.CLARIFICATION]: this.FOLLOW_UP_VARIANTS[FollowUpType.CLARIFICATION] * 
        (traits.formality > 0.7 ? 1.5 : 0.8),
      [FollowUpType.ADDITIONAL_THOUGHT]: this.FOLLOW_UP_VARIANTS[FollowUpType.ADDITIONAL_THOUGHT] * 
        (traits.verbosity > 0.7 ? 1.5 : 0.8),
      [FollowUpType.QUESTION]: this.FOLLOW_UP_VARIANTS[FollowUpType.QUESTION] * 
        (traits.questionFrequency > 0.7 ? 1.5 : 0.8),
      [FollowUpType.EMPHASIS]: this.FOLLOW_UP_VARIANTS[FollowUpType.EMPHASIS] * 
        (traits.positivity > 0.7 ? 1.5 : 0.8),
      [FollowUpType.NONE]: 0.1 // Small chance of no follow-up after all
    };
    
    // Normalize probabilities
    const total = Object.values(adjustedVariants).reduce((a, b) => a + b, 0);
    const normalizedVariants = Object.entries(adjustedVariants).reduce(
      (acc, [key, value]) => ({...acc, [key]: value / total}), 
      {} as Record<FollowUpType, number>
    );
    
    // Select type based on weighted probability
    const rand = Math.random();
    let cumulativeProbability = 0;
    
    for (const [type, probability] of Object.entries(normalizedVariants)) {
      cumulativeProbability += probability;
      if (rand <= cumulativeProbability) {
        return type as FollowUpType;
      }
    }
    
    return FollowUpType.NONE;
  }
  
  /**
   * Send a follow-up message
   * 
   * @param originalMessage - The message being followed up
   * @param followUpType - Type of follow-up
   * @param context - Message context
   */
  private async sendFollowUp(
    originalMessage: string,
    followUpType: FollowUpType,
    context: Record<string, any>
  ): Promise<void> {
    try {
      // Generate follow-up based on type
      let followUpMessage = '';
      
      switch (followUpType) {
        case FollowUpType.CLARIFICATION:
          followUpMessage = this.generateClarification(originalMessage, context);
          break;
        case FollowUpType.ADDITIONAL_THOUGHT:
          followUpMessage = this.generateAdditionalThought(originalMessage, context);
          break;
        case FollowUpType.QUESTION:
          followUpMessage = this.generateQuestion(originalMessage, context);
          break;
        case FollowUpType.EMPHASIS:
          followUpMessage = this.generateEmphasis(originalMessage, context);
          break;
        default:
          return; // No follow-up
      }
      
      if (followUpMessage) {
        // Add typing indicators and send the follow-up
        await this.typingSimulator.simulateTyping(followUpMessage.length);
        await this.telegramClient.sendMessage(this.chatId, followUpMessage);
        this.lastMessageTimestamp = Date.now();
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error sending follow-up: ${errorMessage}`);
    }
  }
  
  /**
   * Generate a clarification follow-up
   * 
   * @param originalMessage - Message to clarify
   * @param context - Message context
   * @returns Clarification message
   */
  private generateClarification(originalMessage: string, context: Record<string, any>): string {
    const clarifications = [
      "Just to be clear, what I mean is...",
      "To clarify,",
      "In other words,",
      "Let me explain what I mean:",
      "To put it differently,"
    ];
    
    // Get a random clarification starter
    const starter = clarifications[Math.floor(Math.random() * clarifications.length)];
    
    // Extract a key point from the original message
    const keywords = this.extractKeywords(originalMessage);
    const keyPoint = keywords.length > 0 
      ? keywords[Math.floor(Math.random() * keywords.length)]
      : "the main point";
    
    // Formulate clarification
    return `${starter} ${this.rephrasePoint(keyPoint, context)}`;
  }
  
  /**
   * Generate an additional thought follow-up
   * 
   * @param originalMessage - Original message
   * @param context - Message context
   * @returns Additional thought message
   */
  private generateAdditionalThought(originalMessage: string, context: Record<string, any>): string {
    const additionalThoughtStarters = [
      "Actually, I should also mention that",
      "Oh, and",
      "Also,",
      "Come to think of it,",
      "I just remembered:",
      "Actually,"
    ];
    
    const starter = additionalThoughtStarters[
      Math.floor(Math.random() * additionalThoughtStarters.length)
    ];
    
    // Generate thought based on context and personality
    let thought = '';
    
    if (context.topicOfInterest) {
      thought = `${context.topicOfInterest} is really interesting, especially ${this.generateTopicDetail(context.topicOfInterest)}`;
    } else if (context.opinion) {
      thought = `I feel ${this.personalityEnhancer.getTraits().positivity > 0.5 ? 'strongly positive' : 'skeptical'} about this because ${this.generateOpinionReason(context.opinion)}`;
    } else {
      const randomTopics = ['recent developments', 'community feedback', 'interesting trends', 'latest news'];
      const topic = randomTopics[Math.floor(Math.random() * randomTopics.length)];
      thought = `I've been thinking about ${topic} lately`;
    }
    
    return `${starter} ${thought}.`;
  }
  
  /**
   * Generate a question follow-up
   * 
   * @param originalMessage - Original message
   * @param context - Message context
   * @returns Question message
   */
  private generateQuestion(originalMessage: string, context: Record<string, any>): string {
    const questions = [
      "What do you think about that?",
      "Wouldn't you agree?",
      "Interesting, right?",
      "Does that make sense?",
      "What's your take on this?"
    ];
    
    // Generate topic-specific questions if context is available
    if (context.topicOfInterest) {
      return `Speaking of ${context.topicOfInterest}, what's your opinion on ${this.generateTopicDetail(context.topicOfInterest)}?`;
    }
    
    return questions[Math.floor(Math.random() * questions.length)];
  }
  
  /**
   * Generate an emphasis follow-up
   * 
   * @param originalMessage - Original message
   * @param context - Message context
   * @returns Emphasis message
   */
  private generateEmphasis(originalMessage: string, context: Record<string, any>): string {
    const emphasisPhrases = [
      "I can't stress enough how important this is!",
      "This is really key.",
      "That's the bottom line.",
      "This is what really matters.",
      "The main takeaway is this."
    ];
    
    // Generate topic-specific emphasis if context is available
    if (context.keyPoint) {
      return `${context.keyPoint} - that's what really matters here.`;
    }
    
    return emphasisPhrases[Math.floor(Math.random() * emphasisPhrases.length)];
  }
  
  /**
   * Extract keywords from a message
   * 
   * @param message - Message to extract keywords from
   * @returns Array of keywords
   */
  private extractKeywords(message: string): string[] {
    // This is a simple implementation
    // In a full version, use NLP or regex pattern matching
    const words = message.split(/\s+/);
    
    // Filter out common stop words and keep only substantive words
    const stopWords = ['the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'with', 'by'];
    const keywords = words.filter(word => 
      word.length > 4 && !stopWords.includes(word.toLowerCase())
    );
    
    return keywords;
  }
  
  /**
   * Rephrase a key point for clarity
   * 
   * @param keyPoint - Key point to rephrase
   * @param context - Message context
   * @returns Rephrased point
   */
  private rephrasePoint(keyPoint: string, context: Record<string, any>): string {
    // This is a simplified implementation
    // In a full version, use more sophisticated text generation
    return `the importance of ${keyPoint} cannot be overstated, especially when considering ${context.topicOfInterest || 'the overall picture'}`;
  }
  
  /**
   * Generate a detail about a topic
   * 
   * @param topic - Topic to generate detail about
   * @returns Topic detail
   */
  private generateTopicDetail(topic: string): string {
    // This would ideally use the agent's knowledge base for more context
    // Here we use a simple implementation
    const details = [
      'recent developments',
      'community response',
      'long-term implications',
      'technical aspects',
      'practical applications'
    ];
    
    return `its ${details[Math.floor(Math.random() * details.length)]}`;
  }
  
  /**
   * Generate a reason for an opinion
   * 
   * @param opinion - Opinion to justify
   * @returns Opinion reason
   */
  private generateOpinionReason(opinion: string): string {
    // This would ideally use the agent's knowledge base
    // Here we use a simple implementation
    const reasons = [
      'it aligns with key principles',
      'the data clearly supports it',
      'it resonates with community values',
      'historical patterns show similar outcomes',
      'current trends point in this direction'
    ];
    
    return reasons[Math.floor(Math.random() * reasons.length)];
  }
  
  /**
   * Cancel any pending follow-ups
   */
  public cancelFollowUps(): void {
    if (this.followUpTimeout) {
      clearTimeout(this.followUpTimeout);
      this.followUpTimeout = null;
    }
  }
  
  /**
   * Get the timestamp of the last sent message
   * 
   * @returns Timestamp of last message
   */
  public getLastMessageTimestamp(): number {
    return this.lastMessageTimestamp;
  }
} 