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
| `jenis_absen`    | varchar(255)               | Jenis absensi (CHECK IN WFO/WFA/WFH, CHECK OUT, TERLAMBAT WFA/WFO/WFH).   |
| `tanggal_absen`  | timestamp                  | Tanggal dan waktu absensi dilakukan. Gunakan hanya bagian tanggal.        |
| `jam_check_in`   | time                       | Jam check-in (abaikan jika jenis_absen adalah CHECK OUT).                 |
| `jam_check_out`  | time                       | Jam check-out (abaikan jika bukan CHECK OUT).                             |
| `jumlah_jam`     | varchar(12) (nullable)     | Lama jam kerja. Jika null berarti belum check-out.                        |
| `lokasi`         | varchar(255)               | Lokasi karyawan saat absensi.                                             |
| `perangkat`      | varchar(255)               | Perangkat yang digunakan (MOBILE, DESKTOP).                               |

**SQL Hint:**  
Gunakan `DATE_TRUNC('day', tanggal_absen)` untuk agregasi harian.

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
