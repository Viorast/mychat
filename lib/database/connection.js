/**
 * Database connection dengan error handling yang lebih robust
 */

import { Pool } from 'pg';

class DatabaseConnection {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    try {
      // Validasi DATABASE_URL
      if (!process.env.DATABASE_URL) {
        console.error('DATABASE_URL environment variable is required');
        return;
      }

      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10, // Reduced untuk development
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000, // Reduced timeout
        maxUses: 7500, // Prevent connection leaks
      });

      // Test connection dengan timeout
      this.testConnection();
      
    } catch (error) {
      console.error('Database connection initialization failed:', error);
      this.isConnected = false;
    }
  }

  async testConnection() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW()');
      console.log('✅ Database connection test successful:', result.rows[0].now);
      client.release();
      this.isConnected = true;
    } catch (error) {
      console.error('❌ Database connection test failed:', error.message);
      this.isConnected = false;
    }
  }

  async query(text, params = []) {
    // Check connection status
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    const start = Date.now();
    
    try {
      const result = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      console.log('📊 Database query executed', { 
        query: text.substring(0, 100) + '...', 
        duration: `${duration}ms`,
        rows: result.rowCount 
      });
      
      return result;
    } catch (error) {
      console.error('❌ Database query error:', {
        query: text,
        params: params,
        error: error.message
      });
      throw new Error(`Database error: ${error.message}`);
    }
  }

  async getClient() {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    const client = await this.pool.connect();
    
    // Enhanced cleanup untuk prevent connection leaks
    const originalRelease = client.release;
    const timeout = setTimeout(() => {
      console.error('⚠️ Client has been checked out for more than 10 seconds!');
    }, 10000);

    client.release = () => {
      clearTimeout(timeout);
      client.release = originalRelease;
      return originalRelease.apply(client);
    };
    
    return client;
  }

  // Method untuk check connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      totalCount: this.pool?.totalCount || 0,
      idleCount: this.pool?.idleCount || 0,
      waitingCount: this.pool?.waitingCount || 0,
    };
  }
}

// Export singleton instance dengan error handling
let dbInstance = null;

export function getDatabase() {
  if (!dbInstance) {
    dbInstance = new DatabaseConnection();
  }
  return dbInstance;
}

export const db = getDatabase();