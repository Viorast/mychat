/**
 * Prediction Queries — Pre-built SQL
 * 
 * Semua query di sini TIDAK di-generate LLM pada runtime.
 * Tujuannya: hemat ~400-600 token per query predictive/recommendation.
 * 
 * Output: data agregat per bulan (bukan raw rows per karyawan/tiket)
 */

// ─── SDA Queries ──────────────────────────────────────────────────────────────

/**
 * Absensi bulanan: jumlah check-in, keterlambatan, WFH (SDA)
 * Output: [{month, total_checkin, late_count, wfh_count, unique_employees}]
 */
export const SDA_ATTENDANCE_MONTHLY = `
SELECT
    TO_CHAR(tanggal_absen, 'YYYY-MM') AS month,
    COUNT(*) AS total_checkin,
    COUNT(DISTINCT nama_karyawan) AS unique_employees,
    COUNT(CASE WHEN jenis_absen ILIKE '%TERLAMBAT%' THEN 1 END) AS late_count,
    COUNT(CASE WHEN jenis_absen ILIKE '%WFH%' THEN 1 END) AS wfh_count,
    COUNT(CASE WHEN jenis_absen ILIKE '%WFO%' THEN 1 END) AS wfo_count
FROM "SDA"."log_absen"
WHERE EXTRACT(YEAR FROM tanggal_absen) = 2025
GROUP BY TO_CHAR(tanggal_absen, 'YYYY-MM')
ORDER BY month ASC
`;

/**
 * Tiket bulanan: total tiket, yang selesai, per tipe (SDA)
 * Output: [{month, total_tickets, closed_tickets, bug_count, incident_count}]
 */
export const SDA_TICKETS_MONTHLY = `
SELECT
    TO_CHAR(create_date, 'YYYY-MM') AS month,
    COUNT(*) AS total_tickets,
    COUNT(CASE WHEN status ILIKE 'close%' THEN 1 END) AS closed_tickets,
    COUNT(CASE WHEN ticket_type ILIKE '%bug%' THEN 1 END) AS bug_count,
    COUNT(CASE WHEN ticket_type ILIKE '%incident%' THEN 1 END) AS incident_count,
    COUNT(CASE WHEN ticket_type ILIKE '%change%' THEN 1 END) AS change_count
FROM "SDA"."m_ticket"
WHERE EXTRACT(YEAR FROM create_date) = 2025
GROUP BY TO_CHAR(create_date, 'YYYY-MM')
ORDER BY month ASC
`;

/**
 * NOSSA (gangguan/complaint) bulanan (SDA)
 * Output: [{month, total_incidents, resolved_count, avg_ttr_hours}]
 */
export const SDA_NOSSA_MONTHLY = `
SELECT
    TO_CHAR(open_date::timestamp, 'YYYY-MM') AS month,
    COUNT(*) AS total_incidents,
    COUNT(CASE WHEN status ILIKE 'close%' THEN 1 END) AS resolved_count,
    ROUND(AVG(
        EXTRACT(EPOCH FROM (
            CASE WHEN close_date IS NOT NULL
            THEN close_date::timestamp - open_date::timestamp
            END
        )) / 3600
    )::numeric, 1) AS avg_ttr_hours
FROM "SDA"."nossa_closed"
WHERE EXTRACT(YEAR FROM open_date::timestamp) = 2025
GROUP BY TO_CHAR(open_date::timestamp, 'YYYY-MM')
ORDER BY month ASC
`;

/**
 * Ringkasan absensi 30 hari terakhir per karyawan (untuk rekomendasi)
 * Output: [{employee, total, late_count, late_rate}]
 */
export const SDA_ATTENDANCE_EMPLOYEE_SUMMARY = `
SELECT
    nama_karyawan AS employee,
    COUNT(*) AS total_checkin,
    COUNT(CASE WHEN jenis_absen ILIKE '%TERLAMBAT%' THEN 1 END) AS late_count,
    ROUND(
        COUNT(CASE WHEN jenis_absen ILIKE '%TERLAMBAT%' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0),
        1
    ) AS late_rate_pct
FROM "SDA"."log_absen"
WHERE EXTRACT(YEAR FROM tanggal_absen) = 2025
GROUP BY nama_karyawan
HAVING COUNT(*) >= 5
ORDER BY late_rate_pct DESC
LIMIT 20
`;

/**
 * Ringkasan tiket per developer (untuk rekomendasi)
 * Output: [{developer, total, closed, open, avg_duration_hours}]
 */
export const SDA_TICKETS_DEV_SUMMARY = `
SELECT
    dev_name AS developer,
    COUNT(*) AS total_tickets,
    COUNT(CASE WHEN status ILIKE 'close%' THEN 1 END) AS closed_tickets,
    COUNT(CASE WHEN status NOT ILIKE 'close%' THEN 1 END) AS open_tickets,
    ROUND(AVG(
        CASE WHEN last_edited IS NOT NULL AND create_date IS NOT NULL
        THEN EXTRACT(EPOCH FROM (last_edited - create_date)) / 3600
        END
    )::numeric, 1) AS avg_duration_hours
FROM "SDA"."m_ticket"
WHERE EXTRACT(YEAR FROM create_date) = 2025
GROUP BY dev_name
HAVING COUNT(*) >= 3
ORDER BY open_tickets DESC
LIMIT 15
`;

// ─── DVO Queries ──────────────────────────────────────────────────────────────

/**
 * Status AP per witel (untuk rekomendasi)
 * Output: [{witel, total_ap, up_count, down_count, down_rate_pct}]
 */
export const DVO_AP_STATUS_BY_WITEL = `
SELECT
    witel,
    COUNT(*) AS total_ap,
    COUNT(CASE WHEN status = 'Up' THEN 1 END) AS up_count,
    COUNT(CASE WHEN status = 'Down' THEN 1 END) AS down_count,
    ROUND(
        COUNT(CASE WHEN status = 'Down' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0),
        1
    ) AS down_rate_pct
FROM "DVO"."v_inventory_wmsl"
GROUP BY witel
ORDER BY down_count DESC
LIMIT 20
`;

/**
 * Status AP per regional (untuk prediksi tren)
 * Output: [{regional, total_ap, up_count, down_count}]
 */
export const DVO_AP_STATUS_BY_REGIONAL = `
SELECT
    regional,
    COUNT(*) AS total_ap,
    COUNT(CASE WHEN status = 'Up' THEN 1 END) AS up_count,
    COUNT(CASE WHEN status = 'Down' THEN 1 END) AS down_count
FROM "DVO"."v_inventory_wmsl"
GROUP BY regional
ORDER BY down_count DESC
`;

/**
 * Trafik pengunjung per AP (untuk rekomendasi utilitas)
 * Output: [{ap_name, total_hits, unique_clients}]
 */
export const DVO_TRAFFIC_TOP_AP = `
SELECT
    t.ap_name,
    COUNT(*) AS total_hits,
    COUNT(DISTINCT t.mac_client) AS unique_clients,
    inv.witel,
    inv.regional
FROM "DVO"."vowner_traffic_202510" t
LEFT JOIN "DVO"."v_inventory_wmsl" inv ON t.ap_name = inv.ap_name
GROUP BY t.ap_name, inv.witel, inv.regional
ORDER BY total_hits DESC
LIMIT 20
`;

// ─── Query Mapper ─────────────────────────────────────────────────────────────

/**
 * Mapping dari dataType → SQL query string
 * Digunakan oleh predictionPipelineService dan recommendationPipelineService
 */
export const QUERY_MAP = {
    // SDA
    sda_attendance: SDA_ATTENDANCE_MONTHLY,
    sda_tickets: SDA_TICKETS_MONTHLY,
    sda_nossa: SDA_NOSSA_MONTHLY,
    sda_attendance_employees: SDA_ATTENDANCE_EMPLOYEE_SUMMARY,
    sda_tickets_devs: SDA_TICKETS_DEV_SUMMARY,

    // DVO
    dvo_ap_witel: DVO_AP_STATUS_BY_WITEL,
    dvo_ap_regional: DVO_AP_STATUS_BY_REGIONAL,
    dvo_traffic: DVO_TRAFFIC_TOP_AP,
};

export default QUERY_MAP;
