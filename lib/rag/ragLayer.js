import { geminiClient } from "../gemini/client";
import { queryExecutor } from "../database/queryExecutor";
import { schemaService } from "../database/schemaService";

const MAX_RETRIEVED_RECORDS = 50;
const MAX_CONTEXT_TOKENS_ESTIMATE = 1024;

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
    planRetrieval = async (userMessage, history, image = null) => { // <= Tambah parameter image
        console.log(`[RAG] Planning retrieval for message (hasImage: ${!!image}):`, userMessage.substring(0, 50) + '...');

        // Untuk saat ini, kita asumsikan gambar TIDAK memengaruhi query planning SQL.
        // Jika perlu analisis gambar untuk query, bagian ini perlu diubah signifikan.
            const schemaInfo = await this.schemaProvider.getFullSchema();
            if (schemaInfo.isDemo) {
            console.warn('[RAG] Database/Schema in Demo mode, RAG might produce limited results.');
            }

            const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');

            // ... (isi prompt planningPrompt tetap sama) ...
            const planningPrompt = `
            Anda adalah AI Query Planner untuk database **PostgreSQL** dengan skema berikut terkait data jaringan (SDA):
            --- SCHEMA START ---
                - **PERHATIAN PENTING PADA TIPE DATA:**
                    - Jika Anda perlu menggunakan fungsi 'MOD' atau operator '%', pastikan kedua argumen adalah tipe integer.
                    - Jika salah satu argumen adalah tipe 'numeric', 'decimal', 'real', atau 'double precision', Anda **HARUS** melakukan casting ke integer menggunakan '::integer' HANYA JIKA konversi ini masuk akal secara logika untuk perhitungan. Contoh benar: 'MOD(kolom_numeric::integer, 5)' atau 'kolom_float::integer % 2'.
                    - Gunakan nama tabel dan kolom yang di-quote dengan benar (contoh: "SDA"."customers").
                    - Batasi jumlah baris hasil jika query berpotensi menghasilkan data sangat banyak (gunakan 'LIMIT 50' jika sesuai konteks).
                    - Gunakan satuan yang mudah dipahami pengguna akhir — misalnya ubah '0.28 hari' menjadi '6 jam 43 menit'.
                    - Pastikan query selalu **aman dan efisien** — hanya gunakan 'SELECT', tidak boleh 'INSERT', 'UPDATE', 'DELETE', atau 'DDL'.
                    - Gunakan fungsi-fungsi bawaan PostgreSQL, seperti:
                    - 'TO_CHAR(date, 'Month')', 'EXTRACT(YEAR FROM ...)', 'DATE_TRUNC('month', ...)'
                    - 'ILIKE' untuk pencarian tidak sensitif terhadap huruf besar kecil.
                    - 'COALESCE()' untuk menangani nilai 'NULL'.
                    - 'DISTINCT ON (column)' untuk hasil unik berdasarkan kolom tertentu.

            ${schemaInfo.schema}
            --- SCHEMA END ---

            Riwayat Percakapan:
            ${historyText}

            Pertanyaan Pengguna: "${userMessage}"

            Tugas Anda:
            1. Tentukan apakah pertanyaan ini memerlukan pengambilan data dari database untuk dijawab (requiresRetrieval: true/false). Fokus HANYA pada skema "SDA". Abaikan skema 'public' kecuali secara eksplisit diminta relasinya.
            2. Jika 'requiresRetrieval = true', tentukan jenis analisis yang diminta pengguna:
                - Gunakan '"descriptive"' jika pertanyaan bersifat “apa”, “berapa”, “kapan”, atau “distribusi”.
                - Gunakan '"diagnostic"' jika pertanyaan bersifat “mengapa” atau “penyebab”.
            3. Jika 'requiresRetrieval = true', buat **SATU query SQL SELECT** yang paling relevan dan efisien untuk mendapatkan data yang dibutuhkan dari skema "SDA".
                - Pastikan query valid untuk **PostgreSQL** (tidak menghasilkan error sintaks atau aturan engine).
                - Gunakan nama tabel dan kolom dengan tanda kutip ganda ('"SDA"."nama_tabel"').
                - Jika ada potensi error PostgreSQL (misalnya 'SELECT DISTINCT' dengan 'ORDER BY' yang tidak ada di SELECT list), **gunakan 'DISTINCT ON'** atau perbaiki sintaks agar tetap valid.
                - Jangan gunakan perintah non-SELECT (seperti 'UPDATE', 'DELETE', 'INSERT', 'CREATE', dll).
                - Tambahkan 'LIMIT 100' jika hasil bisa terlalu banyak.
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
            const startTime = Date.now(); // Catat waktu mulai
            const response = await this.gemini.generateResponse(planningPrompt);
            const duration = Date.now() - startTime; // Hitung durasi
            console.log('[RAG] Raw Gemini Planning Response:', JSON.stringify(response, null, 2));
            // <<< AKHIR LOGGING RAW RESPONSE >>>

            const usage = response?.fullApiResponse?.usageMetadata;
            if (usage) {
                console.log(`[RAG Planning Tokens] Duration: ${duration}ms, Prompt: ${usage.promptTokenCount}, Candidates: ${usage.candidatesTokenCount}, Total: ${usage.totalTokenCount}`);
            } else {
                console.log(`[RAG Planning] Duration: ${duration}ms. Token usage metadata not available.`);
            }

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
   generateFinalResponse = async (userMessage, history, formattedData, analysisType, image = null) => { // <= Tambah parameter image
        console.log(`[RAG] Generating final response. Analysis type: ${analysisType}, Has Image: ${!!image}`);
        const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');

        const imageInstruction = image
        ? `\nInstruksi Tambahan Mengenai Gambar:
            - Pengguna juga melampirkan sebuah gambar.
            - Analisis gambar tersebut dalam konteks pertanyaan dan data yang ada.
            - Jika gambar relevan, gunakan informasinya untuk memperkaya jawabanmu.
            - Jika gambar TIDAK relevan (misalnya topik lain, tidak terkait data), nyatakan dengan sopan bahwa gambar tidak terkait dan fokus pada teks/data saja. Setelah itu, berikan 1-2 contoh pertanyaan relevan.`
        : '';

        const finalPrompt = `
        Anda adalah TMA Chat, AI Assistant yang fokus pada data jaringan di skema "SDA". Anda HARUS menjawab berdasarkan data KONTESKTUAL yang disediakan dan gambar (jika ada).
        Jawablah dengan sopan, profesional, dalam bahasa Indonesia, dan relevan dengan riwayat percakapan.

        Riwayat Percakapan Sebelumnya:
        ${historyText}

        Pertanyaan/Input Pengguna Saat Ini: "${userMessage}" ${image ? '(Disertai Gambar)' : ''}

        Data Relevan yang Diambil dari Database (Skema SDA):
        --- DATA START ---
        ${formattedData}
        --- DATA END ---

        Instruksi Spesifik:
        - Jawab pertanyaan pengguna HANYA berdasarkan data yang disediakan, riwayat percakapan, dan gambar (jika relevan). JANGAN mengarang informasi.
        - ${analysisType === 'descriptive' ? 'Berikan jawaban deskriptif yang merangkum data.' : ''}
        - ${analysisType === 'diagnostic' ? 'Berikan analisis diagnostik, coba jelaskan penyebab/pola dari data.' : ''}
        - ${analysisType === 'none' || formattedData.startsWith("Tidak ada data") ? 'Jika tidak ada data relevan atau pertanyaan tidak memerlukan data, jelaskan hal itu.' : ''}
        - JANGAN menyebutkan istilah teknis backend (SQL, database, JSON, dll.).
        - Sajikan ringkasan data dalam narasi atau poin, hindari tabel mentah.
        ${imageInstruction}

        Jawaban Anda (dalam Bahasa Indonesia):
        ---
        SETELAH jawaban utama Anda selesai, buatlah 3 (tiga) saran pertanyaan lanjutan yang relevan dan dapat dijawab oleh data.
        Format WAJIB untuk saran adalah seperti ini di bagian paling akhir:

        [SARAN]:
        1. Pertanyaan saran 1
        2. Pertanyaan saran 2
        3. Pertanyaan saran 3
        `;

        try {
            // --- LOG SEBELUM STREAMING RESPONSE ---
            console.log(`[RAG Final Response] Starting stream generation. Prompt length (approx chars): ${finalPrompt.length}`);
            // --- AKHIR LOG ---
            const startTime = Date.now(); // Catat waktu mulai stream
            const result = await this.gemini.generateStream(finalPrompt, null, image);
            // Durasi stream hanya bisa diukur setelah selesai, jadi tidak dilog di sini

            if (!result || !result.success) {
                throw new Error(result.error || 'Gemini stream generation failed.');
            }
            console.log('[RAG] Streaming final response from Gemini.');
            // Kita tidak mendapatkan token count dari stream API secara langsung di sini
            return result;
        } catch (error) {
        console.error('[RAG] Error generating final response:', error);
        return this.generateFallbackStream(`Maaf, saya gagal menyusun jawaban akhir: ${error.message}`);
        }
    }

  /**
  * Orkestrasi Alur RAG Penuh
  * @param {string} userMessage - Pesan pengguna
  * @param {Array} history - Riwayat pesan [{role: 'user' | 'assistant', content: string}]
  * @returns {Promise<Object>} Hasil dari Gemini (stream atau teks)
  */
  processQuery = async (userMessage, history, image = null) => { // <= Tambah parameter image
    // 1. Plan Retrieval (teruskan image, meskipun mungkin belum digunakan di sini)
    const plan = await this.planRetrieval(userMessage, history, image);

    if (plan.error) {
       return this.generateFallbackStream(plan.error);
    }

    if (plan.requiresRetrieval && plan.query) {
      // --- Alur RAG (Retrieval Diperlukan) ---
      console.log('[RAG] Retrieval required, proceeding with RAG flow.');
      let formattedData;
      let retrievalError = null;

      // 2a. Retrieve Data
      const retrievalResult = await this.retrieveData(plan.query);

      if (!retrievalResult.success) {
          retrievalError = retrievalResult.error || "Gagal mengambil data dari sumber.";
          formattedData = `Gagal mengambil data yang relevan: ${retrievalError}`; // Info untuk LLM jika kita tetap lanjut
          console.warn('[RAG] Data retrieval failed:', retrievalError);

          // Jika retrieval gagal, langsung fallback ke pesan error, jangan panggil LLM lagi
          const userFriendlyError = `Maaf, terjadi masalah saat mencoba mengambil informasi yang Anda minta (${retrievalError}). Silakan coba lagi nanti.`;
          return this.generateFallbackStream(userFriendlyError);

      } else {
          // 2b. Format Data
          formattedData = this.formatData(retrievalResult.data);
      }

      // 2c. Generate Final Response dengan data + gambar (jika ada)
      return await this.generateFinalResponse(userMessage, history, formattedData, plan.analysisType, image);

    } else {
      // --- Alur Non-RAG (Retrieval TIDAK Diperlukan) ---
      // Ini mencakup: pertanyaan umum, analisis gambar saja, atau pertanyaan meta-skema
      console.log('[RAG] No retrieval needed, generating direct response (potentially multimodal).');

      const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      const imageInstruction = image
        ? `\nInstruksi Tambahan Mengenai Gambar:
           - Pengguna melampirkan sebuah gambar. Analisis gambar ini dalam menjawab pertanyaan.
           - Jika gambar tidak relevan dengan pertanyaan, nyatakan itu dan jawab pertanyaannya saja (jika ada teks). Berikan juga saran pertanyaan relevan tentang data SDA.`
        : '';

      // Prompt yang lebih sederhana, fokus pada pertanyaan/gambar saat ini
      const directPrompt = `
          Anda adalah TMA Chat, AI Assistant yang sopan dan profesional. Fokus utama Anda adalah data dalam skema "SDA", tetapi Anda juga bisa menganalisis gambar atau menjawab pertanyaan umum jika relevan.

          Riwayat Percakapan Sebelumnya:
          ${historyText}

          Pertanyaan/Input Pengguna Saat Ini: "${userMessage}" ${image ? '(Disertai Gambar)' : ''}

          Instruksi:
          - Jawab pertanyaan pengguna secara langsung dalam bahasa Indonesia.
          - Jika ada gambar, analisis gambar tersebut sesuai permintaan pengguna. ${imageInstruction}
          - Jika pertanyaan di luar konteks data jaringan (SDA) dan tidak terkait gambar yang diberikan, tolak dengan sopan atau minta klarifikasi, dan berikan contoh pertanyaan terkait data SDA.

          Jawaban Anda:
      `;

      try {
          // Panggil generateStream langsung dengan teks dan gambar (jika ada)
          const result = await this.gemini.generateStream(directPrompt, null, image); // null untuk context, teruskan image
           if (!result || !result.success) {
                throw new Error(result.error || 'Gemini direct stream generation failed.');
           }
          return result;
      } catch (error) {
          console.error('[RAG] Error generating direct response:', error);
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