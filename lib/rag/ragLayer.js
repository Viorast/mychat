import { geminiClient } from "../gemini/client";
import { queryExecutor } from "../database/queryExecutor";
import { vectorSearch } from "./vectorStoreService"; 

const MAX_RETRIEVED_RECORDS = 50;
const MAX_CONTEXT_CHUNKS = 5;
const RERANK_FAILURE_CONTEXT = "Tidak ada konteks skema yang relevan ditemukan.";

class RagLayer {
    constructor (){
        this.gemini = geminiClient;
        this.dbExecutor = queryExecutor;
        this.vectorStoreSearch = vectorSearch;
    } 

    /** 
     * [BARU] Langkah 0: Intent recognition
     */
    classifyIntent = async (userMessage, history) => {
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
            const response = await this.gemini.generateResponse(intentPrompt);
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
     * [BARU] Langkah 2: Reranking
     * ✅ MODIFIKASI: Menambahkan logging token
     */
    rerankContext = async (userMessage, history, retrievedChunks) => {
        console.log(`[RAG v1.4] Step 2: Reranking ${retrievedChunks.length} chunks...`);
        // ... (Fungsi ini tidak berubah, sudah mengembalikan 'usage') ...
        if (!retrievedChunks || retrievedChunks.length === 0) {
            return { context: RERANK_FAILURE_CONTEXT, usage: { totalTokenCount: 0 } };
        }

        const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        
        const chunksText = retrievedChunks.map((chunk, i) => 
        `---
        [Chunk ${i+1}: ${chunk.title}]
        ${chunk.content}
        ---`
        ).join('\n');

        const rerankPrompt = `
        Anda adalah AI Reranker. Tugas Anda adalah menganalisis pertanyaan pengguna dan riwayat chat, lalu memilih HANYA chunk konteks skema yang paling relevan untuk menjawab pertanyaan tersebut.
        PERATURAN PENTING:
        1.  Kembalikan HANYA teks asli (verbatim) dari chunk yang relevan.
        2.  Jika beberapa chunk relevan, gabungkan teks aslinya.
        3.  JANGAN merangkum, mengubah, atau menambahkan komentar Anda sendiri.
        4.  Jika TIDAK ADA chunk yang relevan, kembalikan HANYA string: "KONTEKS_TIDAK_RELEVAN"
        ---
        RIWAYAT PERCAKAPAN:
        ${historyText}
        PERTANYAAN PENGGUNA:
        "${userMessage}"
        ---
        KONTEKS SKEMA YANG DITEMUKAN (PILIH DARI SINI):
        ${chunksText}
        ---
        Teks Asli dari Chunk Relevan (atau "KONTEKS_TIDAK_RELEVAN"):
        `;

        try {
            const response = await this.gemini.generateResponse(rerankPrompt);
            const rerankerUsage = response.usage || { totalTokenCount: 0 };
            
            console.log(`[RAG Tokens] Reranker Usage: ${JSON.stringify(rerankerUsage)}`);

            if (!response.success || !response.text || response.text.trim() === 'KONTEKS_TIDAK_RELEVAN') {
                console.warn('[RAG v1.4] Reranking tidak menemukan konteks relevan.');
                return { context: RERANK_FAILURE_CONTEXT, usage: rerankerUsage };
            }
            
            console.log(`[RAG v1.4] Reranking berhasil, konteks terpilih (length: ${response.text.length}).`);
            return { context: response.text, usage: rerankerUsage };

        } catch (error) {
            console.error('[RAG v1.4] Error during reranking:', error);
            return { context: RERANK_FAILURE_CONTEXT, usage: { totalTokenCount: 0 } };
        }
    }

    /**
     * Langkah 3: Perencanaan SQL
     */
    generateSQLPlan = async (userMessage, history, rerankedContext) => {
        console.log(`[RAG v1.4] Step 3: Generating SQL plan...`);
        // ... (Fungsi ini tidak berubah, sudah mengembalikan 'usage') ...
        const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');

        const planningPrompt = `
        Anda adalah AI Query Planner untuk database **PostgreSQL** dengan skema berikut terkait data jaringan (SDA):
        
        --- SKEMA KONTEKSTUAL YANG RELEVAN (SATU-SATUNYA SUMBER ANDA) ---
        ${rerankedContext}
        --- SKEMA END ---

        Riwayat Percakapan:
        ${historyText}

        Pertanyaan Pengguna: "${userMessage}"

        Tugas Anda:
        1. Tentukan apakah pertanyaan ini memerlukan pengambilan data (requiresRetrieval: true/false). Fokus HANYA pada skema di atas.
        2. Jika 'requiresRetrieval = true', tentukan jenis analisis: "descriptive" (apa/berapa) atau "diagnostic" (mengapa).
        3. Jika 'requiresRetrieval = true', buat **SATU query SQL SELECT** yang valid untuk PostgreSQL.
           - Gunakan nama tabel dan kolom yang di-quote (contoh: "SDA"."log_absen").
           - Tambahkan 'LIMIT 100' jika hasil bisa terlalu banyak.
        4. Jika tidak (requiresRetrieval: false), set query ke null dan analysisType ke 'none'.

        Format Output HARUS JSON murni seperti ini:
        {
            "requiresRetrieval": boolean,
            "analysisType": "descriptive" | "diagnostic" | "none",
            "query": "SQL SELECT query string atau null"
        }
        `;

        try {
            const startTime = Date.now();
            const response = await this.gemini.generateResponse(planningPrompt);
            const planUsage = response.usage || { totalTokenCount: 0 };
            const duration = Date.now() - startTime;
            
            console.log(`[RAG Tokens] SQL Plan Usage (Duration: ${duration}ms): ${JSON.stringify(planUsage)}`);

            if (!response || !response.success || !response.text) {
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

            plan.usage = planUsage;
            
            console.log('[RAG v1.4] Retrieval plan:', {
              requiresRetrieval: plan.requiresRetrieval,
              query: plan.query ? plan.query.substring(0, 60) + '...' : null
            });
            return plan;

        } catch (error) {
            console.error('[RAG v1.4] Error during query planning:', error);
            return { query: null, requiresRetrieval: false, analysisType: 'none', error: `Failed to plan query: ${error.message}`, usage: { totalTokenCount: 0 } };
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
        ? `\nInstruksi Gambar: Pengguna melampirkan gambar. Analisis gambar ini dalam konteks pertanyaan dan data. Jika tidak relevan, abaikan gambar.`
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
        - Sajikan ringkasan data dalam narasi, hindari tabel mentah.
        ${imageInstruction}

        Jawaban Anda (dalam Bahasa Indonesia):
        ---
        SETELAH jawaban utama Anda selesai, buatlah 3 (tiga) saran pertanyaan lanjutan yang relevan.
        Format WAJIB untuk saran adalah seperti ini di bagian paling akhir:

        [SARAN]:
        1. Pertanyaan saran 1
        2. Pertanyaan saran 2
        3. Pertanyaan saran 3
        `;

        try {
            console.log(`[RAG v1.4 Final Response] Starting stream generation.`);
            const result = await this.gemini.generateStream(finalPrompt, null, image);

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
     * [DIROMBAK] Orkestrasi Alur RAG Penuh v1.4
     * ✅ MODIFIKASI: Menambahkan logging intent
     */
    processQuery = async (userMessage, history, image = null) => {
        console.log(`[RAG v1.4] Processing query (hasImage: ${!!image}):`, userMessage.substring(0, 50));

        let totalThoughtTokens = 0;
        let finalRagResult = null;

        try {
            // [BARU] Langkah 0: Klasifikasi Intent
            const intentResult = await this.classifyIntent(userMessage, history);
            const intent = intentResult.classification;
            totalThoughtTokens += intentResult.usage.totalTokenCount; // Akumulasi token "berpikir"
            console.log(`[RAG Intent] Initial classification: ${intent}`);

            // JIKA 'general_conversation', LEWATI SEMUA RAG
            if (intent === "general_conversation") {
                
                console.log("[RAG Intent] Bypassing RAG. Running as General Conversation.");
                finalRagResult = await this.generateFinalResponse(
                    userMessage, 
                    history, 
                    "Tidak ada konteks data yang diperlukan.", // Konteks kosong
                    "none", 
                    image
                );

            } else {
                
                // JIKA 'data_query', JALANKAN ALUR RAG LENGKAP
                console.log("[RAG Intent] Intent is data-related. Proceeding with RAG pipeline.");
                
                // Langkah 1: Retrieval
                const retrievalResult = await this.retrieveContext(userMessage);
                if (!retrievalResult.success) {
                    return this.generateFallbackStream(`Gagal mengambil konteks skema: ${retrievalResult.error}`);
                }

                // Langkah 2: Reranking
                const rerankResult = await this.rerankContext(userMessage, history, retrievalResult.results);
                const rerankedContext = rerankResult.context;
                totalThoughtTokens += rerankResult.usage.totalTokenCount;
                console.log(`[RAG Intent] Reranked Context Found: ${rerankedContext !== RERANK_FAILURE_CONTEXT}`);

                // Langkah 3: Generate SQL Plan
                const sqlPlan = await this.generateSQLPlan(userMessage, history, rerankedContext);
                totalThoughtTokens += sqlPlan.usage.totalTokenCount;
                
                console.log(`[RAG Intent] SQL Plan Decision: ${sqlPlan.requiresRetrieval ? "NEEDS_DATABASE" : "NO_DATABASE_NEEDED"}`);

                if (sqlPlan.error) {
                   return this.generateFallbackStream(sqlPlan.error);
                }

                // Langkah 4: Tentukan Alur (SQL atau Non-SQL)
                if (sqlPlan.requiresRetrieval && sqlPlan.query) {
                    // --- ALUR SQL ---
                    console.log(`[RAG Intent] Executing SQL Query: ${sqlPlan.query}`);
                    const dataResult = await this.retrieveData(sqlPlan.query);
                    if (!dataResult.success) {
                       return this.generateFallbackStream(`Maaf, terjadi masalah saat mengambil data: ${dataResult.error}`);
                    }
                    const formattedData = this.formatData(dataResult.data);
                    finalRagResult = await this.generateFinalResponse(userMessage, history, formattedData, sqlPlan.analysisType, image);

                } else {
                    // --- ALUR NON-SQL (Query tentang skema, atau gambar) ---
                    console.log('[RAG Intent] Bypassing SQL, using RAG context for general answer.');
                    finalRagResult = await this.generateFinalResponse(userMessage, history, rerankedContext, "none", image);
                }
            }
            
            // ✅ Log total "Thought" tokens
            console.log(`[RAG Tokens] Total Thought Tokens: ${totalThoughtTokens}`);

            // ✅ Tambahkan 'totalThoughtTokens' ke hasil agar bisa disimpan di stream
            if (finalRagResult) {
                finalRagResult.totalThoughtTokens = totalThoughtTokens;
            }
            
            return finalRagResult;
        
        } catch (error) {
             console.error('[RAG v1.4] Critical error in processQuery:', error);
             return this.generateFallbackStream(`Terjadi kesalahan kritis pada RAG Layer: ${error.message}`);
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
         stream: (async function*() {
             yield { text: () => errorMessage || "Terjadi kesalahan yang tidak diketahui." };
         })(),
         responsePromise: Promise.resolve(null), 
         totalThoughtTokens: 0, // Tidak ada token "berpikir" jika error
         isDemo: this.gemini.isDemoMode,
         isError: true
      };

      return fallbackResult;
   }
}

export const ragLayer = new RagLayer();