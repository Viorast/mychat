/**
 * Simplified Gemini AI Client untuk TmaChat
 * Basic integration tanpa complex features
 * File: lib/gemini/client.js
 */

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
        model: 'gemini-2.5-flash',
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
      const fullPrompt = this.buildPrompt(prompt, context);
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
   * Generate streaming response
   */
  async generateStream(prompt, context = '') {
    if (this.isDemoMode) {
      return this.generateDemoStream(prompt);
    }

    try {
      const fullPrompt = this.buildPrompt(prompt, context);
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
      
      "Halo! Saya TmaChat. Saat ini saya berjalan dalam mode demo. Untuk pengalaman yang lebih baik, silakan tambahkan API key Gemini di environment variables.",
      
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
   * Demo streaming simulation
   */
  async generateDemoStream(prompt) {
    const response = this.generateDemoResponse(prompt).text;
    
    // Simulate streaming by chunking the response
    const words = response.split(' ');
    let currentText = '';
    
    const stream = {
      async *[Symbol.asyncIterator]() {
        for (const word of words) {
          await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay
          currentText += word + ' ';
          yield {
            text: () => currentText
          };
        }
      }
    };

    return {
      success: true,
      stream: stream,
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