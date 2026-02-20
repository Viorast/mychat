import { openRouterClient } from './openrouter-client.js';
import { geminiClient } from './gemini-client.js';
import { ragLog } from '../monitoring/ragLogger.js';

/**
 * AI Router with Automatic Fallback
 * 
 * Primary:  OpenRouter (DeepSeek / Llama)
 * Fallback: Gemini (gemini-2.0-flash)
 * 
 * Fallback triggers on:
 * - HTTP 429 (rate limit)
 * - HTTP 5xx (server error)
 * - Timeout (AbortError)
 * - Empty/null response
 * - "Provider returned error" (OpenRouter relay error)
 */

const FALLBACK_TRIGGERS = [
    'rate limit',
    'timed out',
    'timeout',
    '429',
    '500', '502', '503', '504',
    'overloaded',
    'capacity',
    'unavailable',
    'empty response',
    'aborted',
    'aborterror',
    'network',
    'fetch failed',
    'provider returned error',   // ← OpenRouter relay error
    'provider error',
];

function shouldFallback(errorMsg = '') {
    const lower = errorMsg.toLowerCase();
    return FALLBACK_TRIGGERS.some(t => lower.includes(t));
}

class AIRouter {
    constructor() {
        this.primary = openRouterClient;
        this.fallback = geminiClient;
        this._usingFallback = false;
    }

    get activeProvider() {
        return this._usingFallback ? 'Gemini' : 'OpenRouter';
    }

    // ─── generateResponse (non-streaming) ────────────────────────────
    async generateResponse(prompt, context = '', image = null) {
        const t0 = Date.now();

        // Try primary
        try {
            const res = await this.primary.generateResponse(prompt, context, image);

            if (res.success && res.text) {
                if (this._usingFallback) {
                    ragLog.aiSwitch('Gemini', 'OpenRouter', 'primary recovered');
                    this._usingFallback = false;
                }
                ragLog.aiOk('OpenRouter', Date.now() - t0);
                return res;
            }

            // Unsuccessful response — check if fallback-worthy
            if (!shouldFallback(res.error || '')) return res;
            ragLog.aiSwitch('OpenRouter', 'Gemini', res.error || 'unsuccessful response');

        } catch (err) {
            if (!shouldFallback(err.message)) throw err;
            ragLog.aiSwitch('OpenRouter', 'Gemini', err.message);
        }

        // Fallback
        this._usingFallback = true;
        const t1 = Date.now();
        const fallbackRes = await this.fallback.generateResponse(prompt, context, image);

        if (fallbackRes.success) {
            ragLog.aiOk('Gemini (fallback)', Date.now() - t1);
        } else {
            ragLog.error('AIRouter', `Both providers failed. Gemini: ${fallbackRes.error}`);
        }

        return { ...fallbackRes, isFallback: true };
    }

    // ─── generateStream (streaming) ──────────────────────────────────
    async generateStream(prompt, context = '', image = null) {
        const t0 = Date.now();

        // Try primary
        try {
            const res = await this.primary.generateStream(prompt, context, image);

            if (res.success && res.stream) {
                if (this._usingFallback) {
                    ragLog.aiSwitch('Gemini', 'OpenRouter', 'primary recovered');
                    this._usingFallback = false;
                }
                ragLog.aiOk('OpenRouter (stream)', Date.now() - t0);
                return res;
            }

            if (!shouldFallback(res.error || '')) return res;
            ragLog.aiSwitch('OpenRouter', 'Gemini', res.error || 'stream failed');

        } catch (err) {
            if (!shouldFallback(err.message)) throw err;
            ragLog.aiSwitch('OpenRouter', 'Gemini', err.message);
        }

        // Fallback
        this._usingFallback = true;
        const t1 = Date.now();
        const fallbackRes = await this.fallback.generateStream(prompt, context, image);

        if (fallbackRes.success) {
            ragLog.aiOk('Gemini (fallback stream)', Date.now() - t1);
        } else {
            ragLog.error('AIRouter', `Both stream providers failed. Gemini: ${fallbackRes.error}`);
        }

        return { ...fallbackRes, isFallback: true };
    }
}

export const aiRouter = new AIRouter();
export default AIRouter;
