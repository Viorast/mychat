import { queryExecutor } from '../database/queryExecutor.js';
import { predictTimeSeries, calculateGrowthRate } from './predictionService.js';

/**
 * Aggregation Service
 * Generates data summaries with statistical predictions from PostgreSQL
 */

/**
 * Generate monthly insights with predictions
 * @returns {Array} Array of insight objects
 */
export async function generateMonthlyInsights() {
    console.log('[Aggregation] Generating monthly insights...');

    const insights = [];

    try {
        // Aggregate attendance data per month
        const attendanceQuery = `
      SELECT 
        TO_CHAR(tanggal_absen, 'YYYY-MM') as month,
        COUNT(*) as total_records,
        COUNT(DISTINCT nama_karyawan) as unique_employees,
        COUNT(CASE WHEN jam_check_in::time > '08:15:00'::time THEN 1 END) as late_count,
        COUNT(CASE WHEN jenis_absen ILIKE '%WFH%' THEN 1 END) as wfh_count
      FROM "SDA"."log_absen"
      WHERE tanggal_absen >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY TO_CHAR(tanggal_absen, 'YYYY-MM')
      ORDER BY month DESC
    `;

        const attendanceResult = await queryExecutor.executeQuery(attendanceQuery);

        if (attendanceResult.success && attendanceResult.rows.length > 0) {
            const monthlyData = attendanceResult.rows;

            // Calculate predictions
            const historicalCounts = monthlyData.reverse().map((row, idx) => ({
                date: row.month,
                value: parseInt(row.total_records)
            }));

            const prediction = predictTimeSeries(historicalCounts, {
                method: 'moving_average',
                periods: 3
            });

            // Generate summary
            const latestMonth = monthlyData[monthlyData.length - 1];
            const lateRate = latestMonth.total_records > 0
                ? ((latestMonth.late_count / latestMonth.total_records) * 100).toFixed(1)
                : 0;

            const summary = `Attendance Summary (Last 12 Months):
Month ${latestMonth.month}: ${latestMonth.total_records} check-ins, ${latestMonth.unique_employees} employees, ${latestMonth.late_count} late (${lateRate}%), ${latestMonth.wfh_count} WFH.

Trend: ${calculateGrowthRate(historicalCounts.map(h => h.value))}% growth rate.
${prediction.success ? `Prediction next month: ${prediction.predictions[0].value} check-ins (confidence: ${(prediction.confidence * 100).toFixed(0)}%)` : ''}`;

            insights.push({
                type: 'monthly_attendance',
                period: latestMonth.month,
                data: monthlyData,
                prediction: prediction.success ? prediction : null,
                summary
            });
        }

        // Aggregate ticket data per month
        const ticketQuery = `
      SELECT 
        TO_CHAR(create_date, 'YYYY-MM') as month,
        COUNT(*) as total_tickets,
        COUNT(CASE WHEN status ILIKE 'close%' THEN 1 END) as closed_tickets,
        AVG(EXTRACT(EPOCH FROM (last_edited - create_date))/3600) as avg_duration_hours,
        ticket_type,
        COUNT(*) as type_count
      FROM "SDA"."m_ticket"
      WHERE create_date >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY TO_CHAR(create_date, 'YYYY-MM'), ticket_type
      ORDER BY month DESC
    `;

        const ticketResult = await queryExecutor.executeQuery(ticketQuery);

        if (ticketResult.success && ticketResult.rows.length > 0) {
            const ticketData = ticketResult.rows;

            // Group by month
            const byMonth = {};
            ticketData.forEach(row => {
                if (!byMonth[row.month]) {
                    byMonth[row.month] = {
                        total: 0,
                        closed: 0,
                        types: {}
                    };
                }
                byMonth[row.month].total += parseInt(row.total_tickets);
                byMonth[row.month].closed += parseInt(row.closed_tickets);
                byMonth[row.month].types[row.ticket_type] = parseInt(row.type_count);
            });

            const months = Object.keys(byMonth).sort().reverse();
            const latestMonth = months[0];
            const latestData = byMonth[latestMonth];

            const closeRate = latestData.total > 0
                ? ((latestData.closed / latestData.total) * 100).toFixed(1)
                : 0;

            // Predict ticket volume
            const historicalTickets = months.reverse().map(month => ({
                date: month,
                value: byMonth[month].total
            }));

            const ticketPrediction = predictTimeSeries(historicalTickets, {
                method: 'linear_trend',
                periods: 3
            });

            const summary = `Ticket Summary (Last 12 Months):
Month ${latestMonth}: ${latestData.total} tickets, ${latestData.closed} closed (${closeRate}%).
Top types: ${Object.entries(latestData.types).map(([type, count]) => `${type}: ${count}`).join(', ')}.

${ticketPrediction.success ? `Prediction next month: ${ticketPrediction.predictions[0].value} tickets (confidence: ${(ticketPrediction.confidence * 100).toFixed(0)}%)` : ''}`;

            insights.push({
                type: 'monthly_tickets',
                period: latestMonth,
                data: latestData,
                prediction: ticketPrediction.success ? ticketPrediction : null,
                summary
            });
        }

    } catch (error) {
        console.error('[Aggregation] Error generating monthly insights:', error.message);
    }

    console.log(`[Aggregation] Generated ${insights.length} monthly insights`);
    return insights;
}

/**
 * Generate regional insights
 * @returns {Array} Array of regional insights
 */
export async function generateRegionalInsights() {
    console.log('[Aggregation] Generating regional insights...');

    const insights = [];

    try {
        const regionalQuery = `
      SELECT 
        lokasi,
        COUNT(*) as total_checkins,
        COUNT(DISTINCT nama_karyawan) as unique_employees,
        AVG(CASE WHEN jam_check_in::time > '08:15:00'::time THEN 1 ELSE 0 END) * 100 as late_percentage
      FROM "SDA"."log_absen"
      WHERE tanggal_absen >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY lokasi
      ORDER BY total_checkins DESC
      LIMIT 20
    `;

        const result = await queryExecutor.executeQuery(regionalQuery);

        if (result.success && result.rows.length > 0) {
            const summary = `Regional Attendance (Last 30 Days):
${result.rows.slice(0, 5).map((row, idx) =>
                `${idx + 1}. ${row.lokasi}: ${row.total_checkins} check-ins, ${row.unique_employees} employees, ${parseFloat(row.late_percentage).toFixed(1)}% late`
            ).join('\n')}`;

            insights.push({
                type: 'regional_attendance',
                period: 'last_30_days',
                data: result.rows,
                summary
            });
        }
    } catch (error) {
        console.error('[Aggregation] Error generating regional insights:', error.message);
    }

    return insights;
}

/**
 * Generate employee insights
 * @returns {Array} Array of employee insights
 */
export async function generateEmployeeInsights() {
    console.log('[Aggregation] Generating employee insights...');

    const insights = [];

    try {
        const employeeQuery = `
      SELECT 
        nama_karyawan as employee_name,
        COUNT(*) as total_checkins,
        COUNT(CASE WHEN jam_check_in::time <= '08:15:00'::time THEN 1 END) as on_time_count,
        COUNT(CASE WHEN jam_check_in::time > '08:15:00'::time THEN 1 END) as late_count,
        AVG(CASE WHEN jam_check_in::time > '08:15:00'::time THEN 1 ELSE 0 END) * 100 as late_percentage
      FROM "SDA"."log_absen"
      WHERE tanggal_absen >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY nama_karyawan
      HAVING COUNT(*) >= 10
      ORDER BY late_percentage ASC
      LIMIT 10
    `;

        const result = await queryExecutor.executeQuery(employeeQuery);

        if (result.success && result.rows.length > 0) {
            const summary = `Top Performers (Last 30 Days - Most Punctual):
${result.rows.slice(0, 5).map((row, idx) =>
                `${idx + 1}. ${row.employee_name}: ${row.total_checkins} check-ins, ${parseFloat(row.late_percentage).toFixed(1)}% late`
            ).join('\n')}`;

            insights.push({
                type: 'employee_performance',
                period: 'last_30_days',
                data: result.rows,
                summary
            });
        }
    } catch (error) {
        console.error('[Aggregation] Error generating employee insights:', error.message);
    }

    return insights;
}

/**
 * Generate all insights
 * @returns {Array} Combined insights
 */
export async function generateAllInsights() {
    console.log('[Aggregation] Generating all insights...');

    const [monthly, regional, employee] = await Promise.all([
        generateMonthlyInsights(),
        generateRegionalInsights(),
        generateEmployeeInsights()
    ]);

    const allInsights = [...monthly, ...regional, ...employee];

    console.log(`[Aggregation] ✅ Generated ${allInsights.length} total insights`);
    return allInsights;
}
