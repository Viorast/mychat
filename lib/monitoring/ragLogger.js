/**
 * RAG Pipeline Logger
 * Centralized, structured logging for the RAG pipeline.
 * 
 * Format:
 *   [PHASE] ✅/⚠️/❌ Message  (duration, tokens)
 */

const IS_DEBUG = process.env.RAG_DEBUG === 'true';

const icons = {
    ok: '✅',
    warn: '⚠️ ',
    err: '❌',
    info: '→ ',
    skip: '⏭ ',
};

function fmt(ms) {
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function tokens(n) {
    return n > 0 ? ` | ${n} tok` : '';
}

export const ragLog = {
    // ─── Phase headers ───────────────────────────────────────────────
    start(query, hasImage) {
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`[RAG] 🚀 New Query${hasImage ? ' + Image' : ''}: "${query.substring(0, 60)}${query.length > 60 ? '…' : ''}"`);
        console.log(`${'─'.repeat(60)}`);
    },

    end(totalMs, totalTok, cached, provider) {
        const src = cached ? '(cache hit)' : `(${provider || 'AI'})`;
        console.log(`[RAG] 🏁 Done in ${fmt(totalMs)}${tokens(totalTok)} ${src}\n`);
    },

    // ─── Per-step ────────────────────────────────────────────────────
    intent(category, confidence, ms, method) {
        console.log(`[RAG] P0 Intent   ${icons.ok} ${category} (conf: ${confidence.toFixed(2)}, ${fmt(ms)}, via ${method})`);
    },

    retrieval(collections, count, ms) {
        console.log(`[RAG] P1 Retrieve ${icons.ok} ${count} chunks from [${collections.join(', ')}] (${fmt(ms)})`);
    },

    rerank(inputChunks, outputLen, ms, provider) {
        const prov = provider ? ` via ${provider}` : '';
        console.log(`[RAG] P2 Rerank   ${icons.ok} ${inputChunks} chunks → ${outputLen} chars${prov} (${fmt(ms)})`);
    },

    rerankSkip(reason) {
        console.log(`[RAG] P2 Rerank   ${icons.skip} Skipped: ${reason}`);
    },

    sqlPlan(requiresDB, analysisType, ms, tok, provider) {
        const prov = provider ? ` via ${provider}` : '';
        const db = requiresDB ? `DB:${analysisType}` : 'NO_DB';
        console.log(`[RAG] P3 SQLPlan  ${icons.ok} ${db}${prov} (${fmt(ms)}${tokens(tok)})`);
    },

    sqlExec(rowCount, ms) {
        console.log(`[RAG] P4 SQLExec  ${icons.ok} ${rowCount} rows (${fmt(ms)})`);
    },

    sqlSkip(reason) {
        console.log(`[RAG] P4 SQLExec  ${icons.skip} Skipped: ${reason}`);
    },

    response(ms, provider) {
        const prov = provider ? ` via ${provider}` : '';
        console.log(`[RAG] P5 Response ${icons.ok} Streaming${prov} (${fmt(ms)})`);
    },

    // ─── Warnings / Errors ───────────────────────────────────────────
    warn(phase, msg) {
        console.warn(`[RAG] ${phase} ${icons.warn} ${msg}`);
    },

    error(phase, msg) {
        console.error(`[RAG] ${phase} ${icons.err} ${msg}`);
    },

    fallback(from, to, reason) {
        console.warn(`[RAG] 🔄 Fallback: ${from} → ${to} (${reason})`);
    },

    cache(hit, key) {
        if (hit) console.log(`[RAG] 💾 Cache HIT  key: ${key.substring(0, 12)}…`);
        else console.log(`[RAG] 💾 Cache MISS key: ${key.substring(0, 12)}…`);
    },

    // ─── Debug (only when RAG_DEBUG=true) ────────────────────────────
    debug(label, value) {
        if (!IS_DEBUG) return;
        const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
        console.log(`[RAG:DBG] ${label}: ${str.substring(0, 200)}`);
    },

    // ─── AI Router ───────────────────────────────────────────────────
    aiSwitch(from, to, reason) {
        console.warn(`[AIRouter] 🔄 ${from} → ${to}: ${reason}`);
    },

    aiOk(provider, ms) {
        console.log(`[AIRouter] ${icons.ok} ${provider} responded (${fmt(ms)})`);
    },
};

export default ragLog;
