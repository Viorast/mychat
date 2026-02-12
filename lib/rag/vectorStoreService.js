import { GoogleGenerativeAI } from '@google/generative-ai';
import { searchMultiCollection } from './qdrantClient.js';

/**
 * Vector Store Service - Qdrant Multi-Collection
 * Replaces HNSWlib with persistent Qdrant vector database
 */

const EMBEDDING_MODEL_NAME = 'models/gemini-embedding-001';
const EMBEDDING_DIMENSION = 3072;

// Collection names
export const COLLECTIONS = {
  SCHEMA: 'schema_context',
  INSIGHTS: 'aggregated_insights',
  KNOWLEDGE: 'company_knowledge'
};

console.log("🔑 GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "TERDETEKSI ✅" : "❌ TIDAK ADA");

if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️  WARNING: GEMINI_API_KEY tidak ada. Vector search akan dinonaktifkan.");
}

let geminiEmbedder = null;

/**
 * Initialize Gemini embedder
 */
function getEmbedder() {
  if (!geminiEmbedder) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GEMINI_API_KEY");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    geminiEmbedder = genAI.getGenerativeModel({ model: EMBEDDING_MODEL_NAME });
    console.log('[VectorStore] Gemini embedder initialized');
  }

  return geminiEmbedder;
}

/**
 * Get embedding for text
 * @param {string} text - Text to embed
 * @returns {Array} Embedding vector
 */
async function getEmbedding(text) {
  const embedder = getEmbedder();
  const result = await embedder.embedContent(text);
  return result.embedding.values;
}

/**
 * Initialize vector store (no-op for Qdrant, collections managed by seed scripts)
 * This function exists for backward compatibility
 */
export async function initializeVectorStore() {
  try {
    // Just ensure embedder is ready
    getEmbedder();
    console.log('[VectorStore] ✅ Using Qdrant multi-collection (persistent storage)');
    return true;
  } catch (error) {
    console.error('[VectorStore] Initialization failed:', error.message);
    return false;
  }
}

/**
 * Vector search across specified collections
 * @param {string} queryText - Query text
 * @param {number} k - Number of results
 * @param {Array} collections - Collection names to search (default: schema only)
 * @returns {Object} Search results
 */
export async function vectorSearch(queryText, k = 5, collections = [COLLECTIONS.SCHEMA]) {
  try {
    console.log(`[VectorStore] Searching collections: ${collections.join(', ')}`);

    // Get query embedding
    const queryEmbedding = await getEmbedding(queryText);

    // Search Qdrant collections
    const results = await searchMultiCollection(collections, queryEmbedding, k);

    // Transform results to legacy format
    const transformedResults = results.map(r => ({
      id: r.id,
      title: r.payload.title || r.payload.type || 'Context',
      content: r.payload.content || r.payload.summary || '',
      similarity: r.score,
      collection: r.collection,
      metadata: r.payload.metadata || {}
    }));

    console.log(`[VectorStore] Found ${transformedResults.length} results`);

    return {
      success: true,
      results: transformedResults
    };

  } catch (error) {
    console.error('[VectorSearch] Error:', error.message);

    // Check if it's a Qdrant connection error
    if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
      return {
        success: false,
        results: [],
        error: `Qdrant database tidak dapat dijangkau. Pastikan Qdrant running di ${process.env.QDRANT_URL || 'http://localhost:6333'}`
      };
    }

    return {
      success: false,
      results: [],
      error: error.message
    };
  }
}

/**
 * Chunk markdown content (legacy function for seeding)
 * @param {string} markdownContent - Markdown content
 * @returns {Array} Array of chunks
 */
export function chunkMarkdown(markdownContent) {
  if (!markdownContent) {
    return [];
  }

  const chunks = [];
  let idCounter = 0;
  const parts = markdownContent.split(/\n---\n/);

  for (const part of parts) {
    if (part.trim().length === 0) continue;

    let title = 'General Context';
    const titleMatch = part.match(/##\s*`?(.*?)`?(\s*–|$)/);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    } else {
      const numberedTitleMatch = part.match(/##\s*\d+\.?\s*`?(.*?)`?(\s*–|$)/);
      if (numberedTitleMatch && numberedTitleMatch[1]) {
        title = numberedTitleMatch[1].trim();
      }
    }

    chunks.push({
      id: idCounter,
      title: title,
      content: part.trim(),
    });
    idCounter++;
  }

  return chunks;
}

// Export embedding function for seed scripts
export { getEmbedding };