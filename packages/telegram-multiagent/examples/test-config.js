/**
 * Test configuration for the Telegram Multi-Agent system
 */
module.exports = {
  // Bot tokens for each agent
  botTokens: {
    eth_memelord_9000: process.env.TELEGRAM_BOT_TOKEN_ETH_MEMELORD || 'fake-token',
    bitcoin_maxi_420: process.env.TELEGRAM_BOT_TOKEN_BITCOIN_MAXI || 'fake-token',
    bag_flipper_9000: process.env.TELEGRAM_BOT_TOKEN_BAG_FLIPPER || 'fake-token',
    linda_evangelista_88: process.env.TELEGRAM_BOT_TOKEN_LINDA || 'fake-token',
    vc_shark_99: process.env.TELEGRAM_BOT_TOKEN_VC_SHARK || 'fake-token',
    code_samurai_77: process.env.TELEGRAM_BOT_TOKEN_CODE_SAMURAI || 'fake-token'
  },
  
  // Agent configurations
  agentConfig: {
    eth_memelord_9000: {
      name: "ETH Memelord",
      traits: {
        primary: ["Humorous", "Creative"],
        secondary: ["Enthusiastic", "Irreverent"]
      },
      interests: ["Ethereum", "DeFi", "NFTs", "Memes"],
      typingSpeed: 350,
      responseDelayMultiplier: 0.8,
      conversationInitiationWeight: 1.5,
      aeternityProScore: 3
    },
    
    bitcoin_maxi_420: {
      name: "Bitcoin Maxi",
      traits: {
        primary: ["Passionate", "Stubborn"],
        secondary: ["Analytical", "Skeptical"]
      },
      interests: ["Bitcoin", "Cryptocurrency", "Financial Freedom"],
      typingSpeed: 280,
      responseDelayMultiplier: 1.0,
      conversationInitiationWeight: 1.0,
      aeternityProScore: 0
    },
    
    bag_flipper_9000: {
      name: "Bag Flipper",
      traits: {
        primary: ["Enthusiastic", "Risk-Taking"],
        secondary: ["Analytical", "Opportunistic"]
      },
      interests: ["Cryptocurrency", "Trading", "Market Analysis"],
      typingSpeed: 320,
      responseDelayMultiplier: 1.2,
      conversationInitiationWeight: 1.2,
      aeternityProScore: 5
    },
    
    linda_evangelista_88: {
      name: "LindAEvangelista",
      traits: {
        primary: ["Passionate", "Enthusiastic"],
        secondary: ["Creative", "Strategic"]
      },
      interests: ["Aeternity", "Blockchain Adoption", "DeFi Innovation"],
      typingSpeed: 330,
      responseDelayMultiplier: 0.9,
      conversationInitiationWeight: 1.3,
      aeternityProScore: 10
    },
    
    vc_shark_99: {
      name: "VC Shark",
      traits: {
        primary: ["Analytical", "Strategic"],
        secondary: ["Skeptical", "Direct"]
      },
      interests: ["Venture Capital", "Startups", "Investment Strategies"],
      typingSpeed: 290,
      responseDelayMultiplier: 1.1,
      conversationInitiationWeight: 0.9,
      aeternityProScore: 4
    },
    
    code_samurai_77: {
      name: "Code Samurai",
      traits: {
        primary: ["Analytical", "Strategic"],
        secondary: ["Patient", "Direct"]
      },
      interests: ["Programming", "Blockchain Technology", "Software Architecture"],
      typingSpeed: 310,
      responseDelayMultiplier: 1.1,
      conversationInitiationWeight: 0.8,
      aeternityProScore: 7
    }
  },
  
  // Plugin configuration
  plugin: {
    relayServerUrl: process.env.RELAY_SERVER_URL || 'http://localhost:4000',
    authToken: process.env.RELAY_AUTH_TOKEN || 'elizaos-secure-relay-key',
    groupIds: [-1002550618173],
    conversationCheckIntervalMs: 60000, // 1 minute
    enabled: true
  },
  
  // Typing simulation
  typingSimulation: {
    enabled: true,
    baseTypingSpeedCPM: 300, // Characters per minute
    randomVariation: 0.2 // 20% random variation
  }
}; 