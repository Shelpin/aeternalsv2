// OpenAI API Patch
// This patch provides a mock implementation of the OpenAI API for testing

console.log('🧠 Applying OpenAI API patch');

class OpenAIApiMock {
    constructor() {
        console.log('🧠 OpenAI API mock initialized');
        this.responseTemplates = {
            default: "I'm ELIZA, a simple AI assistant. How can I help you today?",
            greeting: "Hello! I'm ELIZA. How are you feeling today?",
            question: "That's an interesting question. Could you tell me more about why you're asking?",
            unclear: "I'm not sure I understand. Could you explain that differently?",
            farewell: "It was nice chatting with you. Take care!"
        };
    }

    async generateResponse(messages) {
        console.log(`🧠 Generating mock response for ${messages.length} messages`);

        // Simple pattern matching to choose response template
        const lastMessage = messages[messages.length - 1];
        const content = lastMessage.content.toLowerCase();

        let responseText;

        if (content.includes('hello') || content.includes('hi ') || content.match(/^hi$/)) {
            responseText = this.responseTemplates.greeting;
        } else if (content.includes('?')) {
            responseText = this.responseTemplates.question;
        } else if (content.includes('bye') || content.includes('goodbye')) {
            responseText = this.responseTemplates.farewell;
        } else if (content.length < 5) {
            responseText = this.responseTemplates.unclear;
        } else {
            responseText = this.responseTemplates.default;
        }

        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log(`🧠 Generated response: "${responseText.substring(0, 30)}..."`);

        return {
            choices: [
                {
                    message: {
                        role: 'assistant',
                        content: responseText
                    }
                }
            ]
        };
    }
}

module.exports = {
    OpenAIApi: OpenAIApiMock
};

console.log('🧠 OpenAI API patch applied successfully'); 