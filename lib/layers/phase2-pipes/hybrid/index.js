/**
 * Phase 2 — Hybrid Pipe (parallel execution + context fusion)
 *
 * Alur Hybrid Pipe:
 * Step 1: Query Decomposition (LLM) — pisah jadi sub_query_db + sub_query_policy
 * Step 2: Parallel Execution — jalankan Database Pipe + Policy Pipe (Promise.all)
 *         masing-masing pipe sudah include cross-encoder reranking
 * Step 3: Error Check per Pipe — jika salah satu gagal → partial context
 * Step 4: Context Fusion — gabung query_results + policy_chunks
 */

export { generateMonthlyInsights, generateRegionalInsights, generateEmployeeInsights, generateAllInsights } from './aggregationService.js';
