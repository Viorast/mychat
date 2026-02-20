/**
 * Rules-based Intent Classifier (Optimized)
 * Replaces LLM-based classification to save ~300 tokens and ~12 seconds per query
 * 
 * Expanded keywords based on SDA schema context
 */

/**
 * Classify user intent without using LLM
 * @param {string} userMessage - User's input message
 * @returns {'general_conversation' | 'data_query'}
 */
export const classifyIntent = (userMessage) => {
    if (!userMessage || typeof userMessage !== 'string') {
        return 'general_conversation';
    }

    const lowerMsg = userMessage.toLowerCase().trim();

    // 1. Simple greetings and farewells (high confidence)
    const greetingPatterns = [
        /^(hi|hello|halo|hai|hey|hei)($|\s|!)/,
        /^(selamat (pagi|siang|sore|malam))($|\s|!)/,
        /^(good (morning|afternoon|evening))($|\s|!)/,
        /^(terima kasih|thanks|thank you|thx)($|\s|!)/,
        /^(bye|goodbye|dadah|sampai jumpa)($|\s|!)/,
        /^(oke|ok|okay|baik|siap)($|!)/,
    ];

    // Short messages with greeting patterns are likely general conversation
    if (lowerMsg.length < 50) {
        for (const pattern of greetingPatterns) {
            if (pattern.test(lowerMsg)) {
                return 'general_conversation';
            }
        }
    }

    // 2. Data query indicators (question words) - EXPANDED
    const questionWords = [
        // Indonesian question words
        'berapa', 'kapan', 'siapa', 'dimana', 'di mana', 'mana',
        'apa', 'apakah', 'bagaimana', 'mengapa', 'kenapa', 'bisakah',
        'dapatkah', 'adakah', 'haruskah', 'bolehkah',

        // English question words
        'how', 'what', 'when', 'where', 'who', 'why', 'which',
        'can', 'could', 'would', 'should', 'is', 'are', 'does'
    ];

    const startsWithQuestion = questionWords.some(word => {
        const pattern = new RegExp(`^${word}\\s`, 'i');
        return pattern.test(lowerMsg);
    });

    if (startsWithQuestion) {
        return 'data_query';
    }

    // 3. Data-related keywords (domain specific) - GREATLY EXPANDED
    const dataKeywords = [
        // Database/Query terms
        'data', 'query', 'tabel', 'table', 'database', 'basis data',
        'sql', 'select', 'tampilkan', 'show', 'lihat', 'cari', 'search',

        // Schema-specific: log_absen table
        'absen', 'absensi', 'kehadiran', 'hadir', 'masuk',
        'check in', 'checkin', 'check out', 'checkout',
        'terlambat', 'telat', 'lembur', 'overtime',
        'wfa', 'wfh', 'wfo', 'work from', 'kerja dari',
        'jam kerja', 'durasi', 'lokasi absen', 'perangkat',

        // Schema-specific: m_ticket table
        'tiket', 'ticket', 'request', 'pekerjaan', 'task',
        'bug', 'incident', 'change', 'explorasi', 'exploration',
        'developer', 'dev', 'programmer', 'coder',
        'deadline', 'target', 'progress', 'pengerjaan',
        'no tiket', 'nomor tiket', 'id tiket',

        // Schema-specific: nossa_closed table
        'nossa', 'gangguan', 'aduan', 'complaint', 'issue',
        'pelanggan', 'customer', 'client', 'user',
        'service id', 'service_id', 'circuit', 'service no',
        'witel', 'regional', 'area', 'wilayah',
        'ttr', 'response time', 'waktu respon',
        'symptom', 'gejala', 'penyebab', 'solusi', 'solution',

        // Analytics terms
        'laporan', 'report', 'analisis', 'analysis', 'statistik', 'stats',
        'chart', 'grafik', 'graph', 'visualisasi', 'visualization',
        'dashboard', 'metric', 'metrik', 'kpi',

        // Aggregation terms
        'total', 'jumlah', 'banyak', 'count', 'sum', 'hitung',
        'rata-rata', 'average', 'mean', 'median',
        'maximum', 'minimum', 'maksimal', 'minimal',
        'tertinggi', 'terendah', 'terbanyak', 'paling',

        // Time-related - EXPANDED
        'bulan', 'month', 'tahun', 'year', 'hari', 'day',
        'minggu', 'week', 'tanggal', 'date', 'waktu', 'time',
        'periode', 'period', 'durasi', 'duration',
        'januari', 'februari', 'maret', 'april', 'mei', 'juni',
        'juli', 'agustus', 'september', 'oktober', 'november', 'desember',
        'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
        'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu', 'minggu',
        'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
        'kemarin', 'yesterday', 'hari ini', 'today', 'besok', 'tomorrow',
        'minggu lalu', 'last week', 'bulan lalu', 'last month',
        'tahun ini', 'this year', 'q1', 'q2', 'q3', 'q4', 'kuartal', 'quarter',

        // Status/State - EXPANDED
        'status', 'progress', 'done', 'selesai', 'finish', 'complete',
        'pending', 'tunggu', 'waiting', 'hold', 'ditunda',
        'open', 'close', 'closed', 'buka', 'tutup',
        'aktif', 'active', 'inactive', 'non-aktif',
        'resolved', 'unresolved', 'terselesaikan',

        // Employee-related - EXPANDED
        'karyawan', 'pegawai', 'staff', 'employee', 'worker',
        'developer', 'dev', 'programmer', 'engineer',
        'tim', 'team', 'grup', 'group', 'divisi', 'division',
        'nama karyawan', 'dev name', 'pekerja',

        // Customer-related
        'pelanggan', 'customer', 'client', 'klien', 'konsumen',
        'customer name', 'nama pelanggan',

        // Performance & Quality
        'performa', 'performance', 'kinerja', 'produktivitas', 'productivity',
        'efisiensi', 'efficiency', 'kualitas', 'quality',
        'benchmark', 'comparison', 'perbandingan', 'bandingkan',

        // Trend & Pattern
        'trend', 'tren', 'pola', 'pattern', 'insight',
        'forecast', 'prediksi', 'prediction', 'proyeksi',

        // Comparison & Filter
        'filter', 'saring', 'cari', 'dimana', 'where',
        'lebih dari', 'kurang dari', 'greater than', 'less than',
        'antara', 'between', 'dalam rentang', 'range',
        'hanya', 'only', 'kecuali', 'except', 'selain', 'exclude'
    ];

    const hasDataKeyword = dataKeywords.some(keyword =>
        lowerMsg.includes(keyword)
    );

    if (hasDataKeyword) {
        return 'data_query';
    }

    // 4. Detect SQL-like patterns
    const sqlPatterns = [
        /select.*from/i,
        /berapa.*yang/i,
        /tampilkan.*data/i,
        /show.*data/i,
        /list.*all/i,
        /daftar.*semua/i,
        /cari.*tiket/i,
        /filter.*berdasarkan/i,
    ];

    for (const pattern of sqlPatterns) {
        if (pattern.test(lowerMsg)) {
            return 'data_query';
        }
    }

    // 5. Image analysis intent
    if (lowerMsg.includes('gambar') || lowerMsg.includes('image') ||
        lowerMsg.includes('foto') || lowerMsg.includes('picture')) {
        return 'data_query';
    }

    // 6. Numeric references (likely data queries)
    const hasNumbers = /\d{1,4}/.test(lowerMsg); // Contains 1-4 digit numbers
    const hasDataContext = hasDataKeyword || startsWithQuestion;
    if (hasNumbers && hasDataContext) {
        return 'data_query';
    }

    // 7. Default: treat ambiguous cases as data_query
    // Exception: very short messages without data indicators
    if (lowerMsg.length < 20 && !hasDataKeyword && !startsWithQuestion && !hasNumbers) {
        return 'general_conversation';
    }

    return 'data_query';
};

/**
 * Get confidence score for the classification (0-1)
 * Useful for logging and debugging
 */
export const getIntentConfidence = (userMessage) => {
    const intent = classifyIntent(userMessage);
    const lowerMsg = userMessage.toLowerCase().trim();

    // High confidence indicators
    if (intent === 'general_conversation' && lowerMsg.length < 20) {
        return 0.95;
    }

    if (intent === 'data_query' && /^(berapa|kapan|siapa|apakah)/.test(lowerMsg)) {
        return 0.98;
    }

    // Medium confidence (has some indicators)
    const strongKeywords = ['tiket', 'absen', 'nossa', 'data', 'laporan', 'karyawan', 'bug', 'periode'];
    if (intent === 'data_query' && strongKeywords.some(k => lowerMsg.includes(k))) {
        return 0.90;
    }

    // Default confidence
    return 0.75;
};

/**
 * Test function for validation
 */
export const testIntentClassifier = () => {
    const testCases = [
        // General conversation
        { msg: 'hai', expected: 'general_conversation' },
        { msg: 'terima kasih', expected: 'general_conversation' },
        { msg: 'selamat pagi', expected: 'general_conversation' },
        { msg: 'oke baik', expected: 'general_conversation' },

        // Data queries - existing
        { msg: 'berapa jumlah tiket?', expected: 'data_query' },
        { msg: 'tampilkan data absensi bulan ini', expected: 'data_query' },
        { msg: 'apa status tiket terbaru?', expected: 'data_query' },
        { msg: 'siapa developer paling produktif?', expected: 'data_query' },
        { msg: 'kapan gangguan nossa terakhir?', expected: 'data_query' },

        // Data queries - new expanded keywords
        { msg: 'apakah ada bug di sistem?', expected: 'data_query' },
        { msg: 'data karyawan bulan periode ini', expected: 'data_query' },
        { msg: 'berapa karyawan yang terlambat?', expected: 'data_query' },
        { msg: 'cek absensi WFH minggu lalu', expected: 'data_query' },
        { msg: 'total incident bulan Januari', expected: 'data_query' },
        { msg: 'filter tiket yang statusnya open', expected: 'data_query' },
        { msg: 'analisis performa tim developer', expected: 'data_query' },
        { msg: 'trend gangguan per regional', expected: 'data_query' },

        // Edge cases
        { msg: 'halo, berapa tiket hari ini?', expected: 'data_query' },
        { msg: 'hi tolong cek data', expected: 'data_query' },
        { msg: 'apakah periode Q1 lebih baik dari Q2?', expected: 'data_query' },
    ];

    let passed = 0;
    let failed = 0;

    console.log('=== Testing Intent Classifier (Extended Keywords) ===\n');

    testCases.forEach(({ msg, expected }) => {
        const result = classifyIntent(msg);
        const confidence = getIntentConfidence(msg);
        const status = result === expected ? '✅' : '❌';

        console.log(`${status} "${msg}"`);
        console.log(`   Expected: ${expected}, Got: ${result} (confidence: ${confidence.toFixed(2)})\n`);

        if (result === expected) {
            passed++;
        } else {
            failed++;
        }
    });

    console.log(`\n=== Results: ${passed}/${testCases.length} passed ===`);
    return { passed, failed, total: testCases.length };
};

// Auto-run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    testIntentClassifier();
}
