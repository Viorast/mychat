import * as stats from 'simple-statistics';

/**
 * Prediction Service - Statistical Methods (Phase 1)
 * Provides statistical prediction capabilities without hallucination
 */

const MIN_DATA_POINTS = parseInt(process.env.PREDICTION_MIN_DATA_POINTS || '6');
const DEFAULT_METHOD = process.env.PREDICTION_DEFAULT_METHOD || 'moving_average';
const DEFAULT_PERIODS = parseInt(process.env.PREDICTION_PERIODS || '3');

/**
 * Predict time series using statistical methods
 * @param {Array} historicalData - Array of {date, value} objects
 * @param {Object} options - {method, periods, confidence}
 * @returns {Object} Prediction with confidence score
 */
export function predictTimeSeries(historicalData, options = {}) {
    const {
        method = DEFAULT_METHOD,
        periods = DEFAULT_PERIODS,
        confidence = 0.7
    } = options;

    // Validate input
    if (!historicalData || historicalData.length < MIN_DATA_POINTS) {
        return {
            success: false,
            error: `Minimum ${MIN_DATA_POINTS} data points required`,
            predictions: null
        };
    }

    // Sort by date
    const sorted = [...historicalData].sort((a, b) =>
        new Date(a.date) - new Date(b.date)
    );

    const values = sorted.map(d => d.value);

    try {
        let predictions;

        switch (method) {
            case 'moving_average':
                predictions = predictMovingAverage(values, periods);
                break;
            case 'linear_trend':
                predictions = predictLinearTrend(values, periods);
                break;
            case 'seasonal_adjusted':
                predictions = predictSeasonalAdjusted(values, periods);
                break;
            default:
                predictions = predictMovingAverage(values, periods);
        }

        return {
            success: true,
            method,
            predictions,
            confidence: calculateConfidence(values),
            basedOnMonths: values.length
        };
    } catch (error) {
        console.error('[Prediction] Error:', error.message);
        return {
            success: false,
            error: error.message,
            predictions: null
        };
    }
}

/**
 * Moving Average Prediction
 */
function predictMovingAverage(values, periods, window = 3) {
    const recent = values.slice(-window);
    const average = stats.mean(recent);

    const predictions = [];
    for (let i = 1; i <= periods; i++) {
        predictions.push({
            period: i,
            value: Math.round(average * 100) / 100,
            method: 'moving_average',
            window
        });
    }

    return predictions;
}

/**
 * Linear Trend Prediction
 */
function predictLinearTrend(values, periods) {
    // Prepare data for linear regression
    const data = values.map((value, index) => [index, value]);

    // Calculate linear regression
    const regression = stats.linearRegression(data);
    const line = stats.linearRegressionLine(regression);

    const predictions = [];
    const lastIndex = values.length - 1;

    for (let i = 1; i <= periods; i++) {
        const predictedValue = line(lastIndex + i);
        predictions.push({
            period: i,
            value: Math.max(0, Math.round(predictedValue * 100) / 100), // Ensure non-negative
            method: 'linear_trend',
            slope: regression.m
        });
    }

    return predictions;
}

/**
 * Seasonal Adjusted Prediction
 */
function predictSeasonalAdjusted(values, periods, seasonalPeriod = 12) {
    // Simple seasonal decomposition
    const trend = calculateMovingAverage(values, Math.min(3, values.length));
    const detrended = values.map((v, i) => v - (trend[i] || v));

    // Calculate seasonal factors (simplified)
    const seasonalFactors = calculateSeasonalFactors(detrended, seasonalPeriod);

    // Predict using trend + seasonal
    const lastTrend = trend[trend.length - 1] || stats.mean(values);
    const predictions = [];

    for (let i = 1; i <= periods; i++) {
        const seasonalIndex = (values.length + i - 1) % seasonalPeriod;
        const seasonalFactor = seasonalFactors[seasonalIndex] || 0;
        const predicted = lastTrend + seasonalFactor;

        predictions.push({
            period: i,
            value: Math.max(0, Math.round(predicted * 100) / 100),
            method: 'seasonal_adjusted',
            trend: lastTrend,
            seasonal: seasonalFactor
        });
    }

    return predictions;
}

/**
 * Calculate moving average
 */
function calculateMovingAverage(values, window) {
    const result = [];
    for (let i = 0; i < values.length; i++) {
        const start = Math.max(0, i - window + 1);
        const subset = values.slice(start, i + 1);
        result.push(stats.mean(subset));
    }
    return result;
}

/**
 * Calculate seasonal factors
 */
function calculateSeasonalFactors(detrended, period) {
    const factors = new Array(period).fill(0);
    const counts = new Array(period).fill(0);

    detrended.forEach((value, index) => {
        const seasonalIndex = index % period;
        factors[seasonalIndex] += value;
        counts[seasonalIndex]++;
    });

    return factors.map((sum, i) =>
        counts[i] > 0 ? sum / counts[i] : 0
    );
}

/**
 * Calculate confidence based on data variance
 */
function calculateConfidence(values) {
    try {
        const stdDev = stats.standardDeviation(values);
        const mean = stats.mean(values);

        // Coefficient of variation (lower is more confident)
        const cv = mean > 0 ? stdDev / mean : 1;

        // Convert to confidence score (0-1)
        // Lower CV = higher confidence
        const confidence = Math.max(0.3, Math.min(0.95, 1 - (cv * 0.5)));

        return Math.round(confidence * 100) / 100;
    } catch (error) {
        return 0.7; // Default moderate confidence
    }
}

/**
 * Calculate growth rate
 */
export function calculateGrowthRate(values) {
    if (values.length < 2) return 0;

    const first = values[0];
    const last = values[values.length - 1];

    if (first === 0) return 0;

    const growthRate = ((last - first) / first) * 100;
    return Math.round(growthRate * 100) / 100;
}

/**
 * Detect outliers using IQR method
 */
export function detectOutliers(values) {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = stats.quantile(sorted, 0.25);
    const q3 = stats.quantile(sorted, 0.75);
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return values.map((v, i) => ({
        index: i,
        value: v,
        isOutlier: v < lowerBound || v > upperBound
    }));
}

/**
 * Detect if a user query is predictive in nature — rules-based, zero LLM tokens
 * @param {string} userMessage
 * @returns {{isPrediction: boolean, dataType: string|null, metric: string|null, periods: number}}
 */
export function detectPredictiveIntent(userMessage) {
    if (!userMessage) return { isPrediction: false, dataType: null, metric: null, periods: 3 };

    const lower = userMessage.toLowerCase();

    // Prediction trigger keywords (Indonesian + English)
    const predKeywords = [
        'prediksi', 'prediction', 'prediksinya', 'proyeksi', 'forecast', 'forecasting',
        'perkiraan', 'estimasi', 'estimate',
        'bulan depan', 'minggu depan', 'next month', 'next week',
        'ke depan', 'kedepan', 'forward', 'akan datang',
        'tren', 'trend', 'kecenderungan'
    ];

    const isPrediction = predKeywords.some(kw => lower.includes(kw));
    if (!isPrediction) return { isPrediction: false, dataType: null, metric: null, periods: 3 };

    // Detect how many periods (months/weeks) forward
    const periodMatch = lower.match(/(\d+)\s*bulan/);
    const periods = periodMatch ? Math.min(parseInt(periodMatch[1]), 6) : 3;

    // Map to dataType
    let dataType = null;
    let metric = null;

    const SDA_ATTENDANCE_KW = ['absen', 'absensi', 'kehadiran', 'hadir', 'check in', 'checkin', 'terlambat', 'wfh', 'wfo'];
    const SDA_TICKET_KW = ['tiket', 'ticket', 'bug', 'incident', 'task', 'pekerjaan', 'issue'];
    const SDA_NOSSA_KW = ['nossa', 'gangguan', 'complaint', 'aduan', 'keluhan'];
    const DVO_AP_KW = ['ap', 'access point', 'status ap', 'up down', 'witel', 'regional', 'jaringan', 'network'];

    if (SDA_ATTENDANCE_KW.some(k => lower.includes(k))) {
        dataType = 'sda_attendance'; metric = 'total_checkin';
    } else if (SDA_TICKET_KW.some(k => lower.includes(k))) {
        dataType = 'sda_tickets'; metric = 'total_tickets';
    } else if (SDA_NOSSA_KW.some(k => lower.includes(k))) {
        dataType = 'sda_nossa'; metric = 'total_incidents';
    } else if (DVO_AP_KW.some(k => lower.includes(k))) {
        dataType = 'dvo_ap_witel'; metric = 'down_count';
    }

    return { isPrediction, dataType, metric, periods };
}

/**
 * Format prediction results into a compact summary string for LLM
 * Keeps token count minimal (~150-200 chars vs thousands for raw data)
 * @param {Object} predResult - Result from predictTimeSeries()
 * @param {Array} historicalRows - Raw DB rows for context
 * @param {string} dataType
 * @param {string} metric
 * @returns {string}
 */
export function formatPredictionSummary(predResult, historicalRows, dataType, metric) {
    if (!predResult || !predResult.success) {
        const rowCount = historicalRows?.length || 0;
        return `Data historis tersedia: ${rowCount} bulan, namun tidak cukup untuk membuat prediksi statistik (minimal 6 bulan).`;
    }

    const latest = historicalRows?.[historicalRows.length - 1];
    const latestVal = latest ? (latest[metric] || 0) : 0;
    const latestMonth = latest?.month || 'terakhir';

    const forecastLines = predResult.predictions.map((p, i) => {
        const label = `Bulan +${p.period}`;
        return `${label}: ${p.value}`;
    }).join(', ');

    const confidencePct = Math.round((predResult.confidence || 0.7) * 100);
    const methodLabel = {
        moving_average: 'Moving Average',
        linear_trend: 'Regresi Linear',
        seasonal_adjusted: 'Seasonal Adjusted'
    }[predResult.method] || predResult.method;

    const growthRate = calculateGrowthRate(historicalRows.map(r => Number(r[metric] || 0)));
    const trendLabel = growthRate > 5 ? 'naik' : growthRate < -5 ? 'turun' : 'stabil';

    return [
        `DATA HISTORIS: ${historicalRows.length} bulan data tersedia.`,
        `Bulan terakhir (${latestMonth}): ${latestVal} ${metric.replace(/_/g, ' ')}.`,
        `Tren keseluruhan: ${trendLabel} (${growthRate > 0 ? '+' : ''}${growthRate}%).`,
        `PREDIKSI (${methodLabel}, confidence ${confidencePct}%): ${forecastLines}.`,
        `Catatan: Prediksi dihitung secara statistik dari data aktual database, bukan estimasi AI.`
    ].join('\n');
}
