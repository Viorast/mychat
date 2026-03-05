import { openRouterClient } from './openrouter-client.js';
import { geminiClient } from './gemini-client.js';
import { ragLog } from '../monitoring/ragLogger.js';
import { tokenTracker } from '../monitoring/ragLogger.js';


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
    'econnreset',        // ← browser / server connection reset
    'connection reset',  // ← socket-level reset
    'terminated',        // ← stream terminated unexpectedly
    'socket hang up',    // ← HTTP keep-alive dropped
    'provider returned error',
    'provider error',
];

function shouldFallback(errorMsg = '') {
    const lower = errorMsg.toLowerCase();
    return FALLBACK_TRIGGERS.some(t => lower.includes(t));
}

// Max time to wait for primary AI before falling back (milliseconds)
const PRIMARY_TIMEOUT_MS = 20_000; // 20 seconds

/**
 * Wrap a promise with a timeout. Rejects with 'timed out' after ms.
 */
function withTimeout(promise, ms = PRIMARY_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms);
        promise.then(
            val => { clearTimeout(timer); resolve(val); },
            err => { clearTimeout(timer); reject(err); }
        );
    });
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

        // Try primary (with timeout to avoid 30s+ hangs)
        try {
            const res = await withTimeout(this.primary.generateResponse(prompt, context, image));

            if (res.success && res.text) {
                if (this._usingFallback) {
                    ragLog.aiSwitch('Gemini', 'OpenRouter', 'primary recovered');
                    this._usingFallback = false;
                }
                ragLog.aiOk('OpenRouter', Date.now() - t0);
                // ── Token tracking ──
                const tok = res.usage?.totalTokenCount || res.usage?.total_tokens || 0;
                if (tok > 0) tokenTracker.record(this._stepLabel || 'LLM', tok, 'OpenRouter');
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
            // ── Token tracking (fallback) ──
            const tok = fallbackRes.usage?.totalTokenCount || fallbackRes.usage?.total_tokens || 0;
            if (tok > 0) tokenTracker.record(this._stepLabel || 'LLM', tok, 'Gemini');
        } else {
            ragLog.error('AIRouter', `Both providers failed. Gemini: ${fallbackRes.error}`);
        }

        return { ...fallbackRes, isFallback: true };
    }

    // ─── generateStream (streaming) ──────────────────────────────────
    async generateStream(prompt, context = '', image = null) {
        const t0 = Date.now();

        // Try primary (with timeout to avoid 30s+ hangs)
        try {
            const res = await withTimeout(this.primary.generateStream(prompt, context, image));

            if (res.success && res.stream) {
                if (this._usingFallback) {
                    ragLog.aiSwitch('Gemini', 'OpenRouter', 'primary recovered');
                    this._usingFallback = false;
                }
                ragLog.aiOk('OpenRouter (stream)', Date.now() - t0);
                // ── Token tracking (stream — tokens available after stream ends, tracked via responsePromise) ──
                // Note: stream tokens are tracked by each service via ragLog.response()
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
        // ─────────────────────────────────────────────────────────────
        // Expose a setter for the calling service to label which step this call is for
        // Usage: aiRouter.setStep('Rerank'); await aiRouter.generateResponse(prompt);
        // ─────────────────────────────────────────────────────────────
    }

    /**
     * Set the label for the next LLM call (for token tracking).
     * @param {string} label - e.g. 'Rerank', 'SQLPlan', 'Response'
     */
    setStep(label) {
        this._stepLabel = label;
    }
}

export const aiRouter = new AIRouter();
export default AIRouter;
