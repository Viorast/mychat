import { OpenRouter } from '@openrouter/sdk';

/**
 * Helper function untuk estimasi token count
 * Rule of thumb: 1 token ≈ 4 characters (untuk bahasa campuran EN/ID)
 */
const estimateTokenCount = (text) => {
    if (!text || typeof text !== 'string') return 0;
    return Math.ceil(text.length / 4);
};

/**
 * Helper function untuk membangun content parts (multimodal support)
 */

/**
 * Validate image object before processing
 */
const validateImage = (image) => {
    if (!image) return { valid: true };

    // Check required fields
    if (!image.base64 || !image.mimeType) {
        return {
            valid: false,
            error: 'Image harus memiliki base64 dan mimeType'
        };
    }

    // Validate mimeType
    if (!image.mimeType.startsWith('image/')) {
        return {
            valid: false,
            error: 'MimeType harus image/* (contoh: image/png, image/jpeg)'
        };
    }

    // Check base64 format (rough validation)
    const base64Data = image.base64.replace(/^data:image\/\w+;base64,/, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(base64Data)) {
        return {
            valid: false,
            error: 'Format base64 tidak valid'
        };
    }

    // Estimate size (base64 is ~1.37x larger than binary)
    const sizeInBytes = (base64Data.length * 3) / 4;
    const sizeInMB = sizeInBytes / (1024 * 1024);
    if (sizeInMB > 5) { // 5MB limit
        return {
            valid: false,
            error: `Ukuran gambar terlalu besar (${sizeInMB.toFixed(2)}MB). Maksimal 5MB.`
        };
    }

    return { valid: true };
};

/**
 * Helper function untuk membangun content parts (multimodal support)
 */
const buildContentParts = (prompt, image) => {
    const parts = [];

    // Add text prompt
    if (prompt && prompt.trim()) {
        parts.push({
            type: "text",
            text: prompt
        });
    }

    // Add image jika ada
    if (image && image.base64 && image.mimeType) {
        // ✅ VALIDATE IMAGE FIRST
        const validation = validateImage(image);
        if (!validation.valid) {
            throw new Error(validation.error);
        }

        // Pastikan base64 memiliki prefix yang benar
        const base64Data = image.base64.startsWith('data:')
            ? image.base64
            : `data:${image.mimeType};base64,${image.base64}`;

        // ✅ OpenRouter SDK format for images
        // See: https://openrouter.ai/docs/guides/overview/multimodal/images
        parts.push({
            type: "image_url",
            imageUrl: { url: base64Data }  // camelCase with nested object
        });

        console.log(`[buildContentParts] ✅ Added image (type: ${image.mimeType}, size: ~${(base64Data.length / 1024).toFixed(1)}KB)`);
    }

    // Harus ada setidaknya satu part
    if (parts.length === 0) {
        parts.push({ type: "text", text: "" });
    }

    return parts;
};

class OpenRouterClient {
    constructor() {
        this.apiKey = process.env.OPENROUTER_API_KEY;
        this.model = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';
        // Fallback vision model if main model doesn't support it (Llama 3.3 is text-only)
        this.visionModel = process.env.OPENROUTER_VISION_MODEL || 'google/gemma-3-12b-it:free';
        this.isDemoMode = !this.apiKey;

        if (this.isDemoMode) {
            console.log('OpenRouter running in DEMO mode - Add OPENROUTER_API_KEY to enable real AI');
        } else {
            this.client = new OpenRouter({
                apiKey: this.apiKey,
                defaultHeaders: {
                    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
                    'X-Title': process.env.OPENROUTER_SITE_NAME || 'TmaChat',
                },
            });

            console.log(`OpenRouter initialized with model: ${this.model}`);
        }
    }

    /**
     * Generate AI response (multimodal support)
     * @param {string} prompt - Teks prompt
     * @param {string} [context] - Konteks tambahan (digabungkan ke prompt)
     * @param {object | null} [image] - Objek gambar { base64, mimeType }
     * @returns {Promise<object>}
     */
    async generateResponse(prompt, context = '', image = null) {
        if (this.isDemoMode) {
            return this.generateDemoResponse(prompt, image);
        }

        try {
            const fullPromptText = context ? `${context}\n\nUser: ${prompt}` : prompt;

            // ✅ Build message content
            let messageContent;
            if (image && image.base64 && image.mimeType) {
                // Validate first
                const validation = validateImage(image);
                if (!validation.valid) {
                    throw new Error(validation.error);
                }

                const base64Data = image.base64.startsWith('data:')
                    ? image.base64
                    : `data:${image.mimeType};base64,${image.base64}`;

                // Multimodal format (OpenRouter SDK format)
                messageContent = [
                    { type: "text", text: fullPromptText },
                    { type: "image_url", imageUrl: { url: base64Data } }
                ];
                console.log(`[OpenRouter] Sending multimodal request with image (${image.mimeType})`);
            } else {
                // Text-only
                messageContent = fullPromptText;
            }

            // ✅ SELECT MODEL: Switch to vision model if image is present
            const selectedModel = (image && image.base64) ? this.visionModel : this.model;
            if (selectedModel !== this.model) {
                console.log(`[OpenRouter] Switching to vision model: ${selectedModel} (original: ${this.model})`);
            }

            // ✅ Use REST API directly instead of SDK (more reliable for images)
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:3000',
                    'X-Title': process.env.OPENROUTER_SITE_NAME || 'TmaChat',
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: [{ role: "user", content: messageContent }]
                })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `API Error: ${response.status}`);
            }

            const completion = await response.json();

            // Extract response
            const responseText = completion.choices?.[0]?.message?.content || '';

            // ✅ FIX: Handle missing usage metadata with estimation fallback
            let tokenUsage;
            if (completion.usage && completion.usage.total_tokens > 0) {
                // Real usage data available
                tokenUsage = {
                    promptTokenCount: completion.usage.prompt_tokens || 0,
                    candidatesTokenCount: completion.usage.completion_tokens || 0,
                    totalTokenCount: completion.usage.total_tokens || 0,
                    isEstimated: false
                };
            } else {
                // Fallback to estimation
                const estimatedPrompt = estimateTokenCount(fullPromptText);
                const estimatedResponse = estimateTokenCount(responseText);
                tokenUsage = {
                    promptTokenCount: estimatedPrompt,
                    candidatesTokenCount: estimatedResponse,
                    totalTokenCount: estimatedPrompt + estimatedResponse,
                    isEstimated: true
                };
                console.log('[OpenRouter] Usage metadata not available, using estimation:', tokenUsage);
            }

            // ✅ FIX: Check for empty response (API errors)
            if (!responseText || responseText.trim() === '') {
                console.warn('[OpenRouter] Received empty response from API');
                return {
                    success: false,
                    error: 'Empty response from AI model (possibly rate limited or model unavailable)',
                    fullApiResponse: completion,
                    text: null,
                    usage: tokenUsage
                };
            }

            return {
                success: true,
                fullApiResponse: completion,
                text: responseText,
                usage: tokenUsage
            };
        } catch (error) {
            console.error('OpenRouter API error:', error);

            // ✅ Enhanced error message with image-specific handling
            let errorMessage = error.message;

            // Image validation errors (from validateImage)
            if (errorMessage.includes('Image ') || errorMessage.includes('gambar') || errorMessage.includes('MimeType')) {
                errorMessage = `Gambar tidak valid: ${errorMessage}`;
            }
            // SDK/API specific errors
            else if (error.statusCode === 429) {
                errorMessage = 'Rate limit exceeded. Please try again later or upgrade your plan.';
            } else if (error.statusCode === 404) {
                errorMessage = 'Model not available or access denied. Check your OpenRouter settings.';
            } else if (errorMessage.includes('Invalid input')) {
                errorMessage = 'Format input tidak valid. Jika mengirim gambar, pastikan format PNG/JPEG dan ukuran < 5MB.';
            }

            return {
                success: false,
                error: errorMessage,
                fullApiResponse: null,
                text: null,
                usage: {
                    promptTokenCount: 0,

                    candidatesTokenCount: 0,
                    totalTokenCount: 0
                }
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
    async generateStream(prompt, context = '', image = null) {
        if (this.isDemoMode) {
            return this.generateDemoStream(prompt, image);
        }

        try {
            const fullPromptText = context ? `${context}\n\nUser: ${prompt}` : prompt;

            // ✅ Build message content (same logic as generateResponse)
            let messageContent;
            if (image && image.base64 && image.mimeType) {
                const validation = validateImage(image);
                if (!validation.valid) {
                    throw new Error(validation.error);
                }

                const base64Data = image.base64.startsWith('data:')
                    ? image.base64
                    : `data:${image.mimeType};base64,${image.base64}`;

                messageContent = [
                    { type: "text", text: fullPromptText },
                    { type: "image_url", imageUrl: { url: base64Data } }
                ];
                console.log(`[OpenRouter Stream] Multimodal with image (${image.mimeType})`);
            } else {
                messageContent = fullPromptText;
            }

            // ✅ SELECT MODEL: Switch to vision model if image is present
            const selectedModel = (image && image.base64) ? this.visionModel : this.model;

            const stream = await this.client.chat.send({
                model: selectedModel,
                messages: [
                    {
                        role: "user",
                        content: messageContent
                    }
                ],
                stream: true,
            });

            // Wrap the OpenRouter stream to match our expected format
            const wrappedStream = this.wrapOpenRouterStream(stream);

            return {
                success: true,
                stream: wrappedStream,
                responsePromise: this.extractUsageFromStream(stream, fullPromptText), // ✅ Pass prompt for estimation
                isError: false
            };
        } catch (error) {
            console.error('OpenRouter streaming error:', error);

            return {
                success: false,
                error: error.message,
                stream: (async function* () {
                    yield { text: () => `Error: ${error.message}` };
                })(),
                responsePromise: Promise.resolve(null),
                isError: true
            };
        }
    }

    /**
     * Wrap OpenRouter stream untuk match format yang diharapkan oleh existing code
     */
    async *wrapOpenRouterStream(openRouterStream) {
        try {
            for await (const chunk of openRouterStream) {
                // OpenRouter SDK returns chunks in format: { choices: [{ delta: { content: "text" } }] }
                const content = chunk.choices?.[0]?.delta?.content || '';

                if (content) {
                    // Wrap in our expected format dengan method text()
                    yield {
                        text: () => content
                    };
                }
            }
        } catch (error) {
            console.error('Error in stream wrapper:', error);
            yield {
                text: () => `Stream error: ${error.message}`
            };
        }
    }

    /**
     * Extract usage metadata dari stream
     * ✅ FIX: Estimate tokens for stream since OpenRouter doesn't provide it
     */
    async extractUsageFromStream(stream, promptText = '') {
        // OpenRouter streaming typically doesn't return usage metadata
        // Estimate prompt tokens at least
        const estimatedPrompt = estimateTokenCount(promptText);

        return Promise.resolve({
            usageMetadata: {
                promptTokenCount: estimatedPrompt,
                candidatesTokenCount: 0, // Will be updated after stream
                totalTokenCount: estimatedPrompt,
                isEstimated: true
            }
        });
    }

    // --- Demo Mode Functions (untuk testing tanpa API key) ---

    generateDemoResponse(prompt, image = null) {
        const imageText = image ? "(with image)" : "";
        const responses = [
            `Halo! Saya TmaChat menggunakan DeepSeek via OpenRouter ${imageText}. Saya siap membantu.`,
            `Anda bertanya ${imageText}: "${prompt.slice(0, 30)}..." - Dalam mode live, saya akan menganalisisnya.`,
        ];

        const randomResponse = responses[Math.floor(Math.random() * responses.length)];

        return {
            success: true,
            text: randomResponse,
            isDemo: true,
            fullApiResponse: null,
            usage: {
                promptTokenCount: 10,
                candidatesTokenCount: 15,
                totalTokenCount: 25
            }
        };
    }

    async generateDemoStream(prompt, image = null) {
        const imageText = image ? "(beserta gambar)" : "";
        const response = `Demo response menggunakan OpenRouter DeepSeek untuk: "${prompt.slice(0, 30)}..." ${imageText}.`;
        const words = response.split(' ');

        const streamGenerator = async function* () {
            yield { text: () => "Processing demo request... " };
            await new Promise(resolve => setTimeout(resolve, 500));

            for (const word of words) {
                await new Promise(resolve => setTimeout(resolve, 80));
                yield {
                    text: () => word + ' '
                };
            }
        };

        const demoResponsePromise = Promise.resolve({
            usageMetadata: {
                promptTokenCount: 20,
                candidatesTokenCount: 50,
                totalTokenCount: 70
            }
        });

        return {
            success: true,
            stream: streamGenerator(),
            responsePromise: demoResponsePromise,
            isDemo: true,
            isError: false
        };
    }

    /**
     * Build prompt dengan system context
     */
    buildPrompt(prompt, context = '') {
        const systemPrompt = `Anda adalah TmaChat, asisten AI yang helpful dan informatif menggunakan model DeepSeek.
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
     * Validate API Key
     */
    async validateApiKey() {
        if (this.isDemoMode) {
            return { valid: false, mode: 'demo' };
        }

        try {
            // Test dengan simple request
            const result = await this.client.chat.send({
                model: this.model,
                messages: [{ role: "user", content: "Hello" }],
                stream: false,
            });

            return { valid: true, mode: 'live' };
        } catch (error) {
            console.error("API Key validation failed:", error.message);
            return { valid: false, mode: 'error', error: error.message };
        }
    }
}

export const openRouterClient = new OpenRouterClient();
export default OpenRouterClient;
