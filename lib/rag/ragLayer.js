import { geminiClient } from "../gemini/client";
import { queryExecutor } from "../database/queryExecutor";
import { schemaService } from "../database/schemaService";

const MAX_RETRIEVED_RECORDS = 50;
const MAX_CONTEXT_TOKENS_ESTIMATE = 800;

class RagLayer {
    constructor (){
        this.gemini = geminiClient;
        this.dbExecutor = queryExecutor;
        this.schemaProvider = schemaService;
    } 

    /**
     * Langkah 1: Merencanakan Pengambilan Data (Query Planning & Building)
     * Menganalisis pertanyaan pengguna dan menghasilkan query SQL jika diperlukan.
     * @param {string} userMessage - Pertanyaan dari pengguna.
     * @param {Array<{role: string, content: string}>} history - Riwayat percakapan sebelumnya.
     * @returns {Promise<{ query: string | null, requiresRetrieval: boolean, analysisType: 'descriptive' | 'diagnostic' | 'none', error?: string }>} Hasil perencanaan.
    */
    planRetrieval = async (userMessage, history) => { // <= Ganti jadi arrow function
        console.log('[RAG] Planning retrieval for:', userMessage.substring(0, 50) + '...');

        const schemaInfo = await this.schemaProvider.getFullSchema();
        if (schemaInfo.isDemo) {
        console.warn('[RAG] Database/Schema in Demo mode, RAG might produce limited results.');
        }

        const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');

        // ... (isi prompt planningPrompt tetap sama) ...
        const planningPrompt = `
        Anda adalah AI Query Planner untuk database PostgreSQL dengan skema berikut terkait data jaringan (SDA):
        --- SCHEMA START ---
        ${schemaInfo.schema}
        --- SCHEMA END ---

        Riwayat Percakapan:
        ${historyText}

        Pertanyaan Pengguna: "${userMessage}"

        Tugas Anda:
        1. Tentukan apakah pertanyaan ini memerlukan pengambilan data dari database untuk dijawab (requiresRetrieval: true/false). Fokus HANYA pada skema "SDA". Abaikan skema 'public' kecuali secara eksplisit diminta relasinya.
        2. Jika ya (requiresRetrieval: true), tentukan jenis analisis yang diminta (analysisType: 'descriptive' untuk 'apa/berapa/distribusi', 'diagnostic' untuk 'mengapa/penyebab').
        3. Jika ya (requiresRetrieval: true), buat SATU query SQL SELECT yang paling relevan dan efisien untuk mendapatkan data yang dibutuhkan dari skema "SDA". Pastikan query aman (hanya SELECT). Batasi jumlah baris yang mungkin diambil jika query bisa menghasilkan sangat banyak data (misal, LIMIT 100). JANGAN membuat query UPDATE, DELETE, INSERT, atau DDL lainnya. Gunakan nama tabel dan kolom yang di-quote dengan benar (contoh: "SDA"."customers").
        4. Jika tidak (requiresRetrieval: false), set query ke null dan analysisType ke 'none'. Ini terjadi jika pertanyaan bersifat umum, sapaan, atau di luar konteks data SDA.

        Format Output HARUS JSON murni seperti ini:
        {
            "requiresRetrieval": boolean,
            "analysisType": "descriptive" | "diagnostic" | "none",
            "query": "SQL SELECT query string atau null"
        }
        `;

        console.log('[RAG] Sending Planning Prompt to Gemini (first 500 chars):', planningPrompt.substring(0, 500) + '...');
        // Jika perlu melihat prompt lengkap (bisa sangat panjang):

        try {
        // Panggil generateResponse (pastikan this.gemini benar)
        const response = await this.gemini.generateResponse(planningPrompt);
        // <<< TAMBAHKAN LOGGING RAW RESPONSE DI SINI >>>
        console.log('[RAG] Raw Gemini Planning Response:', JSON.stringify(response, null, 2));
        // <<< AKHIR LOGGING RAW RESPONSE >>>

        const finishReason = response?.fullApiResponse?.candidates?.[0]?.finishReason;
        const safetyRatings = response?.fullApiResponse?.promptFeedback?.safetyRatings;
        if (safetyRatings && safetyRatings.some(rating => rating.blocked)) {
            console.error('[RAG] Gemini response likely blocked by safety filters:', safetyRatings);
            throw new Error('Gemini response blocked due to safety settings.');
        }

        // Tangani MAX_TOKENS secara eksplisit
        if (finishReason === "MAX_TOKENS") {
            console.error('[RAG] Gemini berhenti karena MAX_TOKENS sebelum menyelesaikan rencana JSON.');
            throw new Error('Gagal merencanakan query: Respons AI terlalu panjang dan terpotong.'); // Pesan lebih jelas
        }
        // Lanjutkan pemeriksaan success dan text (jika tidak diblokir)
        if (!response || !response.success || typeof response.text !== 'string' /* Izinkan string kosong jika tidak diblokir */) {
        console.error('[RAG] Gemini planning response failed validation or blocked without clear feedback:', response);
        throw new Error('Gemini query planning failed, returned invalid response, or was potentially blocked.');
        }

        // PENTING: Handle kasus text benar-benar kosong setelah melewati cek safety
        if (response.text === "") {
            console.warn('[RAG] Gemini returned success but empty text, potentially due to prompt issue or model inability.');
            // Anda bisa memutuskan untuk throw error atau mencoba lagi/fallback di sini.
            // Untuk sekarang, kita anggap ini sebagai kegagalan plan.
            throw new Error('Gemini query planning returned empty text.');
        }

        // if (!response || !response.success || !response.text) {
        //     throw new Error('Gemini query planning failed or returned empty response.');
        // }

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
            console.warn('[RAG] Invalid plan format received:', plan);
            throw new Error('Invalid plan format from Gemini.');
        }
        if (plan.requiresRetrieval && (typeof plan.query !== 'string' || plan.query.trim() === '')) {
            console.warn('[RAG] Gemini indicated retrieval needed but provided no valid query.');
            plan.query = null;
            plan.requiresRetrieval = false;
            plan.analysisType = 'none';
        }
        if (!plan.requiresRetrieval) {
            plan.query = null;
            plan.analysisType = 'none';
        }

        console.log('[RAG] Retrieval plan:', plan);
        return plan;

        } catch (error) {
        console.error('[RAG] Error during query planning:', error);
        return { query: null, requiresRetrieval: false, analysisType: 'none', error: `Failed to plan query: ${error.message}` };
        }
    }

    /**
   * Langkah 2: Mengambil Data (Database Retrieval)
   * Menjalankan query SQL yang dihasilkan ke database.
   * @param {string} sqlQuery - Query SQL SELECT.
   * @returns {Promise<Object>} Object berisi { success: boolean, data: Array | null, error: string | null }
   */
    retrieveData = async (sqlQuery) => { // <= Ganti jadi arrow function
        if (!sqlQuery) {
        return { success: false, data: null, error: 'No query provided for retrieval.' };
        }
        console.log('[RAG] Retrieving data with query:', sqlQuery);

        // Gunakan this.dbExecutor (pastikan this benar)
        const validation = this.dbExecutor.validateQuery(sqlQuery);
        if (!validation.valid) {
        console.error('[RAG] Invalid query detected before execution:', validation.error);
        return { success: false, data: null, error: `Invalid query detected: ${validation.error}` };
        }

        try {
        const result = await this.dbExecutor.executeQuery(sqlQuery);

        if (!result.success) {
            console.error('[RAG] Database query execution failed:', result.error);
            return { success: false, data: null, error: result.error };
        }

        console.log(`[RAG] Retrieved ${result.rowCount} records.`);
        const limitedData = result.rows.slice(0, MAX_RETRIEVED_RECORDS);
        if (result.rowCount > MAX_RETRIEVED_RECORDS) {
            console.warn(`[RAG] Retrieved data truncated to ${MAX_RETRIEVED_RECORDS} records.`);
        }

        return { success: true, data: limitedData, error: null };

        } catch (error) {
        console.error('[RAG] Exception during data retrieval:', error);
        return { success: false, data: null, error: `Database execution failed: ${error.message}` };
        }
    }

  /**
   * Langkah 3: Memformat Data (Data Formatting)
   * Mengubah data hasil query menjadi format string yang cocok untuk LLM.
   * @param {Array | null} retrievedData - Array objek hasil query.
   * @returns {string} String representasi data (misal, JSON string) atau pesan 'tidak ada data'.
   */
    formatData = (retrievedData) => { // <= Ganti jadi arrow function
        if (!retrievedData || retrievedData.length === 0) {
        return "Tidak ada data relevan yang ditemukan di database untuk pertanyaan ini.";
        }

        try {
        let jsonDataString = JSON.stringify(retrievedData, null, 2);

        const estimatedChars = MAX_CONTEXT_TOKENS_ESTIMATE * 4;
        if (jsonDataString.length > estimatedChars) {
            console.warn(`[RAG] Retrieved data (${jsonDataString.length} chars) likely exceeds token limit, truncating.`);
            const truncatedData = retrievedData.slice(0, 5);
            jsonDataString = JSON.stringify(truncatedData, null, 2) + `\n... (data truncated, ${retrievedData.length} total records found)`;
        }

        console.log('[RAG] Formatted data for LLM:', jsonDataString.substring(0, 150) + '...');
        return jsonDataString;

        } catch (error) {
        console.error('[RAG] Error formatting data:', error);
        return "Terjadi kesalahan internal saat memformat data yang diambil.";
        }
    }

  /**
   * Langkah 4: Menghasilkan Respons Akhir (Response Generation)
   * Mengirim prompt asli + data yang diambil ke Gemini untuk jawaban akhir.
   * @param {string} userMessage - Pertanyaan asli pengguna.
   * @param {Array} history - Riwayat percakapan.
   * @param {string} formattedData - Data yang sudah diformat dari database.
   * @param {string} analysisType - Jenis analisis ('descriptive' atau 'diagnostic').
   * @returns {Promise<Object>} Hasil dari geminiClient.generateStream atau generateResponse
   */
    generateFinalResponse = async (userMessage, history, formattedData, analysisType) => { // <= Ganti jadi arrow function
        console.log('[RAG] Generating final response. Analysis type:', analysisType);
        const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');

        // ... (isi prompt finalPrompt tetap sama) ...
        const finalPrompt = `
        Anda adalah TMA Chat, AI Assistant yang fokus pada data jaringan di skema "SDA". Anda HARUS menjawab berdasarkan data KONTESKTUAL yang disediakan.
        Jawablah dengan sopan, profesional, dalam bahasa Indonesia, dan relevan dengan riwayat percakapan.

        Riwayat Percakapan Sebelumnya:
        ${historyText}

        Pertanyaan Pengguna Saat Ini: "${userMessage}"

        Data Relevan yang Diambil dari Database (Skema SDA):
        --- DATA START ---
        ${formattedData}
        --- DATA END ---

        Instruksi Spesifik:
        - Jawab pertanyaan pengguna HANYA berdasarkan data yang disediakan di atas dan riwayat percakapan. JANGAN mengarang informasi atau menggunakan pengetahuan umum di luar data ini. Jika data tidak ada atau tidak cukup, sampaikan itu.
        - ${analysisType === 'descriptive' ? 'Berikan jawaban deskriptif yang merangkum data (misalnya jumlah total, rata-rata, ringkasan distribusi, poin-poin penting).' : ''}
        - ${analysisType === 'diagnostic' ? 'Berikan analisis diagnostik. Coba identifikasi pola, korelasi, atau kemungkinan penyebab berdasarkan data yang ada untuk menjawab pertanyaan "mengapa". Jika data tidak cukup untuk membuat kesimpulan diagnostik, nyatakan keterbatasan tersebut.' : ''}
        - ${analysisType === 'none' || formattedData.startsWith("Tidak ada data") ? 'Jika tidak ada data relevan atau pertanyaan tidak memerlukan data, jelaskan hal itu kepada pengguna. Jika pertanyaan bersifat umum atau sapaan, jawablah dengan sopan.' : ''}
        - JANGAN menyebutkan istilah teknis backend seperti "query SQL", "database", "JSON", "record", "tabel" kepada pengguna. Gunakan istilah seperti "data", "informasi", "catatan".
        - Jika data berbentuk daftar/tabel, sajikan ringkasannya dalam bentuk narasi atau poin-poin utama. Hindari hanya mengembalikan daftar data mentah.

        Jawaban Anda (dalam Bahasa Indonesia):
        `;

        try {
        // Gunakan this.gemini (pastikan this benar)
        const result = await this.gemini.generateStream(finalPrompt);
        if (!result || !result.success) {
            throw new Error(result.error || 'Gemini stream generation failed.');
        }
        console.log('[RAG] Streaming final response from Gemini.');
        return result;

        } catch (error) {
        console.error('[RAG] Error generating final response:', error);
        // Gunakan this.generateFallbackStream (pastikan this benar)
        return this.generateFallbackStream(`Maaf, saya gagal menyusun jawaban akhir: ${error.message}`);
        }
    }

  /**
  * Orkestrasi Alur RAG Penuh
  * @param {string} userMessage - Pesan pengguna
  * @param {Array} history - Riwayat pesan [{role: 'user' | 'assistant', content: string}]
  * @returns {Promise<Object>} Hasil dari Gemini (stream atau teks)
  */
    processQuery = async (userMessage, history) => { // <= Ganti jadi arrow function
        // 1. Plan Retrieval (panggil metode arrow function)
        const plan = await this.planRetrieval(userMessage, history); // 'this' akan benar

        if (plan.error) {
        return this.generateFallbackStream(plan.error); // 'this' akan benar
        }

        let formattedData = "Informasi ini tidak memerlukan pengambilan data tambahan.";
        let retrievalAttempted = false;
        let retrievalError = null;
        let analysisType = plan.analysisType; // Simpan analysisType dari plan

        if (plan.requiresRetrieval && plan.query) {
        retrievalAttempted = true;
        // 2. Retrieve Data (panggil metode arrow function)
        const retrievalResult = await this.retrieveData(plan.query); // 'this' akan benar

        if (!retrievalResult.success) {
            retrievalError = retrievalResult.error || "Gagal mengambil data dari sumber.";
            formattedData = `Gagal mengambil data yang relevan: ${retrievalError}`;
            console.warn('[RAG] Data retrieval failed:', retrievalError);
        } else {
            // 3. Format Data (panggil metode arrow function)
            formattedData = this.formatData(retrievalResult.data); // 'this' akan benar
        }
        }

        // 4. Generate Final Response
        if (retrievalAttempted && retrievalError) {
            console.log('[RAG] Generating response about retrieval failure.');
            const failurePrompt = `
                Anda adalah TMA Chat. Pengguna bertanya: "${userMessage}".
                Terjadi masalah saat mencoba mengambil data yang relevan dari sumber informasi: "${retrievalError}".
                Sampaikan kepada pengguna dengan sopan dalam Bahasa Indonesia bahwa Anda tidak dapat mengambil data yang diperlukan saat ini karena ada kendala teknis, dan sarankan untuk mencoba lagi nanti atau menanyakan hal lain. Jangan sebutkan detail teknis errornya.
            `;
            try {
                // Gunakan this.gemini (pastikan this benar)
                const result = await this.gemini.generateStream(failurePrompt);
                return {...result, isError: true};
            } catch (genError) {
                console.error('[RAG] Error generating failure response:', genError);
                // Gunakan this.generateFallbackStream (pastikan this benar)
                return this.generateFallbackStream("Maaf, terjadi kesalahan saat mengambil data dan saat mencoba memberitahu Anda tentangnya.");
            }

        } else if (plan.requiresRetrieval || analysisType !== 'none') {
            // Panggil metode arrow function
            return await this.generateFinalResponse(userMessage, history, formattedData, analysisType); // 'this' akan benar
        } else {
        console.log('[RAG] No retrieval needed, generating direct response.');
        const directPrompt = `
            Anda adalah TMA Chat, AI Assistant yang sopan dan profesional. Fokus utama Anda adalah data jaringan dalam skema "SDA".
            Riwayat Percakapan:
            ${history.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

            Pertanyaan Pengguna Saat Ini: "${userMessage}"

            Jawab pertanyaan pengguna secara langsung dalam bahasa Indonesia. Jika pertanyaan berada di luar konteks data jaringan (SDA) atau bersifat terlalu umum/tidak relevan, tolak dengan sopan atau minta klarifikasi.
            Jawaban Anda:
        `;
        try {
            // Gunakan this.gemini (pastikan this benar)
            const result = await this.gemini.generateStream(directPrompt);
            if (!result || !result.success) {
                    throw new Error(result.error || 'Gemini direct stream generation failed.');
            }
            return result;
        } catch (error) {
            console.error('[RAG] Error generating direct response:', error);
            // Gunakan this.generateFallbackStream (pastikan this benar)
            return this.generateFallbackStream(`Maaf, terjadi kesalahan saat memproses permintaan Anda: ${error.message}`);
        }
        }
    }

  /**
   * Helper untuk membuat stream fallback jika terjadi error
   */
    generateFallbackStream = (errorMessage) => { // <= Ganti jadi arrow function
      console.error('[RAG] Generating fallback stream due to error:', errorMessage);
      const fallbackResult = {
         success: true,
         stream: (async function*() {
             // Pastikan yield setidaknya satu chunk
             yield { text: () => errorMessage || "Terjadi kesalahan yang tidak diketahui." };
         })(),
         isDemo: this.gemini.isDemoMode, // 'this' akan benar
         isError: true
      };
      return fallbackResult;
   }
}

export const ragLayer = new RagLayer();