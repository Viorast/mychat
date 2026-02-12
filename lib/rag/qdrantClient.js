import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Qdrant Client Wrapper
 * Manages connections and operations with Qdrant vector database
 */

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const VECTOR_SIZE = 3072; // Gemini embedding-001 dimension
const DISTANCE_METRIC = 'Cosine';

let qdrantClient = null;

/**
 * Get or create Qdrant client instance
 */
function getClient() {
    if (!qdrantClient) {
        qdrantClient = new QdrantClient({ url: QDRANT_URL });
        console.log(`[Qdrant] Client initialized: ${QDRANT_URL}`);
    }
    return qdrantClient;
}

/**
 * Ensure collection exists, create if not
 * @param {string} name - Collection name
 * @param {number} vectorSize - Vector dimension (default: 3072)
 */
export async function ensureCollection(name, vectorSize = VECTOR_SIZE) {
    const client = getClient();

    try {
        // Check if collection exists
        const collections = await client.getCollections();
        const exists = collections.collections.some(c => c.name === name);

        if (!exists) {
            console.log(`[Qdrant] Creating collection: ${name}`);
            await client.createCollection(name, {
                vectors: {
                    size: vectorSize,
                    distance: DISTANCE_METRIC,
                },
            });
            console.log(`[Qdrant] ✅ Collection created: ${name}`);
        } else {
            console.log(`[Qdrant] Collection already exists: ${name}`);
        }

        return true;
    } catch (error) {
        console.error(`[Qdrant] Error ensuring collection ${name}:`, error.message);
        throw error;
    }
}

/**
 * Upsert points to collection
 * @param {string} collectionName - Collection name
 * @param {Array} points - Array of {id, vector, payload}
 */
export async function upsertPoints(collectionName, points) {
    const client = getClient();

    try {
        await client.upsert(collectionName, {
            wait: true,
            points: points,
        });

        console.log(`[Qdrant] ✅ Upserted ${points.length} points to ${collectionName}`);
        return true;
    } catch (error) {
        console.error(`[Qdrant] Error upserting to ${collectionName}:`, error.message);
        if (error.data) {
            console.error('[Qdrant] Error data:', JSON.stringify(error.data, null, 2));
        }
        throw error;
    }
}

/**
 * Search similar vectors in a single collection
 * @param {string} collectionName - Collection name
 * @param {Array} queryVector - Query embedding vector
 * @param {number} limit - Max results
 */
export async function searchSimilar(collectionName, queryVector, limit = 5) {
    const client = getClient();

    try {
        const results = await client.search(collectionName, {
            vector: queryVector,
            limit: limit,
            with_payload: true,
        });

        return results.map(r => ({
            id: r.id,
            score: r.score,
            payload: r.payload,
        }));
    } catch (error) {
        console.error(`[Qdrant] Error searching ${collectionName}:`, error.message);
        throw error;
    }
}

/**
 * Search across multiple collections
 * @param {Array} collections - Array of collection names
 * @param {Array} queryVector - Query embedding vector
 * @param {number} limit - Max results per collection
 */
export async function searchMultiCollection(collections, queryVector, limit = 5) {
    try {
        const allResults = [];

        for (const collectionName of collections) {
            try {
                const results = await searchSimilar(collectionName, queryVector, limit);

                // Add collection name to each result
                results.forEach(r => {
                    r.collection = collectionName;
                    allResults.push(r);
                });
            } catch (error) {
                console.warn(`[Qdrant] Skipping collection ${collectionName}:`, error.message);
            }
        }

        // Sort by score descending
        allResults.sort((a, b) => b.score - a.score);

        // Return top results across all collections
        return allResults.slice(0, limit * collections.length);
    } catch (error) {
        console.error('[Qdrant] Error in multi-collection search:', error.message);
        throw error;
    }
}

/**
 * Get collection info
 * @param {string} collectionName - Collection name
 */
export async function getCollectionInfo(collectionName) {
    const client = getClient();

    try {
        const info = await client.getCollection(collectionName);
        return info;
    } catch (error) {
        console.error(`[Qdrant] Error getting info for ${collectionName}:`, error.message);
        throw error;
    }
}

/**
 * Delete collection (use with caution!)
 * @param {string} collectionName - Collection name
 */
export async function deleteCollection(collectionName) {
    const client = getClient();

    try {
        await client.deleteCollection(collectionName);
        console.log(`[Qdrant] ✅ Deleted collection: ${collectionName}`);
        return true;
    } catch (error) {
        console.error(`[Qdrant] Error deleting ${collectionName}:`, error.message);
        throw error;
    }
}

// Export client instance for advanced usage
export { getClient };
