# TMAChat RAG + Prediction Architecture

**2-Phase Implementation**: Multi-collection RAG dengan Qdrant + Prediction Capabilities

---

## Overview

### Phase 1: RAG Foundation + Statistical Prediction
- Multi-collection vector database (Qdrant)
- Intelligent collection routing
- **Simple statistical prediction** (moving average, growth rate)
- ❌ Tidak ada hallucination: AI hanya gunakan data real dari PostgreSQL

### Phase 2: Advanced ML Prediction (Future)
- Prophet time-series forecasting model
- Python FastAPI service
- Akurasi prediksi lebih tinggi dengan seasonality detection

---

# PHASE 1: RAG + Statistical Prediction

## Goal
Bangun RAG system yang bisa:
1. ✅ Generate SQL query untuk detail data
2. ✅ Jawab analisis/trend dari aggregated data
3. ✅ Rekomendasi berdasarkan company policy
4. ✅ **Prediksi sederhana** berdasarkan statistical methods (tanpa hallucination)

---

## User Review Required

> [!IMPORTANT]
> **Qdrant harus running** — Jalankan via Docker:
> ```bash
> docker pull qdrant/qdrant
> docker run -p 6333:6333 -p 6334:6334 -v qdrant_storage:/qdrant/storage qdrant/qdrant
> ```
> Port 6333: REST API, Port 6334: gRPC (opsional)

> [!IMPORTANT]
> **Strategy untuk Data Jutaan Record** — Kita **TIDAK** embed setiap row:
> - **Agregasi**: Ringkasan per bulan/kategori/regional (~100-1000 summaries)
> - **Real-time SQL**: Data detail tetap di-query via SQL
> - **Hybrid search**: Vector search untuk insight + SQL untuk granular data

> [!IMPORTANT]
> **Prediction Strategy Phase 1** — Statistical methods untuk hindari hallucination:
> - Moving average (3-6 bulan terakhir)
> - Linear growth rate
> - Seasonal pattern detection
> - AI **HANYA** gunakan hasil kalkulasi real, **TIDAK** prediksi sendiri

> [!WARNING]
> Dependency `hnswlib-node` akan digantikan sepenuhnya oleh Qdrant

---

## Proposed Changes - Phase 1

### Collection Architecture

Qdrant akan memiliki **3 collections** terpisah:

| Collection | Purpose | Source | Update Frequency |
|---|---|---|---|
| `schema_context` | Schema tabel, kolom, SQL hints | `lib/context/sda_context.md` | Manual/on-deploy |
| `aggregated_insights` | Ringkasan data (trend, KPI, **statistik prediksi**) | PostgreSQL aggregation + statistical calculations | Cron job (harian/mingguan) |
| `company_knowledge` | SOP, kebijakan, aturan | File markdown/PDF di `lib/context/company/` | Manual upload |

---

### Qdrant Client Service (New)

#### [NEW] [qdrantClient.js](file:///d:/3.Magang/ai-try/tmachat/lib/rag/qdrantClient.js)

Qdrant client wrapper:
- SDK: `@qdrant/js-client-rest`
- Connection: `QDRANT_URL` (dari `.env`)
- Helper functions:
  - `ensureCollection(name, vectorSize)` → buat collection jika belum ada
  - `upsertPoints(collectionName, points)` → insert/update embeddings
  - `searchSimilar(collectionName, queryVector, limit)` → semantic search
  - `searchMultiCollection(collections, queryVector, limit)` → search across collections
- Config: vector size `768`, distance `Cosine`

---

### Vector Store Service (Refactor)

#### [MODIFY] [vectorStoreService.js](file:///d:/3.Magang/ai-try/tmachat/lib/rag/vectorStoreService.js)

Refactor untuk multi-collection:
- **Remove**: `hnswlib-node`, global in-memory state, brute-force fallback
- **Add**: Import `qdrantClient`, multi-collection config
- `initializeVectorStore()` → Cek ketiga collections, seed jika kosong
- `vectorSearch(queryText, k, collections)` → 
  - Embed query via Gemini
  - Search di specified collections
  - Merge & rerank results
  - Return unified result array
- `searchMultiCollection(queryText, collectionWeights)` → weighted search
- **Benefit**: Persistent storage + multi-source knowledge

---

### Aggregation Service (New)

#### [NEW] [aggregationService.js](file:///d:/3.Magang/ai-try/tmachat/lib/rag/aggregationService.js)

Generate summaries **+ statistical predictions** dari PostgreSQL:

**Data Aggregation:**
- `generateMonthlyInsights()` → Agregasi per bulan (absensi, tiket, nossa)
- `generateRegionalInsights()` → Breakdown per witel/regional
- `generateEmployeeInsights()` → Top performers, attendance patterns
- `generateTicketAnalytics()` → Avg resolution time, type distribution

**Statistical Prediction (Phase 1):**
- `calculateMovingAverage(data, period)` → MA untuk smoothing trend
- `calculateGrowthRate(data)` → Percentage growth per period
- `detectSeasonality(data)` → Simple seasonal pattern (monthly/quarterly)
- `predictNextPeriod(data, method)` → Prediksi 1-3 bulan ke depan
  - Methods: `moving_average`, `linear_trend`, `seasonal_adjusted`
  - Output: `{ value, confidence, method, basedOnMonths }`

**Output Format untuk Embedding:**
```javascript
{
  type: 'monthly_summary',
  period: '2026-01',
  data: {
    tickets: { total: 120, closed: 95, avgDuration: 4.2 },
    attendance: { rate: 92, late: 8, wfh: 15 }
  },
  predictions: {
    nextMonth: {
      tickets: { predicted: 128, confidence: 0.75, method: 'moving_average' },
      attendance: { predicted: 93, confidence: 0.82, method: 'linear_trend' }
    }
  },
  summary: "Januari 2026: 120 tiket total, 95 closed (79%), rata-rata 4.2 jam. Prediksi Februari: 128 tiket (+6.7% berdasarkan trend 3 bulan)"
}
```

---

### Document Loader (New)

#### [NEW] [documentLoader.js](file:///d:/3.Magang/ai-try/tmachat/lib/rag/documentLoader.js)

Load company documents:
- **Support formats**: Markdown (`.md`), Text (`.txt`), PDF (`.pdf` via `pdf-parse`)
- **Auto-chunking**: Max 512 tokens per chunk (untuk long documents)
- **Metadata extraction**: filename, section title, document type, last modified
- `loadCompanyDocs()` → scan `lib/context/company/`, return chunks array
- **PDF handling**: Extract text, preserve formatting, chunk by pages/sections

---

### Prediction Service (New)

#### [NEW] [predictionService.js](file:///d:/3.Magang/ai-try/tmachat/lib/rag/predictionService.js)

Centralized prediction logic untuk Phase 1:
- `predictTimeSeries(historicalData, options)` → Main prediction function
  - Input: Array of `{ date, value }` dari PostgreSQL
  - Options: `{ method, periods, confidence }`
  - Output: Prediction object dengan confidence score
  
**Methods:**
1. **Moving Average**: Simple average dari N bulan terakhir
2. **Linear Regression**: Fit trend line, project forward
3. **Seasonal Decomposition**: Detect monthly/quarterly patterns

**Validation:**
- Minimum data points: 6 months untuk reliable prediction
- Confidence scoring berdasarkan variance & data quality
- Outlier detection & handling

**Integration:**
- Called by `aggregationService.js` saat generate insights
- Results embedded ke `aggregated_insights` collection
- AI read predictions dari Qdrant, **tidak** generate sendiri

---

### Environment Variables

#### [MODIFY] [.env](file:///d:/3.Magang/ai-try/tmachat/.env)

Tambah variabel:
```env
# Qdrant Configuration
QDRANT_URL=http://localhost:6333

# Aggregation & Prediction
AGGREGATION_SCHEDULE=0 2 * * *  # Daily at 2 AM
PREDICTION_MIN_DATA_POINTS=6    # Minimum months for prediction
PREDICTION_DEFAULT_METHOD=moving_average
PREDICTION_PERIODS=3            # Predict next 3 months
```

---

### Seed Scripts (New)

#### [NEW] [seedSchemaContext.js](file:///d:/3.Magang/ai-try/tmachat/scripts/seedSchemaContext.js)

Seed schema collection:
- Baca `lib/context/sda_context.md`
- Chunk per tabel/section
- Embed via Gemini → `text-embedding-004`
- Upsert ke `schema_context` collection
- Usage: `node scripts/seedSchemaContext.js`

#### [NEW] [seedAggregatedInsights.js](file:///d:/3.Magang/ai-try/tmachat/scripts/seedAggregatedInsights.js)

Generate & seed insights **with predictions**:
- Query PostgreSQL untuk last 12 months data
- Run `aggregationService.js` → generate summaries
- Run `predictionService.js` → calculate statistical predictions
- Combine summaries + predictions
- Embed via Gemini
- Upsert ke `aggregated_insights` collection
- Usage: `node scripts/seedAggregatedInsights.js`
- **Schedulable**: Via cron untuk auto-update daily/weekly

#### [NEW] [seedCompanyKnowledge.js](file:///d:/3.Magang/ai-try/tmachat/scripts/seedCompanyKnowledge.js)

Seed company documents:
- Scan `lib/context/company/` untuk `.md`, `.txt`, `.pdf`
- Load & chunk via `documentLoader.js`
- Embed via Gemini
- Upsert ke `company_knowledge` collection
- Usage: `node scripts/seedCompanyKnowledge.js`

---

### Package Dependencies

#### [MODIFY] [package.json](file:///d:/3.Magang/ai-try/tmachat/package.json)

**Add dependencies:**
```json
{
  "@qdrant/js-client-rest": "^1.11.0",
  "pdf-parse": "^1.1.1",
  "node-cron": "^3.0.3",
  "simple-statistics": "^7.8.3"  // For statistical calculations
}
```

**Remove (optional):**
- `hnswlib-node` (digantikan Qdrant)

**Add scripts:**
```json
{
  "seed:schema": "node scripts/seedSchemaContext.js",
  "seed:insights": "node scripts/seedAggregatedInsights.js",
  "seed:knowledge": "node scripts/seedCompanyKnowledge.js",
  "seed:all": "npm run seed:schema && npm run seed:insights && npm run seed:knowledge",
  "update:insights": "node scripts/seedAggregatedInsights.js --update"
}
```

---

### RAG Layer Enhancement

#### [MODIFY] [ragLayer.js](file:///d:/3.Magang/ai-try/tmachat/lib/rag/ragLayer.js)

**Add intelligent collection routing:**

```javascript
// Deteksi query type
const queryIntent = this.detectQueryIntent(userMessage);

let collections = [];
if (queryIntent.isPrediction) {
  // Prediction questions → search aggregated_insights (berisi predictions)
  collections = ['aggregated_insights', 'schema_context'];
} else if (queryIntent.isSQLQuery) {
  // Detail data → search schema only
  collections = ['schema_context'];
} else if (queryIntent.isAnalysis) {
  // Analysis/trend → search schema + insights
  collections = ['schema_context', 'aggregated_insights'];
} else if (queryIntent.isPolicy) {
  // Policy/compliance → search company knowledge
  collections = ['company_knowledge'];
} else {
  // Fallback → search all
  collections = ['schema_context', 'aggregated_insights', 'company_knowledge'];
}

const results = await vectorSearch(userMessage, k, collections);
```

**Add prediction intent detection:**
```javascript
isPrediction: /prediksi|forecast|estimasi|proyeksi|next month|bulan depan|akan|trend ke depan/i.test(query)
```

---

### Create Company Docs Directory

#### [NEW] [lib/context/company/](file:///d:/3.Magang/ai-try/tmachat/lib/context/company/)

Buat folder untuk company documents:
```
lib/context/company/
├── README.md                    # Instruksi cara add documents
├── policies/
│   ├── attendance_policy.md    # Kebijakan kehadiran
│   ├── wfh_policy.md           # Kebijakan WFH/WFA
│   └── leave_policy.md         # Kebijakan cuti
├── sop/
│   ├── ticket_handling.md      # SOP handling tiket
│   └── escalation.md           # SOP eskalasi
└── kpi/
    └── targets.md              # KPI targets perusahaan
```

---

### Unchanged Files

File-file berikut **tidak berubah**:
- [optimizedReranker.js](file:///d:/3.Magang/ai-try/tmachat/lib/rag/optimizedReranker.js)
- [optimizedIntentClassifier.js](file:///d:/3.Magang/ai-try/tmachat/lib/rag/optimizedIntentClassifier.js)
- [openrouter-client.js](file:///d:/3.Magang/ai-try/tmachat/lib/ai/openrouter-client.js)

---

## Verification Plan - Phase 1

### Setup

1. **Start Qdrant**:
   ```bash
   docker run -p 6333:6333 -p 6334:6334 -v qdrant_storage:/qdrant/storage qdrant/qdrant
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Seed all collections**:
   ```bash
   npm run seed:all
   ```

### Test Cases

**Test 1: Schema-based SQL Query**
- Input: "Siapa karyawan yang terlambat hari ini?"
- Expected: AI generate SQL, query PostgreSQL, return real data

**Test 2: Analysis from Aggregated Data**
- Input: "Bagaimana trend kehadiran 3 bulan terakhir?"
- Expected: AI baca dari `aggregated_insights`, jawab dengan summary

**Test 3: Simple Prediction**
- Input: "Prediksi jumlah tiket bulan depan?"
- Expected: AI baca statistical prediction dari `aggregated_insights`
- Output example: "Berdasarkan moving average 3 bulan (120, 135, 142 tiket), prediksi Februari: 156 tiket (confidence: 78%)"

**Test 4: Policy Question**
- Input: "Apakah boleh WFH kalau sakit?"
- Expected: AI search `company_knowledge`, jawab berdasarkan policy

**Test 5: Complex (Multi-collection)**
- Input: "Berapa rata-rata keterlambatan, dan apakah sesuai target KPI?"
- Expected: Search `aggregated_insights` + `company_knowledge`, combine answer

### Monitoring

- Cek Qdrant dashboard: `http://localhost:6333/dashboard`
- Verify 3 collections ada dan terisi
- Monitor logs untuk collection routing decisions
- Validate prediction confidence scores

---

# PHASE 2: ML-based Prediction (Future)

## Goal
Upgrade simple statistical prediction ke **Prophet ML model** untuk:
- ✅ Akurasi lebih tinggi (MAPE < 10%)
- ✅ Seasonality detection otomatis
- ✅ Trend changepoint detection
- ✅ Confidence intervals

---

## Architecture Changes - Phase 2

### New Python Service

#### [NEW] Python FastAPI Service

**Setup:**
```
prediction-service/
├── requirements.txt          # prophet, fastapi, uvicorn
├── main.py                   # FastAPI app
├── models/
│   ├── prophet_model.py      # Prophet wrapper
│   └── model_storage/        # Trained model files
└── utils/
    └── data_fetcher.py       # Fetch from PostgreSQL
```

**API Endpoints:**
- `POST /predict/timeseries` → General time-series prediction
- `POST /predict/tickets` → Ticket volume prediction
- `POST /predict/attendance` → Attendance rate prediction
- `GET /model/retrain` → Retrain model dengan data terbaru

**Docker Setup:**
```dockerfile
FROM python:3.11-slim
RUN pip install prophet fastapi uvicorn psycopg2-binary
COPY . /app
WORKDIR /app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
```

---

### Integration Layer

#### [NEW] [predictionClient.js](file:///d:/3.Magang/ai-try/tmachat/lib/services/predictionClient.js)

Next.js client untuk call Python service:
```javascript
class PredictionClient {
  async predictTimeSeries(data, options) {
    const response = await fetch(`${PREDICTION_SERVICE_URL}/predict/timeseries`, {
      method: 'POST',
      body: JSON.stringify({ data, options })
    });
    return response.json();
  }
}
```

#### [MODIFY] [aggregationService.js](file:///d:/3.Magang/ai-try/tmachat/lib/rag/aggregationService.js)

Update untuk gunakan ML predictions:
```javascript
// Phase 1: Statistical
const prediction = await predictionService.predictTimeSeries(data);

// Phase 2: ML-based (if available)
try {
  const mlPrediction = await predictionClient.predictTimeSeries(data);
  if (mlPrediction.confidence > prediction.confidence) {
    return mlPrediction; // Use ML if more confident
  }
} catch (err) {
  console.warn('ML service unavailable, using statistical fallback');
}
return prediction;
```

---

### Environment Updates

#### [MODIFY] [.env](file:///d:/3.Magang/ai-try/tmachat/.env)

Tambah Phase 2 config:
```env
# Prediction Service (Phase 2)
PREDICTION_SERVICE_URL=http://localhost:8001
PREDICTION_USE_ML=true
PREDICTION_ML_FALLBACK=true  # Fallback to statistical if ML fails
```

---

### Docker Compose

#### [NEW] [docker-compose.yml](file:///d:/3.Magang/ai-try/tmachat/docker-compose.yml)

Orchestrate semua services:
```yaml
version: '3.8'
services:
  qdrant:
    image: qdrant/qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_storage:/qdrant/storage

  prediction-service:
    build: ./prediction-service
    ports:
      - "8001:8001"
    environment:
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=tmachat_local
      - POSTGRES_PASSWORD=root

volumes:
  qdrant_storage:
```

---

## Migration Path

### From Phase 1 to Phase 2:

1. **Keep Phase 1 running** (zero downtime)
2. **Deploy Python service** via Docker
3. **Test ML predictions** in parallel dengan statistical
4. **Gradual rollout**: ML untuk high-confidence cases only
5. **Monitor**: Compare accuracy Phase 1 vs Phase 2
6. **Full migration**: Setelah ML terbukti lebih akurat

---

## Summary

### Phase 1 Deliverables (Current Focus)
- ✅ Qdrant multi-collection RAG
- ✅ Statistical prediction (no hallucination)
- ✅ Company knowledge integration
- ✅ Intelligent collection routing
- Timeline: **2-3 weeks**

### Phase 2 Deliverables (Future)
- ✅ Prophet ML model
- ✅ Python FastAPI service
- ✅ Docker orchestration
- ✅ ML/Statistical hybrid approach
- Timeline: **1-2 weeks** (after Phase 1 stable)

---

**Next Step**: User approval → Start Phase 1 implementation
