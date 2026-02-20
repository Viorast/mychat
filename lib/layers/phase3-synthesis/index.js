/**
 * Phase 3 — LLM Reasoning + Response Generation (final_synthesis)
 *
 * Tanggung jawab layer ini:
 * Step 1: Context Assembly — Structured Context Fusion
 *         [DATA DARI DATABASE] + [KEBIJAKAN PERUSAHAAN] + [CONVERSATION CONTEXT] + [INSTRUKSI ANALISIS]
 * Step 2: LLM Thinking — Chain-of-Thought reasoning (gemini-1.5-pro)
 *         Temperature per intent: Descriptive/Diagnostic → 0.0-0.1, Recommendation → 0.3, Predictive → 0.1, General → 0.4
 * Step 3: Intent-based Output Schema
 *         Descriptive: Kondisi Aktual + Ringkasan Data
 *         Diagnostic: Temuan + Akar Masalah (Why)
 *         Recommendation: Temuan + Saran + Dasar Policy
 *         Predictive: Tren + Proyeksi + Confidence
 *         Hybrid: Gabungan sesuai sub-intent
 * Step 4: Post-Processing — Save to Semantic Cache + Update session history
 */

export { ResponseGeneratorService, responseGeneratorService } from './responseGeneratorService.js';
export { predictTimeSeries, calculateGrowthRate, detectOutliers } from './predictionService.js';
