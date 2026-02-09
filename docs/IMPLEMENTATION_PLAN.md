# Implementation Plan: tmachat - Text-to-SQL AI Chat

## Priority Goals

| # | Tujuan | Current | Target | Priority |
|---|--------|---------|--------|----------|
| 1 | Analisis Deskriptif | 90% | 95% | ⬆️ High |
| 2 | Analisis Diagnostik | 75% | 90% | ⬆️ High |
| 3 | Rekomendasi AI | 60% | 85% | ⬆️ High |
| 4 | Akurasi + Feedback Loop | 70% | 95% | 🔴 Critical |
| 5 | Basic Predictions | 20% | 70% | Medium |
| 6 | Tabel & Chart | 85% | 95% | Medium |
| 7 | Dashboard | 85% | - | ⚠️ Optional |
| 8 | Embeddable Module | 0% | - | ⚠️ Optional |

---

## Continuous Learning System

**Konsep: Feedback Loop untuk Prompt Improvement**

```
User Query → AI Response → User Feedback (👍/👎)
                ↓
        Store in Database
                ↓
     Analyze Patterns (mingguan)
                ↓
     Update Prompts / Few-shot Examples
                ↓
        Better Future Responses
```

---

## Phase 1: Feedback System & Continuous Learning (Week 1-2)

### Database Schema

```sql
CREATE TABLE query_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL,
  chat_id UUID NOT NULL,
  user_query TEXT NOT NULL,
  generated_sql TEXT,
  ai_response TEXT NOT NULL,
  feedback VARCHAR(20), -- 'positive' | 'negative' | null
  feedback_comment TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_feedback_type ON query_feedback(feedback);
CREATE INDEX idx_feedback_date ON query_feedback(created_at);
```

### New Files to Create

1. `lib/feedback/feedbackService.js` - Feedback CRUD operations
2. `lib/feedback/promptOptimizer.js` - Few-shot learning from history
3. `app/api/feedback/route.js` - API endpoint for feedback

### UI Changes

- Add feedback buttons (👍/👎) to MessageBubble component

---

## Phase 2: Enhanced Diagnostics & Recommendations (Week 2-3)

### Changes to RAG Layer

- Integrate optimized prompts with few-shot examples
- Add mandatory recommendation section in AI response
- Improve diagnostic analysis structure

---

## Phase 3: Basic Predictions (Week 3-4)

### New Files

1. `lib/analytics/trendAnalyzer.js` - Linear trend detection & extrapolation

### Features

- Trend detection (naik/turun/stabil)
- Simple linear extrapolation for predictions
- Integration with RAG for prediction queries

---

## Phase 4: Testing & Quality Assurance (Week 4-5)

### Metrics Dashboard

- `/app/admin/metrics/page.js` - Simple accuracy monitoring
- Weekly accuracy reports from feedback data

---

## Timeline Summary

| Phase | Duration | Focus |
|-------|----------|-------|
| 1 | Week 1-2 | Feedback System + Continuous Learning |
| 2 | Week 2-3 | Diagnostics + Recommendations |
| 3 | Week 3-4 | Basic Predictions |
| 4 | Week 4-5 | Testing + Polish |
| - | Future | Dashboard (optional) |
| - | Future | Embeddable Module (optional) |

**Total Core: 5 weeks**

---

## Success Metrics

- ✅ User feedback accuracy **>85%** (positive / total)
- ✅ Response time **<3 seconds** (p95)
- ✅ Trend prediction accuracy **±20%** error margin
- ✅ Weekly prompt improvement cycle established

---

## Weekly Improvement Cycle

```
1. Review feedback data (Senin)
2. Identify top 5 failure patterns
3. Update prompts dengan fixes
4. Deploy & monitor improvement
5. Repeat
```
