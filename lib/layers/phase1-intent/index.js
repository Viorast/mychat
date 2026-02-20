/**
 * Phase 1 — Intent + Domain Classification (intent_routing)
 *
 * Tanggung jawab layer ini:
 * 1. LLM Intent + Domain Classifier (Gemini 1.5 Flash, structured output)
 * 2. Validation & Confidence Check (threshold: 0.75)
 * 3. Output: { intent, confidence, reasoning, entities }
 *
 * Intent Labels:
 * - General
 * - Policy_Descriptive, Policy_Diagnostic
 * - Data_Descriptive, Data_Diagnostic, Data_Predictive, Data_Recommendation
 * - Hybrid_Descriptive, Hybrid_Diagnostic, Hybrid_Recommendation
 */

// Optimized keyword-based classifier (fast, no LLM call)
export { classifyIntent, getIntentConfidence, testIntentClassifier } from './optimizedIntentClassifier.js';

// Semantic LLM-based classifier (accurate, uses Gemini)
export { classifyIntent as classifyIntentSemantic, isGeneralConversation, getRoute } from './semanticIntentClassifier.js';
export { default as semanticIntentClassifier } from './semanticIntentClassifier.js';
