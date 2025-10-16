// lib/gemini/client.js - ENHANCED STREAMING VERSION
import { GoogleGenerativeAI } from '@google/generative-ai';

class GeminiClient {
  constructor() {
    // Use environment variable or default to demo mode
    this.apiKey = process.env.GEMINI_API_KEY;
    this.isDemoMode = !this.apiKey;
    
    if (this.isDemoMode) {
      console.log('🔶 Gemini running in DEMO mode - Add GEMINI_API_KEY to enable real AI');
    } else {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash',
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      });
    }
  }

  /**
   * Generate AI response (real or demo)
   */
  async generateResponse(prompt, context = '') {
    if (this.isDemoMode) {
      return this.generateDemoResponse(prompt);
    }

    try {
      const fullPrompt = context ? `${context}\n\nUser: ${prompt}` : prompt;
      const result = await this.model.generateContent(fullPrompt);
      const response = await result.response;
      
      return {
        success: true,
        text: response.text(),
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      // Fallback to demo mode on error
      return this.generateDemoResponse(prompt);
    }
  }

  /**
   * Generate streaming response - FIXED VERSION
   */
  async generateStream(prompt, context = '') {
    if (this.isDemoMode) {
      return this.generateDemoStream(prompt);
    }

    try {
      const fullPrompt = context ? `${context}\n\nUser: ${prompt}` : prompt;
      const result = await this.model.generateContentStream(fullPrompt);
      
      return {
        success: true,
        stream: result.stream,
      };
    } catch (error) {
      console.error('Gemini streaming error:', error);
      return this.generateDemoStream(prompt);
    }
  }

  /**
   * Demo response for testing without API key
   */
  generateDemoResponse(prompt) {
    const responses = [
      "Halo! Saya TmaChat, asisten AI yang siap membantu Anda. Saya dapat memberikan informasi dan bantuan terkait berbagai topik termasuk jaringan, teknologi, dan banyak lagi.",
      
      "Terima kasih telah menggunakan TmaChat! Saya di sini untuk membantu menjawab pertanyaan Anda. Silakan tanyakan apa yang ingin Anda ketahui.",
      
      "Selamat datang di TmaChat! Saya siap membantu Anda dengan informasi yang Anda butuhkan. Untuk pertanyaan spesifik tentang jaringan atau hal lainnya, jangan ragu untuk bertanya.",
      
      `Anda bertanya: "${prompt.slice(0, 50)}..." - Dalam mode live, saya akan memberikan jawaban yang lebih spesifik dan akurat.`
    ];

    const randomResponse = responses[Math.floor(Math.random() * responses.length)];
    
    return {
      success: true,
      text: randomResponse,
      isDemo: true
    };
  }

  /**
   * Demo streaming simulation - FIXED VERSION
   */
  async generateDemoStream(prompt) {
    const responses = [
      `Halo! Saya telah menerima pertanyaan Anda: "${prompt}". Sebagai asisten AI, saya siap membantu menganalisis data jaringan dan informasi terkait Access Point.`,
      
      `Terima kasih atas pertanyaannya tentang "${prompt}". Mari saya bantu mencari informasi yang Anda butuhkan dari database jaringan kami.`,
      
      `Pertanyaan yang bagus! "${prompt}" - saya akan menganalisis data yang relevan dan memberikan insight yang berguna untuk Anda.`
    ];

    const response = responses[Math.floor(Math.random() * responses.length)];
    const words = response.split(' ');
    
    // Create async generator untuk streaming simulation
    const streamGenerator = async function*() {
      for (const word of words) {
        await new Promise(resolve => setTimeout(resolve, 80)); // Simulate typing delay
        yield {
          text: () => word + ' '
        };
      }
    };

    return {
      success: true,
      stream: streamGenerator(),
      isDemo: true
    };
  }

  /**
   * Build prompt dengan context
   */
  buildPrompt(prompt, context = '') {
    const systemPrompt = `Anda adalah TmaChat, asisten AI yang helpful dan informatif.
Anda dapat membantu dengan berbagai topik termasuk jaringan, teknologi, dan informasi umum.

${context ? `Context percakapan: ${context}\n\n` : ''}
Pedoman:
- Berikan jawaban yang jelas dan mudah dipahami
- Jika tidak tahu, jangan membuat informasi
- Format respons dengan rapi
- Gunakan bahasa Indonesia yang baik`;

    return `${systemPrompt}

User: ${prompt}
Assistant:`;
  }

  /**
   * Check if API key is valid
   */
  async validateApiKey() {
    if (this.isDemoMode) {
      return { valid: false, mode: 'demo' };
    }

    try {
      const result = await this.model.generateContent('Hello');
      await result.response;
      return { valid: true, mode: 'live' };
    } catch (error) {
      return { valid: false, mode: 'error', error: error.message };
    }
  }
}

// Export singleton instance
export const geminiClient = new GeminiClient();
export default GeminiClient;