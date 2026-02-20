# Arsitektur Alur Chat & Penggunaan AI

Dokumen ini menjelaskan alur pemrosesan pesan dari User hingga menjadi respon AI, serta menghitung jumlah panggilan ke AI (API Calls) yang terjadi dalam satu siklus percakapan.

## Ringkasan Jumlah Panggilan AI
Setiap kali Anda mengirim pesan, sistem melakukan sejumlah API call tergantung jenis pertanyaan:

| Tipe Percakapan | Deskripsi | Jumlah Call AI | Rincian |
| :--- | :--- | :---: | :--- |
| **General Chat** | Sapaan, tanya umum | **2** | 1 Embedding + 1 LLM Final |
| **Knowledge (Kebijakan)** | Tanya SOP, aturan | **3** | 1 Embedding + 1 Rerank + 1 LLM Final |
| **Data Analysis (SQL)** | Tanya data, tren, angka | **4** | 1 Embedding + 1 Rerank + 1 SQL Plan + 1 LLM Final |

---

## Alur Detail (End-to-End Flow)

### 1. User Input
*   **Action:** User mengirim pesan.
*   **Contoh:** *"Analisis tren tiket bulan lalu"*

### 2. Klasifikasi Intent (Phase 0)
*   **API Call #1 (Embedding):** Gemini Text Embedding.
*   **Proses:** Mengubah teks user menjadi vektor numerik.
*   **Tujuan:** Mencocokkan pertanyaan dengan kategori (General, Policy, Descriptive, Diagnostic).
*   **Output:** `intent` (misal: `descriptive`).

### 3. Percabangan (Branching)

#### A. Jika Intent = `general` / `conversation`
*   **Skip RAG:** Tidak perlu cari data.
*   **API Call #2 (Final Response):** OpenRouter/DeepSeek LLM.
*   **Output:** Jawaban langsung.
*   **Selesai.**

#### B. Jika Intent = RAG (`policy`, `descriptive`, dll)
*   User masuk ke pipeline RAG.

### 4. Retrieval & Reranking (Phase 1 & 2)
*   **Retrieval (No AI):** Cari 10+ dokumen kandidat dari Qdrant (Vector DB).
*   **API Call #2 (Reranking):** OpenRouter/DeepSeek LLM.
    *   **Tugas:** Membaca kandidat dokumen dan memilih 3-5 yang paling relevan.
    *   **Output:** `rerankedContext` (Teks/Schema tabel yang relevan).

### 5. Data Processing (Phase 3)

#### Jalur Knowledge (`policy`, `recommendation` non-data)
*   **Action:** Skip SQL Generation.
*   Lanjut ke tahap 6.

#### Jalur Data (`descriptive`, `diagnostic`, `predictive`)
*   **API Call #3 (SQL Planning):** OpenRouter/DeepSeek LLM.
    *   **Tugas:** Merancang query SQL valid berdasarkan `rerankedContext`.
    *   **Output:** SQL Query (misal: `SELECT count(*) FROM sda.m_ticket...`).
*   **Execution (No AI):** Jalankan SQL ke Database PostgreSQL.
*   **Result:** Data mentah (JSON/Table).

### 6. Final Response Generation (Phase 4)
*   **API Call #4 (Final Response):** OpenRouter/DeepSeek LLM.
*   **Input:** Pertanyaan User + Data Mentah/Konteks + History Chat.
*   **Tugas:** Menerjemahkan data menjadi penjelasan bahasa manusia yang mudah dimengerti.
*   **Output:** Respon akhir di layar obrolan.

---

### Catatan Resilience (Ketahanan Sistem)
Jika salah satu API Call di tahap 3, 4, atau 5 gagal (karena "System Busy" / Rate Limit):
1.  Sistem akan mencoba **Fallback**.
2.  Jika SQL gagal, sistem menjawab pakai konteks saja.
3.  Jika Final Response gagal, sistem **menampilkan data mentah** (tabel/teks) agar User tetap mendapat informasi.
