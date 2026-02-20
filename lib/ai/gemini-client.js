import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Gemini Fallback Client
 * Digunakan sebagai fallback ketika OpenRouter error atau rate limit.
 * Model: gemini-2.0-flash (cepat, gratis, cocok untuk fallback)
 */

const estimateTokenCount = (text) => {
    if (!text || typeof text !== 'string') return 0;
    return Math.ceil(text.length / 4);
};

class GeminiClient {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.0-flash';
        this.isDemoMode = !this.apiKey;

        if (this.isDemoMode) {
            console.warn('[GeminiFallback] No GEMINI_API_KEY found, fallback will not work.');
        } else {
            this.genAI = new GoogleGenerativeAI(this.apiKey);
            console.log(`[GeminiFallback] Initialized with model: ${this.model}`);
        }
    }

    /**
     * Generate non-streaming response (untuk reranking & SQL planning)
     */
    async generateResponse(prompt, context = '', image = null) {
        if (this.isDemoMode) {
            return {
                success: false,
                error: 'Gemini fallback not configured (no API key)',
                text: null,
                usage: { totalTokenCount: 0 }
            };
        }

        try {
            const fullPrompt = context ? `${context}\n\nUser: ${prompt}` : prompt;
            const genModel = this.genAI.getGenerativeModel({ model: this.model });

            console.log(`[GeminiFallback] Sending request to ${this.model}...`);
            const startTime = Date.now();

            let result;
            if (image && image.base64 && image.mimeType) {
                // Multimodal request
                const base64Data = image.base64.replace(/^data:image\/\w+;base64,/, '');
                result = await genModel.generateContent([
                    fullPrompt,
                    { inlineData: { data: base64Data, mimeType: image.mimeType } }
                ]);
            } else {
                result = await genModel.generateContent(fullPrompt);
            }

            const duration = Date.now() - startTime;
            const responseText = result.response.text();
            const usage = result.response.usageMetadata || {};

            console.log(`[GeminiFallback] ✅ Success in ${duration}ms, tokens: ${usage.totalTokenCount || 'N/A'}`);

            return {
                success: true,
                text: responseText,
                usage: {
                    promptTokenCount: usage.promptTokenCount || estimateTokenCount(fullPrompt),
                    candidatesTokenCount: usage.candidatesTokenCount || estimateTokenCount(responseText),
                    totalTokenCount: usage.totalTokenCount || 0,
                    isEstimated: !usage.totalTokenCount
                }
            };
        } catch (error) {
            console.error('[GeminiFallback] generateResponse error:', error.message);
            return {
                success: false,
                error: error.message,
                text: null,
                usage: { totalTokenCount: 0 }
            };
        }
    }

    /**
     * Generate streaming response (untuk final response)
     */
    async generateStream(prompt, context = '', image = null) {
        if (this.isDemoMode) {
            return {
                success: false,
                error: 'Gemini fallback not configured (no API key)',
                stream: null,
                responsePromise: Promise.resolve(null),
                isError: true
            };
        }

        try {
            const fullPrompt = context ? `${context}\n\nUser: ${prompt}` : prompt;
            const genModel = this.genAI.getGenerativeModel({ model: this.model });

            console.log(`[GeminiFallback] Starting stream with ${this.model}...`);

            let streamResult;
            if (image && image.base64 && image.mimeType) {
                const base64Data = image.base64.replace(/^data:image\/\w+;base64,/, '');
                streamResult = await genModel.generateContentStream([
                    fullPrompt,
                    { inlineData: { data: base64Data, mimeType: image.mimeType } }
                ]);
            } else {
                streamResult = await genModel.generateContentStream(fullPrompt);
            }

            // Wrap Gemini stream ke format yang dipakai app
            const wrappedStream = this._wrapGeminiStream(streamResult.stream);

            const responsePromise = streamResult.response.then(r => ({
                usageMetadata: r.usageMetadata || {
                    promptTokenCount: estimateTokenCount(fullPrompt),
                    candidatesTokenCount: 0,
                    totalTokenCount: 0,
                    isEstimated: true
                }
            }));

            return {
                success: true,
                stream: wrappedStream,
                responsePromise,
                isError: false,
                isFallback: true
            };
        } catch (error) {
            console.error('[GeminiFallback] generateStream error:', error.message);
            return {
                success: false,
                error: error.message,
                stream: null,
                responsePromise: Promise.resolve(null),
                isError: true
            };
        }
    }

    /**
     * Wrap Gemini stream ke format { text: () => string }
     */
    async *_wrapGeminiStream(geminiStream) {
        try {
            for await (const chunk of geminiStream) {
                const text = chunk.text();
                if (text) {
                    yield { text: () => text };
                }
            }
        } catch (error) {
            console.error('[GeminiFallback] Stream error:', error.message);
            yield { text: () => `[Fallback stream error: ${error.message}]` };
        }
    }
}

export const geminiClient = new GeminiClient();
export default GeminiClient;
