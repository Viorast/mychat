/**
 * Optimized Score-based Context Reranker
 * Replaces LLM-based reranking to save ~2,400 tokens and ~27 seconds per query
 * 
 * Strategy:
 * 1. Use vector search similarity as base score
 * 2. Boost scores based on keyword matches
 * 3. Boost scores based on query intent
 * 4. Return top N chunks (reduced from 5 to 3)
 */

/**
 * Extract meaningful keywords from text
 * @param {string} text - Input text
 * @param {number} maxKeywords - Maximum keywords to extract
 * @returns {string[]} Array of keywords
 */
function extractKeywords(text, maxKeywords = 10) {
    if (!text || typeof text !== 'string') return [];

    // Indonesian and English stopwords
    const stopwords = new Set([
        // Indonesian
        'yang', 'di', 'ke', 'dari', 'untuk', 'adalah', 'dan', 'atau',
        'dengan', 'pada', 'oleh', 'sebagai', 'dalam', 'ini', 'itu',
        'akan', 'telah', 'sudah', 'dapat', 'jika', 'apakah', 'ada',
        'tidak', 'bukan', 'hanya', 'juga', 'lebih', 'sangat', 'paling',
        'saat', 'ketika', 'seperti', 'agar', 'maka', 'atau', 'tetapi',

        // English
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
        'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'were',
        'are', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
        'did', 'will', 'would', 'should', 'could', 'may', 'might', 'can'
    ]);

    const lowerText = text.toLowerCase();

    // Extract words (alphanumeric + underscore for SQL identifiers)
    const words = lowerText.match(/[\w]+/g) || [];

    // Filter and deduplicate
    const keywords = words
        .filter(word =>
            word.length > 2 &&
            !stopwords.has(word) &&
            !/^\d+$/.test(word) // Remove pure numbers
        )
        .reduce((unique, word) => {
            if (!unique.includes(word)) {
                unique.push(word);
            }
            return unique;
        }, [])
        .slice(0, maxKeywords);

    return keywords;
}

/**
 * Calculate keyword match score
 * @param {string} text - Text to search in
 * @param {string[]} keywords - Keywords to search for
 * @returns {number} Match score (0-1)
 */
function calculateKeywordScore(text, keywords) {
    if (!text || !keywords || keywords.length === 0) return 0;

    const lowerText = text.toLowerCase();
    let matchCount = 0;
    let weightedScore = 0;

    keywords.forEach((keyword, index) => {
        // Earlier keywords are more important (from query)
        const weight = 1 - (index * 0.05); // Decay weight by position

        // Count occurrences
        const regex = new RegExp(keyword, 'gi');
        const matches = (lowerText.match(regex) || []).length;

        if (matches > 0) {
            matchCount++;
            // Diminishing returns for multiple matches of same keyword
            weightedScore += weight * Math.min(matches, 3) * 0.1;
        }
    });

    // Normalize by number of keywords
    const coverage = matchCount / keywords.length;

    return coverage * 0.6 + weightedScore * 0.4;
}

/**
 * Detect query intent for targeted boosting
 * @param {string} query - User query
 * @returns {Object} Intent detection results
 */
function detectQueryIntent(query) {
    const lowerQuery = query.toLowerCase();

    const intents = {
        // Table-specific intents
        isAbsenQuery: /absen|kehadiran|check\s?in|check\s?out|terlambat|lembur|wf[ahno]/i.test(query),
        isTicketQuery: /tiket|ticket|request|pekerjaan|dev|developer|bug|incident|change|explorasi/i.test(query),
        isNossaQuery: /nossa|gangguan|aduan|pelanggan|service_id|witel|regional/i.test(query),

        // Query type intents
        isAggregation: /berapa|jumlah|total|count|rata-rata|average|sum|banyak/i.test(query),
        isTimeQuery: /kapan|when|tanggal|date|bulan|tahun|hari|periode|waktu|minggu|quarter|q[1-4]/i.test(query),
        isStatusQuery: /status|progress|selesai|done|pending|open|close/i.test(query),
        isAnalysis: /analisis|analysis|performa|performance|trend|pola|insight|forecast/i.test(query),
        isComparison: /bandingkan|comparison|lebih|kurang|tertinggi|terendah|vs|versus/i.test(query),
    };

    return intents;
}

/**
 * Calculate intent-based boost
 * @param {Object} chunk - Chunk with title and content
 * @param {Object} intents - Detected intents
 * @returns {number} Boost score (0-0.3)
 */
function calculateIntentBoost(chunk, intents) {
    let boost = 0;
    const chunkTitleLower = chunk.title.toLowerCase();
    const chunkContentLower = chunk.content.toLowerCase();

    // Table matching boosts (strong signals)
    if (intents.isAbsenQuery && chunkTitleLower.includes('log_absen')) {
        boost += 0.20; // Increased from 0.15
    }
    if (intents.isTicketQuery && chunkTitleLower.includes('m_ticket')) {
        boost += 0.20; // Increased from 0.15
    }
    if (intents.isNossaQuery && chunkTitleLower.includes('nossa_closed')) {
        boost += 0.20; // Increased from 0.15
    }

    // Content relevance boosts
    if (intents.isAggregation && /count|sum|avg|group by|jumlah/i.test(chunkContentLower)) {
        boost += 0.05;
    }
    if (intents.isTimeQuery && /timestamp|date|time|tanggal|waktu/i.test(chunkContentLower)) {
        boost += 0.05;
    }
    if (intents.isStatusQuery && /status/i.test(chunkContentLower)) {
        boost += 0.05;
    }
    if (intents.isAnalysis && /avg|average|trend|analysis/i.test(chunkContentLower)) {
        boost += 0.05;
    }

    return Math.min(boost, 0.35); // Increased cap from 0.3 to 0.35
}

/**
 * Optimized context reranker using score-based approach
 * @param {string} userMessage - User's query
 * @param {Array} retrievedChunks - Chunks from vector search with similarity scores
 * @param {Object} options - Reranking options
 * @returns {Object} Reranked context and metadata
 */
export const rerankContextOptimized = (
    userMessage,
    retrievedChunks,
    options = {}
) => {
    const {
        topK = 3,              // Reduced from 5 to 3
        verboseLogging = false, // Disabled by default for production
        minScore = 0.15        // Minimum score threshold
    } = options;

    if (!retrievedChunks || retrievedChunks.length === 0) {
        console.warn('[Reranker Optimized] No chunks to rerank');
        return {
            context: 'Tidak ada konteks skema yang relevan ditemukan.',
            usage: { totalTokenCount: 0 },
            chunksUsed: 0
        };
    }

    const startTime = Date.now();
    console.log(`[Reranker Optimized] Fast reranking ${retrievedChunks.length} chunks with score-based approach...`);

    // Extract keywords from query
    const queryKeywords = extractKeywords(userMessage, 12); // Increased from 10
    if (verboseLogging) {
        console.log(`[Reranker Optimized] Query keywords: ${queryKeywords.join(', ')}`);
    }

    // Detect query intent
    const intents = detectQueryIntent(userMessage);
    if (verboseLogging) {
        const activeIntents = Object.entries(intents)
            .filter(([_, val]) => val)
            .map(([key]) => key);
        console.log(`[Reranker Optimized] Detected intents: ${activeIntents.join(', ')}`);
    }

    // Score each chunk
    const scoredChunks = retrievedChunks.map(chunk => {
        // Base score from vector search similarity
        let baseScore = chunk.similarity || 0;

        // Keyword matching scores
        const titleKeywordScore = calculateKeywordScore(chunk.title, queryKeywords);
        const contentKeywordScore = calculateKeywordScore(chunk.content, queryKeywords);

        // Intent-based boost
        const intentBoost = calculateIntentBoost(chunk, intents);

        // Combined final score with adjusted weights
        const finalScore =
            baseScore * 0.35 +              // 35% from vector similarity (reduced from 40%)
            titleKeywordScore * 0.30 +      // 30% from title keywords (increased from 25%)
            contentKeywordScore * 0.20 +    // 20% from content keywords (same)
            intentBoost * 0.15;             // 15% from intent matching (same)

        if (verboseLogging) {
            console.log(`[Reranker Optimized]   "${chunk.title.substring(0, 40)}...": base=${baseScore.toFixed(3)}, title=${titleKeywordScore.toFixed(3)}, content=${contentKeywordScore.toFixed(3)}, intent=${intentBoost.toFixed(3)} → FINAL=${finalScore.toFixed(3)}`);
        }

        return {
            ...chunk,
            scores: {
                base: baseScore,
                titleKeywords: titleKeywordScore,
                contentKeywords: contentKeywordScore,
                intentBoost: intentBoost,
                final: finalScore
            },
            finalScore
        };
    });

    // Sort by final score (descending)
    scoredChunks.sort((a, b) => b.finalScore - a.finalScore);

    // Filter by minimum score and take top K
    const topChunks = scoredChunks
        .filter(chunk => chunk.finalScore >= minScore)
        .slice(0, topK);

    if (topChunks.length === 0) {
        console.warn('[Reranker Optimized] No chunks passed minimum score threshold');
        return {
            context: 'Tidak ada konteks skema yang relevan ditemukan.',
            usage: { totalTokenCount: 0 },
            chunksUsed: 0
        };
    }

    // Concatenate top chunks
    const context = topChunks
        .map(chunk => chunk.content)
        .join('\n\n---\n\n');

    const duration = Date.now() - startTime;

    console.log(`[Reranker Optimized] ✅ Selected ${topChunks.length} chunks in ${duration}ms (saved ~27,000ms vs LLM)`);
    console.log(`[Reranker Optimized] Context length: ${context.length} chars, Tokens saved: ~2,400`);

    if (verboseLogging) {
        console.log(`[Reranker Optimized] Top chunks selected:`);
        topChunks.forEach((c, i) => {
            console.log(`   ${i + 1}. "${c.title}" (score: ${c.finalScore.toFixed(3)})`);
        });
    }

    return {
        context,
        usage: { totalTokenCount: 0 }, // No LLM tokens used!
        chunksUsed: topChunks.length,
        topChunks: topChunks.map(c => ({
            title: c.title,
            score: c.finalScore.toFixed(3)
        })),
        performanceMs: duration
    };
};

/**
 * Compatibility wrapper for existing ragLayer.js interface
 * @param {string} userMessage 
 * @param {Array} history - Chat history (not used in optimized version)
 * @param {Array} retrievedChunks 
 * @returns {Promise<Object>}
 */
export const rerankContext = async (userMessage, history, retrievedChunks) => {
    // Ignore history to save processing time (not needed for reranking)
    return rerankContextOptimized(userMessage, retrievedChunks);
};
