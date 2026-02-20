
import { ragLayer as rag } from '../lib/rag/ragLayer.js';

const query = 'Saya ingin melihat karyawan yang datang tepat waktu dalam satu bulan terakhir yang tersedia di data dan jumlahnya. Karyawan tepat waktu bisa dilihat dengan yang melakukan check in dibawah jam 9';
const history = [
    { role: 'user', content: query }
];

console.log('Testing RAG with query:', query);

try {
    const result = await rag.processQuery(query, history);
    console.log('Result:', JSON.stringify(result, null, 2));

    // Check streams
    if (result && result.stream) {
        console.log('Stream chunks:');
        for await (const chunk of result.stream) {
            const text = typeof chunk.text === 'function' ? chunk.text() : JSON.stringify(chunk);
            process.stdout.write(text);
        }
        console.log('\nStream complete.');
    }
} catch (error) {
    console.error('Error:', error);
}
