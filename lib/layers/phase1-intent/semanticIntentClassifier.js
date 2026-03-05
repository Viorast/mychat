import { getEmbedding } from '../phase2-pipes/shared/vectorStoreService.js';
import { searchSimilar } from '../phase2-pipes/shared/qdrantClient.js';

/**
 * Semantic Intent Classifier
 * Uses Qdrant vector similarity to classify user intent
 * Replaces regex-based routing with semantic understanding
 */

const COLLECTION_NAME = 'intent_classification';
const TOP_K = 5; // Number of similar examples to retrieve
const MIN_CONFIDENCE = 0.3; // Minimum confidence threshold

// ============================================================
// INTENT → ROUTE MAPPING
// ============================================================

const INTENT_ROUTES = {
    descriptive: {
        collections: ['schema_sda'],
        analysisType: 'descriptive',
    },
    diagnostic: {
        collections: ['schema_sda'],
        analysisType: 'diagnostic',
    },
    predictive: {
        collections: ['schema_sda'],
        analysisType: 'predictive', // Updated from 'descriptive'
    },
    recommendation: {
        // Added schema_context so it can generate SQL if needed
        collections: ['company_knowledge', 'schema_sda'],
        analysisType: 'recommendation', // Updated from 'descriptive'
    },
    visualization: {
        collections: ['schema_sda'],
        analysisType: 'descriptive',
    },
    maps: {
        collections: ['schema_sda'],
        analysisType: 'descriptive',
    },
    policy: {
        collections: ['company_knowledge'],
        analysisType: 'none',
    },
    general: {
        collections: [],
        analysisType: 'none',
    },
};

// ============================================================
// SIMPLE EMBEDDING CACHE (in-memory, TTL 5 min)
// ============================================================

const embeddingCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCachedEmbedding(text) {
    const key = text.toLowerCase().trim();
    const cached = embeddingCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
        return cached.embedding;
    }
    return null;
}

function setCachedEmbedding(text, embedding) {
    const key = text.toLowerCase().trim();
    embeddingCache.set(key, { embedding, timestamp: Date.now() });

    // Clean old entries if cache grows too large
    if (embeddingCache.size > 200) {
        const now = Date.now();
        for (const [k, v] of embeddingCache) {
            if (now - v.timestamp > CACHE_TTL) {
                embeddingCache.delete(k);
            }
        }
    }
}

// ============================================================
// CLASSIFIER
// ============================================================

/**
 * Classify user intent using semantic similarity
 * @param {string} userMessage - User's query
 * @returns {Promise<Object>} Classification result
 */
export async function classifyIntent(userMessage) {
    if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
        return {
            category: 'general',
            confidence: 1.0,
            ...INTENT_ROUTES.general,
        };
    }

    const startTime = Date.now();

    try {
        // 1. Get embedding (with cache)
        let queryEmbedding = getCachedEmbedding(userMessage);
        if (!queryEmbedding) {
            queryEmbedding = await getEmbedding(userMessage);
            setCachedEmbedding(userMessage, queryEmbedding);
        }

        // 2. Search intent examples in Qdrant
        const results = await searchSimilar(COLLECTION_NAME, queryEmbedding, TOP_K);

        if (!results || results.length === 0) {
            console.warn('[SemanticIntent] No results from Qdrant, falling back to general');
            return {
                category: 'general',
                confidence: 0.5,
                ...INTENT_ROUTES.general,
                fallback: true,
            };
        }

        // 3. Majority vote with score weighting
        const categoryScores = {};
        for (const result of results) {
            const category = result.payload.category;
            const score = result.score || 0;
            categoryScores[category] = (categoryScores[category] || 0) + score;
        }

        // Find winning category
        const sorted = Object.entries(categoryScores)
            .sort((a, b) => b[1] - a[1]);

        const winnerCategory = sorted[0][0];
        const winnerScore = sorted[0][1];
        const totalScore = sorted.reduce((sum, [, s]) => sum + s, 0);
        const confidence = totalScore > 0 ? winnerScore / totalScore : 0;

        // Best individual match score
        const topMatchScore = results[0].score;

        const duration = Date.now() - startTime;

        const route = INTENT_ROUTES[winnerCategory] || INTENT_ROUTES.general;

        console.log(
            `[SemanticIntent] ✅ "${userMessage.substring(0, 40)}..." → ${winnerCategory} ` +
            `(confidence: ${confidence.toFixed(2)}, topMatch: ${topMatchScore.toFixed(3)}, ${duration}ms)`
        );

        return {
            category: winnerCategory,
            confidence,
            topMatchScore,
            collections: route.collections,
            analysisType: route.analysisType,
            topMatches: results.slice(0, 3).map(r => ({
                text: r.payload.content,
                category: r.payload.category,
                score: r.score,
            })),
            duration,
        };

    } catch (error) {
        console.error('[SemanticIntent] Classification error:', error.message);

        // Fallback: use general with low confidence
        return {
            category: 'general',
            confidence: 0.3,
            ...INTENT_ROUTES.general,
            fallback: true,
            error: error.message,
        };
    }
}

/**
 * Check if category means the RAG pipeline should be skipped
 * @param {string} category - Intent category
 * @returns {boolean}
 */
export function isGeneralConversation(category) {
    return category === 'general';
}

/**
 * Get the route configuration for a given category
 * @param {string} category - Intent category
 * @returns {Object}
 */
export function getRoute(category) {
    return INTENT_ROUTES[category] || INTENT_ROUTES.general;
}

export default { classifyIntent, isGeneralConversation, getRoute };
