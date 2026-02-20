# Database Context: Schema SDA (PostgreSQL)

**Deskripsi Umum:**  
Schema `SDA` menyimpan data tentang aktivitas internal perusahaan, terdiri dari log absensi karyawan dan sistem ticketing pekerjaan serta aduan pelanggan (*Nossa*).  
Setiap tabel **berdiri sendiri (non-relasional)** dan **tidak boleh di-join** antar tabel.  
Gunakan tabel berdasarkan konteks prompt pengguna.

---

## Daftar Tabel
1. [`log_absen`](#1-log_absen) – Log kehadiran karyawan  
2. [`m_ticket`](#2-m_ticket) – Data tiket pekerjaan / request internal  
3. [`nossa_closed`](#3-nossa_closed) – Data gangguan layanan pelanggan (Nossa)

---

## `log_absen`

**Deskripsi:**  
Tabel ini berisi histori log absensi karyawan (check-in/check-out).  
Gunakan tabel ini jika prompt menyinggung **absensi**, **kehadiran**, **check-in/out**, **terlambat**, atau **lembur**.  
Data ini **tidak dapat di-join** dengan tabel lain.

**Kata Kunci Utama:**  
`absensi`, `check in`, `check out`, `kehadiran`, `terlambat`, `lembur`, `lokasi`, `perangkat`.

**Aturan Penggunaan:**
- Gunakan `nama_karyawan` + `tanggal_absen` sebagai pasangan unik untuk identifikasi kehadiran.  
- Abaikan `jam_check_out` jika `jenis_absen` bukan `'CHECK OUT'`.  
- Jika menghitung durasi kerja, gunakan `jumlah_jam` atau selisih antara `jam_check_in` dan `jam_check_out`.  
- Untuk analisis harian gunakan:  
  ```sql
  SELECT DATE(tanggal_absen), COUNT(*) FROM SDA.log_absen GROUP BY 1;
  ```

**Kolom Penting:**

| Nama Kolom       | Tipe Data                  | Deskripsi                                                                 |
|------------------|----------------------------|---------------------------------------------------------------------------|
| `id_absen`       | integer (PK)               | Primary key tabel.                                                        |
| `nama_karyawan`  | varchar(255)               | Nama karyawan yang melakukan absen.                                       |
| `jenis_absen`    | varchar(255)               | Jenis absensi. **Nilai enum yang PERSIS ada di database:** `'CHECK IN WFO'`, `'CHECK IN WFH'`, `'CHECK IN WFA'`, `'CHECK OUT'`, `'TERLAMBAT WFO'`, `'TERLAMBAT WFH'`, `'TERLAMBAT WFA'`. **JANGAN gunakan** `'CHECK IN'` atau `'TERLAMBAT'` saja — pasti 0 hasil! Gunakan `ILIKE '%CHECK IN%'` atau `ILIKE '%TERLAMBAT%'` untuk matching multi-tipe. |
| `tanggal_absen`  | timestamp                  | Tanggal dan waktu absensi. **Rentang data tersedia: 2025-01-01 s/d 2025-12-31.** Untuk query rentang bulan, gunakan `BETWEEN '2025-01-01' AND '2025-12-31'` atau `EXTRACT(YEAR FROM tanggal_absen) = 2025`. **JANGAN gunakan `NOW()` karena data hanya sampai 2025!** |
| `jam_check_in`   | time                       | Jam check-in. Tepat waktu = `jam_check_in <= '09:00:00'`. Terlambat = `jam_check_in > '09:00:00'`. |
| `jam_check_out`  | time                       | Jam check-out (abaikan jika bukan CHECK OUT). |
| `jumlah_jam`     | varchar(12) (nullable)     | Lama jam kerja. Jika null berarti belum check-out. |
| `lokasi`         | varchar(255)               | Lokasi karyawan saat absensi. |
| `perangkat`      | varchar(255)               | Perangkat yang digunakan (MOBILE, DESKTOP). |

**⚠️ CRITICAL SQL RULES untuk log_absen:**
1. **jenis_absen** — SELALU gunakan `ILIKE '%CHECK IN%'` bukan `= 'CHECK IN'`
2. **tanggal_absen** — Data hanya ada di tahun **2025**. Jangan pakai `NOW()` atau `CURRENT_DATE`. Gunakan `EXTRACT(YEAR FROM tanggal_absen) = 2025` atau rentang eksplisit.
3. **Tepat waktu** = `jenis_absen ILIKE '%CHECK IN%' AND jam_check_in <= '09:00:00'`
4. **Terlambat** = `jenis_absen ILIKE '%TERLAMBAT%'` (sudah terpisah dari CHECK IN)

**SQL Hint — Karyawan Tepat Waktu:**
```sql
SELECT nama_karyawan, COUNT(*) AS jumlah_tepat_waktu
FROM "SDA".log_absen
WHERE jenis_absen ILIKE '%CHECK IN%'
  AND jam_check_in <= '09:00:00'
  AND EXTRACT(YEAR FROM tanggal_absen) = 2025
GROUP BY nama_karyawan
ORDER BY jumlah_tepat_waktu DESC
LIMIT 100;
```

**SQL Hint — Karyawan Sering Terlambat:**
```sql
SELECT nama_karyawan, COUNT(*) AS jumlah_terlambat
FROM "SDA".log_absen
WHERE jenis_absen ILIKE '%TERLAMBAT%'
  AND EXTRACT(YEAR FROM tanggal_absen) = 2025
GROUP BY nama_karyawan
ORDER BY jumlah_terlambat DESC
LIMIT 100;
```

**SQL Hint per bulan (gunakan angka bulan eksplisit):**
```sql
-- Contoh: bulan Januari 2025
WHERE EXTRACT(YEAR FROM tanggal_absen) = 2025
  AND EXTRACT(MONTH FROM tanggal_absen) = 1
```

---

## `m_ticket`

**Deskripsi:**  
Tabel ini berisi data tiket pekerjaan atau request karyawan internal.  
Gunakan tabel ini untuk prompt yang membahas **tiket**, **request pekerjaan**, **status pekerjaan**, atau **kinerja developer**.  
Tabel ini **tidak boleh di-join** dengan tabel lain.

**Kata Kunci Utama:**  
`tiket`, `request`, `status`, `pekerjaan`, `target`, `progress`, `developer`.

**Aturan Penggunaan:**
- Kolom `ticket_type`:  
  - 1 = Incident  
  - 2 = Change  
  - 3 = Explorasi  
  - 0 atau null = Lain-lain  
- Gunakan `create_date` untuk tanggal pembuatan tiket, `start_progress` untuk mulai kerja, dan `target_complete` untuk deadline.  
- Gunakan `status` untuk memfilter kondisi tiket (`open`, `on progress`, `close`).  
- Untuk menghitung rata-rata durasi kerja dalam jam:
  ```sql
  SELECT 
    ROUND(AVG(EXTRACT(EPOCH FROM (target_complete - start_progress)) / 3600)::numeric, 2) AS avg_duration_hours
  FROM SDA.m_ticket;
  ```

**Kolom Penting:**

| Nama Kolom        | Tipe Data     | Deskripsi |
|--------------------|---------------|------------|
| `id`               | bigint (PK)   | Primary key tiket. |
| `ticket_type`      | bigint        | Jenis tiket (1=incident, 2=change, 3=explorasi, 0/lain-lain). |
| `no_ticket`        | varchar(255)  | Nomor unik tiket. |
| `req_date`         | timestamp     | Tanggal/waktu pekerjaan dimulai. |
| `dev_name`         | varchar(255)  | Nama developer/karyawan terkait. |
| `target_complete`  | timestamp     | Deadline penyelesaian pekerjaan. |
| `status`           | varchar(255)  | Status tiket (‘open’, ‘on progress’, ‘close’). |
| `create_date`      | timestamp     | Waktu tiket dibuat. |
| `last_edited`      | timestamp     | Terakhir kali tiket diubah. |
| `start_progress`   | timestamp     | Waktu pekerjaan dimulai oleh developer. |

**SQL Hint:**
- Gunakan `DATE_TRUNC('month', create_date)` untuk laporan bulanan.
- Gunakan `EXTRACT(YEAR FROM create_date)` untuk filter per tahun.
- Hindari `SELECT DISTINCT ... ORDER BY ...` dengan kolom berbeda (PostgreSQL constraint).

---

##  `nossa_closed`

**Deskripsi:**  
Tabel ini berisi daftar tiket aduan pelanggan (*Nossa*).  
Gunakan tabel ini jika prompt berisi kata seperti **gangguan**, **nossa**, **service_id**, **pelanggan**, atau **aduan**.  
Tabel ini berdiri sendiri dan **tidak boleh di-join**.

**Kata Kunci Utama:**  
`nossa`, `aduan`, `gangguan`, `service_id`, `service_no`, `witel`, `regional`, `ttr`, `symptom`.

**Aturan Penggunaan:**
- Gunakan `incident` untuk menghitung jumlah aduan.  
- Gunakan `ttr_customer` untuk analisis *time to response (TTR)*.  
- `reported_date` menunjukkan kapan aduan pertama kali dibuat.  
- `status` menunjukkan tahap penyelesaian tiket (`CLOSED`, `PENDINGS`, `RESOLVED`, dll).  
- Untuk hitung total gangguan per wilayah:
  ```sql
  SELECT witel, COUNT(incident) AS total_gangguan
  FROM SDA.nossa_closed
  GROUP BY witel;
  ```

**Kolom Penting:**

| Nama Kolom        | Tipe Data     | Deskripsi |
|--------------------|---------------|------------|
| `incident`         | varchar(25)   | Nomor tiket aduan. |
| `customer_name`    | varchar(100)  | Nama pelanggan. |
| `summary`          | text          | Ringkasan kendala atau lokasi. |
| `service_id`       | varchar(500)  | Nomor service circuit yang diadukan. |
| `reported_date`    | timestamp     | Tanggal laporan dibuat. |
| `ttr_customer`     | numeric(16,2) | Waktu respons pelanggan (jam). |
| `status`           | varchar(10)   | Status tiket (CLOSED, RESOLVED, dll). |
| `witel`            | varchar(100)  | Wilayah Telkom. |
| `regional`         | varchar(100)  | Regional Telkom. |
| `symptom`          | varchar(300)  | Penyebab gangguan. |
| `actual_solution`  | text          | Solusi penanganan kerusakan. |

**SQL Hint:**  
Gunakan `DATE_TRUNC('day', reported_date)` untuk rekap harian gangguan.  

---

## RAG Implementation Notes

| Tahap | Tujuan | Input Ideal |
|--------|--------|-------------|
| **Embedding** | Representasikan tiap tabel + kolom + deskripsi sebagai dokumen vektor. | Gunakan tiap section tabel (deskripsi + keywords + kolom penting) sebagai unit embedding. |
| **Retrieval** | Ambil tabel relevan berdasarkan query pengguna (misal: “berapa tiket bulan Juli?” → ambil `m_ticket`). | Gunakan semantic similarity dari *keywords* dan deskripsi. |
| **Reranking** | Prioritaskan dokumen dengan kolom yang paling sesuai dengan entitas atau atribut yang disebut pengguna. | Gunakan `reranker` untuk memilih konteks kolom paling relevan. |
| **Query Generation** | Gunakan konteks hasil rerank untuk membentuk SQL query PostgreSQL. | Gunakan *SQL Hints* dan *Aturan Penggunaan* untuk memastikan query valid. |
