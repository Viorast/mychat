import { geminiClient } from "../gemini/client";
import { queryExecutor } from "../database/queryExecutor";
// import { schemaService } from "../database/schemaService";
import { vectorSearch } from "./vectorStoreService";

const MAX_RETRIEVED_RECORDS = 50; // Max baris SQL
const MAX_CONTEXT_CHUNKS = 5; // Top K chunks dari vector store
const RERANK_FAILURE_CONTEXT = "Tidak ada konteks skema yang relevan ditemukan.";

class RagLayer {
    constructor (){
        this.gemini = geminiClient;
        this.dbExecutor = queryExecutor;
        // this.schemaProvider = schemaService;
        this.vectorSearch = vectorSearch;
    } 

    /**
     * [BARU] Langkah 1: Retrieval (Context Retrieval)
     * Mengambil K chunk teratas dari vector store berdasarkan query.
     * @param {string} userMessage - Pertanyaan dari pengguna.
     * @returns {Promise<{ success: boolean, results: Array, error?: string }>} Hasil pencarian vektor.
    */
    retrieveContext = async (userMessage) => {
        console.log(`[RAG v1.4] Step 1: Retrieving context for: "${userMessage.substring(0, 50)}..."`);
        try {
            const result = await this.vectorSearch(userMessage, MAX_CONTEXT_CHUNKS);
            return result;
        } catch (error) {
            console.error('[RAG v1.4] Error during context retrieval:', error);
            return { success: false, results: [], error: error.message };
        }
    }

    /**
     * [BARU] Langkah 2: Reranking (Context Reranking)
     * Menggunakan LLM untuk memfilter K chunk menjadi N (N <= K) yang paling relevan.
     * @param {string} userMessage - Pertanyaan dari pengguna.
     * @param {Array} history - Riwayat percakapan.
     * @param {Array} retrievedChunks - Hasil dari retrieveContext.
     * @returns {Promise<string>} Konteks string yang sudah difilter/rerank.
    */
    rerankContext = async (userMessage, history, retrievedChunks) => {
        console.log(`[RAG v1.4] Step 2: Reranking ${retrievedChunks.length} chunks...`);

        if (!retrievedChunks || retrievedChunks.length === 0) {
            return RERANK_FAILURE_CONTEXT;
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
            if (!response.success || !response.text || response.text.trim() === 'KONTEKS_TIDAK_RELEVAN') {
                console.warn('[RAG v1.4] Reranking tidak menemukan konteks relevan.');
                return RERANK_FAILURE_CONTEXT;
            }
            
            console.log(`[RAG v1.4] Reranking berhasil, konteks terpilih (length: ${response.text.length}).`);
            return response.text; // Ini adalah konteks yang sudah di-rerank

        } catch (error) {
            console.error('[RAG v1.4] Error during reranking:', error);
            return RERANK_FAILURE_CONTEXT;
        }
    }

    /**
     * [MODIFIKASI] Langkah 3: Perencanaan Pengambilan Data (Query Planning & Building)
     * Menganalisis pertanyaan pengguna + konteks yang sudah di-rerank.
     * @param {string} userMessage - Pertanyaan dari pengguna.
     * @param {Array} history - Riwayat percakapan.
     * @param {string} rerankedContext - Konteks skema yang sudah difilter.
     * @returns {Promise<{ query: string | null, requiresRetrieval: boolean, analysisType: 'descriptive' | 'diagnostic' | 'none', error?: string }>} Hasil perencanaan.
    */
    generateSQLPlan = async (userMessage, history, rerankedContext) => {
        console.log(`[RAG v1.4] Step 3: Generating SQL plan...`);

        const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');

        // Prompt ini SAMA seperti v1.3, TAPI {schemaInfo.schema} diganti dengan {rerankedContext}
        const planningPrompt = `
        Anda adalah AI Query Planner untuk database **PostgreSQL** dengan skema berikut terkait data jaringan (SDA):
        
        --- SKEMA KONTEKSTUAL YANG RELEVAN (SATU-SATUNYA SUMBER ANDA) ---
        ${rerankedContext}
        --- SKEMA END ---

        Riwayat Percakapan:
        ${historyText}

        Pertanyaan Pengguna: "${userMessage}"

        Tugas Anda:
        1. Tentukan apakah pertanyaan ini memerlukan pengambilan data dari database untuk dijawab (requiresRetrieval: true/false). Fokus HANYA pada skema yang disediakan di atas.
        2. Jika 'requiresRetrieval = true', tentukan jenis analisis: "descriptive" (apa/berapa) atau "diagnostic" (mengapa).
        3. Jika 'requiresRetrieval = true', buat **SATU query SQL SELECT** yang valid untuk PostgreSQL.
           - Gunakan nama tabel dan kolom yang di-quote (contoh: "SDA"."log_absen").
           - Tambahkan 'LIMIT 100' jika hasil bisa terlalu banyak.
        4. Jika tidak (requiresRetrieval: false), set query ke null dan analysisType ke 'none'. Ini terjadi jika pertanyaan bersifat umum, sapaan, atau tentang skema itu sendiri (yang sudah ada di konteks).

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
            const duration = Date.now() - startTime;
            
            // ... (Logika parsing dan validasi JSON dari v1.3) ...
            const usage = response?.fullApiResponse?.usageMetadata;
            if (usage) {
                console.log(`[RAG SQL Plan Tokens] Duration: ${duration}ms, Prompt: ${usage.promptTokenCount}, Total: ${usage.totalTokenCount}`);
            } else {
                console.log(`[RAG SQL Plan] Duration: ${duration}ms.`);
            }

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

            // Validasi output plan
            if (typeof plan.requiresRetrieval !== 'boolean' || !['descriptive', 'diagnostic', 'none'].includes(plan.analysisType)) {
                throw new Error('Invalid plan format from Gemini.');
            }
            if (plan.requiresRetrieval && (typeof plan.query !== 'string' || plan.query.trim() === '')) {
                console.warn('[RAG v1.4] Gemini indicated retrieval needed but provided no valid query. Fallback to non-SQL.');
                plan.query = null;
                plan.requiresRetrieval = false;
                plan.analysisType = 'none';
            }
            if (!plan.requiresRetrieval) {
                plan.query = null;
                plan.analysisType = 'none';
            }

            console.log('[RAG v1.4] Retrieval plan:', plan);
            return plan;

        } catch (error) {
            console.error('[RAG v1.4] Error during query planning:', error);
            return { query: null, requiresRetrieval: false, analysisType: 'none', error: `Failed to plan query: ${error.message}` };
        }
    }

    /**
     * Langkah 4: Mengambil Data (Database Retrieval)
     * (Fungsi ini tidak berubah dari v1.3)
     */
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

    /**
     * Langkah 5: Memformat Data (Data Formatting)
     * (Fungsi ini tidak berubah dari v1.3)
     */
    formatData = (retrievedData) => {
        if (!retrievedData || retrievedData.length === 0) {
            return "Tidak ada data relevan yang ditemukan di database untuk pertanyaan ini.";
        }
        console.log('[RAG v1.4] Step 5: Formatting data for LLM...');
        try {
            let jsonDataString = JSON.stringify(retrievedData, null, 2);
            // ... (Logika pemotongan token jika perlu) ...
            return jsonDataString;
        } catch (error) {
            console.error('[RAG v1.4] Error formatting data:', error);
            return "Terjadi kesalahan internal saat memformat data yang diambil.";
        }
    }

  /**
     * Langkah 6: Menghasilkan Respons Akhir (Response Generation)
     * (Fungsi ini tidak berubah dari v1.3, kecuali nama log)
     */
    generateFinalResponse = async (userMessage, history, formattedData, analysisType, image = null) => {
        console.log(`[RAG v1.4] Step 6: Generating final response. Analysis: ${analysisType}, Has Image: ${!!image}`);
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
        - ${analysisType === 'none' || formattedData.startsWith(RERANK_FAILURE_CONTEXT) ? 'Jika tidak ada data relevan atau pertanyaan tidak memerlukan data, jelaskan hal itu.' : ''}
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
     * [DIROMBAK TOTAL] Orkestrasi Alur RAG Penuh v1.4
     * @param {string} userMessage - Pesan pengguna
     * @param {Array} history - Riwayat pesan
     * @param {object | null} image - Data gambar
     * @returns {Promise<Object>} Hasil dari Gemini (stream atau teks)
     */
    processQuery = async (userMessage, history, image = null) => {
        console.log(`[RAG v1.4] Processing query (hasImage: ${!!image}):`, userMessage.substring(0, 50));

        try {
            // Langkah 1: Retrieval (Ambil K chunks)
            const retrievalResult = await this.retrieveContext(userMessage);
            if (!retrievalResult.success) {
                return this.generateFallbackStream(`Gagal mengambil konteks skema: ${retrievalResult.error}`);
            }

            // Langkah 2: Reranking (Filter K chunks)
            const rerankedContext = await this.rerankContext(userMessage, history, retrievalResult.results);
            // Catatan: Jika reranking gagal, 'rerankedContext' akan berisi pesan error (RERANK_FAILURE_CONTEXT)
            // Kita tetap lanjutkan, karena LLM di langkah 3 & 6 dilatih untuk menanganinya.

            // Langkah 3: Generate SQL Plan (berdasarkan konteks yang di-rerank)
            const sqlPlan = await this.generateSQLPlan(userMessage, history, rerankedContext);
            
            if (sqlPlan.error) {
               return this.generateFallbackStream(sqlPlan.error);
            }

            // Langkah 4: Tentukan Alur (SQL atau Non-SQL)
            if (sqlPlan.requiresRetrieval && sqlPlan.query) {
                // --- ALUR SQL (Membutuhkan data dari DB) ---
                console.log('[RAG v1.4] Alur SQL dieksekusi.');
                
                // Step 5: Retrieve Data (Jalankan SQL)
                const dataResult = await this.retrieveData(sqlPlan.query);
                
                if (!dataResult.success) {
                   const userError = `Maaf, terjadi masalah saat mengambil data: ${dataResult.error}`;
                   return this.generateFallbackStream(userError);
                }

                // Step 6: Format Data (dari SQL)
                const formattedData = this.formatData(dataResult.data);

                // Step 7: Generate Final Response (dengan data SQL)
                return await this.generateFinalResponse(userMessage, history, formattedData, sqlPlan.analysisType, image);

            } else {
                // --- ALUR NON-SQL (General chat, atau pertanyaan tentang skema) ---
                console.log('[RAG v1.4] Alur Non-SQL dieksekusi.');
                
                // Gunakan 'rerankedContext' sebagai data untuk LLM.
                // LLM akan menjawab berdasarkan konteks skema (jika relevan) atau chat biasa.
                return await this.generateFinalResponse(userMessage, history, rerankedContext, "none", image);
            }
        
        } catch (error) {
             console.error('[RAG v1.4] Critical error in processQuery:', error);
             return this.generateFallbackStream(`Terjadi kesalahan kritis pada RAG Layer: ${error.message}`);
        }
    }

  /**
     * Helper untuk membuat stream fallback jika terjadi error
     * (Fungsi ini tidak berubah dari v1.3)
     */
    generateFallbackStream = (errorMessage) => {
      console.error('[RAG v1.4] Generating fallback stream due to error:', errorMessage);
      const fallbackResult = {
         success: true,
         stream: (async function*() {
             yield { text: () => errorMessage || "Terjadi kesalahan yang tidak diketahui." };
         })(),
         isDemo: this.gemini.isDemoMode,
         isError: true
      };
      return fallbackResult;
   }
}

export const ragLayer = new RagLayer();