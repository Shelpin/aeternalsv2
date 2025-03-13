import { ElizaLogger } from './types';

/**
 * TypingSimulator simulates human-like typing behavior for natural interactions
 */
export class TypingSimulator {
  private telegramClient: any;
  private chatId: string;
  private logger: ElizaLogger;
  
  // Human typing patterns
  private MIN_TYPING_BURST = 2000;  // Minimum typing burst in ms
  private MAX_TYPING_BURST = 8000;  // Maximum typing burst in ms
  private THINKING_CHANCE = 0.3;    // Chance agent pauses "thinking" between typing
  private MIN_THINKING = 1500;      // Minimum thinking pause duration in ms
  private MAX_THINKING = 6000;      // Maximum thinking pause duration in ms
  
  /**
   * Create a new TypingSimulator
   * 
   * @param telegramClient - ElizaOS Telegram client instance
   * @param chatId - ID of the chat to simulate typing in
   * @param logger - ElizaOS logger instance
   */
  constructor(telegramClient: any, chatId: string, logger: ElizaLogger) {
    this.telegramClient = telegramClient;
    this.chatId = chatId;
    this.logger = logger;
  }
  
  /**
   * Simulate realistic typing for a given message
   * 
   * @param messageLength - Length of the message being typed
   * @returns Promise that resolves when typing simulation is complete
   */
  async simulateTyping(messageLength: number): Promise<void> {
    try {
      // Calculate typing parameters based on message length
      const estimatedTypingTime = this.calculateTypingTime(messageLength);
      const bursts = this.calculateTypingBursts(estimatedTypingTime);
      
      this.logger.debug(`Simulating typing: ${estimatedTypingTime}ms total time, ${bursts.length} bursts`);
      
      // Execute each typing burst with natural pauses
      for (const burst of bursts) {
        await this.sendTypingAction();
        await this.delay(burst.duration);
        
        // Occasionally add a "thinking pause" between bursts
        if (Math.random() < this.THINKING_CHANCE && burst !== bursts[bursts.length - 1]) {
          const thinkingTime = this.MIN_THINKING + 
            Math.random() * (this.MAX_THINKING - this.MIN_THINKING);
          this.logger.debug(`Adding thinking pause: ${thinkingTime}ms`);
          await this.delay(thinkingTime);
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in typing simulation: ${errorMessage}`);
    }
  }
  
  /**
   * Calculate realistic typing time based on message length
   * 
   * @param messageLength - Length of the message
   * @returns Estimated typing time in milliseconds
   */
  private calculateTypingTime(messageLength: number): number {
    // Average human typing speed: ~40-60 WPM (200-300 CPM)
    const charsPerMinute = 200 + Math.random() * 100; // Random typing speed
    const baseTime = (messageLength / charsPerMinute) * 60 * 1000;
    
    // Add variability to make it more natural
    return baseTime * (0.8 + Math.random() * 0.4); // 0.8-1.2 multiplier
  }
  
  /**
   * Break typing time into natural bursts
   * 
   * @param totalTypingTime - Total typing time
   * @returns Array of typing bursts
   */
  private calculateTypingBursts(totalTypingTime: number): Array<{duration: number}> {
    const bursts = [];
    let remainingTime = totalTypingTime;
    
    while (remainingTime > 0) {
      // Calculate burst duration
      const maxBurstTime = Math.min(this.MAX_TYPING_BURST, remainingTime);
      const burstDuration = this.MIN_TYPING_BURST + 
        Math.random() * (maxBurstTime - this.MIN_TYPING_BURST);
      
      bursts.push({ duration: burstDuration });
      remainingTime -= burstDuration;
    }
    
    return bursts;
  }
  
  /**
   * Send typing action to Telegram
   */
  private async sendTypingAction(): Promise<void> {
    try {
      // Send typing indicator to Telegram
      if (this.telegramClient && this.chatId) {
        await this.telegramClient.sendChatAction(this.chatId, 'typing');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error sending typing indication: ${errorMessage}`);
    }
  }
  
  /**
   * Delay execution for the specified time
   * 
   * @param ms - Delay in milliseconds
   * @returns Promise that resolves after the delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
} 