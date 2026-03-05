# Database Context: Schema SDA — DVO Tables (PostgreSQL)

**Deskripsi Umum:**
Schema `SDA` menyimpan data operasional jaringan Wi-Fi (WMS/DVO), termasuk inventaris perangkat Access Point (AP) dan log trafik pengunjung per periode.
Gunakan tabel berdasarkan konteks pertanyaan pengguna.

---

## Daftar Tabel
1. [`v_inventory_wmsl`](#1-v_inventory_wmsl) — Inventaris perangkat Access Point (AP)
2. [`vowner_traffic_202510`](#2-vowner_traffic_202510) — Log trafik pengunjung Wi-Fi (periode Oktober 2025)

---

## 1. `v_inventory_wmsl`

**Deskripsi:**
View/tabel inventaris perangkat Access Point yang terdaftar di sistem WMS (Wifi Management System). Berisi informasi lokasi, status, identitas perangkat, dan skema bisnis AP.
Gunakan tabel ini untuk pertanyaan tentang **inventaris AP**, **perangkat**, **lokasi AP**, **status AP**, **witel**, **regional**, atau **skema bisnis**.

**Kata Kunci Utama:**
`access point`, `AP`, `inventaris`, `perangkat`, `lokasi`, `status`, `witel`, `regional`, `STO`, `mac address`, `skema bisnis`, `onair`, `WMS`, `WMSL`.

**Aturan Penggunaan:**
- Tidak ada primary key eksplisit; gunakan `mac_address` atau `sn` (serial number) sebagai identifikasi unik perangkat.
- `status` berisi `'Up'` atau `'Down'` untuk status AP saat ini.
- `onair_date` berformat string `YYYYMMDD` (contoh: `'20180830'`), perlu di-cast ke DATE jika ingin filter tanggal.
- `status_ont` bisa berisi `'DYING GASP'` atau nilai lain terkait status ONT/OLT.
- Kolom `latitude` dan `longitude` berformat string, cast ke numeric jika perlu kalkulasi geospasial.
- Kolom `skema_bisnis` berisi `'MS Standard Silver'`, `'BASIC'`, `'BASIC/WICO'`, dll.
- `kategori` berisi kategori AP (contoh: `'WMS'`, `'BASIC/WICO'`).
- Tabel ini dapat di-join dengan `vowner_traffic_202510` melalui kolom `ap_name` atau `sn` atau `order_id`.

**Kolom Lengkap:**

| Nama Kolom         | Tipe Data         | Deskripsi |
|--------------------|-------------------|-----------|
| `ap_name`          | character varying | Nama/label Access Point di sistem WMS. |
| `order_id`         | character varying | ID order pemasangan AP. |
| `mac_address`      | character varying | MAC address perangkat AP. Format: `xx:xx:xx:xx:xx:xx`. |
| `loc_id`           | character varying | ID lokasi AP. |
| `name_site`        | character varying | Nama site/lokasi pemasangan AP. |
| `onair_date`       | character varying | Tanggal AP mulai aktif. Format string `YYYYMMDD`. |
| `latitude`         | character varying | Koordinat lintang lokasi AP (string). |
| `longitude`        | character varying | Koordinat bujur lokasi AP (string). |
| `status`           | character varying | Status AP saat ini: `'Up'` = aktif, `'Down'` = mati/offline. |
| `sid`              | character varying | Service ID (SID) layanan. |
| `location`         | character varying | Alamat atau deskripsi lokasi AP secara detail (termasuk kecamatan, kota, negara). |
| `name_sold`        | character varying | Nama penjual atau customer pemilik AP. |
| `sn`               | character varying | Serial Number (SN) perangkat AP (hardware). |
| `status_ont`       | character varying | Status ONT: contoh `'DYING GASP'` jika perangkat mati mendadak. |
| `regional`         | character varying | Regional Telkom (contoh: `'BENGKULU'`, `'BALIKPAPAN'`). |
| `witel`            | character varying | Wilayah Telkom (contoh: `'MKG'`). |
| `sto`              | character varying | Nama STO (Sentral Telepon Otomat) terkait. |
| `skema_bisnis`     | character varying | Skema bisnis AP (contoh: `'MS Standard Silver'`, `'BASIC'`, `'BASIC/WICO'`). |
| `contr_name`       | character varying | Nama kontraktor atau IP address controller AP. |
| `item_description` | character varying | Deskripsi tipe perangkat AP (contoh: `'AP_CISCO_AIR-AP1832I-F-K9'`). |
| `kategori`         | character varying | Kategori AP (contoh: `'WMS'`, `'BASIC/WICO'`). |

**⚠️ CRITICAL SQL RULES untuk v_inventory_wmsl:**
1. **status** — Gunakan `= 'Up'` atau `= 'Down'` (perhatikan kapital huruf pertama).
2. **onair_date** — Untuk filter tanggal, cast dulu: `TO_DATE(onair_date, 'YYYYMMDD')`.
3. **latitude/longitude** — Cast ke numeric: `CAST(latitude AS NUMERIC)` jika perlu operasi matematis.
4. **Schema** — Gunakan prefix `"DVO"."v_inventory_wmsl"` dalam query.

**🔑 KEYWORD → KOLOM MAPPING (WAJIB DIPATUHI):**
> TIDAK ADA kolom bernama `lokasi`, `koordinat`, `alamat`, `posisi`, `lon`, `lat` — JANGAN PERNAH gunakan nama-nama ini!

| Kata kunci pengguna | Kolom yang BENAR untuk digunakan |
|---------------------|----------------------------------|
| "lokasi", "di mana", "tempat", "alamat" | `location` (teks alamat lengkap) |
| "koordinat", "titik", "peta", "maps" | `latitude`, `longitude` (string, cast ke NUMERIC jika perlu) |
| "lokasi dan koordinat" | `location`, `latitude`, `longitude` |
| "nama lokasi", "nama site" | `name_site` |
| "id lokasi" | `loc_id` |
| "status", "aktif", "mati", "online", "offline" | `status` — nilai: `'Up'` atau `'Down'` |
| "merk", "tipe perangkat", "model AP" | `item_description` |
| "kontrak", "controller", "IP controller" | `contr_name` |
| "skema", "bisnis", "paket bisnis" | `skema_bisnis` |


**SQL Hint — AP yang sedang Down per witel:**
```sql
SELECT witel, COUNT(*) AS jumlah_down
FROM DVO.v_inventory_wmsl
WHERE status = 'Down'
GROUP BY witel
ORDER BY jumlah_down DESC;
```

**SQL Hint — AP yang baru onair dalam 6 bulan terakhir:**
```sql
SELECT ap_name, witel, regional, onair_date
FROM DVO.v_inventory_wmsl
WHERE TO_DATE(onair_date, 'YYYYMMDD') >= CURRENT_DATE - INTERVAL '6 months'
ORDER BY onair_date DESC;
```

**SQL Hint — Total AP aktif vs tidak aktif per regional:**
```sql
SELECT regional,
       SUM(CASE WHEN status = 'Up' THEN 1 ELSE 0 END)   AS ap_up,
       SUM(CASE WHEN status = 'Down' THEN 1 ELSE 0 END) AS ap_down,
       COUNT(*) AS total
FROM DVO.v_inventory_wmsl
GROUP BY regional
ORDER BY total DESC;
```

---

## 2. `vowner_traffic_202510`

**Deskripsi:**
Tabel log trafik pengunjung Wi-Fi dari AP yang terdaftar di sistem DVO/WMS, untuk periode **Oktober 2025** (suffix `_202510`).
Setiap baris merepresentasikan satu sesi atau agregasi trafik dari satu perangkat klien (MAC address) di sebuah AP pada tanggal tertentu.
Gunakan tabel ini untuk pertanyaan tentang **trafik Wi-Fi**, **jumlah pengunjung/klien**, **volume data**, **durasi koneksi**, **paket**, atau **analisis per AP/lokasi/periode**.

**Kata Kunci Utama:**
`trafik`, `traffic`, `hit`, `volume`, `client`, `klien`, `pengunjung`, `durasi`, `koneksi`, `paket`, `SSID`, `vowner`, `wi-fi usage`.

**Aturan Penggunaan:**
- `periode` berformat string `YYYYMMDD` (contoh: `'20251020'`), cast ke DATE jika perlu.
- `jumlah_hit` = jumlah koneksi/request dari klien.
- `jumlah_vol` = total volume data (satuan perlu dikonfirmasi dari konteks, kemungkinan KB atau bytes).
- `jumlah_client` = jumlah device/klien unik yang terkoneksi.
- `duration` = durasi koneksi dalam satuan tertentu (kemungkinan detik atau menit).
- `mac_address` format `xx:xx:xx:xx:xx:xx`, identifikasi unik perangkat klien.
- `ap_name` dapat di-join dengan `v_inventory_wmsl.ap_name` untuk info lokasi/status AP.
- `user_type` membedakan tipe pengguna: dapat berisi nilai seperti `'vowner'`, `'regular'`, dll.
- `paket` berisi paket layanan yang digunakan pelanggan.

**Kolom Lengkap:**

| Nama Kolom      | Tipe Data         | Deskripsi |
|-----------------|-------------------|-----------|
| `periode`       | character varying | Tanggal trafik dicatat. Format: `YYYYMMDD`. |
| `ap_name`       | character varying | Nama Access Point sumber trafik. FK ke `v_inventory_wmsl.ap_name`. |
| `location`      | character varying | Lokasi AP. |
| `regional`      | character varying | Regional Telkom (contoh: `'BALIKPAPAN'`). |
| `witel`         | character varying | Wilayah Telkom. |
| `kota`          | character varying | Nama kota lokasi AP. |
| `jumlah_hit`    | numeric           | Jumlah hit/koneksi yang dilakukan klien. |
| `jumlah_vol`    | numeric           | Total volume data yang digunakan. |
| `jumlah_client` | numeric           | Jumlah klien/device unik yang terkoneksi. |
| `duration`      | numeric           | Durasi koneksi klien. |
| `ssid`          | character varying | SSID Wi-Fi yang digunakan klien. |
| `order_id`      | character varying | ID order AP. FK ke `v_inventory_wmsl.order_id`. |
| `sn`            | character varying | Serial Number AP. FK ke `v_inventory_wmsl.sn`. |
| `mac_address`   | character varying | MAC address perangkat klien (bukan AP). |
| `onair_date`    | character varying | Tanggal AP onair. Format `YYYYMMDD`. |
| `sid`           | character varying | Service ID. |
| `partner_id`    | numeric           | ID partner/mitra bisnis. |
| `vowner_id`     | numeric           | ID vowner (pemilik virtual). |
| `customer`      | character varying | Nama customer/pelanggan. |
| `idx`           | numeric           | Index atau identifier baris. |
| `paket`         | character varying | Paket layanan Wi-Fi yang digunakan. |
| `user_type`     | character varying | Tipe pengguna (contoh: `'vowner'`, `'regular'`). |

**⚠️ CRITICAL SQL RULES untuk vowner_traffic_202510:**
1. **periode** — Cast ke DATE untuk filter: `TO_DATE(periode, 'YYYYMMDD')`.
2. **Nama tabel** — Selalu gunakan `DVO.vowner_traffic_202510` (dengan prefix schema).
3. **Join dengan inventaris** — `JOIN DVO.v_inventory_wmsl inv ON t.ap_name = inv.ap_name`.
4. **NULL handling** — Banyak kolom bisa NULL (terutama `ssid`, `paket`, `customer`). Gunakan `COALESCE` jika perlu.

**SQL Hint — Total trafik per AP (top 10 tersibuk):**
```sql
SELECT ap_name, regional,
       SUM(jumlah_hit)    AS total_hit,
       SUM(jumlah_vol)    AS total_volume,
       SUM(jumlah_client) AS total_klien
FROM DVO.vowner_traffic_202510
GROUP BY ap_name, regional
ORDER BY total_hit DESC
LIMIT 10;
```

**SQL Hint — Trafik harian dalam periode tertentu:**
```sql
SELECT TO_DATE(periode, 'YYYYMMDD') AS tanggal,
       COUNT(DISTINCT mac_address)  AS unique_clients,
       SUM(jumlah_hit)              AS total_hit,
       SUM(jumlah_vol)              AS total_volume
FROM DVO.vowner_traffic_202510
WHERE periode BETWEEN '20251001' AND '20251031'
GROUP BY 1
ORDER BY 1;
```

**SQL Hint — Join inventaris + trafik untuk info lengkap AP:**
```sql
SELECT t.ap_name,
       inv.witel,
       inv.regional,
       inv.status      AS status_ap,
       SUM(t.jumlah_hit)    AS total_hit,
       SUM(t.jumlah_client) AS total_klien
FROM DVO.vowner_traffic_202510 t
JOIN DVO.v_inventory_wmsl inv ON t.ap_name = inv.ap_name
GROUP BY t.ap_name, inv.witel, inv.regional, inv.status
ORDER BY total_hit DESC
LIMIT 20;
```

**SQL Hint — AP dengan trafik tapi status Down (anomali):**
```sql
SELECT t.ap_name, inv.status, inv.witel,
       SUM(t.jumlah_hit) AS total_hit
FROM DVO.vowner_traffic_202510 t
JOIN DVO.v_inventory_wmsl inv ON t.ap_name = inv.ap_name
WHERE inv.status = 'Down'
GROUP BY t.ap_name, inv.status, inv.witel
ORDER BY total_hit DESC;
```

---

## RAG Notes

| Tabel | Typical Query Use |
|-------|-------------------|
| `v_inventory_wmsl` | Status AP, inventaris, jumlah per witel/regional, filter lokasi |
| `vowner_traffic_202510` | Trafik per AP/hari, volume data, jumlah klien, analisis periode |
| **JOIN keduanya** | AP mana yang ramai tapi Down, perbandingan inventaris vs aktual trafik |
