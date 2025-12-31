/**
 * Query Result Cache
 * Implements LRU (Least Recently Used) caching for RAG query results
 * 
 * Features:
 * - MD5 hashing for cache keys
 * - TTL (Time To Live) expiration
 * - LRU eviction policy
 * - Hit/miss rate tracking
 */

import crypto from 'crypto';

class QueryCache {
    constructor(maxSize = 100, ttl = 1800000) { // 30 min TTL default
        this.cache = new Map();
        this.maxSize = maxSize;
        this.ttl = ttl;
        this.hits = 0;
        this.misses = 0;

        console.log(`[QueryCache] Initialized with maxSize=${maxSize}, ttl=${ttl}ms (${Math.round(ttl / 60000)} minutes)`);
    }

    /**
     * Generate cache key from query and user ID
     * @param {string} query - User query
     * @param {string} userId - User identifier
     * @returns {string} MD5 hash of normalized query
     */
    getCacheKey(query, userId = 'default') {
        // Normalize query (lowercase, trim, remove extra spaces)
        const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');

        // Create unique key with userId
        const keyString = `${userId}:${normalized}`;

        // Generate MD5 hash
        const hash = crypto.createHash('md5');
        hash.update(keyString);
        return hash.digest('hex');
    }

    /**
     * Get cached result
     * @param {string} key - Cache key
     * @returns {any|null} Cached data or null if not found/expired
     */
    get(key) {
        const item = this.cache.get(key);

        if (!item) {
            this.misses++;
            return null;
        }

        // Check if expired
        const now = Date.now();
        if (now - item.timestamp > this.ttl) {
            this.cache.delete(key);
            this.misses++;
            console.log(`[QueryCache] EXPIRED key: ${key.substring(0, 8)}...`);
            return null;
        }

        // Cache hit - update access time and move to end (LRU)
        this.hits++;

        // Update timestamp for LRU
        item.lastAccess = now;

        // Move to end of Map (most recently used)
        this.cache.delete(key);
        this.cache.set(key, item);

        const hitRate = this.getHitRate();
        console.log(`[QueryCache] ✅ HIT key: ${key.substring(0, 8)}... (hit rate: ${hitRate}%)`);

        return item.data;
    }

    /**
     * Set cache entry
     * @param {string} key - Cache key
     * @param {any} data - Data to cache
     */
    set(key, data) {
        // Implement LRU eviction if cache is full
        if (this.cache.size >= this.maxSize) {
            // Remove first (least recently used) item
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            console.log(`[QueryCache] ⚠️  EVICTED key: ${firstKey.substring(0, 8)}... (cache full)`);
        }

        const now = Date.now();
        this.cache.set(key, {
            data,
            timestamp: now,
            lastAccess: now
        });

        console.log(`[QueryCache] ➕ SET key: ${key.substring(0, 8)}... (size: ${this.cache.size}/${this.maxSize})`);
    }

    /**
     * Calculate cache hit rate
     * @returns {string} Hit rate percentage
     */
    getHitRate() {
        const total = this.hits + this.misses;
        if (total === 0) return '0.00';
        return ((this.hits / total) * 100).toFixed(2);
    }

    /**
     * Get cache statistics
     * @returns {Object} Cache stats
     */
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: this.getHitRate() + '%',
            ttl: this.ttl,
            ttlMinutes: Math.round(this.ttl / 60000)
        };
    }

    /**
     * Clear entire cache
     */
    clear() {
        const oldSize = this.cache.size;
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
        console.log(`[QueryCache] 🗑️  CLEARED ${oldSize} entries`);
    }

    /**
     * Remove expired entries (garbage collection)
     * @returns {number} Number of expired entries removed
     */
    cleanExpired() {
        const now = Date.now();
        let removed = 0;

        for (const [key, item] of this.cache.entries()) {
            if (now - item.timestamp > this.ttl) {
                this.cache.delete(key);
                removed++;
            }
        }

        if (removed > 0) {
            console.log(`[QueryCache] 🧹 Cleaned ${removed} expired entries`);
        }

        return removed;
    }

    /**
     * Check if a key exists in cache (without affecting hit/miss stats)
     * @param {string} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        const item = this.cache.get(key);
        if (!item) return false;

        // Check if expired
        if (Date.now() - item.timestamp > this.ttl) {
            return false;
        }

        return true;
    }
}

// Singleton instance
export const queryCache = new QueryCache(
    parseInt(process.env.QUERY_CACHE_MAX_SIZE || '100'),
    parseInt(process.env.QUERY_CACHE_TTL || '1800000') // 30 minutes
);

// Export class for testing
export default QueryCache;
