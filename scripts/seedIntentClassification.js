import { getEmbedding } from '../lib/layers/phase2-pipes/shared/vectorStoreService.js';
import { ensureCollection, upsertPoints } from '../lib/layers/phase2-pipes/shared/qdrantClient.js';

/**
 * Seed Intent Classification Examples
 * Seeds ~190 example questions into Qdrant for semantic intent routing
 * 
 * Usage: npm run seed:intents
 */

const COLLECTION_NAME = 'intent_classification';

// ============================================================
// INTENT EXAMPLES
// ============================================================

const INTENT_EXAMPLES = {
    // ──────────────────────────────────────────────────────────
    // A. DESCRIPTIVE — 50 examples (data insight, aggregation)
    // ──────────────────────────────────────────────────────────
    descriptive: [
        // Kehadiran
        'Berapa total check-in dan check-out seluruh karyawan pada bulan Januari 2026?',
        'Siapa saja karyawan yang memiliki check-in tanpa check-out dalam 30 hari terakhir?',
        'Berapa jumlah hari hadir setiap karyawan dalam minggu ini?',
        'Berapa persentase kehadiran karyawan dibanding total hari kerja bulan ini?',
        'Berapa total absensi WFO vs WFH dalam 3 bulan terakhir?',
        'Berapa rata-rata frekuensi absensi per karyawan dalam 1 bulan?',
        'Berapa jumlah karyawan yang tidak melakukan absensi sama sekali minggu lalu?',
        'Berapa total check-in per hari selama minggu ini?',
        'Berapa jumlah absensi valid dan invalid bulan ini?',
        'Siapa 5 karyawan dengan tingkat kehadiran tertinggi bulan ini?',

        // Keterlambatan
        'Berapa total keterlambatan bulan ini?',
        'Hari apa paling sering terjadi keterlambatan dalam 3 bulan terakhir?',
        'Siapa karyawan yang paling sering terlambat dalam 1 bulan terakhir?',
        'Berapa rata-rata menit keterlambatan per karyawan?',
        'Berapa jumlah keterlambatan WFO dibanding WFH?',
        'Apakah keterlambatan lebih sering terjadi di awal minggu atau akhir minggu?',
        'Berapa jumlah keterlambatan per lokasi kantor?',
        'Siapa saja yang terlambat lebih dari 5 kali bulan ini?',
        'Jam berapa paling sering terjadi check-in terlambat?',
        'Berapa distribusi keterlambatan berdasarkan divisi?',

        // Jam Kerja
        'Berapa rata-rata jam kerja per karyawan bulan ini?',
        'Berapa rata-rata jam kerja per minggu untuk divisi IT?',
        'Siapa yang memiliki jam kerja tertinggi dalam 30 hari terakhir?',
        'Berapa rata-rata jumlah_jam per lokasi kerja?',
        'Berapa rata-rata jam kerja WFO vs WFH?',
        'Siapa saja yang bekerja kurang dari 6 jam per hari?',
        'Berapa distribusi jam kerja harian selama minggu ini?',
        'Apakah ada karyawan yang sering lembur? Berapa rata-ratanya?',
        'Berapa total jam kerja seluruh karyawan bulan ini?',
        'Berapa rata-rata jam kerja per shift?',

        // Lokasi
        'Di lokasi mana karyawan paling sering melakukan absensi?',
        'Berapa persentase absensi WFO dibanding WFH?',
        'Cabang mana dengan jumlah absensi tertinggi?',
        'Area mana yang memiliki tingkat kehadiran tertinggi?',
        'Berapa total absensi di kantor pusat bulan ini?',
        'Lokasi mana yang paling jarang digunakan untuk absensi?',
        'Berapa distribusi absensi berdasarkan kota?',
        'Apakah lebih banyak absensi dilakukan di kantor atau remote?',
        'Berapa frekuensi absensi per cabang selama 6 bulan terakhir?',
        'Lokasi mana yang mengalami peningkatan absensi paling signifikan?',

        // Perangkat
        'Berapa proporsi penggunaan MOBILE vs WEB bulan ini?',
        'Perangkat mana yang paling sering digunakan untuk check-in?',
        'Apakah keterlambatan lebih sering terjadi pada pengguna MOBILE?',
        'Berapa jumlah absensi via WEB minggu ini?',
        'Siapa saja yang selalu menggunakan MOBILE untuk absensi?',
        'Apakah ada tren peningkatan penggunaan WEB?',
        'Berapa distribusi perangkat per lokasi kerja?',
        'Berapa total check-in via MOBILE dalam 3 bulan terakhir?',
        'Perangkat mana yang lebih banyak digunakan untuk WFH?',
        'Berapa persentase penggunaan perangkat per divisi?',
    ],

    // ──────────────────────────────────────────────────────────
    // B. DIAGNOSTIC — 20 examples (why analysis)
    // ──────────────────────────────────────────────────────────
    diagnostic: [
        'Mengapa keterlambatan paling sering terjadi pada hari Senin?',
        'Apakah lokasi cabang Bandung berkontribusi terhadap tingginya keterlambatan?',
        'Mengapa pengguna MOBILE memiliki tingkat keterlambatan lebih tinggi?',
        'Apakah jarak rumah ke kantor memengaruhi keterlambatan?',
        'Mengapa divisi operasional lebih sering terlambat dibanding divisi lain?',
        'Apakah hujan berpengaruh terhadap peningkatan keterlambatan?',
        'Mengapa keterlambatan meningkat dalam 2 bulan terakhir?',
        'Apakah perubahan jam kerja menyebabkan kenaikan keterlambatan?',
        'Mengapa WFO lebih sering terlambat dibanding WFH?',
        'Apakah terdapat korelasi antara lembur dan keterlambatan keesokan harinya?',
        'Apa penyebab utama penurunan kehadiran bulan lalu?',
        'Mengapa cabang Surabaya memiliki jam kerja lebih rendah?',
        'Apa yang menyebabkan lonjakan tiket di bulan April?',
        'Kenapa gangguan nossa meningkat saat musim hujan?',
        'Apa faktor yang mempengaruhi durasi penyelesaian tiket?',
        'Mengapa regional tertentu memiliki TTR lebih tinggi?',
        'Apa hubungan antara jumlah karyawan WFH dan produktivitas?',
        'Kenapa keluhan pelanggan meningkat di witel Jakarta?',
        'Apa penyebab perbedaan performa antar developer?',
        'Mengapa ticket incident lebih lama diselesaikan dari change request?',
    ],

    // ──────────────────────────────────────────────────────────
    // C. PREDICTIVE — 20 examples (forecast, ML)
    // ──────────────────────────────────────────────────────────
    predictive: [
        'Prediksi kemungkinan keterlambatan karyawan A minggu depan.',
        'Siapa yang berpotensi sering terlambat bulan depan?',
        'Prediksi tingkat kehadiran bulan depan berdasarkan tren historis.',
        'Apakah karyawan B berisiko mengalami penurunan konsistensi absensi?',
        'Estimasi jam kerja karyawan C untuk 2 minggu ke depan.',
        'Prediksi total keterlambatan bulan depan.',
        'Siapa saja yang berpotensi mengalami absensi abnormal?',
        'Prediksi cabang dengan risiko keterlambatan tertinggi.',
        'Estimasi rata-rata jam kerja kuartal berikutnya.',
        'Deteksi anomali pada pola absensi minggu ini.',
        'Prediksi jumlah tiket bulan depan berdasarkan tren saat ini.',
        'Perkirakan jumlah gangguan nossa di kuartal berikutnya.',
        'Forecast kehadiran karyawan untuk periode liburan.',
        'Prediksi beban kerja developer 2 minggu ke depan.',
        'Estimasi TTR rata-rata bulan depan berdasarkan historis.',
        'Apakah akan ada peningkatan gangguan jaringan bulan depan?',
        'Proyeksi keterlambatan per lokasi 3 bulan ke depan.',
        'Prediksi karyawan yang kemungkinan resign berdasarkan pola absensi.',
        'Forecast jumlah pelanggan yang akan komplain bulan depan.',
        'Estimasi kapasitas tim developer yang dibutuhkan kuartal depan.',
    ],

    // ──────────────────────────────────────────────────────────
    // D. RECOMMENDATION — 20 examples (decision support)
    // ──────────────────────────────────────────────────────────
    recommendation: [
        'Berikan rekomendasi untuk mengurangi keterlambatan hari Senin.',
        'Strategi apa yang dapat menurunkan keterlambatan di cabang Bandung?',
        'Rekomendasi penyesuaian jam kerja untuk divisi operasional.',
        'Siapa yang layak mendapatkan reward berdasarkan kehadiran?',
        'Rekomendasi tindakan untuk karyawan dengan keterlambatan tinggi.',
        'Bagaimana mengoptimalkan shift agar beban kerja lebih seimbang?',
        'Apakah perlu kebijakan hybrid untuk mengurangi keterlambatan?',
        'Rekomendasi peningkatan disiplin absensi berbasis data.',
        'Bagaimana strategi mengurangi penggunaan perangkat yang rawan terlambat?',
        'Rekomendasi sistem reminder absensi otomatis.',
        'Saran untuk memperbaiki SLA penyelesaian tiket.',
        'Apa langkah terbaik untuk mengurangi gangguan berulang?',
        'Rekomendasi alokasi developer berdasarkan beban tiket.',
        'Bagaimana cara meningkatkan customer satisfaction berdasarkan data nossa?',
        'Saran pembagian area untuk mengurangi TTR.',
        'Rekomendasi training untuk developer dengan tiket pending terbanyak.',
        'Bagaimana strategi mengurangi gangguan massal di area rawan?',
        'Apa solusi untuk mengatasi bottleneck penyelesaian tiket?',
        'Rekomendasi KPI yang tepat untuk evaluasi kinerja tim.',
        'Saran improvement proses eskalasi tiket berdasarkan data.',
    ],

    // ──────────────────────────────────────────────────────────
    // E. VISUALIZATION — 20 examples (chart, table, heatmap)
    // ──────────────────────────────────────────────────────────
    visualization: [
        'Tampilkan grafik tren keterlambatan 3 bulan terakhir.',
        'Buatkan tabel ranking keterlambatan karyawan.',
        'Tampilkan heatmap keterlambatan berdasarkan hari dan jam.',
        'Buat grafik perbandingan WFO vs WFH.',
        'Visualisasikan distribusi jam kerja per divisi.',
        'Tampilkan pie chart penggunaan perangkat.',
        'Buat grafik absensi per lokasi.',
        'Tampilkan bar chart keterlambatan per cabang.',
        'Visualisasikan tren rata-rata jam kerja mingguan.',
        'Buat dashboard ringkasan kehadiran bulan ini.',
        'Tampilkan chart jumlah tiket per bulan.',
        'Buatkan grafik batang status tiket per developer.',
        'Visualisasi distribusi gangguan per regional dalam bentuk chart.',
        'Tampilkan line chart tren TTR bulanan.',
        'Buat tabel perbandingan performa developer.',
        'Tampilkan grafik pie distribusi jenis tiket.',
        'Buatkan chart perbandingan gangguan per witel.',
        'Visualisasikan tren kehadiran dalam grafik line.',
        'Tampilkan grafik distribusi symptom gangguan.',
        'Buat chart rata-rata jam kerja per bulan.',
    ],

    // ──────────────────────────────────────────────────────────
    // F. MAPS — 20 examples (geographic, location-based)
    // ──────────────────────────────────────────────────────────
    maps: [
        'Tampilkan peta sebaran lokasi absensi bulan ini.',
        'Mapping keterlambatan berdasarkan kota.',
        'Tampilkan heatmap geografis absensi.',
        'Lokasi mana dengan keterlambatan tertinggi di peta?',
        'Visualisasikan persebaran absensi WFH.',
        'Tampilkan clustering lokasi absensi.',
        'Buat peta perbandingan WFO vs WFH.',
        'Area mana dengan tingkat kehadiran terendah di peta?',
        'Tampilkan radius lokasi absensi dari kantor pusat.',
        'Mapping tren absensi 3 bulan terakhir.',
        'Tampilkan peta persebaran gangguan nossa per wilayah.',
        'Buat map distribusi pelanggan per kota.',
        'Visualisasi lokasi witel dengan gangguan terbanyak di peta.',
        'Tampilkan peta sebaran kantor cabang.',
        'Mapping lokasi karyawan yang WFH.',
        'Tampilkan peta titik-titik gangguan fiber.',
        'Buat heatmap geografis tiket per area.',
        'Visualisasi jangkauan layanan per regional di peta.',
        'Tampilkan map clustering pelanggan berdasarkan segment.',
        'Peta distribusi gangguan PLN per wilayah.',
    ],

    // ──────────────────────────────────────────────────────────
    // G. POLICY — 20 examples (company rules, SOP, guidelines)
    // ──────────────────────────────────────────────────────────
    policy: [
        'Ada berapa kebijakan perusahaan BSI?',
        'Apa saja aturan WFH di perusahaan?',
        'Bagaimana SOP cuti karyawan?',
        'Apa kebijakan perusahaan tentang keterlambatan?',
        'Apakah boleh WFH lebih dari 3 hari seminggu?',
        'Apa peraturan tentang lembur karyawan?',
        'Bagaimana prosedur pengajuan izin sakit?',
        'Apa syarat untuk mendapatkan tunjangan transportasi?',
        'Berapa batas maksimal keterlambatan yang diperbolehkan?',
        'Apa aturan dress code di kantor?',
        'Bagaimana kebijakan perusahaan tentang remote working?',
        'Apa SOP penanganan keluhan pelanggan?',
        'Bagaimana aturan penggunaan aset perusahaan?',
        'Apa kebijakan keamanan data perusahaan?',
        'Bagaimana prosedur eskalasi tiket gangguan?',
        'Apa aturan jam kerja fleksibel?',
        'Bagaimana policy reimbursement biaya perjalanan dinas?',
        'Apa standar SLA penyelesaian gangguan?',
        'Bagaimana aturan evaluasi kinerja tahunan?',
        'Apa kebijakan perusahaan tentang VPN?',
        // K3 & Lingkungan (Environmental & Safety)
        'Bagaimana prosedur penanganan limbah B3?',
        'Apa kebijakan K3 di lingkungan kerja?',
        'Bagaimana aturan pembuangan sampah elektronik?',
        'Apa standar operasional pengelolaan limbah cair?',
        'Bagaimana prosedur kedaruratan kebakaran?',
        'Apa kebijakan safety induction untuk tamu?',
        'Bagaimana aturan penggunaan APD di lokasi teknis?',
        'Apa sanksi pelanggaran prosedur K3?',
        'Bagaimana cara pelaporan insiden lingkungan?',
        'Apa komitmen perusahaan terhadap lingkungan hidup?',
    ],

    // ──────────────────────────────────────────────────────────
    // H. GENERAL — 20 examples (greetings, thanks, general chat)
    // ──────────────────────────────────────────────────────────
    general: [
        'Halo',
        'Selamat pagi',
        'Hi, apa kabar?',
        'Terima kasih banyak atas bantuannya',
        'Sampai jumpa',
        'Oke, baik',
        'Good morning',
        'Thank you',
        'Siap, terima kasih',
        'Hai, saya butuh bantuan',
        'Hey, bisa bantu saya?',
        'Selamat siang, chatbot',
        'Halo TMA Chat',
        'Apa saja yang bisa kamu lakukan?',
        'Kamu siapa?',
        'Fitur apa saja yang tersedia?',
        'Tolong bantuan dong',
        'Okay thanks',
        'Sip, mantap',
        'Bye bye',
    ],
};

// ============================================================
// SEEDING LOGIC (with rate limit handling)
// ============================================================

// Gemini free tier: 100 requests/minute
const RATE_LIMIT_BATCH = 90; // Process 90, then pause
const RATE_LIMIT_PAUSE_MS = 65000; // Wait 65s between batches
const MAX_RETRIES = 3;

async function embedWithRetry(text, retries = MAX_RETRIES) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const embedding = await getEmbedding(text);
            return embedding;
        } catch (error) {
            if (error.status === 429 && attempt < retries) {
                // Extract wait time from error or default to 35s
                const waitMatch = error.message?.match(/retry in ([\d.]+)s/i);
                const waitSec = waitMatch ? Math.ceil(parseFloat(waitMatch[1])) + 5 : 35;
                console.log(`[Seed] Rate limited. Waiting ${waitSec}s before retry ${attempt + 1}/${retries}...`);
                await new Promise(resolve => setTimeout(resolve, waitSec * 1000));
            } else {
                throw error;
            }
        }
    }
}

async function seedIntentClassification() {
    console.log('='.repeat(60));
    console.log('[Seed] Intent Classification Examples');
    console.log('='.repeat(60));

    // 1. Ensure collection exists
    await ensureCollection(COLLECTION_NAME);

    // 2. Count total examples
    const totalExamples = Object.values(INTENT_EXAMPLES).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`\n[Seed] Total examples to seed: ${totalExamples}`);
    for (const [cat, examples] of Object.entries(INTENT_EXAMPLES)) {
        console.log(`  ${cat}: ${examples.length} examples`);
    }

    // 3. Generate embeddings and build points (with rate limit handling)
    const points = [];
    let id = 1;
    let processed = 0;
    let requestsInBatch = 0;

    for (const [category, examples] of Object.entries(INTENT_EXAMPLES)) {
        console.log(`\n[Seed] Embedding category: ${category} (${examples.length} examples)...`);

        for (const text of examples) {
            try {
                // Rate limit: pause before hitting limit
                if (requestsInBatch >= RATE_LIMIT_BATCH) {
                    console.log(`[Seed] Batch limit reached (${RATE_LIMIT_BATCH}). Pausing ${RATE_LIMIT_PAUSE_MS / 1000}s for rate limit...`);
                    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_PAUSE_MS));
                    requestsInBatch = 0;
                }

                const embedding = await embedWithRetry(text);
                requestsInBatch++;

                points.push({
                    id: id++,
                    vector: embedding,
                    payload: {
                        content: text,
                        category: category,
                    },
                });

                processed++;
                if (processed % 20 === 0) {
                    console.log(`[Seed] Progress: ${processed}/${totalExamples} (batch: ${requestsInBatch}/${RATE_LIMIT_BATCH})`);
                }

                // Small delay between calls
                await new Promise(resolve => setTimeout(resolve, 50));
            } catch (error) {
                console.error(`[Seed] Error embedding "${text.substring(0, 40)}...":`, error.message);
            }
        }
    }

    console.log(`\n[Seed] Embedding complete: ${points.length}/${totalExamples} successful`);

    // 4. Upsert all points in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
        const batch = points.slice(i, i + BATCH_SIZE);
        await upsertPoints(COLLECTION_NAME, batch);
        console.log(`[Seed] Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(points.length / BATCH_SIZE)}`);
    }

    // 5. Verification (with rate limit pause)
    console.log('\n[Seed] Waiting 65s before verification (rate limit cooldown)...');
    await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_PAUSE_MS));

    console.log('[Seed] === VERIFICATION ===');
    const testQueries = [
        { text: 'Berapa total keterlambatan bulan ini?', expected: 'descriptive' },
        { text: 'Mengapa keterlambatan meningkat?', expected: 'diagnostic' },
        { text: 'Prediksi keterlambatan bulan depan', expected: 'predictive' },
        { text: 'Rekomendasi untuk mengurangi keterlambatan', expected: 'recommendation' },
        { text: 'Tampilkan grafik tren absensi', expected: 'visualization' },
        { text: 'Tampilkan peta lokasi absensi', expected: 'maps' },
        { text: 'Apa kebijakan perusahaan tentang WFH?', expected: 'policy' },
        { text: 'Detail penanganan limbah', expected: 'policy' },
        { text: 'Halo selamat pagi', expected: 'general' },
    ];

    const { searchSimilar } = await import('../lib/layers/phase2-pipes/shared/qdrantClient.js');
    let correct = 0;

    for (const test of testQueries) {
        try {
            const embedding = await embedWithRetry(test.text);
            const results = await searchSimilar(COLLECTION_NAME, embedding, 5);

            // Score-weighted majority vote
            const votes = {};
            for (const r of results) {
                const cat = r.payload.category;
                votes[cat] = (votes[cat] || 0) + r.score;
            }
            const predicted = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
            const isCorrect = predicted === test.expected;
            if (isCorrect) correct++;

            console.log(`  ${isCorrect ? '✅' : '❌'} "${test.text.substring(0, 45)}..." → ${predicted} (expected: ${test.expected})`);
            if (!isCorrect) {
                console.log(`     Votes: ${JSON.stringify(votes)}`);
                console.log(`     Top result: "${results[0].payload.content.substring(0, 50)}" (score: ${results[0].score.toFixed(3)})`);
            }

            await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
            console.error(`  ⚠️ Skipping verification for "${test.text.substring(0, 30)}...": ${error.message}`);
        }
    }

    console.log(`\n[Seed] Verification: ${correct}/${testQueries.length} correct (${(correct / testQueries.length * 100).toFixed(0)}%)`);
    console.log('[Seed] ✅ Intent classification seeding complete!');
}

// Run
seedIntentClassification().catch(error => {
    console.error('[Seed] Fatal error:', error);
    process.exit(1);
});
