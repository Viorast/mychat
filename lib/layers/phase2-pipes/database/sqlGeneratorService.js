import { aiRouter } from "../../../ai/ai-router.js";
import { ragLog } from "../../../monitoring/ragLogger.js";
import { settingsService } from "../../../services/settingsService.js";


const MAX_HISTORY_CHARS = 200;  // Batasi history di prompt
const MAX_CONTEXT_CHARS = 1800; // ✅ FIX: Kurangi token (sebelumnya 3500 → 4494 tok, sekarang target ~1500 tok)

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

        // Baca context DB aktif dari settings
        const activeCtx = await settingsService.getSetting('active_database_context') || 'SDA';
        const isDVO = activeCtx === 'DVO';

        // ✅ FIX: Truncate history and context to control token count
        const historyText = history
            .slice(-2)
            .map(m => `${m.role}: ${m.content.slice(0, 120)}`)
            .join('\n')
            .slice(0, MAX_HISTORY_CHARS);

        const schemaContext = rerankedContext.slice(0, MAX_CONTEXT_CHARS);
        ragLog.debug('P3 SQLPlan context', `${schemaContext.length} chars (ctx: ${activeCtx})`);

        // ─── Prompt SDA ───────────────────────────────────────────────────────────
        const SDA_PROMPT = `You are a SQL Query Planner for PostgreSQL schema "SDA".

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

!!! CRITICAL DATA RULES !!!
- jenis_absen: ALWAYS ILIKE '%CHECK IN%' (never exact match)
- tanggal_absen: Data HANYA 2025. JANGAN pakai NOW()/CURRENT_DATE
  GUNAKAN: EXTRACT(YEAR FROM tanggal_absen) = 2025

STEP 1 — Needs DB? SDA data question → requiresRetrieval: true. Greeting/policy → false
STEP 2 — Type: descriptive | diagnostic | predictive | recommendation | none
STEP 3 — Write query if needed

OUTPUT (JSON only):
{"requiresRetrieval": true/false, "analysisType": "...", "query": "SELECT ... LIMIT 100" or null}`;

        // ─── Prompt DVO ───────────────────────────────────────────────────────────
        const DVO_PROMPT = `You are a SQL Query Planner for PostgreSQL schema "DVO".

=== GUARANTEED COLUMN LIST (ALWAYS USE THESE, DO NOT INVENT OTHERS) ===
Table "DVO"."v_inventory_wmsl" columns:
  ap_name, order_id, mac_address, loc_id, name_site, onair_date,
  latitude, longitude, STATUS, sid, location, name_sold, sn,
  status_ont, regional, witel, sto, skema_bisnis, contr_name,
  item_description, kategori

KEY FACTS about v_inventory_wmsl:
- Column STATUS: values are exactly 'Up' or 'Down' (capital first letter)
  → WHERE status = 'Down'   ← to filter offline/mati AP
  → WHERE status = 'Up'     ← to filter active AP
- Column latitude/longitude: varchar, CAST to NUMERIC if needed
- Column location: full address text (NOT a coordinate)
- DO NOT infer status from coordinates — status IS a real column

Table "DVO"."vowner_traffic_202510" columns:
  periode, ap_name, location, regional, witel, kota, jumlah_hit,
  jumlah_vol, jumlah_client, duration, ssid, order_id, sn,
  mac_address, onair_date, sid, partner_id, vowner_id, customer,
  idx, paket, user_type
=== END GUARANTEED COLUMNS ===

=== ADDITIONAL SCHEMA CONTEXT (from retrieval) ===
${schemaContext}
=== END SCHEMA ===

HISTORY:
${historyText}

QUESTION: "${userMessage}"

RULES:
1. SCHEMA: Always prefix tables with "DVO". Example: "DVO"."v_inventory_wmsl"
2. ALLOWED TABLES ONLY:
   - "DVO"."v_inventory_wmsl"        → Inventory Access Point (AP), status Up/Down, lokasi, witel
   - "DVO"."vowner_traffic_202510"   → Trafik Wi-Fi pengunjung Oktober 2025
3. JOINS: Join kedua tabel via: t.ap_name = inv.ap_name (atau sn, order_id)
4. PostgreSQL syntax, always LIMIT 100
5. status column: 'Up' or 'Down' (case-sensitive, capital U/D only)
6. onair_date/periode: string YYYYMMDD → TO_DATE(col, 'YYYYMMDD') for date ops
7. Use ILIKE for text search on varchar columns

!!! CRITICAL RULES !!!
- status = 'Down' (BUKAN 'DOWN' atau 'down')
- JANGAN gunakan NOW()/CURRENT_DATE → gunakan filter string periode/onair_date
- LIMIT wajib ada, max 100
- JANGAN PERNAH mengasumsikan status dari latitude/longitude — gunakan kolom STATUS langsung!

!!! COLUMN NAME MAPPING — NO HALLUCINATION !!!
FORBIDDEN column names (DO NOT USE): lokasi, koordinat, alamat, posisi, lon, lat, location_name
Map user keywords to REAL column names:
- "lokasi"/"tempat"/"alamat"       → column: location  (full address text)
- "koordinat"/"titik"/"peta"/"gps" → column: latitude, longitude (CAST to NUMERIC if needed)
- "nama site"/"nama lokasi"        → column: name_site
- "status"/"aktif"/"mati"/"down"/"up"/"online"/"offline" → column: status (values: 'Up' or 'Down' ONLY)
- "tipe perangkat"/"merk"/"model"  → column: item_description

!!! SQL HINT — Query AP Down dengan koordinat !!!
SELECT ap_name, status, witel, regional, latitude, longitude, location
FROM "DVO"."v_inventory_wmsl"
WHERE status = 'Down'
  AND latitude IS NOT NULL AND latitude <> ''
LIMIT 100;

STEP 1 — Needs DB?
- Query tentang AP, inventory, trafik, status, witel, regional → requiresRetrieval: true
- Greeting/policy/general → requiresRetrieval: false
STEP 2 — Type: descriptive | diagnostic | predictive | recommendation | none
STEP 3 — Write SQL query if needed

OUTPUT (JSON only):
{"requiresRetrieval": true/false, "analysisType": "...", "query": "SELECT ... LIMIT 100" or null}`;


        const planningPrompt = isDVO ? DVO_PROMPT : SDA_PROMPT;


        try {
            const t0 = Date.now();
            this.aiClient.setStep?.('SQLPlan');
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

            // ✅ Smart fallback: override jika ada keywords data yang jelas
            if (!plan.requiresRetrieval) {
                const q = userMessage.toLowerCase();

                if (isDVO) {
                    // DVO keywords: AP, trafik, status, witel, dll
                    const dvoKw = ['ap', 'access point', 'status', 'up', 'down', 'trafik', 'traffic',
                        'witel', 'regional', 'inventory', 'ap_name', 'v_inventory', 'vowner',
                        'mac', 'lokasi', 'hit', 'client', 'klien', 'periode', 'sn', 'serial'];
                    const hasDVO = dvoKw.some(k => q.includes(k));

                    if (hasDVO) {
                        ragLog.warn('P3 SQLPlan', 'Override: DVO keywords found, forcing requiresRetrieval=true');
                        plan.requiresRetrieval = true;
                        plan.analysisType = plan.analysisType === 'none' ? 'descriptive' : plan.analysisType;
                        if (!plan.query) {
                            plan.query = 'SELECT ap_name, status, witel, regional FROM "DVO"."v_inventory_wmsl" WHERE status = \'Down\' LIMIT 100';
                        }
                    }
                } else {
                    // SDA keywords
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
            }

            if (plan.query) {
                // Auto-fix 0: Hapus semicolon di tengah query
                plan.query = plan.query.replace(/;\s*(LIMIT|ORDER|OFFSET|FETCH)/gi, ' $1');

                // Auto-fix 1: Missing quotes: SDA.tablename → "SDA"."tablename"
                plan.query = plan.query.replace(/\bSDA\.(\w+)/g, '"SDA"."$1"');

                if (isDVO) {
                    // Auto-fix DVO: ganti SDA. prefix → DVO. jika AI salah gunakan SDA
                    plan.query = plan.query.replace(/\bSDA\.(\w+)/g, 'DVO.$1');
                    plan.query = plan.query.replace(/"SDA"\."(\w+)"/g, '"DVO"."$1"');
                    // Tambahkan quote yang benar: DVO.tablename → "DVO"."tablename"
                    plan.query = plan.query.replace(/\bDVO\.(\w+)/g, '"DVO"."$1"');
                    // status harus 'Up' atau 'Down' (bukan uppercase penuh)
                    plan.query = plan.query.replace(/status\s*=\s*'DOWN'/gi, "status = 'Down'");
                    plan.query = plan.query.replace(/status\s*=\s*'UP'/gi, "status = 'Up'");
                } else {
                    // Auto-fix SDA: jenis_absen exact → ILIKE
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

                    // Auto-fix SDA: NOW() / CURRENT_DATE → EXTRACT(YEAR=2025)
                    const hasNow = /NOW\(\)|CURRENT_DATE|CURRENT_TIMESTAMP/i.test(plan.query);
                    if (hasNow) {
                        ragLog.warn('P3 SQLPlan', 'Auto-fix: NOW()/CURRENT_DATE → EXTRACT(YEAR=2025)');
                        const YEAR_FILTER = 'EXTRACT(YEAR FROM tanggal_absen) = 2025';
                        plan.query = plan.query.replace(
                            /\w+\s*(?:>=|<=|>|<|=)\s*\(?\s*(?:NOW\(\)|CURRENT_DATE|CURRENT_TIMESTAMP)\s*(?:-\s*INTERVAL\s*'[^']*')?\s*\)?/gi,
                            YEAR_FILTER
                        );
                        if (!plan.query.includes('EXTRACT(YEAR')) {
                            plan.query = plan.query.replace(/\bWHERE\b/i, `WHERE ${YEAR_FILTER} AND`);
                        }
                    }
                }

                // Auto-fix final: Hapus semicolon di akhir
                plan.query = plan.query.replace(/;\s*$/, '').trim();
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
