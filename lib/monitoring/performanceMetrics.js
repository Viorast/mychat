/**
 * Performance Metrics Tracker
 * Tracks and reports RAG query performance metrics
 * 
 * Metrics tracked:
 * - Total queries processed
 * - Average tokens per query
 * - Average response time
 * - Cache hit rate
 * - Error rate
 * - Per-step timing breakdown
 */

class PerformanceMetrics {
    constructor() {
        this.reset();
        console.log('[PerformanceMetrics] Initialized');
    }

    /**
     * Reset all metrics
     */
    reset() {
        this.queries = [];
        this.totalQueries = 0;
        this.totalTokens = 0;
        this.totalDuration = 0;
        this.cacheHits = 0;
        this.errors = 0;

        // Step-level timing
        this.stepTimings = {
            intentClassification: [],
            retrieval: [],
            reranking: [],
            sqlPlanning: [],
            sqlExecution: [],
            finalResponse: []
        };
    }

    /**
     * Record a query execution
     * @param {Object} data - Query execution data
     */
    recordQuery(data) {
        this.totalQueries++;
        this.totalTokens += data.tokens || 0;
        this.totalDuration += data.duration || 0;

        if (data.cached) this.cacheHits++;
        if (data.error) this.errors++;

        // Record step timings if provided
        if (data.stepTimings) {
            Object.keys(data.stepTimings).forEach(step => {
                if (this.stepTimings[step] && data.stepTimings[step]) {
                    this.stepTimings[step].push(data.stepTimings[step]);
                }
            });
        }

        // Store query record (keep last 1000)
        this.queries.push({
            timestamp: Date.now(),
            ...data
        });

        if (this.queries.length > 1000) {
            this.queries.shift();
        }
    }

    /**
     * Calculate average for an array
     */
    _average(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    /**
     * Get formatted performance report
     * @returns {string} Formatted report
     */
    getReport() {
        if (this.totalQueries === 0) {
            return '[PerformanceMetrics] No queries recorded yet';
        }

        const avgTokens = Math.round(this.totalTokens / this.totalQueries);
        const avgDuration = Math.round(this.totalDuration / this.totalQueries);
        const cacheHitRate = ((this.cacheHits / this.totalQueries) * 100).toFixed(2);
        const errorRate = ((this.errors / this.totalQueries) * 100).toFixed(2);

        // Calculate step averages
        const stepAvgs = {};
        Object.keys(this.stepTimings).forEach(step => {
            stepAvgs[step] = Math.round(this._average(this.stepTimings[step]));
        });

        const report = `
╔════════════════════════════════════════════════════════╗
║          PERFORMANCE METRICS REPORT                    ║
╠════════════════════════════════════════════════════════╣
║ Total Queries:         ${this.totalQueries.toString().padEnd(30)} ║
║ Avg Tokens/Query:      ${avgTokens.toString().padEnd(30)} ║
║ Avg Response Time:     ${avgDuration}ms${' '.repeat(30 - avgDuration.toString().length - 2)}║
║ Cache Hit Rate:        ${cacheHitRate}%${' '.repeat(30 - cacheHitRate.toString().length - 1)}║
║ Error Rate:            ${errorRate}%${' '.repeat(30 - errorRate.toString().length - 1)}║
╠════════════════════════════════════════════════════════╣
║ STEP TIMING BREAKDOWN (avg):                          ║
║ - Intent Classification: ${stepAvgs.intentClassification || 0}ms${' '.repeat(28 - (stepAvgs.intentClassification || 0).toString().length - 2)}║
║ - Retrieval:           ${stepAvgs.retrieval || 0}ms${' '.repeat(30 - (stepAvgs.retrieval || 0).toString().length - 2)}║
║ - Reranking:           ${stepAvgs.reranking || 0}ms${' '.repeat(30 - (stepAvgs.reranking || 0).toString().length - 2)}║
║ - SQL Planning:        ${stepAvgs.sqlPlanning || 0}ms${' '.repeat(30 - (stepAvgs.sqlPlanning || 0).toString().length - 2)}║
║ - SQL Execution:       ${stepAvgs.sqlExecution || 0}ms${' '.repeat(30 - (stepAvgs.sqlExecution || 0).toString().length - 2)}║
║ - Final Response:      ${stepAvgs.finalResponse || 0}ms${' '.repeat(30 - (stepAvgs.finalResponse || 0).toString().length - 2)}║
╚════════════════════════════════════════════════════════╝
        `.trim();

        return report;
    }

    /**
     * Get compact one-line summary
     * @returns {string}
     */
    getSummary() {
        if (this.totalQueries === 0) {
            return '[Metrics] No data';
        }

        const avgTokens = Math.round(this.totalTokens / this.totalQueries);
        const avgDuration = Math.round(this.totalDuration / this.totalQueries);
        const cacheHitRate = ((this.cacheHits / this.totalQueries) * 100).toFixed(1);

        return `[Metrics] Queries: ${this.totalQueries} | Avg: ${avgTokens} tokens, ${avgDuration}ms | Cache: ${cacheHitRate}%`;
    }

    /**
     * Get detailed statistics as object
     * @returns {Object}
     */
    getDetailedStats() {
        if (this.totalQueries === 0) {
            return {
                totalQueries: 0,
                avgTokens: 0,
                avgDuration: 0,
                cacheHitRate: 0,
                errorRate: 0
            };
        }

        const stepAvgs = {};
        Object.keys(this.stepTimings).forEach(step => {
            stepAvgs[step] = Math.round(this._average(this.stepTimings[step]));
        });

        return {
            totalQueries: this.totalQueries,
            totalTokens: this.totalTokens,
            totalDuration: this.totalDuration,
            avgTokens: Math.round(this.totalTokens / this.totalQueries),
            avgDuration: Math.round(this.totalDuration / this.totalQueries),
            cacheHits: this.cacheHits,
            cacheHitRate: (this.cacheHits / this.totalQueries) * 100,
            errors: this.errors,
            errorRate: (this.errors / this.totalQueries) * 100,
            stepTimings: stepAvgs
        };
    }

    /**
     * Get recent queries
     * @param {number} count - Number of recent queries to return
     * @returns {Array}
     */
    getRecentQueries(count = 10) {
        return this.queries.slice(-count);
    }

    /**
     * Calculate percentiles for a metric
     * @param {string} metric - Metric name ('tokens' or 'duration')
     * @returns {Object} Percentile values
     */
    getPercentiles(metric = 'duration') {
        if (this.queries.length === 0) {
            return { p50: 0, p90: 0, p95: 0, p99: 0 };
        }

        const values = this.queries
            .map(q => q[metric] || 0)
            .sort((a, b) => a - b);

        const getPercentile = (p) => {
            const index = Math.ceil(values.length * (p / 100)) - 1;
            return values[Math.max(0, index)];
        };

        return {
            p50: getPercentile(50),
            p90: getPercentile(90),
            p95: getPercentile(95),
            p99: getPercentile(99)
        };
    }
}

// Singleton instance
export const metrics = new PerformanceMetrics();

// Export class for testing
export default PerformanceMetrics;
