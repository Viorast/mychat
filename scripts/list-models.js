import { GoogleGenerativeAI } from '@google/generative-ai';

// Load env vars if running directly (node --env-file=.env)
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("❌ GEMINI_API_KEY not found in environment variables");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    try {
        // Note: The Node.js SDK doesn't have a direct listModels method on GoogleGenerativeAI instance in some versions,
        // but usually it's accessed via a ModelManager or similar if available, 
        // OR we can just try to hit the REST API if the SDK doesn't expose it easily.
        // However, let's try the SDK way if possible, or fall back to fetch.

        // Actually, looking at the SDK docs, it might not be directly exposed in the main class easily in older versions,
        // but let's try a simple fetch to the API endpoint which is universal.

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.models) {
            console.log("✅ Available Models:");
            const embeddingModels = data.models.filter(m => m.name.includes("embedding"));

            console.log("\n--- Embedding Models ---");
            embeddingModels.forEach(m => {
                console.log(`- ${m.name}`);
                console.log(`  Supported methods: ${m.supportedGenerationMethods.join(', ')}`);
            });

            console.log("\n--- All Models ---");
            data.models.forEach(m => {
                console.log(`- ${m.name}`);
            });

        } else {
            console.error("❌ Failed to list models:", data);
        }

    } catch (error) {
        console.error("❌ Error listing models:", error.message);
    }
}

listModels();
