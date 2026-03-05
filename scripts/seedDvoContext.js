import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ensureCollection, upsertPoints } from '../lib/layers/phase2-pipes/shared/qdrantClient.js';
import { chunkMarkdown, getEmbedding } from '../lib/layers/phase2-pipes/shared/vectorStoreService.js';

/**
 * Seed DVO Schema Context Collection
 * Loads dvo_context.md and embeds to Qdrant collection 'schema_dvo'
 */

const COLLECTION_NAME = 'schema_dvo';
const MARKDOWN_PATH = path.join(process.cwd(), 'lib', 'context', 'dvo_context.md');

async function seedDvoContext() {
    console.log('[Seed DVO] Starting DVO schema context seeding...');

    try {
        // Ensure collection exists
        await ensureCollection(COLLECTION_NAME);

        // Read markdown file
        if (!fs.existsSync(MARKDOWN_PATH)) {
            throw new Error(`File not found: ${MARKDOWN_PATH}`);
        }

        const markdownContent = fs.readFileSync(MARKDOWN_PATH, 'utf-8');
        console.log(`[Seed DVO] Loaded ${markdownContent.length} chars from ${MARKDOWN_PATH}`);

        // Chunk content
        const chunks = chunkMarkdown(markdownContent);
        console.log(`[Seed DVO] Created ${chunks.length} chunks`);

        if (chunks.length === 0) {
            throw new Error('No chunks generated from markdown');
        }

        // Embed and prepare points
        const points = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`[Seed DVO] Embedding chunk ${i + 1}/${chunks.length}: ${chunk.title}`);

            const embedding = await getEmbedding(chunk.content);

            points.push({
                id: crypto.randomUUID(),
                vector: embedding,
                payload: {
                    original_id: `schema_dvo_${chunk.id}`,
                    title: chunk.title,
                    content: chunk.content,
                    type: 'schema',
                    source: 'dvo_context.md'
                }
            });
        }

        // Upsert to Qdrant
        console.log(`[Seed DVO] Upserting ${points.length} points to ${COLLECTION_NAME}...`);
        await upsertPoints(COLLECTION_NAME, points);

        console.log(`[Seed DVO] ✅ Successfully seeded ${points.length} DVO schema chunks to ${COLLECTION_NAME}`);

    } catch (error) {
        console.error('[Seed DVO] Error seeding DVO context:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    seedDvoContext().then(() => {
        console.log('[Seed DVO] DVO schema context seeding complete');
        process.exit(0);
    });
}

export { seedDvoContext };
