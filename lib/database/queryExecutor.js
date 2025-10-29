import { getDatabase } from './connection.js';

class QueryExecutor {
  constructor() {
    this.db = getDatabase();
  }

  async executeQuery(sqlQuery) {
    if (!sqlQuery) {
      throw new Error('SQL query is required');
    }

    // Jika database tidak connected, return demo data
    if (!this.db.isConnected) {
      return this.getDemoData(sqlQuery);
    }

    try {
      // Set search_path untuk schema SDA
      await this.db.query('SET search_path TO "public", "SDA"');
      
      console.log('Executing SQL:', sqlQuery);
      const result = await this.db.query(sqlQuery);
      
      return {
        success: true,
        rows: result.rows,
        rowCount: result.rowCount
      };
    } catch (error) {
      console.error('Query execution error:', error);
      return {
        success: false,
        error: error.message,
        rows: [],
        rowCount: 0
      };
    }
  }

  getDemoData(sqlQuery) {
    console.log('Using demo data - Database not connected');
    
    // Return demo data berdasarkan jenis query
    if (sqlQuery.includes('COUNT')) {
      return {
        success: true,
        rows: [{ total: 15, count: 15 }],
        rowCount: 1,
        isDemo: true
      };
    } else if (sqlQuery.includes('users')) {
      return {
        success: true,
        rows: [
          { id: 1, name: 'John Doe', email: 'john@example.com' },
          { id: 2, name: 'Jane Smith', email: 'jane@example.com' }
        ],
        rowCount: 2,
        isDemo: true
      };
    } else if (sqlQuery.includes('ap_detail')) {
      return {
        success: true,
        rows: [
          { id: 1, location: 'Jakarta Pusat', status: 'active', type: 'Indoor' },
          { id: 2, location: 'Bandung', status: 'active', type: 'Outdoor' }
        ],
        rowCount: 2,
        isDemo: true
      };
    } else {
      return {
        success: true,
        rows: [{ message: 'Demo data', query: sqlQuery }],
        rowCount: 1,
        isDemo: true
      };
    }
  }

  validateQuery(sqlQuery) {
    if (!sqlQuery || typeof sqlQuery !== 'string') {
        return { valid: false, error: 'Query tidak valid atau kosong' };
    }

    const cleanedQuery = sqlQuery.trim().toUpperCase();
    // 1. Periksa keyword berbahaya (sebagai kata utuh)
    const forbiddenKeywords = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'ALTER', 'CREATE', 'TRUNCATE', 'GRANT', 'REVOKE', 'SET ROLE']; // Tambahkan SET ROLE untuk keamanan
    for (const keyword of forbiddenKeywords) {
      // Regex \b memastikan kita mencocokkan kata utuh, bukan bagian dari kata lain
      const regex = new RegExp(`\\b${keyword}\\b`);
      if (regex.test(cleanedQuery)) {
        return { valid: false, error: `Query mengandung operasi ${keyword} yang tidak diizinkan` };
      }
    }

    // 2. Pastikan query mengandung SELECT (bisa diawali WITH)
    const selectRegex = /\bSELECT\b/;
    if (!selectRegex.test(cleanedQuery)) {
      return { valid: false, error: 'Query harus mengandung operasi SELECT' };
    }

    // 3. (Opsional tapi direkomendasikan) Batasi hanya satu statement SQL
    // Hitung jumlah semicolon non-komentar (penyederhanaan: hitung saja)
    // Izinkan semicolon di akhir, tapi tidak di tengah
    const semicolonCount = (cleanedQuery.match(/;/g) || []).length;
    if (semicolonCount > 1 || (semicolonCount === 1 && !cleanedQuery.endsWith(';'))) {
        return { valid: false, error: 'Hanya satu statement SQL yang diizinkan per query' };
    }


    // Jika semua pemeriksaan lolos
    console.log('[ValidateQuery] Query passed validation.'); // Log keberhasilan
    return { valid: true };
  }

  async testConnection() {
    if (!this.db.isConnected) {
      return { connected: false, error: 'Database not connected', isDemo: true };
    }

    try {
      await this.db.query('SET search_path TO "public", "SDA"');
      const result = await this.db.query('SELECT current_database(), current_schema()');
      return {
        connected: true,
        database: result.rows[0].current_database,
        schema: result.rows[0].current_schema
      };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }
}

export const queryExecutor = new QueryExecutor();