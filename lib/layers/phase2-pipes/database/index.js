/**
 * Phase 2 — Database Pipe (schema grounding + SQL generation + execution)
 *
 * Alur Database Pipe:
 * Step 1: Table Identification (LLM identifikasi tabel dari Schema Registry)
 * Step 2: Schema Grounding — Qdrant Search (db_schema collection, top_k: 20)
 * Step 3: Cross-Encoder Reranking (Schema) — top-5 schema chunks
 * Step 4: SQL Generation (LLM) — gemini-1.5-pro, temp: 0.0
 * Step 5: SQL Validation — node-sql-parser, cek tabel/kolom valid, no DELETE/DROP
 * Step 6: SQL Execute (read-only user) → Query Results
 */

export { SqlGeneratorService, sqlGeneratorService } from './sqlGeneratorService.js';
export { SqlExecutionService, sqlExecutionService } from './sqlExecutionService.js';
