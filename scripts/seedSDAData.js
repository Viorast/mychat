import pg from 'pg';

const { Pool } = pg;

/**
 * Seed SDA Data Script
 * Generates realistic training data for tmachat AI
 * Tables: log_absen, m_ticket, nossa_closed
 *
 * Usage: npm run seed:sda
 */

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    YEAR: 2025,
    MONTHS: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    BATCH_SIZE: 500,
};

// Hari libur nasional Indonesia 2025
const HOLIDAYS_2025 = [
    '2025-01-01', // Tahun Baru
    '2025-01-27', // Isra Mi'raj (perkiraan)
    '2025-01-29', // Tahun Baru Imlek
    '2025-03-28', // Hari Raya Nyepi
    '2025-03-29', // Hari Raya Nyepi (cuti bersama)
    '2025-03-31', // Hari Raya Idul Fitri
    '2025-04-01', // Hari Raya Idul Fitri
    '2025-04-02', // Cuti Bersama Idul Fitri
    '2025-04-03', // Cuti Bersama Idul Fitri
    '2025-04-04', // Cuti Bersama Idul Fitri
    '2025-04-18', // Wafat Isa Al-Masih
    '2025-05-01', // Hari Buruh
    '2025-05-12', // Hari Raya Waisak
    '2025-05-29', // Kenaikan Isa Al-Masih
    '2025-06-01', // Hari Lahir Pancasila
    '2025-06-06', // Idul Adha (perkiraan)
    '2025-06-07', // Cuti Bersama Idul Adha
    '2025-06-27', // Tahun Baru Islam
    '2025-08-17', // Hari Kemerdekaan
    '2025-09-05', // Maulid Nabi (perkiraan)
    '2025-12-25', // Natal
    '2025-12-26', // Cuti Bersama Natal
];

const HOLIDAY_SET = new Set(HOLIDAYS_2025);

// ============================================================
// DATA POOLS
// ============================================================

const EMPLOYEES = [
    'Andi Setiawan', 'Budi Pratama', 'Citra Dewi', 'Dian Permata',
    'Eko Saputra', 'Fajar Nugroho', 'Gita Rahmawati', 'Hendra Wijaya',
    'Indra Kusuma', 'Joko Susanto', 'Kartika Sari', 'Lukman Hakim',
    'Maya Puspita', 'Nanda Firmansyah', 'Oktavia Putri', 'Putra Aditya',
    'Rina Marlina', 'Surya Darma', 'Tegar Prasetyo', 'Umi Kalsum',
    'Vina Anggraeni', 'Wahyu Hidayat', 'Xena Lestari', 'Yoga Pratama',
    'Zahra Amelia',
];

const DEVELOPERS = [
    'Andi Setiawan', 'Budi Pratama', 'Citra Dewi', 'Eko Saputra',
    'Fajar Nugroho', 'Gita Rahmawati', 'Hendra Wijaya', 'Indra Kusuma',
    'Joko Susanto', 'Lukman Hakim', 'Maya Puspita', 'Nanda Firmansyah',
    'Putra Aditya', 'Rina Marlina', 'Surya Darma', 'Tegar Prasetyo',
    'Vina Anggraeni', 'Wahyu Hidayat', 'Yoga Pratama', 'Zahra Amelia',
];

const CUSTOMERS = [
    'Ahmad Fauzi', 'Bambang Sutrisno', 'Bank BPR Mitra Usaha',
    'Cahya Dwi Putra', 'CV Cahaya Teknik', 'CV Mega Sentosa',
    'Dewi Sartika', 'Edy Mulyono', 'Fitri Handayani', 'Gunawan Wibisono',
    'Hesti Rahayu', 'Hotel Grand Cempaka', 'Irwan Setiabudi', 'Jumadi',
    'Koperasi Maju Bersama', 'Kurniawan', 'Lina Marlina', 'Muhammad Rizky',
    'Nurul Hidayah', 'Oscar Prasetyo', 'PT Berkah Mandiri', 'PT Bumi Lestari',
    'PT Global Solusi', 'PT Indo Telematika', 'PT Karya Digital',
    'PT Nusantara Jaya', 'Putri Ayu Ningtyas', 'Rahmat Hidayat',
    'RS Harapan Sehat', 'Siti Nurhaliza', 'SMKN 1 Bandung',
    'Taufik Ismail', 'Universitas Padjadjaran', 'Usman Harun',
    'Yayasan Pendidikan Nusantara',
];

const LOKASI_WFO = [
    { nama: 'Graha Merah Putih, Jl. Jend. Gatot Subroto Kav. 52, Jakarta', weight: 25 },
    { nama: 'Gedung Telkom Landmark Tower, Jl. Jend. Gatot Subroto Kav. 52, Jakarta Selatan', weight: 20 },
    { nama: 'Telkom Bandung, Jl. Japati No. 1, Bandung', weight: 20 },
    { nama: 'Telkom University, Jl. Telekomunikasi No. 1, Bandung', weight: 15 },
    { nama: 'Telkom Surabaya, Jl. Ketintang No. 156, Surabaya', weight: 10 },
    { nama: 'Telkom Semarang, Jl. Pahlawan No. 10, Semarang', weight: 10 },
];

const LOKASI_WFH_WFA = [
    { nama: 'GoWork Menara Rajawali, Jakarta Pusat', weight: 10 },
    { nama: 'WeWork Revenue Tower, Jakarta Selatan', weight: 9 },
    { nama: 'CoHive D.Lab, Jl. Jend. Gatot Subroto Kav. 52, Jakarta', weight: 8 },
    { nama: 'L. Block Co-Working, Jl. Braga No. 99, Bandung', weight: 10 },
    { nama: 'Starbucks Pacific Place, Jakarta Selatan', weight: 7 },
    { nama: 'Summarecon Bandung, Gedebage, Bandung', weight: 5 },
    { nama: 'Kelapa Gading, Jakarta Utara', weight: 6 },
    { nama: 'Bintaro Jaya, Tangerang Selatan', weight: 7 },
    { nama: 'Pondok Indah, Jakarta Selatan', weight: 6 },
    { nama: 'Cipaganti, Bandung', weight: 8 },
    { nama: 'Cimahi, Jawa Barat', weight: 6 },
    { nama: 'Ciputat, Tangerang Selatan', weight: 5 },
    { nama: 'Margahayu, Bandung', weight: 6 },
];

// Witel → Regional mapping
const WITEL_REGIONAL = {
    'JAKSEL': 'REG-2', 'JAKPUS': 'REG-2', 'JAKBAR': 'REG-2', 'JAKTIM': 'REG-2', 'JAKUT': 'REG-2',
    'BEKASI': 'REG-2', 'BOGOR': 'REG-2', 'TANGERANG': 'REG-2',
    'BANDUNG': 'REG-3', 'BANDUNGBRT': 'REG-3', 'TASIKMALAYA': 'REG-3', 'CIREBON': 'REG-3', 'KARAWANG': 'REG-3',
    'SEMARANG': 'REG-4', 'SOLO': 'REG-4', 'YOGYAKARTA': 'REG-4', 'PURWOKERTO': 'REG-4',
    'SURABAYA': 'REG-5', 'MALANG': 'REG-5', 'SIDOARJO': 'REG-5', 'DENPASAR': 'REG-5', 'MATARAM': 'REG-5',
    'MAKASSAR': 'REG-7', 'AMBON': 'REG-7', 'JAYAPURA': 'REG-7', 'MANADO': 'REG-7', 'KENDARI': 'REG-7',
    'SUMUT': 'REG-1', 'RIAU': 'REG-1', 'PEKANBARU': 'REG-1', 'PALEMBANG': 'REG-1',
    'BENGKULU': 'REG-1', 'JAMBI': 'REG-1', 'LAMPUNG': 'REG-1', 'PADANG': 'REG-1',
    'SAMARINDA': 'REG-6', 'BALIKPAPAN': 'REG-6', 'PONTIANAK': 'REG-6', 'KALTENG': 'REG-6',
    'BANJARMASIN': 'REG-6',
};

const WITEL_WEIGHTS = {
    'JAKSEL': 15, 'JAKPUS': 12, 'JAKTIM': 10, 'BEKASI': 9, 'BANDUNG': 14, 'BANDUNGBRT': 8,
    'SURABAYA': 10, 'SEMARANG': 7, 'MAKASSAR': 6, 'SUMUT': 6, 'RIAU': 5, 'PEKANBARU': 5,
    'PALEMBANG': 5, 'AMBON': 4, 'BENGKULU': 3, 'SAMARINDA': 4, 'KALTENG': 3, 'DENPASAR': 5,
    'BOGOR': 6, 'TANGERANG': 7, 'KARAWANG': 4, 'CIREBON': 4, 'TASIKMALAYA': 3,
    'SOLO': 5, 'YOGYAKARTA': 5, 'PURWOKERTO': 3, 'MALANG': 5, 'SIDOARJO': 4, 'MATARAM': 3,
    'JAYAPURA': 2, 'MANADO': 3, 'KENDARI': 2, 'JAMBI': 3, 'LAMPUNG': 4, 'PADANG': 4,
    'BALIKPAPAN': 4, 'PONTIANAK': 3, 'BANJARMASIN': 3, 'JAKBAR': 8, 'JAKUT': 7,
};

const SYMPTOMS = [
    { text: 'IPTV | Tidak Ada Siaran / Freeze', weight: 10, season: 'any' },
    { text: 'CPE | Port LAN Mati', weight: 9, season: 'any' },
    { text: 'Fiber | GPON | GPON | Kerusakan Software / Problem Logic', weight: 8, season: 'any' },
    { text: 'VPN | Latency Tinggi', weight: 10, season: 'any' },
    { text: 'INTERNET | Tidak Bisa Connect', weight: 12, season: 'any' },
    { text: 'Billing | Tagihan Tidak Sesuai', weight: 7, season: 'any' },
    { text: 'Gangguan Massal | Imbas PLN Padam', weight: 8, season: 'dry' },
    { text: 'ONT | Lampu PON Mati', weight: 9, season: 'any' },
    { text: 'Fiber | GPON | GPON | Kerusakan Fisik - Putus', weight: 12, season: 'rain' },
    { text: 'Instalasi | ONT Baru Belum Aktif', weight: 8, season: 'any' },
];

const SOLUTIONS = {
    'IPTV | Tidak Ada Siaran / Freeze': [
        'Reset STB dan konfigurasi ulang channel list',
        'Ganti STB karena hardware issue, channel kembali normal',
        'Perbaikan signal OLT, siaran kembali stabil',
        'Update firmware STB ke versi terbaru',
    ],
    'CPE | Port LAN Mati': [
        'Ganti kabel LAN dan restart CPE, port aktif kembali',
        'Reset factory CPE, konfigurasi ulang port LAN',
        'Ganti unit CPE baru karena kerusakan hardware',
        'Perbaikan konektor RJ45, koneksi LAN normal',
    ],
    'Fiber | GPON | GPON | Kerusakan Software / Problem Logic': [
        'Reset OLT port dan re-provision ONT pelanggan',
        'Update firmware OLT, logic GPON kembali normal',
        'Reconfigure VLAN tagging pada OLT',
        'Restart service GPON pada OLT dan ONT',
    ],
    'VPN | Latency Tinggi': [
        'Optimasi routing path VPN, latency turun ke normal',
        'Upgrade bandwidth link backbone, latency berkurang signifikan',
        'Perbaikan konfigurasi QoS pada router PE',
        'Migrasi ke jalur fiber alternatif, latency stabil',
    ],
    'INTERNET | Tidak Bisa Connect': [
        'Reset modem ONT dan konfigurasi PPPoE ulang',
        'Perbaikan sambungan fiber di ODP terdekat',
        'Aktivasi ulang port OLT, koneksi internet normal',
        'Ganti splitter rusak di ODP, koneksi kembali',
    ],
    'Billing | Tagihan Tidak Sesuai': [
        'Adjustment tagihan sesuai paket berlangganan aktif',
        'Koreksi double billing pada sistem, refund diproses',
        'Update data paket pelanggan di sistem billing',
        'Eskalasi ke tim billing pusat, tagihan sudah dikoreksi',
    ],
    'Gangguan Massal | Imbas PLN Padam': [
        'PLN sudah recovery, semua layanan up setelah restart perangkat',
        'Pasang UPS tambahan di STO untuk antisipasi PLN padam',
        'Koordinasi dengan PLN untuk recovery supply listrik',
        'Recovery otomatis setelah PLN menyala, monitoring 24 jam',
    ],
    'ONT | Lampu PON Mati': [
        'Ganti ONT baru, lampu PON menyala normal, koneksi stabil',
        'Perbaikan konektor fiber pada ONT, signal recovered',
        'Ganti adapter ONT, indikator PON menyala normal',
        'Splicing ulang kabel fiber ke ONT',
    ],
    'Fiber | GPON | GPON | Kerusakan Fisik - Putus': [
        'Splicing fiber yang putus di segment outdoor, koneksi normal',
        'Tarik ulang kabel fiber dari ODP ke lokasi pelanggan',
        'Perbaikan fiber putus di tiang, semua layanan recovered',
        'Ganti kabel fiber yang rusak akibat galian pihak ketiga',
    ],
    'Instalasi | ONT Baru Belum Aktif': [
        'Provisioning ONT di OLT berhasil, internet aktif',
        'Aktivasi port OLT dan registrasi SN ONT pelanggan',
        'Konfigurasi VLAN dan PPPoE pada ONT baru, layanan aktif',
        'Input data pelanggan di CMS dan aktivasi layanan',
    ],
};

const CUSTOMER_SEGMENTS = ['DCS', 'DGS', 'DES', 'DBS'];
const SOURCES = ['NOSSA', 'MANUAL_GAMMAS', 'PROACTIVE_TICKET'];
const SERVICE_TYPES = ['INTERNET', 'IPTV', 'WIFI', 'VOICE', 'VPN'];

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

function rand(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max, decimals = 2) {
    return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}

function pickOne(arr) {
    return arr[rand(0, arr.length - 1)];
}

function pickWeighted(items) {
    const totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
    let r = Math.random() * totalWeight;
    for (const item of items) {
        r -= (item.weight || 1);
        if (r <= 0) return item;
    }
    return items[items.length - 1];
}

function pickWeightedFromMap(map) {
    const entries = Object.entries(map);
    const totalWeight = entries.reduce((sum, [, w]) => sum + w, 0);
    let r = Math.random() * totalWeight;
    for (const [key, w] of entries) {
        r -= w;
        if (r <= 0) return key;
    }
    return entries[entries.length - 1][0];
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function formatTime(hours, minutes, seconds) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatTimestamp(date, hours, minutes, seconds) {
    return `${formatDate(date)} ${formatTime(hours, minutes, seconds)}`;
}

function isWeekday(date) {
    const day = date.getDay();
    return day !== 0 && day !== 6; // 0=Sunday, 6=Saturday
}

function isHoliday(date) {
    return HOLIDAY_SET.has(formatDate(date));
}

function isWorkday(date) {
    return isWeekday(date) && !isHoliday(date);
}

function getWorkdaysInMonth(year, month) {
    const days = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month - 1, d);
        if (isWorkday(date)) {
            days.push(date);
        }
    }
    return days;
}

function isRainySeason(month) {
    // Indonesia: Nov-Feb rainy, Jun-Sep dry
    return [11, 12, 1, 2].includes(month);
}

function generateServiceId() {
    const part1 = rand(10000000, 99999999);
    const part2 = rand(100000000000, 999999999999);
    return `${part1}_${part2}_INTERNET`;
}

function generateServiceNo() {
    return String(rand(100000000000, 999999999999));
}

function witelToWorkzone(witel) {
    const map = {
        'JAKSEL': 'JKS', 'JAKPUS': 'JKP', 'JAKBAR': 'JKB', 'JAKTIM': 'JKT', 'JAKUT': 'JKU',
        'BEKASI': 'BKS', 'BOGOR': 'BGR', 'TANGERANG': 'TNG', 'BANDUNG': 'BDG', 'BANDUNGBRT': 'BDB',
        'TASIKMALAYA': 'TSM', 'CIREBON': 'CRB', 'KARAWANG': 'KRW', 'SEMARANG': 'SMG', 'SOLO': 'SLO',
        'YOGYAKARTA': 'YGY', 'PURWOKERTO': 'PWK', 'SURABAYA': 'SBY', 'MALANG': 'MLG', 'SIDOARJO': 'SDA',
        'DENPASAR': 'DPS', 'MATARAM': 'MTR', 'MAKASSAR': 'MKS', 'AMBON': 'AMB', 'JAYAPURA': 'JPR',
        'MANADO': 'MND', 'KENDARI': 'KDR', 'SUMUT': 'SMU', 'RIAU': 'RIA', 'PEKANBARU': 'PKB',
        'PALEMBANG': 'PLB', 'BENGKULU': 'BKL', 'JAMBI': 'JMB', 'LAMPUNG': 'LMP', 'PADANG': 'PDG',
        'SAMARINDA': 'SMR', 'BALIKPAPAN': 'BPN', 'PONTIANAK': 'PTK', 'KALTENG': 'KTG', 'BANJARMASIN': 'BJM',
    };
    return map[witel] || witel.substring(0, 3).toUpperCase();
}

// ============================================================
// DATA GENERATORS
// ============================================================

function generateLogAbsen() {
    console.log('[Seed] Generating log_absen data...');
    const records = [];
    let idAbsen = 1;

    for (const month of CONFIG.MONTHS) {
        const workdays = getWorkdaysInMonth(CONFIG.YEAR, month);

        for (const day of workdays) {
            const dayOfWeek = day.getDay(); // 1=Mon, 5=Fri

            for (const emp of EMPLOYEES) {
                // ~8% chance of absence (izin/sakit) per day
                if (Math.random() < 0.08) continue;

                // Decide work type: 55% WFO, 25% WFH, 20% WFA
                const roll = Math.random();
                let workType;
                if (roll < 0.55) workType = 'WFO';
                else if (roll < 0.80) workType = 'WFH';
                else workType = 'WFA';

                // Generate check-in time
                let checkInH, checkInM, checkInS;
                const ciRoll = Math.random();

                if (ciRoll < 0.10) {
                    // 10% very early (06:30-07:30)
                    checkInH = 6;
                    checkInM = rand(30, 59);
                    if (Math.random() < 0.5) { checkInH = 7; checkInM = rand(0, 30); }
                    checkInS = rand(0, 59);
                } else if (ciRoll < 0.80) {
                    // 70% normal (07:30-08:15)
                    checkInH = 7;
                    checkInM = rand(30, 59);
                    if (Math.random() < 0.6) { checkInH = 8; checkInM = rand(0, 14); }
                    checkInS = rand(0, 59);
                } else {
                    // 20% late (08:15-09:30) — higher on Monday
                    const lateBias = dayOfWeek === 1 ? 0.3 : 0;
                    if (Math.random() < 0.8 + lateBias) {
                        checkInH = 8;
                        checkInM = rand(15, 59);
                    } else {
                        checkInH = 9;
                        checkInM = rand(0, 30);
                    }
                    checkInS = rand(0, 59);
                }

                // Determine if late (after 08:15)
                const isLate = checkInH > 8 || (checkInH === 8 && checkInM >= 15);
                const jenisAbsenIn = isLate ? `TERLAMBAT ${workType}` : `CHECK IN ${workType}`;

                // Location
                let lokasi;
                if (workType === 'WFO') {
                    lokasi = pickWeighted(LOKASI_WFO).nama;
                } else {
                    lokasi = pickWeighted(LOKASI_WFH_WFA).nama;
                }

                // Device
                let perangkat;
                if (workType === 'WFO') {
                    perangkat = Math.random() < 0.70 ? 'DESKTOP' : 'MOBILE';
                } else {
                    perangkat = Math.random() < 0.90 ? 'MOBILE' : 'DESKTOP';
                }

                // CHECK IN record
                records.push({
                    id_absen: idAbsen++,
                    nama_karyawan: emp,
                    jenis_absen: jenisAbsenIn,
                    tanggal_absen: formatTimestamp(day, checkInH, checkInM, checkInS),
                    jam_check_in: formatTime(checkInH, checkInM, checkInS),
                    jam_check_out: null,
                    jumlah_jam: null,
                    lokasi,
                    perangkat,
                });

                // Generate check-out time (some people don't check out ~3%)
                if (Math.random() < 0.03) continue;

                let checkOutH, checkOutM, checkOutS;
                const coRoll = Math.random();

                if (coRoll < 0.15) {
                    // 15% leave early (15:00-16:30)
                    checkOutH = rand(15, 16);
                    checkOutM = checkOutH === 16 ? rand(0, 30) : rand(0, 59);
                    checkOutS = rand(0, 59);
                } else if (coRoll < 0.75) {
                    // 60% normal (16:30-17:30)
                    checkOutH = 16;
                    checkOutM = rand(30, 59);
                    if (Math.random() < 0.5) { checkOutH = 17; checkOutM = rand(0, 30); }
                    checkOutS = rand(0, 59);
                } else {
                    // 25% overtime (17:30-21:00)
                    checkOutH = 17;
                    checkOutM = rand(30, 59);
                    if (Math.random() < 0.5) { checkOutH = rand(18, 20); checkOutM = rand(0, 59); }
                    checkOutS = rand(0, 59);
                }

                // Calculate hours worked
                const totalMinIn = checkInH * 60 + checkInM;
                const totalMinOut = checkOutH * 60 + checkOutM;
                const diffMin = totalMinOut - totalMinIn;
                const jumlahJam = (diffMin / 60).toFixed(2);

                // CHECK OUT record
                records.push({
                    id_absen: idAbsen++,
                    nama_karyawan: emp,
                    jenis_absen: 'CHECK OUT',
                    tanggal_absen: formatTimestamp(day, checkOutH, checkOutM, checkOutS),
                    jam_check_in: formatTime(checkInH, checkInM, checkInS),
                    jam_check_out: formatTime(checkOutH, checkOutM, checkOutS),
                    jumlah_jam: jumlahJam,
                    lokasi,
                    perangkat,
                });
            }
        }
    }

    console.log(`[Seed] Generated ${records.length} log_absen records`);
    return records;
}

function generateMTicket() {
    console.log('[Seed] Generating m_ticket data...');
    const records = [];
    let ticketId = 1;

    // Per-type sequential counters per month
    const seqCounters = {};

    // Monthly volume with seasonal variation
    const monthlyVolumes = {
        1: 250, 2: 270, 3: 260, 4: 340, 5: 350, 6: 330,
        7: 280, 8: 270, 9: 290, 10: 300, 11: 260, 12: 200,
    };

    for (const month of CONFIG.MONTHS) {
        const targetCount = monthlyVolumes[month] + rand(-20, 20);
        const daysInMonth = new Date(CONFIG.YEAR, month, 0).getDate();
        const monthStr = String(month).padStart(2, '0');
        const yearStr = String(CONFIG.YEAR).slice(-2);

        seqCounters[month] = { 'I': 0, 'C': 0, 'E': 0, 'O': 0 };

        for (let i = 0; i < targetCount; i++) {
            // Ticket type: 1=Incident(35%), 2=Change(35%), 3=Explorasi(20%), 0=Other(10%)
            const typeRoll = Math.random();
            let ticketType, typePrefix;
            if (typeRoll < 0.35) { ticketType = 1; typePrefix = 'I'; }
            else if (typeRoll < 0.70) { ticketType = 2; typePrefix = 'C'; }
            else if (typeRoll < 0.90) { ticketType = 3; typePrefix = 'E'; }
            else { ticketType = 0; typePrefix = 'O'; }

            seqCounters[month][typePrefix]++;
            const noTicket = `${typePrefix}-${seqCounters[month][typePrefix]}/${monthStr}/${yearStr}`;

            // Developer
            const devName = pickOne(DEVELOPERS);

            // Create date: random day in month, working hours
            const createDay = rand(1, daysInMonth);
            const createDate = new Date(CONFIG.YEAR, month - 1, createDay);
            const createH = rand(8, 17);
            const createM = rand(0, 59);
            const createS = rand(0, 59);
            const createTs = formatTimestamp(createDate, createH, createM, createS);

            // req_date: 0-5 days before create_date
            const reqDate = new Date(createDate);
            reqDate.setDate(reqDate.getDate() - rand(0, 5));
            const reqTs = formatTimestamp(reqDate, rand(8, 17), rand(0, 59), rand(0, 59));

            // Status with logical distribution
            const statusRoll = Math.random();
            let status;
            if (statusRoll < 0.55) status = 'close';
            else if (statusRoll < 0.75) status = 'on progress';
            else if (statusRoll < 0.90) status = 'open';
            else status = 'pending';

            // start_progress: only if not 'open'
            let startProgressTs = null;
            const startProgressDate = new Date(createDate);
            if (status !== 'open') {
                startProgressDate.setHours(startProgressDate.getHours() + rand(0, 48));
                startProgressTs = formatTimestamp(startProgressDate, rand(8, 17), rand(0, 59), rand(0, 59));
            }

            // target_complete: based on ticket type
            let daysToComplete;
            switch (ticketType) {
                case 1: daysToComplete = rand(1, 7); break;   // Incident: 1-7 days
                case 2: daysToComplete = rand(5, 30); break;  // Change: 5-30 days
                case 3: daysToComplete = rand(7, 21); break;  // Explorasi: 7-21 days
                default: daysToComplete = rand(3, 14); break; // Other: 3-14 days
            }
            const targetDate = new Date(createDate);
            targetDate.setDate(targetDate.getDate() + daysToComplete);
            const targetTs = formatTimestamp(targetDate, rand(8, 17), rand(0, 59), rand(0, 59));

            // last_edited: depends on status
            let lastEditedDate;
            if (status === 'close') {
                // Closed before or at target
                lastEditedDate = new Date(targetDate);
                if (Math.random() < 0.7) {
                    // 70% finished early
                    lastEditedDate.setDate(lastEditedDate.getDate() - rand(0, Math.max(1, daysToComplete - 1)));
                }
            } else if (status === 'on progress' || status === 'pending') {
                lastEditedDate = new Date(startProgressDate || createDate);
                lastEditedDate.setDate(lastEditedDate.getDate() + rand(1, 5));
            } else {
                lastEditedDate = new Date(createDate);
                lastEditedDate.setDate(lastEditedDate.getDate() + rand(0, 2));
            }
            const lastEditedTs = formatTimestamp(lastEditedDate, rand(8, 17), rand(0, 59), rand(0, 59));

            records.push({
                id: ticketId++,
                ticket_type: ticketType,
                no_ticket: noTicket,
                req_date: reqTs,
                dev_name: devName,
                target_complete: targetTs,
                status,
                create_date: createTs,
                last_edited: lastEditedTs,
                start_progress: startProgressTs,
            });
        }
    }

    console.log(`[Seed] Generated ${records.length} m_ticket records`);
    return records;
}

function generateNossaClosed() {
    console.log('[Seed] Generating nossa_closed data...');
    const records = [];
    let incidentSeq = 200003200;

    // Monthly volume with seasonal variation (rainy = more fiber issues)
    const monthlyVolumes = {
        1: 1050, 2: 1080, 3: 900, 4: 850, 5: 880, 6: 820,
        7: 860, 8: 870, 9: 830, 10: 950, 11: 1100, 12: 1080,
    };

    for (const month of CONFIG.MONTHS) {
        const targetCount = monthlyVolumes[month] + rand(-40, 40);
        const daysInMonth = new Date(CONFIG.YEAR, month, 0).getDate();
        const rainy = isRainySeason(month);

        for (let i = 0; i < targetCount; i++) {
            incidentSeq++;
            const incident = `IN${incidentSeq}`;

            // Customer
            const customerName = pickOne(CUSTOMERS);

            // Witel (weighted)
            const witel = pickWeightedFromMap(WITEL_WEIGHTS);
            const regional = WITEL_REGIONAL[witel];
            const workzone = witelToWorkzone(witel);

            // Symptom (adjusted for season)
            let symptomPool = SYMPTOMS.map(s => ({
                ...s,
                weight: s.weight * (
                    s.season === 'rain' && rainy ? 2.0 :
                        s.season === 'rain' && !rainy ? 0.5 :
                            s.season === 'dry' && !rainy ? 2.0 :
                                s.season === 'dry' && rainy ? 0.5 : 1.0
                ),
            }));
            const symptom = pickWeighted(symptomPool).text;

            // Summary
            const summary = `[${witel}] ${customerName} - ${symptom}`;

            // Service ID & No
            const serviceId = generateServiceId();
            const serviceNo = generateServiceNo();

            // Other fields
            const customerSegment = pickOne(CUSTOMER_SEGMENTS);
            const source = pickOne(SOURCES);
            const serviceType = pickOne(SERVICE_TYPES);

            // Reported date
            const repDay = rand(1, daysInMonth);
            const repDate = new Date(CONFIG.YEAR, month - 1, repDay);
            const repH = rand(0, 23);
            const repM = rand(0, 59);
            const repS = rand(0, 59);
            const reportedDateTs = formatTimestamp(repDate, repH, repM, repS);

            // Status: CLOSED(65%), RESOLVED(15%), ANALYSIS(12%), NEW(8%)
            const statusRoll = Math.random();
            let status;
            if (statusRoll < 0.65) status = 'CLOSED';
            else if (statusRoll < 0.80) status = 'RESOLVED';
            else if (statusRoll < 0.92) status = 'ANALYSIS';
            else status = 'NEW';

            // TTR: based on status
            let ttrCustomer = null;
            if (status === 'CLOSED') {
                ttrCustomer = randFloat(0.5, 48);
            } else if (status === 'RESOLVED') {
                ttrCustomer = randFloat(0.5, 72);
            } else if (status === 'ANALYSIS') {
                ttrCustomer = randFloat(24, 168);
            }
            // NEW → null TTR

            // actual_solution: CLOSED/RESOLVED → solution, otherwise null
            let actualSolution = null;
            if (status === 'CLOSED' || status === 'RESOLVED') {
                const solutionPool = SOLUTIONS[symptom] || ['Perbaikan teknis oleh tim lapangan'];
                actualSolution = pickOne(solutionPool);
            }

            // last_update_ticket
            const lastUpdateDate = new Date(repDate);
            if (status === 'CLOSED') {
                lastUpdateDate.setHours(lastUpdateDate.getHours() + Math.ceil(ttrCustomer || rand(1, 48)));
            } else if (status === 'RESOLVED') {
                lastUpdateDate.setHours(lastUpdateDate.getHours() + Math.ceil(ttrCustomer || rand(1, 72)));
            } else if (status === 'ANALYSIS') {
                lastUpdateDate.setDate(lastUpdateDate.getDate() + rand(1, 5));
            } else {
                lastUpdateDate.setDate(lastUpdateDate.getDate() + rand(1, 2));
            }
            const lastUpdateTs = formatTimestamp(lastUpdateDate, rand(0, 23), rand(0, 59), rand(0, 59));

            // status_date
            let statusDateTs = null;
            if (status === 'CLOSED' || status === 'RESOLVED') {
                statusDateTs = lastUpdateTs;
            }

            records.push({
                incident,
                customer_name: customerName,
                summary,
                source,
                customer_segment: customerSegment,
                service_id: serviceId,
                service_no: serviceNo,
                service_type: serviceType,
                reported_date: reportedDateTs,
                ttr_customer: ttrCustomer,
                status,
                last_update_ticket: lastUpdateTs,
                status_date: statusDateTs,
                workzone,
                witel,
                regional,
                symptom,
                actual_solution: actualSolution,
            });
        }
    }

    console.log(`[Seed] Generated ${records.length} nossa_closed records`);
    return records;
}

// ============================================================
// DATABASE INSERT
// ============================================================

async function insertBatch(pool, tableName, columns, rows) {
    const batchSize = CONFIG.BATCH_SIZE;
    let inserted = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const placeholders = batch.map((row, rowIdx) => {
            const offset = rowIdx * columns.length;
            return `(${columns.map((_, colIdx) => `$${offset + colIdx + 1}`).join(', ')})`;
        }).join(', ');

        const values = batch.flatMap(row => columns.map(col => row[col]));

        const query = `INSERT INTO "SDA"."${tableName}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES ${placeholders}`;
        await pool.query(query, values);
        inserted += batch.length;

        if (inserted % 2000 === 0 || inserted === rows.length) {
            console.log(`[Seed] ${tableName}: inserted ${inserted}/${rows.length}`);
        }
    }

    return inserted;
}

// ============================================================
// VERIFICATION
// ============================================================

async function verify(pool) {
    console.log('\n[Verify] === DATA QUALITY REPORT ===\n');

    await pool.query('SET search_path TO "public", "SDA"');

    // log_absen
    const absenStats = await pool.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT nama_karyawan) as employees,
            COUNT(DISTINCT jenis_absen) as jenis_types,
            TO_CHAR(MIN(tanggal_absen), 'YYYY-MM-DD') as min_date,
            TO_CHAR(MAX(tanggal_absen), 'YYYY-MM-DD') as max_date,
            COUNT(CASE WHEN jenis_absen LIKE 'TERLAMBAT%' THEN 1 END) as late_count,
            COUNT(CASE WHEN jenis_absen = 'CHECK OUT' THEN 1 END) as checkout_count
        FROM "SDA"."log_absen"
    `);
    console.log('[Verify] log_absen:', JSON.stringify(absenStats.rows[0]));

    const absenMonthly = await pool.query(`
        SELECT TO_CHAR(tanggal_absen, 'YYYY-MM') as month, COUNT(*) as cnt
        FROM "SDA"."log_absen" GROUP BY 1 ORDER BY 1
    `);
    console.log('[Verify] log_absen monthly:', absenMonthly.rows.map(r => `${r.month}:${r.cnt}`).join(', '));

    // m_ticket
    const ticketStats = await pool.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT dev_name) as devs,
            COUNT(DISTINCT status) as statuses,
            TO_CHAR(MIN(create_date), 'YYYY-MM-DD') as min_date,
            TO_CHAR(MAX(create_date), 'YYYY-MM-DD') as max_date
        FROM "SDA"."m_ticket"
    `);
    console.log('[Verify] m_ticket:', JSON.stringify(ticketStats.rows[0]));

    const ticketMonthly = await pool.query(`
        SELECT TO_CHAR(create_date, 'YYYY-MM') as month, COUNT(*) as cnt
        FROM "SDA"."m_ticket" GROUP BY 1 ORDER BY 1
    `);
    console.log('[Verify] m_ticket monthly:', ticketMonthly.rows.map(r => `${r.month}:${r.cnt}`).join(', '));

    const ticketStatusDist = await pool.query(`
        SELECT status, COUNT(*) as cnt FROM "SDA"."m_ticket" GROUP BY 1 ORDER BY cnt DESC
    `);
    console.log('[Verify] m_ticket status:', ticketStatusDist.rows.map(r => `${r.status}:${r.cnt}`).join(', '));

    // nossa_closed
    const nossaStats = await pool.query(`
        SELECT 
            COUNT(*) as total,
            COUNT(DISTINCT customer_name) as customers,
            COUNT(DISTINCT witel) as witels,
            COUNT(DISTINCT regional) as regionals,
            TO_CHAR(MIN(reported_date), 'YYYY-MM-DD') as min_date,
            TO_CHAR(MAX(reported_date), 'YYYY-MM-DD') as max_date,
            COUNT(CASE WHEN actual_solution IS NOT NULL THEN 1 END) as has_solution,
            COUNT(CASE WHEN ttr_customer IS NOT NULL THEN 1 END) as has_ttr
        FROM "SDA"."nossa_closed"
    `);
    console.log('[Verify] nossa_closed:', JSON.stringify(nossaStats.rows[0]));

    const nossaMonthly = await pool.query(`
        SELECT TO_CHAR(reported_date, 'YYYY-MM') as month, COUNT(*) as cnt
        FROM "SDA"."nossa_closed" GROUP BY 1 ORDER BY 1
    `);
    console.log('[Verify] nossa_closed monthly:', nossaMonthly.rows.map(r => `${r.month}:${r.cnt}`).join(', '));

    // Correlation check: CLOSED/RESOLVED should have solution
    const corr = await pool.query(`
        SELECT 
            status,
            COUNT(*) as total,
            COUNT(actual_solution) as with_solution,
            COUNT(ttr_customer) as with_ttr
        FROM "SDA"."nossa_closed"
        GROUP BY status ORDER BY status
    `);
    console.log('[Verify] nossa_closed correlation (status → solution/ttr):');
    corr.rows.forEach(r => {
        console.log(`  ${r.status}: ${r.total} total, ${r.with_solution} with solution, ${r.with_ttr} with TTR`);
    });

    console.log('\n[Verify] === END REPORT ===');
}

// ============================================================
// MAIN
// ============================================================

async function main() {
    console.log('='.repeat(60));
    console.log('[Seed] SDA Schema Data Seeder');
    console.log('[Seed] Target database:', process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@'));
    console.log('='.repeat(60));

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
    });

    try {
        // Test connection
        await pool.query('SELECT NOW()');
        console.log('[Seed] ✅ Database connected\n');

        // Generate data
        const absenData = generateLogAbsen();
        const ticketData = generateMTicket();
        const nossaData = generateNossaClosed();

        // TRUNCATE existing data
        console.log('\n[Seed] ⚠️  Truncating existing data...');
        await pool.query('TRUNCATE TABLE "SDA"."log_absen" RESTART IDENTITY CASCADE');
        await pool.query('TRUNCATE TABLE "SDA"."m_ticket" RESTART IDENTITY CASCADE');
        await pool.query('TRUNCATE TABLE "SDA"."nossa_closed" CASCADE');
        console.log('[Seed] ✅ Tables truncated\n');

        // Insert data
        console.log('[Seed] Inserting log_absen...');
        const absenCols = ['id_absen', 'nama_karyawan', 'jenis_absen', 'tanggal_absen', 'jam_check_in', 'jam_check_out', 'jumlah_jam', 'lokasi', 'perangkat'];
        await insertBatch(pool, 'log_absen', absenCols, absenData);

        console.log('[Seed] Inserting m_ticket...');
        const ticketCols = ['id', 'ticket_type', 'no_ticket', 'req_date', 'dev_name', 'target_complete', 'status', 'create_date', 'last_edited', 'start_progress'];
        await insertBatch(pool, 'm_ticket', ticketCols, ticketData);

        console.log('[Seed] Inserting nossa_closed...');
        const nossaCols = ['incident', 'customer_name', 'summary', 'source', 'customer_segment', 'service_id', 'service_no', 'service_type', 'reported_date', 'ttr_customer', 'status', 'last_update_ticket', 'status_date', 'workzone', 'witel', 'regional', 'symptom', 'actual_solution'];
        await insertBatch(pool, 'nossa_closed', nossaCols, nossaData);

        // Verify
        await verify(pool);

        console.log('\n[Seed] ✅ All data seeded successfully!');

    } catch (error) {
        console.error('\n[Seed] ❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();
