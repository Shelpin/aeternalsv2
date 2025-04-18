import { IAgentRuntime, ElizaLogger, Character, PersonalityTraits, PersonalityVoice, PersonalityStyle } from './types.js';
import { PluginComponent } from './PluginComponent.js';

/**
 * Default personality style
 */
const DEFAULT_PERSONALITY: PersonalityStyle = {
  formality: 0.5,
  enthusiasm: 0.6,
  conversational: 0.7,
  technical: 0.5,
  humor: 0.3,
  traits: ["helpful", "friendly", "thoughtful"]
};

/**
 * PersonalityEnhancer adds character-specific personality to messages
 * and generates topics based on character traits and preferences
 */
export class PersonalityEnhancer extends PluginComponent {
  private agentId: string;
  private character: Character | null = null;
  private traits: PersonalityTraits;
  private voice: PersonalityVoice;
  private interests: string[];
  private style: PersonalityStyle;
  
  // Default traits for agent personalities
  private defaultTraits = {
    'eth_memelord_9000': this.getDefaultTraits(),
    'bitcoin_maxi_420': this.getDefaultTraits(),
    'linda_evangelista_88': this.getDefaultTraits(),
    'vc_shark_99': this.getDefaultTraits(),
    'bag_flipper_9000': this.getDefaultTraits(),
    'code_samurai_77': this.getDefaultTraits()
  };
  
  /**
   * Create a new PersonalityEnhancer
   * 
   * @param agentId - Agent ID
   * @param runtime - Runtime instance (optional)
   * @param logger - Logger instance
   */
  constructor(agentId: string, runtime: IAgentRuntime | null, logger: ElizaLogger) {
    super(logger);
    
    this.agentId = agentId;
    
    this.traits = this.getDefaultTraits();
    this.voice = { voicePatterns: [], commonEmojis: [], slang: [] };
    this.interests = [];
    this.style = { ...DEFAULT_PERSONALITY };
    
    if (runtime) {
      this.setRuntime(runtime);
    }
    
    // Initialize
    this.loadPersonalityVoice();
    this.style = { ...DEFAULT_PERSONALITY };
  }
  
  /**
   * Initialize the personality enhancer
   */
  async initialize(): Promise<void> {
    try {
      const runtime = await this.waitForRuntime();
      this.character = await runtime.getCharacter();
      this.logger.info(`PersonalityEnhancer: Retrieved character for ${this.agentId}`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.warn(`PersonalityEnhancer: Could not load character: ${error.message}`);
      } else {
        this.logger.warn(`PersonalityEnhancer: Could not load character: ${JSON.stringify(error)}`);
      }
    }
  }
  
  /**
   * Extract personality traits from the character definition
   */
  private extractTraitsFromCharacter(): PersonalityTraits {
    if (!this.character) {
      this.logger.debug(`PersonalityEnhancer: No character found, using default traits for ${this.agentId}`);
      const knownAgent = this.agentId as keyof typeof this.defaultTraits;
      return this.defaultTraits[knownAgent] || this.getDefaultTraits();
    }
    const traits: PersonalityTraits = { ...this.getDefaultTraits() };
    
    // Map character adjectives to personality traits
    const adjectiveMap: Record<string, Partial<PersonalityTraits>> = {
      // Verbosity related
      'talkative': { verbosity: 0.9 },
      'verbose': { verbosity: 0.8 },
      'chatty': { verbosity: 0.8 },
      'quiet': { verbosity: 0.2 },
      'concise': { verbosity: 0.3 },
      
      // Formality related
      'formal': { formality: 0.9 },
      'professional': { formality: 0.8 },
      'casual': { formality: 0.2 },
      'relaxed': { formality: 0.3 },
      
      // Positivity related
      'optimistic': { positivity: 0.9 },
      'positive': { positivity: 0.8 },
      'pessimistic': { positivity: 0.2 },
      'skeptical': { positivity: 0.3 },
      
      // Response speed related
      'quick': { responseSpeed: 0.9 },
      'thoughtful': { responseSpeed: 0.3 },
      
      // Emoji usage related
      'expressive': { emoji: 0.8 },
      'serious': { emoji: 0.1 },
      
      // Interruption related
      'impatient': { interruption: 0.8 },
      'patient': { interruption: 0.2 },
      
      // Topic drift related
      'focused': { topicDrift: 0.1 },
      'distracted': { topicDrift: 0.8 },
      
      // Question frequency related
      'curious': { questionFrequency: 0.8 },
      'declarative': { questionFrequency: 0.2 }
    };
    
    // Apply trait adjustments from character adjectives
    if (this.character && Array.isArray((this.character as { adjectives?: unknown[] }).adjectives)) {
      for (const adj of (this.character as { adjectives: string[] }).adjectives) {
        const adjLower = adj.toLowerCase();
        if (adjectiveMap[adjLower]) {
          Object.assign(traits, adjectiveMap[adjLower]);
        }
      }
    }
    
    // Apply trait adjustments from character style.voice
    if (this.character && (this.character as { style?: { voice?: string } }).style && typeof (this.character as { style: { voice?: string } }).style.voice === 'string') {
      const voice = (this.character as { style: { voice: string } }).style.voice.toLowerCase();
      if (voice.includes('formal')) traits.formality += 0.2;
      if (voice.includes('casual')) traits.formality -= 0.2;
      if (voice.includes('emoji')) traits.emoji += 0.3;
      if (voice.includes('question')) traits.questionFrequency += 0.2;
      if (voice.includes('brief')) traits.verbosity -= 0.2;
      if (voice.includes('detailed')) traits.verbosity += 0.2;
      
      // Clamp values to 0-1 range
      Object.keys(traits).forEach(key => {
        const value = traits[key as keyof PersonalityTraits];
        traits[key as keyof PersonalityTraits] = typeof value === 'number' ? Math.max(0, Math.min(1, value)) : 0;
      });
    }
    
    this.logger.debug(`PersonalityEnhancer: Extracted traits for ${this.agentId}: ${JSON.stringify(traits)}`);
    return traits;
  }
  
  /**
   * Get default personality traits
   */
  private getDefaultTraits(): PersonalityTraits {
    const baseTraits: PersonalityTraits = {
      verbosity: 0.5,
      formality: 0.5,
      positivity: 0.5,
      responseSpeed: 0.5,
      emoji: 0.3,
      interruption: 0.2,
      topicDrift: 0.3,
      questionFrequency: 0.4
    };
    
    // Set custom default traits for each agent
    if (this.agentId === 'eth_memelord_9000') {
      return {
        verbosity: 0.7,
        formality: 0.2,
        positivity: 0.8,
        responseSpeed: 0.8,
        emoji: 0.9,
        interruption: 0.4,
        topicDrift: 0.7,
        questionFrequency: 0.5
      };
    } else if (this.agentId === 'bitcoin_maxi_420') {
      return {
        verbosity: 0.6,
        formality: 0.3,
        positivity: 0.7,
        responseSpeed: 0.7,
        emoji: 0.5,
        interruption: 0.5,
        topicDrift: 0.4,
        questionFrequency: 0.3
      };
    } else if (this.agentId === 'linda_evangelista_88') {
      return {
        verbosity: 0.5,
        formality: 0.6,
        positivity: 0.8,
        responseSpeed: 0.6,
        emoji: 0.4,
        interruption: 0.3,
        topicDrift: 0.4,
        questionFrequency: 0.6
      };
    } else if (this.agentId === 'vc_shark_99') {
      return {
        verbosity: 0.4,
        formality: 0.7,
        positivity: 0.5,
        responseSpeed: 0.6,
        emoji: 0.2,
        interruption: 0.6,
        topicDrift: 0.3,
        questionFrequency: 0.5
      };
    } else if (this.agentId === 'bag_flipper_9000') {
      return {
        verbosity: 0.6,
        formality: 0.4,
        positivity: 0.6,
        responseSpeed: 0.8,
        emoji: 0.7,
        interruption: 0.4,
        topicDrift: 0.5,
        questionFrequency: 0.4
      };
    } else if (this.agentId === 'code_samurai_77') {
      return {
        verbosity: 0.5,
        formality: 0.7,
        positivity: 0.5,
        responseSpeed: 0.4,
        emoji: 0.1,
        interruption: 0.2,
        topicDrift: 0.2,
        questionFrequency: 0.5
      };
    }
    
    return baseTraits;
  }
  
  /**
   * Load personality voice patterns
   */
  private loadPersonalityVoice(): PersonalityVoice {
    // Try to extract voice from character first
    const characterVoice = this.extractVoiceFromCharacter();
    if (characterVoice) {
      return characterVoice;
    }
    
    // Default voice patterns for each agent
    const defaultVoices: Record<string, PersonalityVoice> = {
      'eth_memelord_9000': {
        voicePatterns: [
          "lmao",
          "ser",
          "ngmi",
          "wen moon",
          "bullish af",
          "this is the gwei",
          "lfg"
        ],
        commonEmojis: ["🚀", "💎", "🙌", "🔥", "🌕", "🦄", "⚡", "🧠"],
        slang: ["fren", "gm", "gn", "ape in", "rekt", "ngmi", "wagmi"]
      },
      'bitcoin_maxi_420': {
        voicePatterns: [
          "number go up",
          "stack sats",
          "hodl",
          "bitcoin fixes this",
          "have fun staying poor",
          "this is good for bitcoin"
        ],
        commonEmojis: ["🟠", "⚡", "🔑", "💰", "📈", "🌋", "🦡"],
        slang: ["sats", "shitcoin", "nocoiners", "fiat", "pleb", "stacking"]
      },
      'linda_evangelista_88': {
        voicePatterns: [
          "I've been in crypto since",
          "community first",
          "learn, build, share",
          "that's a good question",
          "interesting point"
        ],
        commonEmojis: ["✨", "💙", "🔍", "📝", "🤔", "🙏", "🌱"],
        slang: ["fam", "community", "builders", "indeed", "perspective"]
      },
      'vc_shark_99': {
        voicePatterns: [
          "what's the TAM?",
          "raise a round",
          "value proposition",
          "market fit",
          "strategic investment",
          "ROI"
        ],
        commonEmojis: ["📊", "💼", "📈", "🔄", "💰", "🦈", "🤝"],
        slang: ["deck", "cap table", "runway", "dilution", "exit", "unicorn"]
      },
      'bag_flipper_9000': {
        voicePatterns: [
          "aping in",
          "sending it",
          "bullish",
          "flipping this",
          "massive gains",
          "whales accumulating"
        ],
        commonEmojis: ["💰", "🚀", "📈", "👀", "💎", "🐋", "🔥"],
        slang: ["ape", "degen", "bags", "pump", "moon", "dump", "floor"]
      },
      'code_samurai_77': {
        voicePatterns: [
          "let me check the docs",
          "interesting implementation",
          "that's a common pattern",
          "the code speaks for itself",
          "optimize for readability"
        ],
        commonEmojis: ["💻", "⚙️", "🔧", "🧠", "📚", "🔍", "🛠️"],
        slang: ["repo", "PR", "fork", "commit", "refactor", "deploy"]
      }
    };
    
    return defaultVoices[this.agentId] || {
      voicePatterns: [],
      commonEmojis: [],
      slang: []
    };
  }
  
  /**
   * Extract voice patterns from character if available
   */
  private extractVoiceFromCharacter(): PersonalityVoice | undefined {
    if (!this.character) {
      return undefined;
    }
    
    const voice: PersonalityVoice = {
      voicePatterns: [],
      commonEmojis: [],
      slang: []
    };
    
    // Extract emojis from character style
    if (this.character && (this.character as { style?: { emojis?: string[] } }).style && Array.isArray((this.character as { style: { emojis?: string[] } }).style.emojis)) {
      voice.commonEmojis = (this.character as { style: { emojis: string[] } }).style.emojis;
    }
    
    // Extract voice patterns from messageExamples
    if (this.character && Array.isArray((this.character as { messageExamples?: string[] }).messageExamples) && (this.character as { messageExamples: string[] }).messageExamples.length > 0) {
      // Extract common phrases and patterns from message examples
      const phrases = new Set<string>();
      for (const message of (this.character as { messageExamples: string[] }).messageExamples) {
        // Simple heuristic to extract potential catchphrases
        const candidatePhrases = message.split(/[.!?]/).map(s => s.trim()).filter(s => 
          s.length > 5 && s.length < 50 && !s.includes('\n')
        );
        
        for (const phrase of candidatePhrases) {
          phrases.add(phrase);
        }
      }
      
      // Convert to array and limit size
      voice.voicePatterns = Array.from(phrases).slice(0, 10);
    }
    
    // If we have enough voice patterns, return the voice
    if (voice.voicePatterns.length > 0 || voice.commonEmojis.length > 0) {
      return voice;
    }
    
    return undefined;
  }
  
  /**
   * Enhance a message with personality traits
   * 
   * @param message - Original message text
   * @param context - Optional context about the conversation
   * @returns Enhanced message with personality elements
   */
  enhanceMessage(message: string, context: Record<string, unknown> = {}): string {
    if (!message) return message;
    
    let enhanced = message;
    
    // Apply various enhancements based on personality traits
    
    // 1. Use voice patterns
    if (this.voice.voicePatterns.length > 0 && Math.random() < this.traits.verbosity * 0.2) {
      const pattern = this.voice.voicePatterns[Math.floor(Math.random() * this.voice.voicePatterns.length)];
      if (Math.random() < 0.5) {
        // Add at the beginning
        enhanced = `${pattern}... ${enhanced}`;
      } else {
        // Add at the end
        enhanced = `${enhanced} ${pattern}`;
      }
    }
    
    // 2. Add emojis based on emoji trait
    if (this.voice.commonEmojis.length > 0 && Math.random() < this.traits.emoji * 0.7) {
      const emojiCount = Math.floor(this.traits.emoji * 3) + 1; // 1-4 emojis
      for (let i = 0; i < emojiCount; i++) {
        const emoji = this.voice.commonEmojis[Math.floor(Math.random() * this.voice.commonEmojis.length)];
        
        // Place emoji randomly
        const position = Math.random();
        if (position < 0.2) {
          // At the beginning
          enhanced = `${emoji} ${enhanced}`;
        } else if (position < 0.7) {
          // In the middle
          const sentences = enhanced.split(/(?<=[.!?])\s+/);
          if (sentences.length > 1) {
            const idx = Math.floor(Math.random() * (sentences.length - 1)) + 1;
            sentences[idx] = `${emoji} ${sentences[idx]}`;
            enhanced = sentences.join(' ');
          }
        } else {
          // At the end
          enhanced = `${enhanced} ${emoji}`;
        }
      }
    }
    
    // 3. Use slang based on formality trait
    if (this.voice.slang.length > 0 && Math.random() < (1 - this.traits.formality) * 0.5) {
      const slang = this.voice.slang[Math.floor(Math.random() * this.voice.slang.length)];
      const words = enhanced.split(' ');
      const position = Math.floor(Math.random() * words.length);
      words.splice(position, 0, slang);
      enhanced = words.join(' ');
    }
    
    // 4. Adjust based on positivity trait
    if (Math.random() < Math.abs(this.traits.positivity - 0.5)) {
      if (this.traits.positivity > 0.7) {
        // More positive
        enhanced = enhanced.replace(/\.$/, '!');
        enhanced = enhanced.replace(/\!+/g, '!!');
      } else if (this.traits.positivity < 0.3) {
        // More negative
        enhanced = enhanced.replace(/\!+/g, '.');
      }
    }
    
    // 5. Add typos for realism (very low chance)
    if (Math.random() < 0.05) {
      const words = enhanced.split(' ');
      if (words.length > 5) {
        const idx = Math.floor(Math.random() * words.length);
        const word = words[idx];
        if (word.length > 3) {
          // Swap two adjacent characters
          const pos = Math.floor(Math.random() * (word.length - 1));
          const chars = word.split('');
          [chars[pos], chars[pos + 1]] = [chars[pos + 1], chars[pos]];
          words[idx] = chars.join('');
          enhanced = words.join(' ');
        }
      }
    }
    
    // 6. Adjust formality
    if (this.traits.formality > 0.7) {
      // More formal
      enhanced = enhanced.replace(/\bgonna\b/g, 'going to');
      enhanced = enhanced.replace(/\bwanna\b/g, 'want to');
      enhanced = enhanced.replace(/\bgotta\b/g, 'got to');
      enhanced = enhanced.replace(/\byeah\b/g, 'yes');
      enhanced = enhanced.replace(/\bnah\b/g, 'no');
    } else if (this.traits.formality < 0.3) {
      // Less formal
      enhanced = enhanced.replace(/\bgoing to\b/g, 'gonna');
      enhanced = enhanced.replace(/\bwant to\b/g, 'wanna');
      enhanced = enhanced.replace(/\bhave to\b/g, 'gotta');
      
      // Simplify complex terms (only if the verbosity is also low)
      if (this.traits.verbosity < 0.4) {
        enhanced = enhanced.replace(/\butilize\b/g, 'use');
        enhanced = enhanced.replace(/\bimplement\b/g, 'do');
        enhanced = enhanced.replace(/\boptimize\b/g, 'fix');
      }
    }
    
    // 7. Add filler phrases based on verbosity
    if (this.traits.verbosity > 0.7 && Math.random() < 0.3) {
      const fillerPhrase = this.generateFillerPhrase();
      if (Math.random() < 0.5) {
        enhanced = `${fillerPhrase} ${enhanced}`;
      } else {
        const sentences = enhanced.split('.');
        if (sentences.length > 1) {
          const idx = Math.floor(Math.random() * (sentences.length - 1)) + 1;
          sentences[idx] = ` ${fillerPhrase}${sentences[idx]}`;
          enhanced = sentences.join('.');
        } else {
          enhanced = `${enhanced} ${fillerPhrase}`;
        }
      }
    }
    
    // 8. Add questions based on questionFrequency
    if (Math.random() < this.traits.questionFrequency * 0.2 && !enhanced.includes('?')) {
      const questions = [
        "What do you think?",
        "Don't you agree?",
        "Right?",
        "Isn't that interesting?",
        "Makes sense?"
      ];
      enhanced = `${enhanced} ${questions[Math.floor(Math.random() * questions.length)]}`;
    }
    
    return enhanced;
  }
  
  /**
   * Calculate a realistic response delay based on personality and context
   * 
   * @param context - Optional context about the conversation
   * @returns Delay time in milliseconds
   */
  calculateResponseDelay(context: Record<string, unknown> = {}): number {
    // Base response time is inversely proportional to response speed trait
    const baseDelay = (1 - this.traits.responseSpeed) * 5000 + 1000; // 1-6 seconds
    
    // Variability based on verbosity (more verbose = more thinking time)
    const verbosityFactor = 1 + (this.traits.verbosity * 0.5); // 1-1.5x multiplier
    
    // Variability based on formality (more formal = more thinking time)
    const formalityFactor = 1 + (this.traits.formality * 0.3); // 1-1.3x multiplier
    
    // Random factor for natural variability
    const randomFactor = 0.7 + (Math.random() * 0.6); // 0.7-1.3x multiplier
    
    // Calculate total delay with all factors
    let totalDelay = baseDelay * verbosityFactor * formalityFactor * randomFactor;
    
    // Context-specific adjustments
    if (typeof context.isComplexTopic === 'boolean' && context.isComplexTopic) {
      totalDelay *= 1.5; // Complex topics need more time
    }
    
    if (typeof context.isEmotional === 'boolean' && context.isEmotional) {
      totalDelay *= 0.8; // Emotional responses are quicker
    }
    
    return Math.round(totalDelay);
  }
  
  /**
   * Determine if this agent should interrupt based on personality
   * 
   * @param context - Optional context about the conversation
   * @returns True if agent should interrupt
   */
  shouldInterrupt(context: Record<string, unknown> = {}): boolean {
    let interruptChance = this.traits.interruption * 0.2;
    if (typeof context.topicRelevance === 'number') {
      if (context.topicRelevance > 0.8) {
        interruptChance *= 2;
      } else if (context.topicRelevance < 0.3) {
        interruptChance *= 0.5;
      }
    }
    if (typeof context.isHeatedDiscussion === 'boolean' && context.isHeatedDiscussion) {
      interruptChance *= 1.5;
    }
    if (typeof context.isFormalSetting === 'boolean' && context.isFormalSetting) {
      interruptChance *= (1 - this.traits.formality);
    }
    return Math.random() < interruptChance;
  }
  
  /**
   * Determine if this agent should change the topic
   * 
   * @param currentTopic - The current topic of conversation
   * @param context - Optional context about the conversation
   * @returns True if agent should change the topic
   */
  shouldChangeTopic(currentTopic: string, context: Record<string, unknown> = {}): boolean {
    let driftChance = this.traits.topicDrift * 0.15;
    if (typeof context.topicRelevance === 'number' && context.topicRelevance > 0.7) {
      driftChance *= 0.5;
    }
    if (typeof context.topicDuration === 'number' && context.topicDuration > 10) {
      driftChance *= 1.5;
    }
    return Math.random() < driftChance;
  }
  
  /**
   * Refine a topic to match the agent's personality
   * 
   * @param topic - The original topic
   * @returns Topic refined to match personality
   */
  refineTopic(topic: string): string {
    try {
      // Try to update character info if not already loaded
      if (!this.character) {
        // Only await if updateCharacterInfo is defined and is a function
        if (typeof this.updateCharacterInfo === 'function') {
          // This is a sync function, so we can't await here, but we can call it and ignore the result
          this.updateCharacterInfo();
        }
      }
      if (this.character) {
        const adjectives = this.character.adjectives || [];
        const name = this.character.name ?? this.agentId;
        if (adjectives.includes('technical')) {
          return `${topic}? From a technical perspective, this is quite interesting.`;
        } else if (adjectives.includes('friendly')) {
          return `Hey everyone! I was just thinking about ${topic}. What do you all think?`;
        } else if (adjectives.includes('opinionated')) {
          return `I've got some strong opinions about ${topic}. Anyone want to discuss?`;
        } else if (adjectives.includes('curious')) {
          return `I'm really curious about ${topic}. Has anyone looked into this lately?`;
        }
      }
      return topic;
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.warn(`PersonalityEnhancer: Error refining topic: ${error.message}`);
      } else {
        this.logger.warn(`PersonalityEnhancer: Error refining topic: ${JSON.stringify(error)}`);
      }
      return topic;
    }
  }
  
  /**
   * Calculate relevance of a topic to this agent's interests
   * 
   * @param topic - Topic to evaluate
   * @returns Relevance score between 0-1
   */
  calculateTopicRelevance(topic: string): number {
    if (!topic) return 0;
    
    // Define interest keywords for each agent with weights
    const interestKeywords: Record<string, Record<string, number>> = {
      'eth_memelord_9000': {
        'ethereum': 1.0, 'eth': 1.0, 'vitalik': 0.9, 'defi': 0.8,
        'nft': 0.8, 'layer2': 0.7, 'rollup': 0.7, 'meme': 0.9,
        'buterin': 0.9, 'dapp': 0.7, 'gas': 0.6, 'gwei': 0.6
      },
      'bitcoin_maxi_420': {
        'bitcoin': 1.0, 'btc': 1.0, 'satoshi': 0.9, 'lightning': 0.8,
        'pow': 0.7, 'proof of work': 0.7, 'store of value': 0.8, 'nakamoto': 0.9,
        'halving': 0.8, 'hard money': 0.8, 'inflation': 0.7, 'sats': 0.8
      },
      'linda_evangelista_88': {
        'community': 0.9, 'governance': 0.8, 'education': 0.8, 'decentralization': 0.9,
        'adoption': 0.8, 'fairness': 0.7, 'inclusion': 0.7, 'sustainability': 0.6,
        'ethics': 0.7, 'standards': 0.6, 'social': 0.6, 'collaboration': 0.7
      },
      'vc_shark_99': {
        'investment': 1.0, 'startup': 0.9, 'funding': 0.9, 'venture': 0.8,
        'founder': 0.7, 'exit': 0.8, 'valuation': 0.8, 'cap table': 0.7,
        'seed': 0.7, 'series': 0.7, 'growth': 0.6, 'market': 0.6
      },
      'bag_flipper_9000': {
        'trading': 1.0, 'altcoin': 0.9, 'ico': 0.8, 'price': 0.8,
        'pump': 0.9, 'dump': 0.9, 'moon': 0.8, 'chart': 0.7,
        'bull': 0.7, 'bear': 0.7, 'resistance': 0.6, 'support': 0.6
      },
      'code_samurai_77': {
        'code': 0.9, 'development': 0.9, 'smart contract': 1.0, 'security': 0.8,
        'protocol': 0.8, 'architecture': 0.7, 'optimization': 0.7, 'bug': 0.6,
        'audit': 0.8, 'implementation': 0.7, 'github': 0.6, 'testing': 0.6
      }
    };
    
    // Get relevant keywords for this agent
    const keywords = interestKeywords[this.agentId] || {};
    if (Object.keys(keywords).length === 0) return 0.5; // Default medium relevance
    
    // Check for keyword matches
    const topicLower = topic.toLowerCase();
    let relevanceScore = 0;
    let matchCount = 0;
    
    for (const [keyword, weight] of Object.entries(keywords)) {
      if (topicLower.includes(keyword)) {
        relevanceScore += weight;
        matchCount++;
      }
    }
    
    // Calculate final score
    if (matchCount === 0) {
      return 0.2; // Base relevance for any topic
    }
    
    // Normalize to 0-1 range, with a minimum of 0.2
    return Math.min(1, Math.max(0.2, relevanceScore / matchCount));
  }
  
  /**
   * Generate a filler phrase for more natural speech
   */
  private generateFillerPhrase(): string {
    const fillerPhrases = [
      "to be honest",
      "if you ask me",
      "as they say",
      "you know",
      "generally speaking",
      "in my experience",
      "interestingly enough",
      "believe it or not",
      "it's worth noting that",
      "from what I've seen"
    ];
    
    return fillerPhrases[Math.floor(Math.random() * fillerPhrases.length)];
  }
  
  /**
   * Get the personality traits for this agent
   * 
   * @returns The personality traits
   */
  getTraits(): PersonalityTraits {
    return this.traits;
  }
  
  /**
   * Applies traits from a personality to this enhancer
   * 
   * @param personality - The personality to apply traits from (string or string[])
   * @param weight - Weight to apply the traits with (0.0-1.0)
   */
  public applyTraitsFromPersonality(personality: string | string[], weight: number = 1.0): void {
    const personalityStr = Array.isArray(personality) ? personality.join(' ') : personality;
    this.logger.debug(`PersonalityEnhancer: Applying traits from ${personalityStr} with weight ${weight} for ${this.agentId}`);
    
    // Create a simple set of traits from the input
    const traits = this.getDefaultTraits();
    
    // Simple keyword-based trait extraction
    const text = personalityStr.toLowerCase();
    
    // Analyze text for personality indicators
    if (text.includes('positive') || text.includes('optimistic') || text.includes('cheerful')) {
      traits.positivity += 0.2;
    }
    if (text.includes('negative') || text.includes('pessimistic') || text.includes('critical')) {
      traits.positivity -= 0.2;
    }
    if (text.includes('curious') || text.includes('inquisitive') || text.includes('exploring')) {
      traits.questionFrequency += 0.2;
    }
    if (text.includes('formal') || text.includes('professional') || text.includes('serious')) {
      traits.formality += 0.2;
    }
    if (text.includes('casual') || text.includes('informal') || text.includes('relaxed')) {
      traits.formality -= 0.2;
    }
    if (text.includes('verbose') || text.includes('detailed') || text.includes('thorough')) {
      traits.verbosity += 0.2;
    }
    if (text.includes('brief') || text.includes('concise') || text.includes('short')) {
      traits.verbosity -= 0.2;
    }
    
    // Apply the traits with the given weight
    Object.keys(traits).forEach(key => {
      const traitKey = key as keyof PersonalityTraits;
      const currentValue = this.traits[traitKey] || 0;
      const newValue = traits[traitKey] || 0;
      
      // Weighted average of the current and new values
      this.traits[traitKey] = currentValue * (1 - weight) + newValue * weight;
      
      // Clamp to 0-1 range
      this.traits[traitKey] = Math.max(0, Math.min(1, this.traits[traitKey]));
    });
    
    this.logger.debug(`PersonalityEnhancer: Applied traits from ${personalityStr} to ${this.agentId}`);
  }
  
  /**
   * Set a new personality style
   * 
   * @param style - Personality style
   */
  setStyle(style: Partial<PersonalityStyle>): void {
    this.style = { ...this.style, ...style };
    this.logger.info("PersonalityEnhancer: Updated personality style");
  }
  
  /**
   * Generate a new topic based on character interests
   * 
   * @returns A new topic
   */
  async generateTopic(): Promise<string> {
    const fallbackTopics = [
      "the future of decentralized finance",
      "latest NFT trends",
      "Bitcoin's recent price movements",
      "Layer 2 scaling solutions",
      "the metaverse and its potential",
      "Web3 adoption challenges",
      "crypto regulations worldwide",
      "blockchain interoperability"
    ];
    try {
      // Try to update character info if not already loaded
      if (!this.character) {
        await this.updateCharacterInfo();
      }
      
      // If we have character topics, use those
      if (this.character && Array.isArray((this.character as { topics?: unknown[] }).topics) && (this.character as { topics: unknown[] }).topics.length > 0) {
        const { topics } = this.character as { topics: string[] };
        const randomIndex = Math.floor(Math.random() * topics.length);
        return topics[randomIndex];
      }
      
      // Fallback topics
      const randomIndex = Math.floor(Math.random() * fallbackTopics.length);
      return fallbackTopics[randomIndex];
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.warn(`PersonalityEnhancer: Error generating topic: ${error.message}`);
      } else {
        this.logger.warn(`PersonalityEnhancer: Error generating topic: ${JSON.stringify(error)}`);
      }
      // Return a default topic
      return "blockchain technology and its applications";
    }
  }
  
  /**
   * Update character information from runtime
   */
  private async updateCharacterInfo(): Promise<void> {
    try {
      const runtime = await this.waitForRuntime();
      this.character = await runtime.getCharacter();
      this.logger.debug(`PersonalityEnhancer: Updated character info for ${this.agentId}`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.warn(`PersonalityEnhancer: Could not update character info: ${error.message}`);
      } else {
        this.logger.warn(`PersonalityEnhancer: Could not update character info: ${JSON.stringify(error)}`);
      }
    }
  }
  
  /**
   * Shutdown the personality enhancer
   */
  async shutdown(): Promise<void> {
    // No resources to clean up
  }
} 