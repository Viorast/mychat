import { ragLog, tokenTracker } from '../lib/monitoring/ragLogger.js';

// Simulate a full query cycle
console.log('\n=== TOKEN LOGGER DEMO ===\n');

ragLog.start('prediksi absensi bulan depan', false);
tokenTracker.record('Rerank', 420, 'OpenRouter');
tokenTracker.record('SQLPlan', 580, 'OpenRouter');
tokenTracker.record('Response', 310, 'Gemini');
ragLog.end(3200, 0, false, 'OpenRouter');

ragLog.start('berapa tiket open bulan ini?', false);
tokenTracker.record('Rerank', 390, 'OpenRouter');
tokenTracker.record('SQLPlan', 610, 'OpenRouter');
tokenTracker.record('Response', 290, 'OpenRouter');
ragLog.end(2800, 0, false, 'OpenRouter');

console.log(`\nSession total: ${tokenTracker.sessionTotal} tok | ${tokenTracker.sessionCalls} calls`);
