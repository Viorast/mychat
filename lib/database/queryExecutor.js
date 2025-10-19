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
    // Basic validation
    const forbidden = [
      /DROP\s+/i, 
      /DELETE\s+FROM/i, 
      /UPDATE\s+.+\s+SET/i, 
      /INSERT\s+INTO/i, 
      /ALTER\s+TABLE/i, 
      /CREATE\s+TABLE/i, 
      /TRUNCATE\s+TABLE/i
    ];
    
    for (const pattern of forbidden) {
      if (pattern.test(sqlQuery)) {
        return { valid: false, error: 'Query mengandung operasi yang tidak diizinkan' };
      }
    }

    if (!sqlQuery.trim().toUpperCase().startsWith('SELECT')) {
      return { valid: false, error: 'Hanya query SELECT yang diizinkan' };
    }

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