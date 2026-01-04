import { openRouterClient } from "../ai/openrouter-client";
import { queryExecutor } from "../database/queryExecutor";
import { vectorSearch } from "./vectorStoreService";

// ✅ PHASE 1 & 2 OPTIMIZATIONS: Import optimized modules
import { classifyIntent as classifyIntentOptimized, getIntentConfidence } from "./optimizedIntentClassifier.js";
import { rerankContextOptimized } from "./optimizedReranker.js";
import { queryCache } from "../cache/queryCache.js";
import { metrics } from "../monitoring/performanceMetrics.js";

const MAX_RETRIEVED_RECORDS = 50;
const MAX_CONTEXT_CHUNKS = 10; // ✅ ACCURACY FIX: Increased from 5 to 10 for better schema coverage
const RERANK_FAILURE_CONTEXT = "Tidak ada konteks skema yang relevan ditemukan.";

// ✅ Feature flags for optimizations (can be disabled via .env)
const USE_OPTIMIZED_INTENT = process.env.USE_OPTIMIZED_INTENT !== 'false'; // Default: true
const USE_OPTIMIZED_RERANKING = process.env.USE_OPTIMIZED_RERANKING !== 'false'; // Default: true
const ENABLE_QUERY_CACHE = process.env.ENABLE_QUERY_CACHE !== 'false'; // Default: true
const ENABLE_METRICS = process.env.ENABLE_METRICS !== 'false'; // Default: true
const MAX_HISTORY_MESSAGES = 6; // ✅ 3 user + 3 AI messages

class RagLayer {
    constructor() {
        this.aiClient = openRouterClient;
        this.dbExecutor = queryExecutor;
        this.vectorStoreSearch = vectorSearch;
    }

    /** 
     * ✅ OPTIMIZED: Langkah 0: Intent recognition with rules-based approach
     */
    classifyIntent = async (userMessage, history) => {
        // Use optimized rules-based classification (saves ~300 tokens, ~12 seconds)
        if (USE_OPTIMIZED_INTENT) {
            const classification = classifyIntentOptimized(userMessage);
            const confidence = getIntentConfidence(userMessage);
            console.log(`[RAG Intent] ✅ Optimized classification: ${classification} (confidence: ${confidence.toFixed(2)}, 0ms, 0 tokens)`);
            return {
                classification,
                usage: { totalTokenCount: 0 }
            };
        }

        // Fallback to LLM-based classification (original code)
        console.log(`[RAG Intent] ⚠️  Using LLM-based classification (optimization disabled)`);
        const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');

        const intentPrompt = `
            Tugas: Klasifikasikan intent pengguna berdasarkan percakapan terakhir.
            Jawab HANYA dengan salah satu dari dua kategori ini:

            1.  "general_conversation": Untuk sapaan, salam perpisahan, ucapan terima kasih, atau obrolan umum yang tidak terkait dengan data atau gambar.
            2.  "data_query": Untuk pertanyaan spesifik tentang data, skema, analisis, kueri, atau permintaan untuk menjelaskan gambar.

            ---
            Riwayat Percakapan (Singkat):
            ${historyText.slice(-500)}

            ---
            Input Pengguna Terakhir:
            "${userMessage}"

            ---
            Klasifikasi (satu kata):
            `;

        try {
            const response = await this.aiClient.generateResponse(intentPrompt);
            const usage = response.usage || { totalTokenCount: 0 };

            // ✅ LOG: Token untuk "Intent Classification" (Langkah Pikiran 0)
            console.log(`[RAG Tokens] Intent Classification Usage: ${JSON.stringify(usage)}`);

            let classification = "general_conversation"; // Default
            if (response.success && response.text) {
                const cleanedText = response.text.trim().toLowerCase();
                if (cleanedText.includes("data_query")) {
                    classification = "data_query";
                }
            }

            return { classification, usage };

        } catch (error) {
            console.error('[RAG v1.4] Error during Intent Classification:', error);
            // Jika klasifikasi gagal, anggap saja sebagai data_query agar RAG tetap berjalan
            return { classification: "data_query", usage: { totalTokenCount: 0 } };
        }
    }

    /**
     * [BARU] Langkah 1: Retrieval
     */
    retrieveContext = async (userMessage) => {
        console.log(`[RAG v1.4] Step 1: Retrieving context for: "${userMessage.substring(0, 50)}..."`);
        // ... (Fungsi ini tidak berubah) ...
        try {
            const result = await this.vectorStoreSearch(userMessage, MAX_CONTEXT_CHUNKS);
            return result;
        } catch (error) {
            console.error('[RAG v1.4] Error during context retrieval:', error);
            return { success: false, results: [], error: error.message };
        }
    }

    /**
     * Langkah 2: Reranking Context dengan LLM
     * Menggunakan AI untuk memilih chunks paling relevan dan preserve verbatim
     */
    rerankContext = async (userMessage, history, retrievedChunks) => {
        console.log(`[RAG v1.4] Step 2: Reranking ${retrievedChunks.length} chunks with LLM...`);

        if (!retrievedChunks || retrievedChunks.length === 0) {
            return "Tidak ada konteks skema yang relevan ditemukan.";
        }

        // Fallback to score-based if too few chunks
        if (retrievedChunks.length <= 2) {
            console.log('[RAG] Too few chunks, using all');
            return retrievedChunks.map(c => c.content).join('\n---\n');
        }

        const historyText = history.slice(-2).map(msg => `${msg.role}: ${msg.content.slice(0, 100)}`).join('\n');

        // Build chunks text with clear separators
        const chunksText = retrievedChunks.map((chunk, i) =>
            `---
[Chunk ${i + 1}${chunk.title ? ': ' + chunk.title : ''}]
${chunk.content}
---`
        ).join('\n');

        const rerankPrompt = `
You are an AI Reranker. Your task: Select MOST RELEVANT schema chunks for the question.

CRITICAL RULES:
1. Return VERBATIM text from relevant chunks (exact copy, no changes)
2. If multiple chunks relevant, combine their full text
3. NO summarization, NO paraphrasing, NO modifications
4. If NOTHING relevant, return exactly: "NO_RELEVANT_CONTEXT"

CONVERSATION HISTORY:
${historyText}

USER QUESTION: "${userMessage}"

AVAILABLE SCHEMA CHUNKS:
${chunksText}

Verbatim Text from Relevant Chunks (or "NO_RELEVANT_CONTEXT"):
`;

        try {
            const startTime = Date.now();
            const response = await this.aiClient.generateResponse(rerankPrompt);
            const duration = Date.now() - startTime;

            console.log(`[RAG Reranking] Duration: ${duration}ms, Success: ${response.success}`);

            if (!response.success) {
                console.warn('[RAG] LLM reranking failed, using score-based fallback');
                // Fallback to all chunks
                return retrievedChunks.map(c => c.content).join('\n---\n');
            }

            const rerankedText = response.text.trim();

            if (rerankedText === 'NO_RELEVANT_CONTEXT' || rerankedText.includes('NO_RELEVANT_CONTEXT')) {
                console.warn('[RAG] Reranker found no relevant context');
                return "Tidak ada konteks skema yang relevan ditemukan.";
            }

            console.log(`[RAG] ✅ Reranking successful, context length: ${rerankedText.length} chars`);
            return rerankedText;

        } catch (error) {
            console.error('[RAG] Reranking error:', error);
            // Fallback to score-based
            console.warn('[RAG] Using score-based fallback');
            return retrievedChunks
                .sort((a, b) => (b.score || 0) - (a.score || 0))
                .slice(0, MAX_CONTEXT_CHUNKS)
                .map(c => c.content)
                .join('\n---\n');
        }
    }

    /**
     * Langkah 3: Perencanaan SQL
     */
    generateSQLPlan = async (userMessage, history, rerankedContext) => {
        console.log(`[RAG v1.4] Step 3: Generating SQL plan...`);
        // ... (Fungsi ini tidak berubah, sudah mengembalikan 'usage') ...
        const historyText = history.slice(-2).map(msg => `${msg.role}: ${msg.content.slice(0, 100)}`).join('\n');

        console.log('\n[RAG SQL PLAN] ========== START ==========');
        console.log('[RAG SQL PLAN] Question:', userMessage);
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
  "analysisType": "descriptive"/"diagnostic"/"none",
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
            if (typeof plan.requiresRetrieval !== 'boolean' || !['descriptive', 'diagnostic', 'none'].includes(plan.analysisType)) {
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
                    'data', 'informasi', 'laporan', 'terlambat', 'tepat waktu'
                ];

                const hasSDAKeyword = sdaKeywords.some(kw => question.includes(kw));

                if (hasSDAKeyword) {
                    console.warn('[RAG FALLBACK] ⚠️  Model said NO retrieval, but question has SDA keywords');
                    console.warn('[RAG FALLBACK] Overriding to requiresRetrieval = TRUE');

                    plan.requiresRetrieval = true;
                    plan.analysisType = 'descriptive';

                    if (!plan.query || plan.query === 'null') {
                        console.warn('[RAG FALLBACK] No query provided, using generic SDA query');
                        plan.query = 'SELECT * FROM "SDA"."log_absen" ORDER BY created_at DESC LIMIT 100';
                    }
                }
            }

            // ✅ FIX: Auto-correct SQL queries with missing quotes
            if (plan.query && plan.requiresRetrieval) {
                const originalQuery = plan.query;

                // Fix: SDA.tablename → "SDA"."tablename"
                plan.query = plan.query.replace(/\bSDA\.(\w+)/g, '"SDA"."$1"');

                // Fix: FROM tablename → FROM "SDA"."tablename" (if schema not specified)
                // This is a fallback for extreme cases

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

    // ... (retrieveData dan formatData tetap sama) ...
    retrieveData = async (sqlQuery) => {
        if (!sqlQuery) {
            return { success: false, data: null, error: 'No query provided for retrieval.' };
        }
        console.log('[RAG v1.4] Step 4: Retrieving data with query:', sqlQuery);
        const validation = this.dbExecutor.validateQuery(sqlQuery);
        if (!validation.valid) {
            console.error('[RAG v1.4] Invalid query detected:', validation.error);
            return { success: false, data: null, error: `Invalid query detected: ${validation.error}` };
        }
        try {
            const result = await this.dbExecutor.executeQuery(sqlQuery);
            if (!result.success) {
                console.error('[RAG v1.4] Database query failed:', result.error);
                return { success: false, data: null, error: result.error };
            }
            console.log(`[RAG v1.4] Retrieved ${result.rowCount} records.`);
            const limitedData = result.rows.slice(0, MAX_RETRIEVED_RECORDS);
            return { success: true, data: limitedData, error: null };
        } catch (error) {
            console.error('[RAG v1.4] Exception during data retrieval:', error);
            return { success: false, data: null, error: `Database execution failed: ${error.message}` };
        }
    }
    formatData = (retrievedData) => {
        if (!retrievedData || retrievedData.length === 0) {
            return "Tidak ada data relevan yang ditemukan di database untuk pertanyaan ini.";
        }
        console.log('[RAG v1.4] Step 5: Formatting data for LLM...');
        try {
            let jsonDataString = JSON.stringify(retrievedData, null, 2);
            return jsonDataString;
        } catch (error) {
            console.error('[RAG v1.4] Error formatting data:', error);
            return "Terjadi kesalahan internal saat memformat data yang diambil.";
        }
    }

    /**
     * Langkah 6: Menghasilkan Respons Akhir (Response Generation)
     * ✅ MODIFIKASI: Sekarang mengembalikan 'responsePromise' dari client
     */
    generateFinalResponse = async (userMessage, history, formattedData, analysisType, image = null) => {
        console.log(`[RAG v1.4] Step 6: Generating final response. Analysis: ${analysisType}, Has Image: ${!!image}`);
        // ... (Fungsi ini tidak berubah, sudah mengembalikan 'result' penuh) ...
        const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');

        const imageInstruction = image
            ? `\n📊 INSTRUKSI GAMBAR CHART SDA:
        Pengguna melampirkan gambar (kemungkinan chart/grafik berisi data SDA).
        
        Analisis chart dengan fokus pada:
        1. Jenis visualisasi (pie chart, bar chart, line chart, dll)
        2. Kategori data yang ditampilkan (karyawan, tiket, absensi, lokasi, dll)
        3. Insight atau pattern yang terlihat dari visualisasi
        4. Hubungkan dengan KONTEKS DATA yang tersedia dari database
        5. Berikan rekomendasi atau observasi berdasarkan visualisasi
        
        Jika gambar bukan chart atau tidak relevan dengan SDA, jelaskan dengan sopan.`
            : '';

        const finalPrompt = `
        Anda adalah TMA Chat, AI Assistant yang fokus pada data jaringan di skema "SDA". Jawab berdasarkan KONTEKS DATA yang disediakan dan gambar (jika ada).
        Jawab sopan, profesional, dalam bahasa Indonesia.

        Riwayat Percakapan:
        ${historyText}

        Pertanyaan Pengguna: "${userMessage}" ${image ? '(Disertai Gambar)' : ''}

        --- KONTEKS DATA START ---
        ${formattedData}
        --- KONTEKS DATA END ---

        Instruksi Spesifik:
        - Jawab pertanyaan pengguna HANYA berdasarkan KONTEKS DATA, riwayat, dan gambar.
        - ${analysisType === 'descriptive' ? 'Berikan jawaban deskriptif yang merangkum data.' : ''}
        - ${analysisType === 'diagnostic' ? 'Berikan analisis diagnostik, coba jelaskan penyebab/pola dari data.' : ''}
        - ${analysisType === 'none' || formattedData.startsWith(RERANK_FAILURE_CONTEXT) || formattedData.startsWith("Tidak ada data") ? 'Jika tidak ada data relevan atau pertanyaan tidak memerlukan data, jelaskan hal itu.' : ''}
        - JANGAN menyebutkan istilah teknis (SQL, database, JSON).
        
        FORMAT JAWABAN (WAJIB DIIKUTI):
        - Untuk PENJELASAN atau KALIMAT BIASA, gunakan paragraf normal tanpa simbol apapun
        - Untuk DAFTAR ITEM, DATA, atau POIN-POIN, gunakan bullet points (•) atau numbered list (1. 2. 3.)
        - JANGAN gunakan simbol asterisk (*) atau markdown apapun
        - Akhiri dengan kesimpulan dalam paragraf singkat
        
        DATA VISUALIZATION (CHART/GRAFIK):
        HANYA jika user SECARA EKSPLISIT meminta "chart", "grafik", "visualisasi", "plot", atau istilah sejenis, barulah buat chart.
        JANGAN buat chart jika user hanya bertanya data biasa (misal: "tampilkan data tiket", "berapa jumlah karyawan").
        
        Jika user meminta visualisasi:
        
        Format CHART (pilih tipe yang sesuai: bar/line/pie):
        [CHART:bar]
        {"title": "Judul Chart", "data": [{"name": "Label1", "value": 10}, {"name": "Label2", "value": 20}]}
        [/CHART]
        
        Gunakan:
        • bar - untuk perbandingan kategori
        • pie - untuk distribusi/proporsi (persentase)
        • line - untuk trend waktu
        
        DATA TABLE (Gunakan jika user meminta tabel atau data tabular):
        [TABLE]
        {"title": "Judul Tabel", "columns": ["Kolom1", "Kolom2"], "rows": [["nilai1", "nilai2"]]}
        [/TABLE]
        
        Contoh format TANPA chart:
        
        Berdasarkan data yang tersedia, berikut adalah rata-rata durasi per jenis tiket:
        
        • Tipe 2 (Change): 5.42 jam - paling lama
        • Tipe 3 (Explorasi): 4.07 jam
        • Tipe 1 (Incident): 1.89 jam - paling cepat
        
        Kesimpulan: Tiket change membutuhkan waktu paling lama.
        ${imageInstruction}

        Jawaban Anda (dalam Bahasa Indonesia):
        ---
        SETELAH jawaban utama, buatlah 3 saran pertanyaan SUPER SINGKAT (3-6 kata).
        
        KATEGORI:
        1. Deepening (Lanjutan)
        2. Insight (Perkaya)
        3. Pivot (Sudut pandang lain)
        
        CONTOH FORMAT (Wajib ditiru pendeknya):
        [SARAN]:
        1. Tren tiket bulan depan?
        2. Karyawan paling rajin?
        3. Perbandingan Q1 dan Q2?

        Format WAJIB output Anda (di akhir):

        [SARAN]:
        1. [Pertanyaan 3-6 kata]
        2. [Pertanyaan 3-6 kata]
        3. [Pertanyaan 3-6 kata]
        `;

        try {
            console.log(`[RAG v1.4 Final Response] Starting stream generation.`);
            const result = await this.aiClient.generateStream(finalPrompt, null, image);

            if (!result || !result.success) {
                throw new Error(result.error || 'Gemini stream generation failed.');
            }
            return result;
        } catch (error) {
            console.error('[RAG v1.4] Error generating final response:', error);
            return this.generateFallbackStream(`Maaf, saya gagal menyusun jawaban akhir: ${error.message}`);
        }
    }

    /**
     * ✅ OPTIMIZED: Orkestrasi Alur RAG Penuh v1.5 with Cache & Metrics
     */
    processQuery = async (userMessage, history, image = null) => {
        const startTime = Date.now();
        let totalThoughtTokens = 0;
        let finalRagResult = null;
        let wasCached = false;
        let hasError = false;

        const stepTimings = {
            intentClassification: 0,
            retrieval: 0,
            reranking: 0,
            sqlPlanning: 0,
            sqlExecution: 0,
            finalResponse: 0
        };

        console.log(`[RAG v1.5] Processing query (hasImage: ${!!image}):`, userMessage.substring(0, 50));

        // ✅ PHASE 2: Try cache first (only for non-image queries)
        if (ENABLE_QUERY_CACHE && !image) {
            const cacheKey = queryCache.getCacheKey(userMessage);
            const cached = queryCache.get(cacheKey);

            if (cached) {
                wasCached = true;
                console.log('[RAG v1.5] ✅ Using cached result');

                // Record metrics for cache hit
                if (ENABLE_METRICS) {
                    const duration = Date.now() - startTime;
                    metrics.recordQuery({
                        duration,
                        tokens: 0, // Cached, no tokens used
                        cached: true,
                        error: false,
                        stepTimings: {}
                    });
                }

                return cached;
            }
        }

        // ✅ PHASE 2: Limit history to last 6 messages (3 user + 3 AI)
        const limitedHistory = history.slice(-MAX_HISTORY_MESSAGES);
        console.log(`[RAG v1.5] Using ${limitedHistory.length}/${history.length} history messages (limited to ${MAX_HISTORY_MESSAGES})`);

        try {
            // [BARU] Langkah 0: Klasifikasi Intent
            const intentStart = Date.now();
            const intentResult = await this.classifyIntent(userMessage, limitedHistory);
            stepTimings.intentClassification = Date.now() - intentStart;

            const intent = intentResult.classification;
            totalThoughtTokens += intentResult.usage.totalTokenCount; // Akumulasi token "berpikir"
            console.log(`[RAG Intent] Initial classification: ${intent}`);

            // JIKA 'general_conversation', LEWATI SEMUA RAG
            if (intent === "general_conversation") {

                console.log("[RAG Intent] Bypassing RAG. Running as General Conversation.");
                const responseStart = Date.now();
                finalRagResult = await this.generateFinalResponse(
                    userMessage,
                    limitedHistory,
                    "Tidak ada konteks data yang diperlukan.", // Konteks kosong
                    "none",
                    image
                );
                stepTimings.finalResponse = Date.now() - responseStart;

            } else {

                // JIKA 'data_query', JALANKAN ALUR RAG LENGKAP
                console.log("[RAG Intent] Intent is data-related. Proceeding with RAG pipeline.");

                // Langkah 1: Retrieval
                const retrievalStart = Date.now();
                const retrievalResult = await this.retrieveContext(userMessage);
                stepTimings.retrieval = Date.now() - retrievalStart;

                if (!retrievalResult.success) {
                    return this.generateFallbackStream(`Gagal mengambil konteks skema: ${retrievalResult.error}`);
                }

                // 🔍 DEBUG: Log retrieved chunks
                if (process.env.RAG_DEBUG === 'true') {
                    console.log('[RAG DEBUG] Retrieved Chunks:', retrievalResult.results.length);
                    console.log('[RAG DEBUG] Retrieved Content Length:',
                        retrievalResult.results.reduce((sum, r) => sum + r.content.length, 0)
                    );
                }

                // Langkah 2: Reranking (now returns string directly)
                const rerankStart = Date.now();
                const rerankedContext = await this.rerankContext(userMessage, limitedHistory, retrievalResult.results);
                stepTimings.reranking = Date.now() - rerankStart;

                console.log(`[RAG Intent] Reranked Context Found: ${rerankedContext !== RERANK_FAILURE_CONTEXT}`);

                // 🔍 DEBUG: Log reranked context details
                if (process.env.RAG_DEBUG === 'true') {
                    console.log('[RAG DEBUG] Reranked Context Length:', rerankedContext.length);
                    console.log('[RAG DEBUG] Context Preview:', rerankedContext.substring(0, 500));
                    const tableMatches = rerankedContext.match(/"SDA"\."\w+"/g) || [];
                    console.log('[RAG DEBUG] Tables in Context:', [...new Set(tableMatches)].slice(0, 15));
                    const retrievedTotal = retrievalResult.results.reduce((s, r) => s + r.content.length, 0);
                    const ratio = retrievedTotal > 0 ? ((rerankedContext.length / retrievedTotal) * 100).toFixed(1) : '0';
                    console.log('[RAG DEBUG] Context Retention Ratio:', ratio + '%');
                }

                // Langkah 3: Generate SQL Plan
                const sqlPlanStart = Date.now();
                const sqlPlan = await this.generateSQLPlan(userMessage, limitedHistory, rerankedContext);
                stepTimings.sqlPlanning = Date.now() - sqlPlanStart;

                totalThoughtTokens += sqlPlan.usage.totalTokenCount;

                console.log(`[RAG Intent] SQL Plan Decision: ${sqlPlan.requiresRetrieval ? "NEEDS_DATABASE" : "NO_DATABASE_NEEDED"}`);

                if (sqlPlan.error) {
                    return this.generateFallbackStream(sqlPlan.error);
                }

                // Langkah 4: Tentukan Alur (SQL atau Non-SQL)
                if (sqlPlan.requiresRetrieval && sqlPlan.query) {
                    // --- ALUR SQL ---
                    console.log(`[RAG Intent] Executing SQL Query: ${sqlPlan.query}`);
                    const sqlExecStart = Date.now();
                    const dataResult = await this.retrieveData(sqlPlan.query);
                    stepTimings.sqlExecution = Date.now() - sqlExecStart;

                    if (!dataResult.success) {
                        return this.generateFallbackStream(`Maaf, terjadi masalah saat mengambil data: ${dataResult.error}`);
                    }
                    const formattedData = this.formatData(dataResult.data);

                    const responseStart = Date.now();
                    finalRagResult = await this.generateFinalResponse(userMessage, limitedHistory, formattedData, sqlPlan.analysisType, image);
                    stepTimings.finalResponse = Date.now() - responseStart;

                } else {
                    // --- ALUR NON-SQL (Query tentang skema, atau gambar) ---
                    console.log('[RAG Intent] Bypassing SQL, using RAG context for general answer.');
                    const responseStart = Date.now();
                    finalRagResult = await this.generateFinalResponse(userMessage, limitedHistory, rerankedContext, "none", image);
                    stepTimings.finalResponse = Date.now() - responseStart;
                }
            }

            // ✅ Log total "Thought" tokens
            console.log(`[RAG Tokens] Total Thought Tokens: ${totalThoughtTokens}`);

            // ✅ Tambahkan 'totalThoughtTokens' ke hasil agar bisa disimpan di stream
            if (finalRagResult) {
                finalRagResult.totalThoughtTokens = totalThoughtTokens;
            }

            // ✅ PHASE 2: Cache the result (only for successful non-image queries)
            if (ENABLE_QUERY_CACHE && !image && finalRagResult && finalRagResult.success) {
                const cacheKey = queryCache.getCacheKey(userMessage);
                queryCache.set(cacheKey, finalRagResult);
            }

            return finalRagResult;

        } catch (error) {
            hasError = true;
            console.error('[RAG v1.5] Critical error in processQuery:', error);
            return this.generateFallbackStream(`Terjadi kesalahan kritis pada RAG Layer: ${error.message}`);
        } finally {
            // ✅ PHASE 2: Record metrics
            if (ENABLE_METRICS) {
                const duration = Date.now() - startTime;
                metrics.recordQuery({
                    duration,
                    tokens: totalThoughtTokens,
                    cached: wasCached,
                    error: hasError,
                    stepTimings
                });

                // Log report every 10 queries
                if (metrics.totalQueries % 10 === 0) {
                    console.log('\n' + metrics.getReport() + '\n');
                } else {
                    // Log compact summary
                    console.log(metrics.getSummary());
                }
            }
        }
    }

    /**
     * Helper Fallback Stream
     * ✅ MODIFIKASI: Mengembalikan 'responsePromise' palsu
     */
    generateFallbackStream = (errorMessage) => {
        console.error('[RAG v1.4] Generating fallback stream due to error:', errorMessage);
        const fallbackResult = {
            success: true,
            stream: (async function* () {
                yield { text: () => errorMessage || "Terjadi kesalahan yang tidak diketahui." };
            })(),
            responsePromise: Promise.resolve(null),
            totalThoughtTokens: 0, // Tidak ada token "berpikir" jika error
            isDemo: this.aiClient.isDemoMode,
            isError: true
        };

        return fallbackResult;
    }
}

export const ragLayer = new RagLayer();