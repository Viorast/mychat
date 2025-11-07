import { getDatabase } from './connection.js';
// Import 'fs' and 'path' for reading the JSON file reliably
import fs from 'fs';
import path from 'path';

// Construct the absolute path to the JSON file
const markdownFilePath = path.join(process.cwd(), 'lib', 'context', 'sda_context.md');

class SchemaService {
    constructor() {
        this.db = getDatabase();
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // Cache in-memory selama 5 menit
        this.schemaContextData = null; // Menyimpan konten string dari .md
        this.loadMarkdownCache();
    }

    loadMarkdownCache() {
        try {
            if (!fs.existsSync(markdownFilePath)) {
                 console.error(`Error: File konteks Markdown tidak ditemukan di ${markdownFilePath}`);
                 this.schemaContextData = "SCHEMA ERROR: File konteks tidak ditemukan.";
                 return;
            }
            // Baca file sebagai string mentah
            this.schemaContextData = fs.readFileSync(markdownFilePath, 'utf-8');
            console.log('Successfully loaded and cached sda_context.md');
        } catch (error) {
            console.error('Error loading or parsing sda_context.md:', error);
            this.schemaContextData = `SCHEMA ERROR: Gagal memuat file konteks. ${error.message}`;
        }
    }

    /**
     * Fungsi YANG DIMODIFIKASI: Mendapatkan schema, sekarang dari cache JSON via this.tableCachesData.
     */
    async getFullSchema() {
        const cacheKey = 'full_schema_from_markdown'; // Key cache baru
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
            console.log('Returning schema from in-memory cache (Markdown source)');
            return cached.data;
        }

        // Pastikan konten MD dimuat jika gagal di constructor
        if (!this.schemaContextData) {
            this.loadMarkdownCache();
        }

        const currentCacheData = this.schemaContextData;

        if (currentCacheData.startsWith("SCHEMA ERROR")) {
             console.error("Critical error: schemaContextData (Markdown) tidak terisi.");
             return this.getDemoSchema(); // Fallback jika loading gagal total
        }

        try {
            // 1. Schema string adalah konten mentah dari file .md
            const formattedSchemaString = currentCacheData;

            // 2. Ekstrak nama Schema dari file .md
            // Mencari pola: Schema `SDA`
            const schemaMatch = currentCacheData.match(/Schema \`(.*?)\`/);
            const schemaName = schemaMatch ? schemaMatch[1] : 'SDA'; // Fallback ke 'SDA'

            // 3. Ekstrak daftar nama tabel dari file .md
            // Mencari pola: "## 1️⃣ log_absen", "## 2️⃣ m_ticket", dll.
            const tableRegex = /^## \d️⃣ (.*?)$/gm;
            const tablesList = [];
            let match;

            while ((match = tableRegex.exec(currentCacheData)) !== null) {
                const tableName = match[1].trim();
                if (tableName) {
                    tablesList.push(`"${schemaName}"."${tableName}"`);
                }
            }

            if (tablesList.length === 0) {
                 console.warn("Tidak ada tabel yang ter-parsing dari sda_context.md, periksa format heading.");
            }

            // 4. Buat objek schema yang akan dikembalikan
            const formattedSchema = {
                schema: formattedSchemaString, // Konten .md mentah
                raw: formattedSchemaString,   // Konten .md mentah
                tables: tablesList,           // Daftar tabel yang diekstrak
                isDemo: false
            };

            // 5. Simpan ke cache in-memory
            this.cache.set(cacheKey, {
                data: formattedSchema,
                timestamp: Date.now()
            });

            console.log('Schema processed and cached from sda_context.md');
            return formattedSchema;

        } catch (error) {
            console.error('Schema service error (processing markdown data):', error);
            return this.getDemoSchema();
        }
    }

    // --- Fungsi Lainnya (TETAP SAMA) ---

    async getTableRowCounts() {
      // ... (No changes needed here) ...
      try {
        if (!this.db.isConnected) {
          console.warn('[DB Status] DB not connected for row counts, returning demo indicator.');
          return { isDemo: true, counts: {} };
        }
        await this.db.query('SET search_path TO "public", "SDA"');
        const tablesResult = await this.db.query(`
          SELECT table_schema, table_name
          FROM information_schema.tables
          WHERE table_schema IN ('public', 'SDA') AND table_type = 'BASE TABLE'
        `);
        const counts = {};
        for (const row of tablesResult.rows) {
          const fullTableName = `"${row.table_schema}"."${row.table_name}"`;
          try {
            const countResult = await this.db.query(`SELECT COUNT(*) AS row_count FROM ${fullTableName}`);
            counts[fullTableName] = parseInt(countResult.rows[0].row_count, 10);
          } catch (countError) {
            // Log specific error but continue
            console.error(`Could not count rows for ${fullTableName}:`, countError.message);
            counts[fullTableName] = 'N/A';
          }
        }
        console.log('[DB Query] Successfully fetched row counts.');
        return { isDemo: false, counts: counts };
      } catch (error) {
        console.error('Error getting table row counts:', error);
        return { isDemo: false, counts: {}, error: error.message };
      }
    }

    async getSampleData(tableName, limit = 3) {
      // ... (No changes needed here) ...
      try {
        if (!this.db.isConnected) {
           console.warn(`[DB Status] DB not connected for sample data (${tableName}), returning demo indicator.`);
          return { isDemo: true, data: [] };
        }
        await this.db.query('SET search_path TO "public", "SDA"');
        const tableNameRegex = /^"([^"]+)"\."([^"]+)"$/;
        const match = tableName.match(tableNameRegex);
        if (!match) {
          console.error(`Invalid table name format for sample data: ${tableName}`);
          throw new Error('Invalid table name format provided.');
        }
        const sampleQuery = `SELECT * FROM ${tableName} LIMIT $1`;
        const result = await this.db.query(sampleQuery, [limit]);
        console.log(`[DB Query] Fetched ${result.rowCount} sample rows for ${tableName}.`);
        return {
          table: tableName,
          data: result.rows,
          count: result.rowCount,
          isDemo: false
        };
      } catch (error) {
        console.error(`Error getting sample data for ${tableName}:`, error);
        return { table: tableName, error: error.message, data: [], isDemo: false };
      }
    }

    getDemoSchema() {
        console.log('[Schema Service] Using demo schema - Database potentially not connected or Markdown loading failed');

        // Daftar tabel fallback hardcoded
        const demoTablesList = [
             '"SDA"."log_absen"',
             '"SDA"."m_ticket"',
             '"SDA"."nossa_closed"'
        ];

        // String schema fallback minimal
        const demoSchemaString = `
SCHEMA DATABASE POSTGRESQL (DEMO MODE / FALLBACK):

Deskripsi Umum: Schema SDA berisi data log absensi, tiket internal, dan aduan nossa.
Setiap tabel berdiri sendiri.

TABEL: "SDA"."log_absen"
   Deskripsi: Log kehadiran karyawan (check-in/check-out).
   Kolom: id_absen, nama_karyawan, jenis_absen, tanggal_absen, ...

TABEL: "SDA"."m_ticket"
   Deskripsi: Data tiket pekerjaan / request internal.
   Kolom: id, ticket_type, no_ticket, dev_name, status, ...

TABEL: "SDA"."nossa_closed"
    Deskripsi: Data gangguan layanan pelanggan (Nossa).
    Kolom: incident, customer_name, service_id, status, witel, symptom, ...
`;

        return {
            schema: demoSchemaString,
            raw: [], // Tidak ada raw data di mode demo
            tables: demoTablesList,
            isDemo: true
        };
    }

    clearCache() {
        console.log('Clearing SchemaService in-memory cache.');
        this.cache.clear();
    }
}

export const schemaService = new SchemaService();