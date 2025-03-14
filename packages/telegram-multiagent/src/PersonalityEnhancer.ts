import { ElizaLogger, Character, IAgentRuntime } from './types';

/**
 * PersonalityTraits define the behavioral characteristics of an agent
 */
export interface PersonalityTraits {
  verbosity: number;     // 0-1: How wordy the agent is
  formality: number;     // 0-1: How formal vs casual
  positivity: number;    // 0-1: How positive vs negative
  responseSpeed: number; // 0-1: How quickly they respond
  emoji: number;         // 0-1: Frequency of emoji usage
  interruption: number;  // 0-1: Tendency to interrupt conversations
  topicDrift: number;    // 0-1: Tendency to change topics
  questionFrequency: number; // 0-1: How often they ask questions
}

/**
 * PersonalityVoice defines the textual expression style of an agent
 */
export interface PersonalityVoice {
  voicePatterns: string[];
  commonEmojis: string[];
  slang: string[];
}

/**
 * PersonalityEnhancer makes agent messages more natural and personalized
 */
export class PersonalityEnhancer {
  private agentId: string;
  private runtime: IAgentRuntime;
  private character?: Character;
  private traits: PersonalityTraits;
  private voice: PersonalityVoice;
  private logger: ElizaLogger;
  private interests: string[];
  
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
   * Constructor overloads for PersonalityEnhancer
   */
  constructor(config: {
    agentId: string;
    primary: string[];
    secondary: string[];
    interests: string[];
  });
  constructor(agentId: string, runtime: IAgentRuntime, logger: ElizaLogger);
  constructor(agentIdOrConfig: string | {
    agentId: string;
    primary: string[];
    secondary: string[];
    interests: string[];
  }, runtime?: IAgentRuntime, logger?: ElizaLogger) {
    try {
      // Handle different parameter formats
      if (typeof agentIdOrConfig === 'string') {
        this.agentId = agentIdOrConfig;
        this.logger = logger || {
          debug: console.debug,
          info: console.info,
          warn: console.warn,
          error: console.error
        };
      } else {
        // Object parameter format
        this.agentId = agentIdOrConfig.agentId;
        this.traits = this.getDefaultTraits();
        
        // Override with provided traits
        if (agentIdOrConfig.primary && agentIdOrConfig.primary.length) {
          this.applyTraitsFromPersonality(agentIdOrConfig.primary, 0.7);
        }
        
        if (agentIdOrConfig.secondary && agentIdOrConfig.secondary.length) {
          this.applyTraitsFromPersonality(agentIdOrConfig.secondary, 0.4);
        }
        
        this.interests = agentIdOrConfig.interests || [];
        
        this.logger = {
          debug: console.debug,
          info: console.info,
          warn: console.warn,
          error: console.error
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`PersonalityEnhancer initialization error: ${errorMessage}`);
      
      // Set defaults
      this.agentId = typeof agentIdOrConfig === 'string' ? agentIdOrConfig : 
                    (agentIdOrConfig as any)?.agentId || 'unknown';
      this.traits = this.getDefaultTraits();
      this.interests = [];
      this.logger = {
        debug: console.debug,
        info: console.info,
        warn: console.warn,
        error: console.error
      };
    }
    
    // Initialize
    this.loadPersonalityVoice();
  }
  
  /**
   * Extract personality traits from the character definition
   */
  private extractTraitsFromCharacter(): PersonalityTraits {
    if (!this.character) {
      this.logger.debug(`PersonalityEnhancer: No character found, using default traits for ${this.agentId}`);
      // Use type assertion to tell TypeScript this is a valid key access
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
    if (this.character.adjectives) {
      for (const adj of this.character.adjectives) {
        const adjLower = adj.toLowerCase();
        if (adjectiveMap[adjLower]) {
          Object.assign(traits, adjectiveMap[adjLower]);
        }
      }
    }
    
    // Apply trait adjustments from character style.voice
    if (this.character.style && this.character.style.voice) {
      const voice = this.character.style.voice.toLowerCase();
      if (voice.includes('formal')) traits.formality += 0.2;
      if (voice.includes('casual')) traits.formality -= 0.2;
      if (voice.includes('emoji')) traits.emoji += 0.3;
      if (voice.includes('question')) traits.questionFrequency += 0.2;
      if (voice.includes('brief')) traits.verbosity -= 0.2;
      if (voice.includes('detailed')) traits.verbosity += 0.2;
      
      // Clamp values to 0-1 range
      Object.keys(traits).forEach(key => {
        traits[key as keyof PersonalityTraits] = Math.max(0, Math.min(1, traits[key as keyof PersonalityTraits]));
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
    if (this.character.style && this.character.style.emojis) {
      voice.commonEmojis = this.character.style.emojis;
    }
    
    // Extract voice patterns from messageExamples
    if (this.character.messageExamples && this.character.messageExamples.length > 0) {
      // Extract common phrases and patterns from message examples
      const phrases = new Set<string>();
      for (const message of this.character.messageExamples) {
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
  enhanceMessage(message: string, context: any = {}): string {
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
  calculateResponseDelay(context: any = {}): number {
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
    if (context.isComplexTopic) {
      totalDelay *= 1.5; // Complex topics need more time
    }
    
    if (context.isEmotional) {
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
  shouldInterrupt(context: any = {}): boolean {
    // Base chance from interruption trait
    let interruptChance = this.traits.interruption * 0.2; // 0-20% base chance
    
    // Adjust based on topic relevance
    if (context.topicRelevance) {
      if (context.topicRelevance > 0.8) {
        // Very relevant to agent's interests
        interruptChance *= 2; // Double the chance
      } else if (context.topicRelevance < 0.3) {
        // Not relevant to agent's interests
        interruptChance *= 0.5; // Half the chance
      }
    }
    
    // Adjust based on conversation context
    if (context.isHeatedDiscussion) {
      interruptChance *= 1.5; // More likely in heated discussions
    }
    
    if (context.isFormalSetting) {
      interruptChance *= (1 - this.traits.formality); // Less likely in formal settings for formal agents
    }
    
    // Random decision based on calculated chance
    return Math.random() < interruptChance;
  }
  
  /**
   * Determine if this agent should change the topic
   * 
   * @param currentTopic - The current topic of conversation
   * @param context - Optional context about the conversation
   * @returns True if agent should change the topic
   */
  shouldChangeTopic(currentTopic: string, context: any = {}): boolean {
    // Base chance from topic drift trait
    let driftChance = this.traits.topicDrift * 0.15; // 0-15% base chance
    
    // Reduce chance if the current topic is highly relevant
    if (context.topicRelevance && context.topicRelevance > 0.7) {
      driftChance *= 0.5; // Half the chance for relevant topics
    }
    
    // Increase chance if the topic has been discussed for a while
    if (context.topicDuration && context.topicDuration > 10) {
      driftChance *= 1.5; // 50% more likely after 10 messages on same topic
    }
    
    // Random decision based on calculated chance
    return Math.random() < driftChance;
  }
  
  /**
   * Refine a topic to align with agent's interests
   * 
   * @param topic - Original topic
   * @returns Refined topic more aligned with agent's interests
   */
  refineTopic(topic: string): string {
    if (!topic) return topic;
    
    // Define interest areas for each agent
    const interestAreas: Record<string, string[]> = {
      'eth_memelord_9000': [
        'Ethereum', 'NFTs', 'DeFi', 'Layer 2', 'Rollups', 'Memes', 'Vitalik'
      ],
      'bitcoin_maxi_420': [
        'Bitcoin', 'Lightning Network', 'Proof of Work', 'Store of Value', 'Hard Money', 'Inflation'
      ],
      'linda_evangelista_88': [
        'Community', 'Governance', 'Education', 'Adoption', 'Decentralization', 'Fairness'
      ],
      'vc_shark_99': [
        'Investments', 'Startups', 'Funding', 'Founders', 'Exits', 'Growth', 'Markets'
      ],
      'bag_flipper_9000': [
        'Trading', 'Altcoins', 'ICOs', 'Price Action', 'Market Cycles', 'Pumps', 'Dumps'
      ],
      'code_samurai_77': [
        'Development', 'Smart Contracts', 'Security', 'Protocols', 'Architecture', 'Optimization'
      ]
    };
    
    // Get relevant interests for this agent
    const interests = interestAreas[this.agentId] || [];
    if (interests.length === 0) return topic;
    
    // Check if topic already contains an interest area
    for (const interest of interests) {
      if (topic.toLowerCase().includes(interest.toLowerCase())) {
        return topic; // Already aligned with interests
      }
    }
    
    // Add an interest angle to the topic
    const selectedInterest = interests[Math.floor(Math.random() * interests.length)];
    
    // Different ways to connect the original topic with the interest area
    const connections = [
      `${topic} in relation to ${selectedInterest}`,
      `${topic} and its impact on ${selectedInterest}`,
      `${selectedInterest} perspective on ${topic}`,
      `How ${topic} affects ${selectedInterest}`,
      `${topic}: ${selectedInterest} implications`
    ];
    
    return connections[Math.floor(Math.random() * connections.length)];
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
} 