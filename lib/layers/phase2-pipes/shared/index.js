/**
 * Phase 2 — Pipe Execution: Shared Utilities (retrieval + reranker)
 *
 * Shared oleh semua pipe (Policy, Database, Hybrid):
 * - Qdrant vector database client
 * - Vector store search service
 * - Cross-Encoder Reranker (ms-marco-MiniLM-L-6-v2)
 */

// Qdrant client — low-level vector DB operations
export { ensureCollection, upsertPoints, searchSimilar, searchMultiCollection, getCollectionInfo, deleteCollection, getClient } from './qdrantClient.js';

// Vector store service — embedding + search abstraction
export { COLLECTIONS, initializeVectorStore, vectorSearch, chunkMarkdown, getEmbedding } from './vectorStoreService.js';

// Optimized reranker — cross-encoder reranking
export { rerankContextOptimized, rerankContext } from './optimizedReranker.js';

// Reranking service — high-level reranking orchestration
export { RerankingService, rerankingService } from './rerankingService.js';
