import crypto from 'crypto';
import { ensureCollection, upsertPoints } from '../lib/rag/qdrantClient.js';
import { loadCompanyDocs } from '../lib/rag/documentLoader.js';
import { getEmbedding } from '../lib/rag/vectorStoreService.js';

/**
 * Seed Company Knowledge Collection
 * Loads company documents and embeds to Qdrant
 */

const COLLECTION_NAME = 'company_knowledge';

async function seedCompanyKnowledge() {
    console.log('[Seed] Starting company knowledge seeding...');

    try {
        // Ensure collection exists
        await ensureCollection(COLLECTION_NAME);

        // Load company documents
        console.log('[Seed] Loading company documents...');
        const docs = await loadCompanyDocs();

        if (docs.length === 0) {
            console.warn('[Seed] No documents found in lib/context/company/');
            console.warn('[Seed] Skipping company knowledge seeding. Add documents and run again.');
            return;
        }

        console.log(`[Seed] Loaded ${docs.length} document chunks`);

        // Embed and prepare points
        const points = [];

        for (let i = 0; i < docs.length; i++) {
            const doc = docs[i];
            console.log(`[Seed] Embedding doc ${i + 1}/${docs.length}: ${doc.metadata.fileName}`);

            const embedding = await getEmbedding(doc.content);

            points.push({
                id: crypto.randomUUID(), // Use UUID for Qdrant
                vector: embedding,
                payload: {
                    original_id: `doc_${i}_${Date.now()}`,
                    content: doc.content,
                    fileName: doc.metadata.fileName,
                    category: doc.metadata.category,
                    type: doc.metadata.type,
                    section: doc.metadata.section,
                    lastModified: doc.metadata.lastModified,
                    source: 'company_documents'
                }
            });
        }

        // Upsert to Qdrant
        console.log(`[Seed] Upserting ${points.length} points to ${COLLECTION_NAME}...`);
        await upsertPoints(COLLECTION_NAME, points);

        console.log(`[Seed] ✅ Successfully seeded ${points.length} documents to ${COLLECTION_NAME}`);

    } catch (error) {
        console.error('[Seed] Error seeding company knowledge:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    seedCompanyKnowledge().then(() => {
        console.log('[Seed] Company knowledge seeding complete');
        process.exit(0);
    });
}

export { seedCompanyKnowledge };
