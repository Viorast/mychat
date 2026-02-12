import crypto from 'crypto';
import { ensureCollection, upsertPoints } from '../lib/rag/qdrantClient.js';
import { generateAllInsights } from '../lib/rag/aggregationService.js';
import { getEmbedding } from '../lib/rag/vectorStoreService.js';

/**
 * Seed Aggregated Insights Collection
 * Generates insights from PostgreSQL and embeds to Qdrant
 */

const COLLECTION_NAME = 'aggregated_insights';

async function seedAggregatedInsights() {
    console.log('[Seed] Starting aggregated insights seeding...');

    // Wait for DB connection to initialize (fix race condition)
    console.log('[Seed] Waiting 5s for DB connection...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    try {
        // Ensure collection exists
        await ensureCollection(COLLECTION_NAME);

        // Generate insights from database
        console.log('[Seed] Generating insights from PostgreSQL...');
        const insights = await generateAllInsights();

        if (insights.length === 0) {
            console.warn('[Seed] No insights generated. Check database connection.');
            return;
        }

        console.log(`[Seed] Generated ${insights.length} insights`);

        // Embed and prepare points
        const points = [];

        for (let i = 0; i < insights.length; i++) {
            const insight = insights[i];
            console.log(`[Seed] Embedding insight ${i + 1}/${insights.length}: ${insight.type}`);

            // Embed the summary text
            const embedding = await getEmbedding(insight.summary);

            points.push({
                id: crypto.randomUUID(), // Use UUID for Qdrant
                vector: embedding,
                payload: {
                    original_id: `insight_${insight.type}_${insight.period}`,
                    type: insight.type,
                    period: insight.period,
                    summary: insight.summary,
                    data: JSON.stringify(insight.data),
                    prediction: insight.prediction ? JSON.stringify(insight.prediction) : null,
                    source: 'postgresql_aggregation'
                }
            });
        }

        // Upsert to Qdrant
        console.log(`[Seed] Upserting ${points.length} points to ${COLLECTION_NAME}...`);
        await upsertPoints(COLLECTION_NAME, points);

        console.log(`[Seed] ✅ Successfully seeded ${points.length} insights to ${COLLECTION_NAME}`);

    } catch (error) {
        console.error('[Seed] Error seeding aggregated insights:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    seedAggregatedInsights().then(() => {
        console.log('[Seed] Aggregated insights seeding complete');
        process.exit(0);
    });
}

export { seedAggregatedInsights };
