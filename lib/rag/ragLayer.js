import { aiRouter } from "../ai/ai-router.js";
import { queryExecutor } from "../database/queryExecutor.js";
import { ragLog } from "../monitoring/ragLogger.js";

// ✅ Phase 2 Shared: Vector Store (moved to lib/layers/phase2-pipes/shared/)
import { vectorSearch } from "../layers/phase2-pipes/shared/vectorStoreService.js";

// ✅ Phase 2 Services (moved to lib/layers/)
import { rerankingService } from "../layers/phase2-pipes/shared/rerankingService.js";
import { sqlGeneratorService } from "../layers/phase2-pipes/database/sqlGeneratorService.js";
import { sqlExecutionService } from "../layers/phase2-pipes/database/sqlExecutionService.js";
import { responseGeneratorService } from "../layers/phase3-synthesis/responseGeneratorService.js";

// ✅ Phase 1: Intent Classifiers (moved to lib/layers/phase1-intent/)
import { classifyIntent as classifyIntentOptimized, getIntentConfidence } from "../layers/phase1-intent/optimizedIntentClassifier.js";
import { queryCache } from "../cache/queryCache.js";
import { metrics } from "../monitoring/performanceMetrics.js";

// ✅ Phase 1: Semantic Intent Classification (moved to lib/layers/phase1-intent/)
import { classifyIntent as classifyIntentSemantic, isGeneralConversation } from "../layers/phase1-intent/semanticIntentClassifier.js";

const MAX_CONTEXT_CHUNKS = 10; // ✅ ACCURACY FIX: Increased from 5 to 10 for better schema coverage
const RERANK_FAILURE_CONTEXT = "Tidak ada konteks skema yang relevan ditemukan.";

// ✅ Feature flags for optimizations (can be disabled via .env)
const USE_OPTIMIZED_INTENT = process.env.USE_OPTIMIZED_INTENT !== 'false'; // Default: true
const ENABLE_QUERY_CACHE = process.env.ENABLE_QUERY_CACHE !== 'false'; // Default: true
const ENABLE_METRICS = process.env.ENABLE_METRICS !== 'false'; // Default: true
const MAX_HISTORY_MESSAGES = 6; // ✅ 3 user + 3 AI messages

class RagLayer {
    constructor() {
        this.aiClient = aiRouter;
        this.dbExecutor = queryExecutor;
        this.vectorStoreSearch = vectorSearch;
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
     */
    retrieveContext = async (userMessage) => {
        try {
            let collections;
            if (this._lastIntentResult?.collections?.length > 0) {
                collections = this._lastIntentResult.collections;
            } else {
                collections = ['schema_context', 'aggregated_insights', 'company_knowledge'];
            }
            const result = await this.vectorStoreSearch(userMessage, MAX_CONTEXT_CHUNKS, collections);
            return result;
        } catch (error) {
            ragLog.error('P1 Retrieve', error.message);
            return { success: false, results: [], error: error.message };
        }
    }

    /**
     * Langkah 2: Reranking Context dengan LLM
     * Menggunakan AI untuk memilih chunks paling relevan dan preserve verbatim
     */
    rerankContext = async (userMessage, history, retrievedChunks) => {
        return rerankingService.rerankContext(userMessage, history, retrievedChunks);
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

        const limitedHistory = history.slice(-MAX_HISTORY_MESSAGES);
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

                    // Langkah 4: Tentukan Alur (SQL atau Non-SQL)
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
                        lastContextData = formattedData; // ✅ Capture formatted SQL data

                        const responseStart = Date.now();
                        finalRagResult = await this.generateFinalResponse(userMessage, limitedHistory, formattedData, sqlPlan.analysisType, image);
                        stepTimings.finalResponse = Date.now() - responseStart;

                    } else {
                        // --- ALUR NON-SQL (Query tentang skema, atau gambar) ---
                        ragLog.sqlSkip('SQL plan returned no query');
                        const responseStart = Date.now();
                        finalRagResult = await this.generateFinalResponse(userMessage, limitedHistory, rerankedContext, "none", image);
                        stepTimings.finalResponse = Date.now() - responseStart;
                    }
                }
            }



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