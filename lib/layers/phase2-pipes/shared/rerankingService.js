import { aiRouter } from "../../../ai/ai-router.js";
import { ragLog } from "../../../monitoring/ragLogger.js";

const MAX_CONTEXT_CHUNKS = 6;
const MAX_HISTORY_CHARS = 300;  // ✅ FIX: Batasi history di prompt agar hemat token
const MAX_CONTEXT_CHARS = 4000; // ✅ FIX: Batasi context agar tidak membengkak
const RERANK_FAILURE_CONTEXT = "Tidak ada konteks skema yang relevan ditemukan.";

export class RerankingService {
    constructor(aiClient = aiRouter) {
        this.aiClient = aiClient;
    }

    /**
     * Step 2: Reranking Context dengan LLM
     * Pilih chunks paling relevan dan kembalikan verbatim.
     */
    async rerankContext(userMessage, history, retrievedChunks, isTopicShift = false) {
        if (!retrievedChunks || retrievedChunks.length === 0) {
            ragLog.rerankSkip('no chunks retrieved');
            return RERANK_FAILURE_CONTEXT;
        }

        // Too few chunks — skip LLM, return all directly
        if (retrievedChunks.length <= 2) {
            ragLog.rerankSkip(`only ${retrievedChunks.length} chunks, using directly`);
            return retrievedChunks.map(c => c.content).join('\n---\n');
        }

        // ✅ Topic Shift Fix: clear history when user switches topic.
        // Prevents reranker from seeing stale context (e.g. employee data) and
        // incorrectly discarding valid chunks for the new topic (e.g. policy).
        const historyForRerank = isTopicShift ? [] : history;
        if (isTopicShift) {
            ragLog.warn('P2 Rerank', 'Topic shift detected — clearing history for reranker');
        }

        const historyText = historyForRerank
            .slice(-2)
            .map(m => `${m.role}: ${m.content.slice(0, 120)}`)
            .join('\n')
            .slice(0, MAX_HISTORY_CHARS);

        // ✅ FIX: Truncate each chunk content to avoid prompt bloat
        const chunksText = retrievedChunks.map((chunk, i) => {
            const content = chunk.content.slice(0, 600); // max 600 chars per chunk
            return `[Chunk ${i + 1}${chunk.title ? ': ' + chunk.title : ''}]\n${content}`;
        }).join('\n---\n').slice(0, MAX_CONTEXT_CHARS);

        const prompt = `You are a Context Selector. Pick the MOST RELEVANT chunks for the CURRENT QUESTION.

RULES:
1. Return VERBATIM text from relevant chunks (exact copy, no changes)
2. Combine multiple relevant chunks if needed
3. NO summarization or paraphrasing
4. Judge relevance by the CURRENT QUESTION only — history is context, not the target
5. If nothing is relevant, return exactly: NO_RELEVANT_CONTEXT

${historyText ? `HISTORY (last 2 turns):\n${historyText}\n\n` : ''}QUESTION: "${userMessage}"

CHUNKS:
---
${chunksText}
---

Verbatim text from relevant chunks (or NO_RELEVANT_CONTEXT):`;

        try {
            const t0 = Date.now();
            this.aiClient.setStep?.('Rerank');
            const response = await this.aiClient.generateResponse(prompt);

            const ms = Date.now() - t0;

            if (!response.success) {
                ragLog.warn('P2 Rerank', `LLM failed (${response.error}), using score-based fallback`);
                return retrievedChunks.map(c => c.content).join('\n---\n');
            }

            const result = response.text.trim();

            if (result === 'NO_RELEVANT_CONTEXT' || result.includes('NO_RELEVANT_CONTEXT')) {
                ragLog.warn('P2 Rerank', 'No relevant context found by reranker');
                return RERANK_FAILURE_CONTEXT;
            }

            ragLog.rerank(
                retrievedChunks.length,
                result.length,
                ms,
                response.isFallback ? 'Gemini' : 'OpenRouter'
            );
            return result;

        } catch (error) {
            ragLog.error('P2 Rerank', error.message);
            return retrievedChunks
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .slice(0, MAX_CONTEXT_CHUNKS)
                .map(c => c.content)
                .join('\n---\n');
        }
    }
}

export const rerankingService = new RerankingService();
