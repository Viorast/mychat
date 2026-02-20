import { aiRouter } from "../../../ai/ai-router.js";
import { ragLog } from "../../../monitoring/ragLogger.js";

const MAX_HISTORY_CHARS = 300;  // ✅ FIX: Batasi history di prompt
const MAX_CONTEXT_CHARS = 3500; // ✅ FIX: Batasi schema context di prompt

export class SqlGeneratorService {
    constructor(aiClient = aiRouter) {
        this.aiClient = aiClient;
    }

    /**
     * Step 3: SQL Query Planning
     * Generates a SQL query plan based on user question and schema context.
     */
    async generateSQLPlan(userMessage, history, rerankedContext) {
        if (!rerankedContext) {
            ragLog.warn('P3 SQLPlan', 'No context provided, skipping SQL generation');
            return { query: null, requiresRetrieval: false, analysisType: 'none', usage: { totalTokenCount: 0 } };
        }

        // ✅ FIX: Truncate history and context to control token count
        const historyText = history
            .slice(-2)
            .map(m => `${m.role}: ${m.content.slice(0, 120)}`)
            .join('\n')
            .slice(0, MAX_HISTORY_CHARS);

        const schemaContext = rerankedContext.slice(0, MAX_CONTEXT_CHARS);

        ragLog.debug('P3 SQLPlan context', `${schemaContext.length} chars (truncated from ${rerankedContext.length})`);

        const planningPrompt = `You are a SQL Query Planner for PostgreSQL schema "SDA".

=== SCHEMA ===
${schemaContext}
=== END SCHEMA ===

HISTORY:
${historyText}

QUESTION: "${userMessage}"

RULES:
1. SCHEMA: Always prefix tables with "SDA". Example: "SDA"."log_absen"
2. ALLOWED TABLES ONLY:
   - "SDA"."log_absen"     → Attendance / check-in / check-out
   - "SDA"."m_ticket"      → Work tickets / incidents
   - "SDA"."nossa_closed"  → Customer complaints
3. NO JOINS between tables (non-relational)
4. PostgreSQL syntax, always LIMIT 100
5. Use ILIKE for text search

!!! CRITICAL DATA RULES (pelanggaran = 0 rows) !!!
- jenis_absen: JANGAN gunakan = 'CHECK IN'. ALWAYS ILIKE '%CHECK IN%'
  Nilai valid: 'CHECK IN WFO', 'CHECK IN WFH', 'CHECK IN WFA', 'CHECK OUT', 'TERLAMBAT WFO/WFH/WFA'
- tanggal_absen: Data HANYA ada tahun 2025 (2025-01-01 s/d 2025-12-31).
  JANGAN pakai NOW(), CURRENT_DATE, CURRENT_TIMESTAMP — hasilnya selalu 0!
  GUNAKAN: EXTRACT(YEAR FROM tanggal_absen) = 2025
  Per bulan: ... AND EXTRACT(MONTH FROM tanggal_absen) = <angka_bulan>
- Tepat waktu: jenis_absen ILIKE '%CHECK IN%' AND jam_check_in <= '09:00:00'
- Terlambat  : jenis_absen ILIKE '%TERLAMBAT%'

STEP 1 — Needs DB?
- SDA data question → requiresRetrieval: true
- Greeting / policy / general → requiresRetrieval: false

STEP 2 — Type: descriptive | diagnostic | predictive | recommendation | none

STEP 3 — Write query if needed

OUTPUT (JSON only):
{"requiresRetrieval": true/false, "analysisType": "...", "query": "SELECT ... LIMIT 100" or null}`;

        try {
            const t0 = Date.now();
            const response = await this.aiClient.generateResponse(planningPrompt);
            const ms = Date.now() - t0;
            const usage = response.usage || { totalTokenCount: 0 };

            if (!response.success || !response.text) {
                ragLog.warn('P3 SQLPlan', `AI failed: ${response.error}`);
                return { query: null, requiresRetrieval: false, analysisType: 'none', error: response.error, usage };
            }

            // Parse JSON from response
            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                ragLog.warn('P3 SQLPlan', 'No JSON in response, skipping SQL');
                return { query: null, requiresRetrieval: false, analysisType: 'none', usage };
            }

            let plan;
            try {
                plan = JSON.parse(jsonMatch[0]);
            } catch {
                ragLog.warn('P3 SQLPlan', 'JSON parse failed');
                return { query: null, requiresRetrieval: false, analysisType: 'none', usage };
            }

            // Validate
            const validTypes = ['descriptive', 'diagnostic', 'predictive', 'recommendation', 'none'];
            if (typeof plan.requiresRetrieval !== 'boolean' || !validTypes.includes(plan.analysisType)) {
                ragLog.warn('P3 SQLPlan', 'Invalid plan format');
                return { query: null, requiresRetrieval: false, analysisType: 'none', usage };
            }

            if (!plan.requiresRetrieval || !plan.query?.trim()) {
                plan.query = null;
                if (!plan.requiresRetrieval) plan.analysisType = 'none';
            }

            // ✅ Smart fallback: override if obvious SDA keywords present
            if (!plan.requiresRetrieval) {
                const q = userMessage.toLowerCase();
                const sdaKw = ['karyawan', 'pegawai', 'absen', 'check in', 'check-in', 'hadir', 'tiket', 'ticket',
                    'incident', 'lokasi', 'jam', 'tanggal', 'jumlah', 'berapa', 'total', 'terlambat'];
                const policyKw = ['kebijakan', 'policy', 'sop', 'aturan', 'peraturan'];
                const isPolicy = policyKw.some(k => q.includes(k));
                const hasSDA = !isPolicy && sdaKw.some(k => q.includes(k));

                if (hasSDA) {
                    ragLog.warn('P3 SQLPlan', 'Override: SDA keywords found, forcing requiresRetrieval=true');
                    plan.requiresRetrieval = true;
                    plan.analysisType = plan.analysisType === 'none' ? 'descriptive' : plan.analysisType;
                    if (!plan.query) plan.query = 'SELECT * FROM "SDA"."log_absen" ORDER BY tgl DESC LIMIT 100';
                }
            }

            // ✅ Auto-fix 1: Missing quotes: SDA.tablename → "SDA"."tablename"
            if (plan.query) {
                plan.query = plan.query.replace(/\bSDA\.(\w+)/g, '"SDA"."$1"');

                // ✅ Auto-fix 2: Exact match 'CHECK IN' → ILIKE '%CHECK IN%'
                // Data aktual: 'CHECK IN WFO', 'CHECK IN WFH', 'CHECK IN WFA'
                plan.query = plan.query.replace(
                    /jenis_absen\s*=\s*'CHECK IN'/gi,
                    "jenis_absen ILIKE '%CHECK IN%'"
                );
                plan.query = plan.query.replace(
                    /jenis_absen\s*=\s*'TERLAMBAT'/gi,
                    "jenis_absen ILIKE '%TERLAMBAT%'"
                );
                plan.query = plan.query.replace(
                    /jenis_absen\s*=\s*'CHECK OUT'/gi,
                    "jenis_absen ILIKE '%CHECK OUT%'"
                );

                // ✅ Auto-fix 3: NOW() / CURRENT_DATE / CURRENT_TIMESTAMP → year filter
                // Data range HANYA 2025-01-01 s/d 2025-12-31.
                // Regex menangani: col >= NOW(), col >= (CURRENT_DATE - INTERVAL '...')
                //                  col >= NOW() - INTERVAL '...', dll
                const hasNow = /NOW\(\)|CURRENT_DATE|CURRENT_TIMESTAMP/i.test(plan.query);
                if (hasNow) {
                    ragLog.warn('P3 SQLPlan', 'Auto-fix: NOW()/CURRENT_DATE → EXTRACT(YEAR=2025) [data only in 2025]');

                    const YEAR_FILTER = 'EXTRACT(YEAR FROM tanggal_absen) = 2025';

                    // Satu regex menangani semua variasi dengan/tanpa kurung:
                    // col >= (NOW() - INTERVAL '...')
                    // col >= NOW() - INTERVAL '...'
                    // col >= (CURRENT_DATE - INTERVAL '...')
                    // col >= CURRENT_DATE
                    // col >= CURRENT_TIMESTAMP
                    plan.query = plan.query.replace(
                        /\w+\s*(?:>=|<=|>|<|=)\s*\(?\s*(?:NOW\(\)|CURRENT_DATE|CURRENT_TIMESTAMP)\s*(?:-\s*INTERVAL\s*'[^']*')?\s*\)?/gi,
                        YEAR_FILTER
                    );

                    // Safety: jika YEAR_FILTER belum masuk (edge case), paksa inject
                    if (!plan.query.includes('EXTRACT(YEAR')) {
                        plan.query = plan.query.replace(/\bWHERE\b/i, `WHERE ${YEAR_FILTER} AND`);
                    }
                }

                ragLog.debug('P3 SQL (sanitized)', plan.query.substring(0, 200));
            }


            ragLog.sqlPlan(
                plan.requiresRetrieval,
                plan.analysisType,
                ms,
                usage.totalTokenCount,
                response.isFallback ? 'Gemini' : 'OpenRouter'
            );

            ragLog.debug('P3 SQL query', plan.query || 'null');

            plan.usage = usage;
            return plan;

        } catch (error) {
            ragLog.error('P3 SQLPlan', error.message);
            return { query: null, requiresRetrieval: false, analysisType: 'none', error: error.message, usage: { totalTokenCount: 0 } };
        }
    }
}

export const sqlGeneratorService = new SqlGeneratorService();
