// Test file untuk Hybrid Specialized Pipeline
import { routePipeline } from '../lib/layers/phase2-pipes/shared/intentRouter.js';
import { detectPredictiveIntent, formatPredictionSummary, predictTimeSeries } from '../lib/rag/predictionService.js';


console.log('=== Intent Router Test ===\n');

const routerTests = [
    { analysisType: 'predictive', msg: 'prediksi absensi bulan depan', ctx: 'SDA', expectPath: 'PREDICTIVE' },
    { analysisType: 'recommendation', msg: 'apa rekomendasimu untuk karyawan terlambat', ctx: 'SDA', expectPath: 'RECOMMENDATION' },
    { analysisType: 'descriptive', msg: 'berapa jumlah tiket bulan ini', ctx: 'SDA', expectPath: 'STANDARD' },
    { analysisType: 'predictive', msg: 'proyeksikan tiket 3 bulan ke depan', ctx: 'SDA', expectPath: 'PREDICTIVE' },
    { analysisType: 'predictive', msg: 'prediksi status AP di witel minggu depan', ctx: 'DVO', expectPath: 'PREDICTIVE' },
    { analysisType: 'recommendation', msg: 'rekomendasi untuk AP yang down', ctx: 'DVO', expectPath: 'RECOMMENDATION' },
    { analysisType: 'diagnostic', msg: 'kenapa tiket bulan ini naik', ctx: 'SDA', expectPath: 'STANDARD' },
];

let pass = 0;
routerTests.forEach(t => {
    const d = routePipeline(t.analysisType, t.msg, t.ctx);
    const correct = d.path === t.expectPath;
    if (correct) pass++;
    const icon = correct ? '✅' : '❌';
    console.log(`${icon} [${t.analysisType}/${t.ctx}] "${t.msg.substring(0, 40)}" → path=${d.path}, dataType=${d.predDataType}`);
    if (!correct) console.log(`   Expected: path=${t.expectPath}`);
});
console.log(`\nRouter: ${pass}/${routerTests.length} passed\n`);

console.log('=== Predictive Intent Detector ===\n');

const detTests = [
    { msg: 'prediksi absensi bulan depan', expected: true, expectedType: 'sda_attendance' },
    { msg: 'proyeksi tiket 3 bulan ke depan', expected: true, expectedType: 'sda_tickets' },
    { msg: 'tren gangguan nossa', expected: true, expectedType: 'sda_nossa' },
    { msg: 'forecast AP down witel jabodetabek', expected: true, expectedType: 'dvo_ap_witel' },
    { msg: 'berapa absensi hari ini', expected: false, expectedType: null },
    { msg: 'tampilkan data tiket open', expected: false, expectedType: null },
];

let detPass = 0;
detTests.forEach(t => {
    const r = detectPredictiveIntent(t.msg);
    const correct = r.isPrediction === t.expected && r.dataType === t.expectedType;
    if (correct) detPass++;
    const icon = correct ? '✅' : '❌';
    console.log(`${icon} "${t.msg}" → isPrediction=${r.isPrediction}, dataType=${r.dataType}`);
    if (!correct) console.log(`   Expected: isPrediction=${t.expected}, dataType=${t.expectedType}`);
});
console.log(`\nDetector: ${detPass}/${detTests.length} passed\n`);

console.log('=== Prediction + Format Summary Test ===\n');

const mockRows = [
    { month: '2025-01', total_checkin: 820 },
    { month: '2025-02', total_checkin: 790 },
    { month: '2025-03', total_checkin: 850 },
    { month: '2025-04', total_checkin: 830 },
    { month: '2025-05', total_checkin: 870 },
    { month: '2025-06', total_checkin: 860 },
    { month: '2025-07', total_checkin: 895 },
];

const historicalData = mockRows.map(r => ({ date: r.month, value: r.total_checkin }));
const predResult = predictTimeSeries(historicalData, { method: 'moving_average', periods: 3 });
console.log(`Prediction: success=${predResult.success}, method=${predResult.method}, confidence=${predResult.confidence}`);
if (predResult.predictions) console.log('Forecasts:', predResult.predictions);

const summary = formatPredictionSummary(predResult, mockRows, 'sda_attendance', 'total_checkin');
console.log('\nFormatted summary for LLM:\n---');
console.log(summary);
console.log('---');
console.log(`Summary: ${summary.length} chars | Raw data: ~${JSON.stringify(mockRows).length} chars`);
console.log(`Token saving estimate: ~${Math.round((1 - summary.length / JSON.stringify(mockRows).length) * 100)}%`);
