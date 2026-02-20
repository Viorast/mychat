import { openRouterClient } from "../../ai/openrouter-client.js";

export class SqlGeneratorService {
    constructor(aiClient = openRouterClient) {
        this.aiClient = aiClient;
    }

    /**
     * Langkah 3: Perencanaan SQL
     */
    async generateSQLPlan(userMessage, history, rerankedContext) {
        console.log(`[RAG v1.4] Step 3: Generating SQL plan...`);

        const historyText = history.slice(-2).map(msg => `${msg.role}: ${msg.content.slice(0, 100)}`).join('\n');

        console.log('\n[RAG SQL PLAN] ========== START ==========');
        console.log('[RAG SQL PLAN] Question:', userMessage);

        // Safety check for rerankedContext length
        if (!rerankedContext) {
            console.warn('[RAG SQL PLAN] No reranked context provided, skipping SQL generation.');
            return {
                query: null,
                requiresRetrieval: false,
                analysisType: 'none',
                usage: { totalTokenCount: 0 }
            };
        }

        console.log('[RAG SQL PLAN] Context length:', rerankedContext.length, 'chars');
        console.log('[RAG SQL PLAN] Context preview:', rerankedContext.substring(0, 200) + '...');

        //✅ ENHANCED: Step-by-step with negation handling
        const planningPrompt = `
You are SQL Query Planner for PostgreSQL database "SDA".

=== AVAILABLE SCHEMA (YOUR ONLY SOURCE) ===
${rerankedContext}
=== END SCHEMA ===

CONVERSATION HISTORY:
${historyText}

USER QUESTION: "${userMessage}"

YOUR TASK (Step-by-step):

STEP 1: Determine if database query needed
- Question about SDA data (employees, tickets, attendance, locations)? → requiresRetrieval = TRUE
- General chat or greeting? → requiresRetrieval = FALSE
- When uncertain → prefer TRUE

STEP 2: Classification
- "What/How many" questions → "descriptive"
- "Why/What caused" questions → "diagnostic"
- "Will/Predict/Forecast" questions → "predictive"
- "Recommend/Suggest" questions:
  * If asking for data-driven advice (e.g. "Employee performance") → "recommendation" (requiresRetrieval = TRUE)
  * If asking for policy/SOP → "none" (requiresRetrieval = FALSE)

STEP 3: Generate Query (IF NEEDED)

!!! CRITICAL SCHEMA RULES (THIS IS MANDATORY) !!!
1. SCHEMA NAME: Always use schema "SDA". Example: "SDA"."log_absen"
2. ALLOWED TABLES ONLY:
   - "SDA"."log_absen" (Attendance)
   - "SDA"."m_ticket" (Work Tickets)
   - "SDA"."nossa_closed" (Customer Complaints/Nossa)
3. DO NOT INVENT TABLES. If user asks for "karyawan" table, use "log_absen" or "m_ticket" depending on context.
4. NO JOINS ALLOWED between these tables. They are non-relational.
   - WRONG: JOIN SDA.log_absen ON SDA.m_ticket
   - RIGHT: Query single table relevant to question.

SQL SYNTAX RULES:
- Use PostgreSQL syntax
- Always LIMIT 100
- Use ILIKE for text search
- Use aliases for clarity

OUTPUT (JSON only, no explanations):
{
  "requiresRetrieval": true/false,
  "analysisType": "descriptive"/"diagnostic"/"predictive"/"recommendation"/"none",
  "query": "SELECT ... FROM \"SDA\".\"table_name\" ... LIMIT 100" (or null)
}

`;

        try {
            const startTime = Date.now();
            const response = await this.aiClient.generateResponse(planningPrompt);
            const planUsage = response.usage || { totalTokenCount: 0 };
            const duration = Date.now() - startTime;

            console.log(`[RAG Tokens] SQL Plan Usage (Duration: ${duration}ms): ${JSON.stringify(planUsage)}`);

            console.log('[RAG SQL PLAN] AI Response Success:', response.success);
            console.log('[RAG SQL PLAN] Raw Response:', response.text?.substring(0, 300));

            if (!response || !response.success || !response.text) {
                console.error('[RAG SQL PLAN] Error:', response.error);
                throw new Error('Gemini query planning failed or returned empty response.');
            }

            const jsonMatch = response.text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No valid JSON object found in Gemini planning response.');
            }

            let plan;
            try {
                plan = JSON.parse(jsonMatch[0]);
            } catch (parseError) {
                throw new Error(`Failed to parse JSON from Gemini planning response: ${parseError.message}`);
            }

            // Validasi plan
            if (typeof plan.requiresRetrieval !== 'boolean' || !['descriptive', 'diagnostic', 'predictive', 'recommendation', 'none'].includes(plan.analysisType)) {
                throw new Error('Invalid plan format from Gemini.');
            }
            if (plan.requiresRetrieval && (typeof plan.query !== 'string' || plan.query.trim() === '')) {
                plan.query = null;
                plan.requiresRetrieval = false;
                plan.analysisType = 'none';
            }
            if (!plan.requiresRetrieval) {
                plan.query = null;
                plan.analysisType = 'none';
            }

            console.log('[RAG SQL PLAN] Parsed Plan:');
            console.log('  - requiresRetrieval:', plan.requiresRetrieval);
            console.log('  - analysisType:', plan.analysisType);
            console.log('  - query:', plan.query ? plan.query.substring(0, 80) + '...' : 'null');

            // 🔍 DEBUG: Log generated SQL
            if (process.env.RAG_DEBUG === 'true' && plan.query) {
                console.log('[RAG DEBUG] === Generated SQL ===');
                console.log(plan.query);
                console.log('[RAG DEBUG] === End SQL ===');
            }

            // ✅ SMART FALLBACK: Override bad decisions for obvious SDA queries
            if (!plan.requiresRetrieval) {
                const question = userMessage.toLowerCase();
                const sdaKeywords = [
                    'karyawan', 'pegawai', 'employee', 'staff',
                    'absen', 'check in', 'check-in', 'hadir', 'kehadiran',
                    'tiket', 'ticket', 'incident', 'request',
                    'lokasi', 'location', 'tempat',
                    'waktu', 'time', 'jam', 'tanggal', 'hari',
                    'pola', 'pattern', 'trend', 'analisis', 'analysis',
                    'jumlah', 'berapa', 'count', 'total',
                    'terlambat', 'tepat waktu'
                ];

                // Don't override for policy/knowledge queries
                const policyKeywords = ['kebijakan', 'policy', 'perusahaan', 'company', 'sop', 'aturan', 'peraturan'];
                const isPolicyQuery = policyKeywords.some(kw => question.includes(kw));

                const hasSDAKeyword = !isPolicyQuery && sdaKeywords.some(kw => question.includes(kw));

                if (hasSDAKeyword) {
                    console.warn('[RAG FALLBACK] ⚠️  Model said NO retrieval, but question has SDA keywords');
                    console.warn('[RAG FALLBACK] Overriding to requiresRetrieval = TRUE');

                    plan.requiresRetrieval = true;
                    plan.analysisType = 'descriptive';

                    if (!plan.query || plan.query === 'null') {
                        console.warn('[RAG FALLBACK] No query provided, using generic SDA query');
                        plan.query = 'SELECT * FROM "SDA"."log_absen" ORDER BY tgl DESC LIMIT 100';
                    }
                }
            }

            // ✅ FIX: Auto-correct SQL queries with missing quotes
            if (plan.query && plan.requiresRetrieval) {
                const originalQuery = plan.query;

                // Fix: SDA.tablename → "SDA"."tablename"
                plan.query = plan.query.replace(/\bSDA\.(\w+)/g, '"SDA"."$1"');

                if (originalQuery !== plan.query) {
                    console.log(`[SQL Auto-Fix] Corrected query quotes`);
                    console.log(`  Before: ${originalQuery.substring(0, 100)}...`);
                    console.log(`  After:  ${plan.query.substring(0, 100)}...`);
                }
            }

            plan.usage = planUsage;

            console.log('[RAG v1.4] Retrieval plan:', {
                requiresRetrieval: plan.requiresRetrieval,
                query: plan.query ? plan.query.substring(0, 60) + '...' : null
            });
            return plan;

        } catch (error) {
            console.error('[RAG v1.4] Error during query planning:', error);

            // Provide user-friendly error messages
            let userMessage = 'Terjadi kesalahan saat memproses permintaan Anda.';

            if (error.message.includes('empty response') || error.message.includes('rate limit')) {
                userMessage = 'Sistem sedang sibuk. Silakan tunggu beberapa saat dan coba lagi.';
            } else if (error.message.includes('failed') || error.message.includes('planning')) {
                userMessage = 'Maaf, saya kesulitan memahami permintaan Anda. Coba jelaskan dengan cara yang berbeda.';
            }

            return {
                query: null,
                requiresRetrieval: false,
                analysisType: 'none',
                error: userMessage,
                technicalError: error.message, // For logging
                usage: { totalTokenCount: 0 }
            };
        }
    }
}

export const sqlGeneratorService = new SqlGeneratorService();
