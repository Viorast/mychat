import { appDb } from '../database/app-connection.js';

/**
 * Settings Service
 * Membaca dan menulis konfigurasi AI dari tabel `app_settings` di tmachat_app.
 * Menggunakan in-memory cache 30 detik untuk efisiensi.
 */

const CACHE_TTL_MS = 30 * 1000; // 30 detik

// Default fallback values (dari .env jika settings DB belum ada)
const DEFAULTS = {
    openrouter_api_key: process.env.OPENROUTER_API_KEY || '',
    openrouter_model: process.env.OPENROUTER_MODEL || 'stepfun/step-3.5-flash:free',
    openrouter_vision_model: process.env.OPENROUTER_VISION_MODEL || 'google/gemma-3-12b-it:free',
    gemini_api_key: process.env.GEMINI_API_KEY || '',
    gemini_model: process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash',
    active_database_context: 'SDA',
    max_history_messages: '10',
};

class SettingsService {
    constructor() {
        this._cache = null;
        this._cacheTime = 0;
    }

    /** Load semua settings dari DB ke cache */
    async _loadAll() {
        const now = Date.now();
        if (this._cache && now - this._cacheTime < CACHE_TTL_MS) {
            return this._cache;
        }

        try {
            const result = await appDb.query('SELECT key, value FROM app_settings');
            const settings = { ...DEFAULTS };
            for (const row of result.rows) {
                settings[row.key] = row.value;
            }
            this._cache = settings;
            this._cacheTime = now;
            return settings;
        } catch (err) {
            console.warn('[SettingsService] DB read failed, using defaults:', err.message);
            return { ...DEFAULTS };
        }
    }

    /** Ambil satu setting */
    async getSetting(key) {
        const all = await this._loadAll();
        return all[key] ?? DEFAULTS[key] ?? null;
    }

    /** Ambil semua settings */
    async getAll() {
        return await this._loadAll();
    }

    /** Update satu setting ke DB */
    async setSetting(key, value) {
        try {
            await appDb.query(
                `INSERT INTO app_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
                [key, String(value)]
            );
            this.invalidateCache();
        } catch (err) {
            console.error('[SettingsService] setSetting error:', err.message);
            throw err;
        }
    }

    /** Batch update banyak settings sekaligus */
    async setMany(settings = {}) {
        const client = await appDb.getClient();
        try {
            await client.query('BEGIN');
            for (const [key, value] of Object.entries(settings)) {
                await client.query(
                    `INSERT INTO app_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
                    [key, String(value)]
                );
            }
            await client.query('COMMIT');
            this.invalidateCache();
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('[SettingsService] setMany error:', err.message);
            throw err;
        } finally {
            client.release();
        }
    }

    /** Clear cache agar settings terbaru dibaca dari DB */
    invalidateCache() {
        this._cache = null;
        this._cacheTime = 0;
    }
}

// Singleton
export const settingsService = new SettingsService();
