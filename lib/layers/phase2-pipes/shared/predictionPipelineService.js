/**
 * Prediction Pipeline Service — Orchestrator untuk Hybrid Specialized Pipeline
 * 
 * Handles dua path:
 *  1. PREDICTIVE  → pre-built SQL + statistical computation + compact summary
 *  2. RECOMMENDATION → pre-built aggregation SQL + structured summary
 * 
 * Token saving: kedua path SKIP SQL planning LLM (~400-600 token per query)
 */

import { queryExecutor } from '../../../database/queryExecutor.js';
import { ragLog } from '../../../monitoring/ragLogger.js';
import {
    predictTimeSeries,
    detectPredictiveIntent,
    formatPredictionSummary,
    calculateGrowthRate
} from '../../../rag/predictionService.js';
import QUERY_MAP from '../../../rag/predictionQueries.js';


const MIN_DATA_POINTS = 6;

class PredictionPipelineService {

    /**
     * Handle PREDICTIVE path
     * Runs pre-built SQL → calculates stats → returns compact summary for LLM
     * 
     * @param {string} dataType - key di QUERY_MAP
     * @param {string} metric - kolom yang di-prediksi
     * @param {number} periods - berapa bulan ke depan
     * @returns {{handled: boolean, summaryText: string, rawData: Array, predResult: Object|null}}
     */
    async handlePredictiveQuery(dataType, metric, periods = 3) {
        const sql = QUERY_MAP[dataType];

        if (!sql) {
            ragLog.warn('PredPipeline', `No pre-built SQL for dataType=${dataType}, skipping`);
            return { handled: false, summaryText: null, rawData: [], predResult: null };
        }

        ragLog.debug('PredPipeline', `Running pre-built SQL for ${dataType}`);
        const t0 = Date.now();

        const dbResult = await queryExecutor.executeQuery(sql);

        if (!dbResult.success || !dbResult.rows || dbResult.rows.length === 0) {
            ragLog.warn('PredPipeline', `DB query failed or empty: ${dbResult.error}`);
            return {
                handled: true,
                summaryText: `Tidak ada data historis yang cukup untuk membuat prediksi ${dataType.replace(/_/g, ' ')}.`,
                rawData: [],
                predResult: null
            };
        }

        const rows = dbResult.rows;
        ragLog.debug('PredPipeline', `Got ${rows.length} rows in ${Date.now() - t0}ms`);

        // Prepare time series data for statistical prediction
        const historicalData = rows.map(row => ({
            date: row.month || row.periode || `row_${rows.indexOf(row)}`,
            value: Number(row[metric] || 0)
        })).filter(d => !isNaN(d.value));

        // Choose best method based on data characteristics
        const method = this._selectMethod(historicalData.map(d => d.value));

        // Run statistical prediction (server-side, zero LLM tokens)
        const predResult = predictTimeSeries(historicalData, { method, periods });
        ragLog.debug('PredPipeline', `Prediction: ${predResult.success ? 'OK' : 'FAILED'}, method=${method}`);

        // Format compact summary for LLM (~200 chars vs thousands for raw data)
        const summaryText = formatPredictionSummary(predResult, rows, dataType, metric);

        // Also include structured forecast data for [PREDICTION] chart rendering
        const forecastData = predResult.success ? predResult.predictions : [];

        return {
            handled: true,
            summaryText,
            rawData: rows,
            predResult: predResult.success ? predResult : null,
            forecastData,
            historicalData,
            dataType,
            metric
        };
    }

    /**
     * Handle RECOMMENDATION path
     * Runs pre-built aggregation SQL → formats structured summary
     * Hemat: skip SQL planning LLM (~400-500 token)
     * 
     * @param {string} dataType - key di QUERY_MAP
     * @param {string} activeCtx - 'SDA' atau 'DVO'
     * @returns {{handled: boolean, summaryText: string, rawData: Array}}
     */
    async handleRecommendationQuery(dataType, activeCtx = 'SDA') {
        const sql = QUERY_MAP[dataType];

        if (!sql) {
            ragLog.warn('PredPipeline', `No pre-built SQL for recommendation dataType=${dataType}`);
            return { handled: false, summaryText: null, rawData: [] };
        }

        ragLog.debug('PredPipeline', `Running pre-built recommendation SQL for ${dataType}`);
        const t0 = Date.now();

        const dbResult = await queryExecutor.executeQuery(sql);

        if (!dbResult.success || !dbResult.rows || dbResult.rows.length === 0) {
            ragLog.warn('PredPipeline', `Recommendation DB query empty: ${dbResult.error}`);
            return {
                handled: true,
                summaryText: `Tidak ada data yang cukup untuk memberikan rekomendasi saat ini (${dataType}).`,
                rawData: []
            };
        }

        const rows = dbResult.rows;
        ragLog.debug('PredPipeline', `Got ${rows.length} rows for recommendation in ${Date.now() - t0}ms`);

        // Format recommendation data into compact summary
        const summaryText = this._formatRecommendationSummary(rows, dataType, activeCtx);

        return {
            handled: true,
            summaryText,
            rawData: rows,
            dataType
        };
    }

    /**
     * Select best prediction method based on data characteristics
     * @param {number[]} values
     * @returns {'moving_average'|'linear_trend'|'seasonal_adjusted'}
     */
    _selectMethod(values) {
        if (values.length < MIN_DATA_POINTS) return 'moving_average';

        // Check monotonic trend (linear)
        let increasingCount = 0;
        for (let i = 1; i < values.length; i++) {
            if (values[i] > values[i - 1]) increasingCount++;
        }
        const trendRatio = increasingCount / (values.length - 1);

        // Strong trend (>70% consistently going up/down) → linear
        if (trendRatio > 0.7 || trendRatio < 0.3) return 'linear_trend';

        // Enough data for seasonal → seasonal adjusted (12+ months)
        if (values.length >= 12) return 'seasonal_adjusted';

        // Default: moving average
        return 'moving_average';
    }

    /**
     * Format recommendation rows into compact, LLM-friendly summary
     * @param {Array} rows
     * @param {string} dataType
     * @param {string} activeCtx
     * @returns {string}
     */
    _formatRecommendationSummary(rows, dataType, activeCtx) {
        const lines = [];

        switch (dataType) {
            case 'sda_attendance_employees': {
                const topLate = rows.filter(r => r.late_rate_pct > 0).slice(0, 5);
                const topOnTime = rows.filter(r => r.late_rate_pct === 0 || r.late_rate_pct === '0').slice(0, 3);
                lines.push(`DATA ABSENSI KARYAWAN (Top 20 berdasarkan keterlambatan):`);
                lines.push(`Total karyawan teranalisis: ${rows.length}`);
                if (topLate.length > 0) {
                    lines.push(`\nKaryawan dengan keterlambatan tertinggi:`);
                    topLate.forEach((r, i) => {
                        lines.push(`${i + 1}. ${r.employee}: ${r.late_count}x terlambat (${r.late_rate_pct}% dari ${r.total_checkin} hari)`);
                    });
                }
                if (topOnTime.length > 0) {
                    lines.push(`\nKaryawan paling disiplin (0% terlambat):`);
                    topOnTime.forEach((r, i) => lines.push(`${i + 1}. ${r.employee}: ${r.total_checkin} hari hadir`));
                }
                break;
            }

            case 'sda_tickets_devs': {
                const highOpen = rows.filter(r => r.open_tickets > 0).slice(0, 5);
                lines.push(`DATA TIKET PER DEVELOPER (berdasarkan open tickets):`);
                lines.push(`Total developer teranalisis: ${rows.length}`);
                if (highOpen.length > 0) {
                    lines.push(`\nDeveloper dengan open tickets terbanyak:`);
                    highOpen.forEach((r, i) => {
                        lines.push(`${i + 1}. ${r.developer}: ${r.open_tickets} open, ${r.closed_tickets} closed, avg ${r.avg_duration_hours}h/tiket`);
                    });
                }
                break;
            }

            case 'dvo_ap_witel': {
                const highDown = rows.filter(r => r.down_count > 0).slice(0, 5);
                lines.push(`DATA STATUS AP PER WITEL:`);
                lines.push(`Total witel: ${rows.length}`);
                const totalDown = rows.reduce((s, r) => s + Number(r.down_count || 0), 0);
                const totalAP = rows.reduce((s, r) => s + Number(r.total_ap || 0), 0);
                lines.push(`Total AP: ${totalAP}, Down: ${totalDown} (${totalAP > 0 ? Math.round(totalDown * 100 / totalAP) : 0}%)`);
                if (highDown.length > 0) {
                    lines.push(`\nWitel dengan AP Down terbanyak:`);
                    highDown.forEach((r, i) => {
                        lines.push(`${i + 1}. ${r.witel}: ${r.down_count} Down / ${r.total_ap} AP (${r.down_rate_pct}%)`);
                    });
                }
                break;
            }

            case 'dvo_traffic': {
                lines.push(`DATA TRAFIK AP TERTINGGI (Top 20):`);
                rows.slice(0, 10).forEach((r, i) => {
                    lines.push(`${i + 1}. ${r.ap_name} [${r.witel}]: ${r.total_hits} hits, ${r.unique_clients} klien unik`);
                });
                break;
            }

            default: {
                // Fallback: format as JSON snippet
                lines.push(`DATA AGREGASI (${dataType}):`);
                lines.push(JSON.stringify(rows.slice(0, 10), null, 0).slice(0, 1000));
            }
        }

        return lines.join('\n');
    }
}

export const predictionPipelineService = new PredictionPipelineService();
