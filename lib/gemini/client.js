import { GoogleGenerativeAI,HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const buildContentParts = (prompt, image) => {
    const parts = [];
    if (prompt && prompt.trim()) {
        parts.push({ text: prompt });
    }
    if (image && image.base64 && image.mimeType) {
        // Pastikan base64 tidak ada prefix
        const base64Data = image.base64.replace(/^data:[^;]+;base64,/, '');
        parts.push({
            inlineData: {
                mimeType: image.mimeType,
                data: base64Data
            }
        });
    }
    // Harus ada setidaknya satu part
    if (parts.length === 0) {
        parts.push({ text: "" }); // Kirim teks kosong jika tidak ada input lain
    }
    return parts;
};

class GeminiClient {
  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY;
    this.isDemoMode = !this.apiKey;

    if (this.isDemoMode) {
      console.log('Gemini running in DEMO mode - Add GEMINI_API_KEY to enable real AI');
    } else {
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({
        model: 'gemini-2.5-flash', // Pastikan model ini mendukung multimodal
        generationConfig: {
          temperature: 0.1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 10000, // Tingkatkan jika perlu (seperti pada solusi sebelumnya)
        },
         // Safety settings (opsional, untuk debugging)
        // safetySettings: [
        //     { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        //     // ... tambahkan kategori lain jika perlu
        // ],
      });
    }
  }

  /**
   * Generate AI response (multimodal support)
   * @param {string} prompt - Teks prompt
   * @param {string} [context] - Konteks tambahan (digabungkan ke prompt)
   * @param {object | null} [image] - Objek gambar { base64, mimeType }
   * @returns {Promise<object>}
   */
  async generateResponse(prompt, context = '', image = null) { // <= Tambah parameter image
    if (this.isDemoMode) {
      return this.generateDemoResponse(prompt, image); // <= Update demo
    }

    try {
      const fullPromptText = context ? `${context}\n\nUser: ${prompt}` : prompt;
      const contentParts = buildContentParts(fullPromptText, image); // <= Bangun parts

      // Kirim dalam format contents
      const result = await this.model.generateContent({
          contents: [{ role: "user", parts: contentParts }]
      });
      const response = await result.response;

      return {
        success: true,
        fullApiResponse: response,
        text: response.text(),
        usage: response.usageMetadata || { totalTokenCount: 0 } // Fallback
      };
    } catch (error) {
      console.error('Gemini API error:', error);
      return {
        success: false,
        error: error.message,
        fullApiResponse: null,
        text: null,
        usage: { totalTokenCount: 0 }
      };
    }
  }

  /**
   * Generate AI stream (multimodal support)
   * @param {string} prompt - Teks prompt
   * @param {string} [context] - Konteks tambahan (digabungkan ke prompt)
   * @param {object | null} [image] - Objek gambar { base64, mimeType }
   * @returns {Promise<object>}
   */
  async generateStream(prompt, context = '', image = null) { // <= Tambah parameter image
    if (this.isDemoMode) {
      return this.generateDemoStream(prompt, image); // <= Update demo
    }

    try {
      const fullPromptText = context ? `${context}\n\nUser: ${prompt}` : prompt;
      const contentParts = buildContentParts(fullPromptText, image); // <= Bangun parts

      // Kirim dalam format contents
      const result = await this.model.generateContentStream({
           contents: [{ role: "user", parts: contentParts }]
      });

      return {
        success: true,
        stream: result.stream,
        responsePromise: result.response,
        // Tambahkan isError flag awal (akan diupdate oleh stream handler jika perlu)
        isError: false
      };
    } catch (error) {
      console.error('Gemini streaming error:', error);
      // Buat stream error fallback
       return {
            success: false, // Tandai sebagai gagal
            error: error.message,
            stream: (async function*() {
                 yield { text: () => `Error: ${error.message}` }; // Kirim error message
            })(),
            responsePromise: Promise.resolve(null),
            isError: true // Tandai ini adalah error stream
       };
    }
  }

  // --- Update Fungsi Demo (Opsional) ---
  generateDemoResponse(prompt, image = null) {
      const imageText = image ? "(with image)" : "";
       const responses = [
          `Halo! Saya TmaChat ${imageText}. Saya siap membantu.`,
          `Anda bertanya ${imageText}: "${prompt.slice(0, 30)}..." - Dalam mode live, saya akan menganalisisnya.`,
       ];
      // ... (logika demo response lainnya) ...
          const randomResponse = responses[Math.floor(Math.random() * responses.length)];

      return {
          success: true,
          text: randomResponse,
          isDemo: true,
          fullApiResponse: null,
          usage: { promptTokenCount: 10, candidatesTokenCount: 15, totalTokenCount: 25 } // Demo usage
      };
  }

  async generateDemoStream(prompt, image = null) {
      const imageText = image ? "(beserta gambar)" : "";
      const response = `Demo response untuk: "${prompt.slice(0, 30)}..." ${imageText}.`;
      // ... (logika demo stream lainnya) ...
        const words = response.split(' ');

        const streamGenerator = async function*() {
            yield { text: () => "Processing demo request... " }; // Pesan awal
            await new Promise(resolve => setTimeout(resolve, 500));
            for (const word of words) {
                await new Promise(resolve => setTimeout(resolve, 80));
                yield {
                text: () => word + ' '
                };
            }
        };

        // Demo response promise
        const demoResponsePromise = Promise.resolve({
            usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 50, totalTokenCount: 70 }
        });

        return {
            success: true,
            stream: streamGenerator(),
            responsePromise: demoResponsePromise,
            isDemo: true,
            isError: false
        };
  }

  // ... (buildPrompt dan validateApiKey tetap sama) ...
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

  async validateApiKey() {
    if (this.isDemoMode) {
      return { valid: false, mode: 'demo' };
    }

    try {
      // Coba generate konten teks sederhana untuk validasi
      const result = await this.model.generateContent("Hello");
      await result.response;
      return { valid: true, mode: 'live' };
    } catch (error) {
       console.error("API Key validation failed:", error.message); // Log error
      return { valid: false, mode: 'error', error: error.message };
    }
  }

}

export const geminiClient = new GeminiClient();
export default GeminiClient;