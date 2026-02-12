import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ensureCollection, upsertPoints } from '../lib/rag/qdrantClient.js';
import { chunkMarkdown, getEmbedding } from '../lib/rag/vectorStoreService.js';

/**
 * Seed Schema Context Collection
 * Loads sda_context.md and embeds to Qdrant
 */

const COLLECTION_NAME = 'schema_context';
const MARKDOWN_PATH = path.join(process.cwd(), 'lib', 'context', 'sda_context.md');

async function seedSchemaContext() {
    console.log('[Seed] Starting schema context seeding...');

    try {
        // Ensure collection exists
        await ensureCollection(COLLECTION_NAME);

        // Read markdown file
        if (!fs.existsSync(MARKDOWN_PATH)) {
            throw new Error(`File not found: ${MARKDOWN_PATH}`);
        }

        const markdownContent = fs.readFileSync(MARKDOWN_PATH, 'utf-8');
        console.log(`[Seed] Loaded ${markdownContent.length} chars from ${MARKDOWN_PATH}`);

        // Chunk content
        const chunks = chunkMarkdown(markdownContent);
        console.log(`[Seed] Created ${chunks.length} chunks`);

        if (chunks.length === 0) {
            throw new Error('No chunks generated from markdown');
        }

        // Embed and prepare points
        const points = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`[Seed] Embedding chunk ${i + 1}/${chunks.length}: ${chunk.title}`);

            const embedding = await getEmbedding(chunk.content);

            points.push({
                id: crypto.randomUUID(), // Use UUID for Qdrant
                vector: embedding,
                payload: {
                    original_id: `schema_${chunk.id}`,
                    title: chunk.title,
                    content: chunk.content,
                    type: 'schema',
                    source: 'sda_context.md'
                }
            });
        }

        // Upsert to Qdrant
        console.log(`[Seed] Upserting ${points.length} points to ${COLLECTION_NAME}...`);
        await upsertPoints(COLLECTION_NAME, points);

        console.log(`[Seed] ✅ Successfully seeded ${points.length} schema chunks to ${COLLECTION_NAME}`);

    } catch (error) {
        console.error('[Seed] Error seeding schema context:', error.message);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    seedSchemaContext().then(() => {
        console.log('[Seed] Schema context seeding complete');
        process.exit(0);
    });
}

export { seedSchemaContext };
