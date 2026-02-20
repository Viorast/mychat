import { aiRouter } from "../../ai/ai-router.js";
import { ragLog } from "../../monitoring/ragLogger.js";

const RERANK_FAILURE_CONTEXT = "Tidak ada konteks skema yang relevan ditemukan.";

export class ResponseGeneratorService {
    constructor(aiClient = aiRouter) {
        this.aiClient = aiClient;
    }

    /**
     * Langkah 6: Menghasilkan Respons Akhir (Response Generation)
     */
    async generateFinalResponse(userMessage, history, formattedData, analysisType, image = null) {

        // ✅ FIX: Truncate history to last 4 messages, max 200 chars each → saves ~500-1000 tokens
        const historyText = history
            .slice(-4)
            .map(m => `${m.role}: ${m.content.slice(0, 200)}`)
            .join('\n');

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
        
        ATURAN VISUALISASI DATA (WAJIB DIPATUHI):
        
        1. JIKA USER MEMINTA "TABEL":
           ANDA HARUS MENGGUNAKAN FORMAT [TABLE] DI BAWAH INI. JANGAN GUNAKAN DAFTAR LIST BIASA.
        
           Format TABLE:
           [TABLE]
           {"title": "Judul Tabel", "columns": ["Kolom1", "Kolom2"], "rows": [["nilai1", "nilai2"], ["nilai3", "nilai4"]]}
           [/TABLE]

        2. JIKA USER MEMINTA "CHART" / "GRAFIK" / "VISUALISASI":
           ANDA HARUS MENGGUNAKAN FORMAT [CHART] DI BAWAH INI.
           
           Format CHART (pilih tipe yang sesuai: bar/line/pie):
           [CHART:bar]
           {"title": "Judul Chart", "data": [{"name": "Label1", "value": 10}, {"name": "Label2", "value": 20}]}
           [/CHART]
           
           Gunakan:
           • bar - untuk perbandingan kategori
           • pie - untuk distribusi/proporsi (persentase)
           • line - untuk trend waktu

        3. JIKA USER HANYA BERTANYA DATA BIASA (TANPA KATA KUNCI "TABEL" ATAU "CHART"):
           JANGAN BUAT CHART ATAU TABEL JSON. Gunakan format teks biasa dengan bullet points.
           
           Contoh format teks biasa (NON-TABEL):
           Berdasarkan data yang tersedia:
           • Tipe 2 (Change): 5.42 jam
           • Tipe 3 (Explorasi): 4.07 jam
        
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
            const t0 = Date.now();
            const result = await this.aiClient.generateStream(finalPrompt, null, image);

            if (!result || !result.success) {
                throw new Error(result.error || 'Stream generation failed.');
            }

            ragLog.response(Date.now() - t0, result.isFallback ? 'Gemini' : 'OpenRouter');
            return result;
        } catch (error) {
            ragLog.error('P5 Response', error.message);
            throw error;
        }
    }
}

export const responseGeneratorService = new ResponseGeneratorService();
