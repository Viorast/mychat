import { aiRouter } from "../ai/ai-router.js";
import { queryExecutor } from "../database/queryExecutor.js";
import { ragLog } from "../monitoring/ragLogger.js";
import { settingsService } from "../services/settingsService.js";

// ✅ Phase 2 Shared: Vector Store (moved to lib/layers/phase2-pipes/shared/)
import { vectorSearch } from "../layers/phase2-pipes/shared/vectorStoreService.js";

// ✅ Phase 2 Services (moved to lib/layers/)
import { rerankingService } from "../layers/phase2-pipes/shared/rerankingService.js";
import { sqlGeneratorService } from "../layers/phase2-pipes/database/sqlGeneratorService.js";
import { sqlExecutionService } from "../layers/phase2-pipes/database/sqlExecutionService.js";
import { responseGeneratorService } from "../layers/phase3-synthesis/responseGeneratorService.js";

// ✅ Hybrid Specialized Pipeline: Router + Prediction/Recommendation Pipeline
import { routePipeline } from "../layers/phase2-pipes/shared/intentRouter.js";
import { predictionPipelineService } from "../layers/phase2-pipes/shared/predictionPipelineService.js";

// ✅ Phase 1: Intent Classifiers (moved to lib/layers/phase1-intent/)
import { classifyIntent as classifyIntentOptimized, getIntentConfidence } from "../layers/phase1-intent/optimizedIntentClassifier.js";
import { queryCache } from "../cache/queryCache.js";
import { metrics } from "../monitoring/performanceMetrics.js";

// ✅ Phase 1: Semantic Intent Classification (moved to lib/layers/phase1-intent/)
import { classifyIntent as classifyIntentSemantic, isGeneralConversation } from "../layers/phase1-intent/semanticIntentClassifier.js";

// ✅ Phase 0.5: Topic Shift Detector
import { detectTopicShift } from "../layers/phase1-intent/topicShiftDetector.js";

const MAX_CONTEXT_CHUNKS = 10; // ✅ ACCURACY FIX: Increased from 5 to 10 for better schema coverage
const RERANK_FAILURE_CONTEXT = "Tidak ada konteks skema yang relevan ditemukan.";

// ✅ Feature flags for optimizations (can be disabled via .env)
const USE_OPTIMIZED_INTENT = process.env.USE_OPTIMIZED_INTENT !== 'false'; // Default: true
const ENABLE_QUERY_CACHE = process.env.ENABLE_QUERY_CACHE !== 'false'; // Default: true
const ENABLE_METRICS = process.env.ENABLE_METRICS !== 'false'; // Default: true
// MAX_HISTORY_MESSAGES sekarang dibaca dinamis dari DB settings (default: 10)

class RagLayer {
    constructor() {
        this.aiClient = aiRouter;
        this.dbExecutor = queryExecutor;
        this.vectorStoreSearch = vectorSearch;
        this._prevIntentCategory = null; // Track previous topic for shift detection
        this._isTopicShift = false;      // Set each turn by classifyIntent
    }

    /** 
     * ✅ OPTIMIZED: Langkah 0: Intent recognition with rules-based approach
     */
    classifyIntent = async (userMessage, history) => {
        // ✅ PHASE 3: Semantic Intent Classification using Qdrant vector similarity
        // Fast pre-filter: short greetings don't need embedding
        const lowerMsg = userMessage.toLowerCase().trim();
        const greetingPatterns = [
            /^(hi|hello|halo|hai|hey|hei)(\s|!|$)/,
            /^(selamat (pagi|siang|sore|malam))(\s|!|$)/,
            /^(terima kasih|thanks|thank you|thx)(\s|!|$)/,
            /^(bye|goodbye|dadah|sampai jumpa)(\s|!|$)/,
            /^(oke|ok|okay|baik|siap)(\s|!|$)/,
        ];

        if (lowerMsg.length < 30) {
            for (const pattern of greetingPatterns) {
                if (pattern.test(lowerMsg)) {
                    ragLog.intent('general', 0.99, 0, 'fast-greeting');
                    this._lastIntentResult = {
                        category: 'general',
                        confidence: 0.99,
                        collections: [],
                        analysisType: 'none',
                    };
                    return {
                        classification: 'general_conversation',
                        usage: { totalTokenCount: 0 }
                    };
                }
            }
        }

        // Semantic classification using Qdrant
        try {
            const t0 = Date.now();
            const semanticResult = await classifyIntentSemantic(userMessage);
            const category = semanticResult.category;
            const confidence = semanticResult.confidence;

            this._lastIntentResult = semanticResult;

            if (semanticResult.fallback && semanticResult.error) {
                throw new Error(semanticResult.error);
            }

            // ── Phase 0.5: Topic Shift Detection ──────────────────────
            const shiftResult = detectTopicShift(this._prevIntentCategory, category);
            this._isTopicShift = shiftResult.isTopicShift;
            this._prevIntentCategory = category; // update for next turn

            if (shiftResult.isTopicShift) {
                ragLog.warn('P0.5 TopicShift',
                    `NEW_TOPIC detected: ${shiftResult.prevCategory} → ${shiftResult.currCategory} (history will be cleared for reranker)`);
            } else {
                ragLog.info('P0.5 TopicShift',
                    `SAME_TOPIC: ${shiftResult.prevCategory ?? 'first-turn'} → ${shiftResult.currCategory}`);
            }
            // ──────────────────────────────────────────────────────────

            const classification = isGeneralConversation(category) ? 'general_conversation' : 'data_query';
            ragLog.intent(category, confidence, Date.now() - t0, 'semantic');

            return { classification, usage: { totalTokenCount: 0 } };
        } catch (error) {
            ragLog.fallback('semantic-intent', 'rules-based', error.message);
            const classification = classifyIntentOptimized(userMessage);
            const confidence = getIntentConfidence(userMessage);
            ragLog.intent(classification, confidence, 0, 'rules-based');
            this._lastIntentResult = null;
            return { classification, usage: { totalTokenCount: 0 } };
        }
    }

    /**
     * [BARU] Langkah 1: Retrieval with intelligent collection routing
     * Memilih schema collection berdasarkan active_database_context setting (SDA/DVO)
     */
    retrieveContext = async (userMessage) => {
        try {
            // Tentukan schema collection berdasarkan setting aktif
            const activeCtx = await settingsService.getSetting('active_database_context');
            const schemaCollection = (activeCtx === 'DVO') ? 'schema_dvo' : 'schema_sda';

            let collections;
            if (this._lastIntentResult?.collections?.length > 0) {
                // Ganti schema_sda/schema_dvo di intent result dengan collection yang sesuai
                collections = this._lastIntentResult.collections.map(c =>
                    (c === 'schema_sda' || c === 'schema_dvo') ? schemaCollection : c
                );
            } else {
                collections = [schemaCollection, 'aggregated_insights', 'company_knowledge'];
            }

            ragLog.debug('Retrieve', `schema collection: ${schemaCollection}`);
            const result = await this.vectorStoreSearch(userMessage, MAX_CONTEXT_CHUNKS, collections);
            return result;
        } catch (error) {
            ragLog.error('P1 Retrieve', error.message);
            return { success: false, results: [], error: error.message };
        }
    }


    /**
     * Langkah 2: Reranking Context dengan LLM
     * Passes isTopicShift so reranker can clear history when user shifts topic.
     */
    rerankContext = async (userMessage, history, retrievedChunks) => {
        return rerankingService.rerankContext(userMessage, history, retrievedChunks, this._isTopicShift);
    }

    /**
     * Langkah 3: Perencanaan SQL
     */
    generateSQLPlan = async (userMessage, history, rerankedContext) => {
        return sqlGeneratorService.generateSQLPlan(userMessage, history, rerankedContext);
    }

    // ... (retrieveData dan formatData tetap sama) ...
    // ... (retrieveData dan formatData delegated to service) ...
    retrieveData = async (sqlQuery) => {
        return sqlExecutionService.retrieveData(sqlQuery);
    }
    formatData = (retrievedData) => {
        return sqlExecutionService.formatData(retrievedData);
    }

    /**
     * Langkah 6: Menghasilkan Respons Akhir (Response Generation)
     * ✅ MODIFIKASI: Sekarang mengembalikan 'responsePromise' dari client
     */
    /**
     * Langkah 6: Menghasilkan Respons Akhir (Response Generation)
     */
    generateFinalResponse = async (userMessage, history, formattedData, analysisType, image = null) => {
        try {
            return await responseGeneratorService.generateFinalResponse(userMessage, history, formattedData, analysisType, image);
        } catch (error) {
            console.error('[RAG v1.4] Error generating final response:', error);
            // ✅ Fallback with context data (using shared wrapper logic)
            // Note: formattedData is usually what we want to pass as context
            return this.generateFallbackStream(`Maaf, saya gagal menyusun jawaban akhir: ${error.message}`, formattedData);
        }
    }

    /**
     * ✅ OPTIMIZED: Orkestrasi Alur RAG Penuh v1.5 with Cache & Metrics
     */
    processQuery = async (userMessage, history, image = null) => {
        const startTime = Date.now();
        let totalThoughtTokens = 0;
        let finalRagResult = null;
        let wasCached = false;
        let hasError = false;
        let lastContextData = null; // ✅ Track context data for fallback

        const stepTimings = {
            intentClassification: 0,
            retrieval: 0,
            reranking: 0,
            sqlPlanning: 0,
            sqlExecution: 0,
            finalResponse: 0
        };

        ragLog.start(userMessage, !!image);

        // ✅ PHASE 2: Try cache first (only for non-image queries)
        if (ENABLE_QUERY_CACHE && !image) {
            const cacheKey = queryCache.getCacheKey(userMessage);
            const cached = queryCache.get(cacheKey);

            if (cached) {
                wasCached = true;
                console.log('[RAG v1.5] ✅ Using cached result');

                // Record metrics for cache hit
                if (ENABLE_METRICS) {
                    const duration = Date.now() - startTime;
                    metrics.recordQuery({
                        duration,
                        tokens: 0, // Cached, no tokens used
                        cached: true,
                        error: false,
                        stepTimings: {}
                    });
                }

                return cached;
            }
        }

        // Baca max history dari settings DB secara dinamis
        const maxHistory = parseInt(await settingsService.getSetting('max_history_messages') || '10', 10);
        const limitedHistory = history.slice(-maxHistory);
        ragLog.debug('History', `${limitedHistory.length}/${history.length} messages`);

        try {
            // [BARU] Langkah 0: Klasifikasi Intent
            const intentStart = Date.now();
            const intentResult = await this.classifyIntent(userMessage, limitedHistory);
            stepTimings.intentClassification = Date.now() - intentStart;

            const intent = intentResult.classification;
            totalThoughtTokens += intentResult.usage.totalTokenCount;

            // JIKA 'general_conversation', LEWATI SEMUA RAG
            if (intent === "general_conversation") {

                ragLog.debug('Pipeline', 'general_conversation → skip RAG');
                const responseStart = Date.now();
                finalRagResult = await this.generateFinalResponse(
                    userMessage,
                    limitedHistory,
                    "Tidak ada konteks data yang diperlukan.", // Konteks kosong
                    "none",
                    image
                );
                stepTimings.finalResponse = Date.now() - responseStart;

            } else {

                // ✅ PHASE 3: Determine pipeline path based on semantic intent category
                const semanticCategory = this._lastIntentResult?.category || 'descriptive';

                // Non-SQL intents: policy → skip SQL planning, use context only
                // NOTE: 'recommendation' removed to allow SQL-based recommendations
                const KNOWLEDGE_ONLY_INTENTS = ['policy'];
                const isKnowledgeOnly = KNOWLEDGE_ONLY_INTENTS.includes(semanticCategory);

                // Data intents: descriptive, diagnostic, predictive, visualization, maps, recommendation → full SQL pipeline
                ragLog.debug('Pipeline', `${semanticCategory} → ${isKnowledgeOnly ? 'KNOWLEDGE_ONLY' : 'DATA_SQL'}`);

                // Langkah 1: Retrieval (always needed for both paths)
                const retrievalStart = Date.now();
                const retrievalResult = await this.retrieveContext(userMessage);
                stepTimings.retrieval = Date.now() - retrievalStart;
                if (retrievalResult.success) {
                    ragLog.retrieval(
                        this._lastIntentResult?.collections || ['all'],
                        retrievalResult.results?.length || 0,
                        stepTimings.retrieval
                    );
                }

                if (!retrievalResult.success) {
                    return this.generateFallbackStream(`Gagal mengambil konteks skema: ${retrievalResult.error}`);
                }

                // 🔍 DEBUG: Log retrieved chunks
                if (process.env.RAG_DEBUG === 'true') {
                    console.log('[RAG DEBUG] Retrieved Chunks:', retrievalResult.results.length);
                    console.log('[RAG DEBUG] Retrieved Content Length:',
                        retrievalResult.results.reduce((sum, r) => sum + r.content.length, 0)
                    );
                }

                const rerankStart = Date.now();
                const rerankedContext = await this.rerankContext(userMessage, limitedHistory, retrievalResult.results);
                lastContextData = rerankedContext; // ✅ Capture context
                stepTimings.reranking = Date.now() - rerankStart;

                ragLog.debug('Rerank result', rerankedContext !== RERANK_FAILURE_CONTEXT ? `${rerankedContext.length} chars` : 'NO_CONTEXT');

                if (isKnowledgeOnly) {
                    // ─── KNOWLEDGE-ONLY PATH (policy, recommendation) ───
                    // Skip SQL planning entirely, respond using retrieved knowledge context
                    ragLog.sqlSkip(`knowledge-only (${semanticCategory})`);

                    const responseStart = Date.now();
                    finalRagResult = await this.generateFinalResponse(
                        userMessage,
                        limitedHistory,
                        rerankedContext,
                        "none",
                        image
                    );
                    stepTimings.finalResponse = Date.now() - responseStart;

                } else {
                    // ─── DATA-SQL PATH (descriptive, diagnostic, predictive, visualization, maps) ───


                    // Langkah 3: Generate SQL Plan
                    const sqlPlanStart = Date.now();
                    const sqlPlan = await this.generateSQLPlan(userMessage, limitedHistory, rerankedContext);
                    stepTimings.sqlPlanning = Date.now() - sqlPlanStart;

                    totalThoughtTokens += sqlPlan.usage.totalTokenCount;



                    if (sqlPlan.error) {
                        // ✅ ROBUST: If SQL planning fails (e.g. rate limit), try to answer with context only
                        if (rerankedContext && rerankedContext !== RERANK_FAILURE_CONTEXT && rerankedContext.length > 50) {
                            console.warn(`[RAG Intent] SQL Planning failed (${sqlPlan.error}), falling back to Context-Only Answer.`);

                            // Fallback to Knowledge-Only Flow
                            const responseStart = Date.now();
                            finalRagResult = await this.generateFinalResponse(
                                userMessage,
                                limitedHistory,
                                rerankedContext,
                                "none",
                                image
                            );
                            stepTimings.finalResponse = Date.now() - responseStart;

                            // SKIP the rest of SQL execution
                            if (finalRagResult) {
                                finalRagResult.totalThoughtTokens = totalThoughtTokens;
                            }
                            // Cache and return early
                            if (ENABLE_QUERY_CACHE && !image && finalRagResult && finalRagResult.success) {
                                const cacheKey = queryCache.getCacheKey(userMessage);
                                queryCache.set(cacheKey, finalRagResult);
                            }
                            return finalRagResult;
                        }

                        // If context is also empty, then return error
                        return this.generateFallbackStream(sqlPlan.error);
                    }

                    // Langkah 4: ── HYBRID SPECIALIZED PIPELINE ROUTING ──────────────────
                    const activeCtx = await settingsService.getSetting('active_database_context') || 'SDA';
                    const routeDecision = routePipeline(sqlPlan.analysisType, userMessage, activeCtx);
                    ragLog.debug('IntentRouter', `path=${routeDecision.path} | reason=${routeDecision.reason}`);

                    // ─── PREDICTIVE PATH ─────────────────────────────────────────────
                    if (routeDecision.path === 'PREDICTIVE') {
                        ragLog.debug('Pipeline', '→ PREDICTIVE: pre-built SQL + server-side stats');
                        const predResult = await predictionPipelineService.handlePredictiveQuery(
                            routeDecision.predDataType,
                            routeDecision.predMetric,
                            routeDecision.predPeriods
                        );

                        if (predResult.handled) {
                            const responseStart = Date.now();
                            finalRagResult = await this.generateFinalResponse(
                                userMessage,
                                limitedHistory,
                                predResult.summaryText,
                                'predictive',
                                image
                            );
                            stepTimings.finalResponse = Date.now() - responseStart;

                            // Attach prediction data for potential chart rendering
                            if (finalRagResult && predResult.predResult) {
                                finalRagResult._predictionData = {
                                    historical: predResult.historicalData,
                                    forecast: predResult.forecastData,
                                    dataType: predResult.dataType,
                                    metric: predResult.metric
                                };
                            }

                            ragLog.debug('Pipeline', '✅ PREDICTIVE path complete (SQL planning LLM skipped)');
                        } else {
                            // Fallback to standard path if pre-built SQL not available
                            ragLog.warn('Pipeline', 'PREDICTIVE path unhandled, falling back to STANDARD');
                            routeDecision.path = 'STANDARD';
                        }
                    }

                    // ─── RECOMMENDATION PATH ─────────────────────────────────────────
                    if (routeDecision.path === 'RECOMMENDATION') {
                        ragLog.debug('Pipeline', '→ RECOMMENDATION: pre-built aggregation SQL');
                        const recResult = await predictionPipelineService.handleRecommendationQuery(
                            routeDecision.predDataType,
                            activeCtx
                        );

                        if (recResult.handled) {
                            const responseStart = Date.now();
                            finalRagResult = await this.generateFinalResponse(
                                userMessage,
                                limitedHistory,
                                recResult.summaryText,
                                'recommendation',
                                image
                            );
                            stepTimings.finalResponse = Date.now() - responseStart;
                            ragLog.debug('Pipeline', '✅ RECOMMENDATION path complete (SQL planning LLM skipped)');
                        } else {
                            ragLog.warn('Pipeline', 'RECOMMENDATION path unhandled, falling back to STANDARD');
                            routeDecision.path = 'STANDARD';
                        }
                    }

                    // ─── STANDARD PATH (descriptive, diagnostic, visualization, maps) ─
                    if (routeDecision.path === 'STANDARD') {
                        ragLog.debug('Pipeline', `→ STANDARD: full SQL pipeline (analysisType=${sqlPlan.analysisType})`);

                        if (sqlPlan.requiresRetrieval && sqlPlan.query) {
                            // --- ALUR SQL ---
                            ragLog.debug('SQL', sqlPlan.query?.substring(0, 100));
                            const sqlExecStart = Date.now();
                            const dataResult = await this.retrieveData(sqlPlan.query);
                            stepTimings.sqlExecution = Date.now() - sqlExecStart;

                            ragLog.sqlExec(dataResult.data?.length || 0, stepTimings.sqlExecution);
                            if (!dataResult.success) {
                                return this.generateFallbackStream(`Maaf, terjadi masalah saat mengambil data: ${dataResult.error}`);
                            }
                            const formattedData = this.formatData(dataResult.data);
                            lastContextData = formattedData;

                            const responseStart = Date.now();
                            finalRagResult = await this.generateFinalResponse(userMessage, limitedHistory, formattedData, sqlPlan.analysisType, image);
                            stepTimings.finalResponse = Date.now() - responseStart;

                        } else {
                            // --- ALUR NON-SQL (Query tentang skema, atau gambar) ---
                            ragLog.sqlSkip('SQL plan returned no query');
                            const responseStart = Date.now();
                            finalRagResult = await this.generateFinalResponse(userMessage, limitedHistory, rerankedContext, 'none', image);
                            stepTimings.finalResponse = Date.now() - responseStart;
                        }
                    } // end STANDARD path
                } // end else (isKnowledgeOnly)
            } // end else (general_conversation)

            // ✅ Tambahkan 'totalThoughtTokens' ke hasil agar bisa disimpan di stream
            if (finalRagResult) {
                finalRagResult.totalThoughtTokens = totalThoughtTokens;
            }

            // ✅ PHASE 2: Cache the result (only for successful non-image queries)
            if (ENABLE_QUERY_CACHE && !image && finalRagResult && finalRagResult.success) {
                const cacheKey = queryCache.getCacheKey(userMessage);
                queryCache.set(cacheKey, finalRagResult);
            }

            return finalRagResult;

        } catch (error) {
            hasError = true;
            ragLog.error('processQuery', error.message);
            return this.generateFallbackStream(`Terjadi kesalahan kritis: ${error.message}`, lastContextData);
        } finally {
            // ✅ PHASE 2: Record metrics
            if (ENABLE_METRICS) {
                const duration = Date.now() - startTime;
                metrics.recordQuery({
                    duration,
                    tokens: totalThoughtTokens,
                    cached: wasCached,
                    error: hasError,
                    stepTimings
                });

                ragLog.end(Date.now() - startTime, totalThoughtTokens, wasCached, aiRouter.activeProvider);
                if (metrics.totalQueries % 10 === 0) console.log('\n' + metrics.getReport() + '\n');
            }
        }
    }

    /**
     * Helper Fallback Stream
     * ✅ MODIFIKASI: Mengembalikan 'responsePromise' palsu
     */
    generateFallbackStream = (errorMessage, contextData = null) => {
        ragLog.warn('Fallback', errorMessage?.substring(0, 100));

        // If we have context data, show it nicely
        let finalMessage = errorMessage || "Terjadi kesalahan yang tidak diketahui.";

        if (contextData && contextData.length > 0) {
            // Check if contextData is JSON (formatted data) or text (reranked context)
            let dataDisplay = contextData;
            if (contextData.startsWith('[') || contextData.startsWith('{')) {
                // It's likely JSON data, readable enough
                dataDisplay = "```json\n" + contextData + "\n```";
            }

            finalMessage = `⚠️ **Sistem Sedang Sibuk (AI Model Overloaded)**\n\n` +
                `Maaf, saya tidak dapat memproses jawaban akhir karena antrian AI penuh (Rate Limit). ` +
                `Namun, berikut data/konteks yang berhasil saya temukan:\n\n` +
                `---\n\n${dataDisplay}\n\n---`;
        }

        const fallbackResult = {
            success: true,
            stream: (async function* () {
                yield { text: () => finalMessage };
            })(),
            responsePromise: Promise.resolve(finalMessage), // Return string directly for promise
            totalThoughtTokens: 0,
            isDemo: this.aiClient.isDemoMode,
            isError: true
        };

        return fallbackResult;
    }
}

export const ragLayer = new RagLayer();