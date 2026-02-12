import { GoogleGenerativeAI } from '@google/generative-ai';

// Load env vars
const apiKey = process.env.GEMINI_API_KEY;
const MODEL_NAME = 'models/gemini-embedding-001';

if (!apiKey) {
    console.error("❌ GEMINI_API_KEY not found");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: MODEL_NAME });

async function testEmbedding() {
    try {
        console.log(`Testing embedding with model: ${MODEL_NAME}`);
        const text = "Hello world";
        const result = await model.embedContent(text);
        const vector = result.embedding.values;

        console.log(`✅ Embedding generated successfully`);
        console.log(`📏 Vector dimension: ${vector.length}`);

        if (vector.length !== 768) {
            console.warn(`⚠️ WARNING: Dimension mismatch! Expected 768, got ${vector.length}`);
        } else {
            console.log(`✅ Dimension matches expected (768)`);
        }

    } catch (error) {
        console.error("❌ Error generating embedding:", error.message);
    }
}

testEmbedding();
