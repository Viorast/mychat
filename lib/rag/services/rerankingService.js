import { openRouterClient } from "../../ai/openrouter-client.js";

const MAX_CONTEXT_CHUNKS = 10;
const RERANK_FAILURE_CONTEXT = "Tidak ada konteks skema yang relevan ditemukan.";

export class RerankingService {
    constructor(aiClient = openRouterClient) {
        this.aiClient = aiClient;
    }

    /**
     * Langkah 2: Reranking Context dengan LLM
     * Menggunakan AI untuk memilih chunks paling relevan dan preserve verbatim
     */
    async rerankContext(userMessage, history, retrievedChunks) {
        console.log(`[RAG v1.4] Step 2: Reranking ${retrievedChunks.length} chunks with LLM...`);

        if (!retrievedChunks || retrievedChunks.length === 0) {
            return RERANK_FAILURE_CONTEXT;
        }

        // Fallback to score-based if too few chunks
        if (retrievedChunks.length <= 2) {
            console.log('[RAG] Too few chunks, using all');
            return retrievedChunks.map(c => c.content).join('\n---\n');
        }

        const historyText = history.slice(-2).map(msg => `${msg.role}: ${msg.content.slice(0, 100)}`).join('\n');

        // Build chunks text with clear separators
        const chunksText = retrievedChunks.map((chunk, i) =>
            `---
[Chunk ${i + 1}${chunk.title ? ': ' + chunk.title : ''}]
${chunk.content}
---`
        ).join('\n');

        const rerankPrompt = `
You are an AI Reranker. Your task: Select MOST RELEVANT schema chunks for the question.

CRITICAL RULES:
1. Return VERBATIM text from relevant chunks (exact copy, no changes)
2. If multiple chunks relevant, combine their full text
3. NO summarization, NO paraphrasing, NO modifications
4. If NOTHING relevant, return exactly: "NO_RELEVANT_CONTEXT"

CONVERSATION HISTORY:
${historyText}

USER QUESTION: "${userMessage}"

AVAILABLE SCHEMA CHUNKS:
${chunksText}

Verbatim Text from Relevant Chunks (or "NO_RELEVANT_CONTEXT"):
`;

        try {
            const startTime = Date.now();
            const response = await this.aiClient.generateResponse(rerankPrompt);
            const duration = Date.now() - startTime;

            console.log(`[RAG Reranking] Duration: ${duration}ms, Success: ${response.success}`);

            if (!response.success) {
                console.warn('[RAG] LLM reranking failed, using score-based fallback');
                // Fallback to all chunks
                return retrievedChunks.map(c => c.content).join('\n---\n');
            }

            const rerankedText = response.text.trim();

            if (rerankedText === 'NO_RELEVANT_CONTEXT' || rerankedText.includes('NO_RELEVANT_CONTEXT')) {
                console.warn('[RAG] Reranker found no relevant context');
                return RERANK_FAILURE_CONTEXT;
            }

            console.log(`[RAG] ✅ Reranking successful, context length: ${rerankedText.length} chars`);
            return rerankedText;

        } catch (error) {
            console.error('[RAG] Reranking error:', error);
            // Fallback to score-based
            console.warn('[RAG] Using score-based fallback');
            return retrievedChunks
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .slice(0, MAX_CONTEXT_CHUNKS)
                .map(c => c.content)
                .join('\n---\n');
        }
    }
}

export const rerankingService = new RerankingService();
