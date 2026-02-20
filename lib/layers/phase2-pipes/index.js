/**
 * Phase 2 — Pipe Execution (retrieval + reranker + sql_generation)
 *
 * Tiga pipe yang tersedia berdasarkan intent classification:
 * - Policy Pipe  → intent: Policy_Descriptive, Policy_Diagnostic
 * - Database Pipe → intent: Data_Descriptive, Data_Diagnostic, Data_Predictive, Data_Recommendation
 * - Hybrid Pipe  → intent: Hybrid_Descriptive, Hybrid_Diagnostic, Hybrid_Recommendation
 *
 * Semua pipe menggunakan Cross-Encoder Reranker (ms-marco-MiniLM-L-6-v2):
 * Qdrant top-20 → Reranker → top-5 berkualitas tinggi
 */

// Shared utilities (Qdrant, Vector Store, Reranker)
export * from './shared/index.js';

// Database Pipe
export { SqlGeneratorService, sqlGeneratorService, SqlExecutionService, sqlExecutionService } from './database/index.js';

// Hybrid Pipe
export { generateMonthlyInsights, generateRegionalInsights, generateEmployeeInsights, generateAllInsights } from './hybrid/index.js';
