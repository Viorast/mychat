/**
 * Intent Router — Hybrid Specialized Pipeline
 * 
 * Menentukan path pipeline berdasarkan analysisType dari SQL planner.
 * Tujuan: Setiap intent mendapat strategi data yang paling efisien.
 * 
 * Path options:
 *   PREDICTIVE      → Pre-built SQL + server-side stats (skip SQL planning LLM)
 *   RECOMMENDATION  → Pre-built aggregation SQL (skip SQL planning LLM)
 *   STANDARD        → Pipeline normal (SQL planning LLM + SQL execution)
 *   KNOWLEDGE_ONLY  → Hanya context dari vector store (skip SQL)
 */

import { detectPredictiveIntent } from '../../../rag/predictionService.js';
import { ragLog } from '../../../monitoring/ragLogger.js';


/**
 * @typedef {Object} RouterDecision
 * @property {'PREDICTIVE'|'RECOMMENDATION'|'STANDARD'|'KNOWLEDGE_ONLY'} path
 * @property {boolean} skipSQLPlanning - Jika true, skip LLM SQL planning
 * @property {string|null} predDataType  - Untuk PREDICTIVE: tipe data yang dibutuhkan
 * @property {string|null} predMetric    - Untuk PREDICTIVE: kolom metric utama
 * @property {number} predPeriods        - Untuk PREDICTIVE: berapa bulan ke depan
 * @property {string} reason             - Alasan routing untuk logging
 */

/**
 * Route pipeline berdasarkan analysisType dan userMessage
 * @param {string} analysisType - dari SQL planner: 'predictive'|'recommendation'|'diagnostic'|'descriptive'|'none'
 * @param {string} userMessage
 * @param {string} activeCtx - 'SDA' atau 'DVO'
 * @returns {RouterDecision}
 */
export function routePipeline(analysisType, userMessage, activeCtx = 'SDA') {
    // ── 1. Predictive path ────────────────────────────────────────────────────
    if (analysisType === 'predictive') {
        const detection = detectPredictiveIntent(userMessage);

        if (detection.isPrediction && detection.dataType) {
            ragLog.debug('IntentRouter', `PREDICTIVE path → dataType=${detection.dataType}, metric=${detection.metric}, periods=${detection.periods}`);
            return {
                path: 'PREDICTIVE',
                skipSQLPlanning: true,
                predDataType: detection.dataType,
                predMetric: detection.metric,
                predPeriods: detection.periods,
                reason: `predictive:${detection.dataType}`
            };
        }

        // Predictive tapi dataType tidak terdeteksi → fallback ke STANDARD
        // (SQL planner akan generate query terbaik)
        ragLog.debug('IntentRouter', 'PREDICTIVE analysisType but no specific dataType — fallback to STANDARD');
        return {
            path: 'STANDARD',
            skipSQLPlanning: false,
            predDataType: null,
            predMetric: null,
            predPeriods: 3,
            reason: 'predictive:fallback_standard'
        };
    }

    // ── 2. Recommendation path ────────────────────────────────────────────────
    if (analysisType === 'recommendation') {
        // Pilih dataType untuk rekomendasi berdasarkan context dan keywords
        const lower = userMessage.toLowerCase();

        let recDataType = null;

        if (activeCtx === 'DVO') {
            // DVO: rekomendasi default seputar AP status
            recDataType = lower.includes('trafik') || lower.includes('traffic')
                ? 'dvo_traffic'
                : 'dvo_ap_witel';
        } else {
            // SDA: rekomendasi tergantung keyword
            if (lower.includes('tiket') || lower.includes('ticket') || lower.includes('dev') || lower.includes('developer')) {
                recDataType = 'sda_tickets_devs';
            } else if (lower.includes('absen') || lower.includes('kehadiran') || lower.includes('terlambat')) {
                recDataType = 'sda_attendance_employees';
            } else {
                // Default SDA recommendation: attendance overview
                recDataType = 'sda_attendance_employees';
            }
        }

        ragLog.debug('IntentRouter', `RECOMMENDATION path → dataType=${recDataType}`);
        return {
            path: 'RECOMMENDATION',
            skipSQLPlanning: true,
            predDataType: recDataType,
            predMetric: null,
            predPeriods: 0,
            reason: `recommendation:${recDataType}`
        };
    }

    // ── 3. Knowledge-Only path (policy, general knowledge) ───────────────────
    if (analysisType === 'none' || analysisType === 'policy') {
        ragLog.debug('IntentRouter', 'KNOWLEDGE_ONLY path');
        return {
            path: 'KNOWLEDGE_ONLY',
            skipSQLPlanning: true,
            predDataType: null,
            predMetric: null,
            predPeriods: 0,
            reason: 'knowledge_only'
        };
    }

    // ── 4. Standard path (descriptive, diagnostic, visualization, maps) ──────
    ragLog.debug('IntentRouter', `STANDARD path → analysisType=${analysisType}`);
    return {
        path: 'STANDARD',
        skipSQLPlanning: false,
        predDataType: null,
        predMetric: null,
        predPeriods: 0,
        reason: `standard:${analysisType}`
    };
}
