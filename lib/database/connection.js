import { Pool } from 'pg';

class DatabaseConnection {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    try {
      if (!process.env.DATABASE_URL) {
        console.warn(' DATABASE_URL not set, running in demo mode');
        return;
      }

      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

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
      console.log('Database connection test successful');
      client.release();
      this.isConnected = true;
    } catch (error) {
      console.error('Database connection test failed:', error.message);
      this.isConnected = false;
    }
  }

  async query(text, params = []) {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }

    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (error) {
      console.error('Database query error:', error);
      throw new Error(`Database error: ${error.message}`);
    }
  }

  async getClient() {
    if (!this.isConnected) {
      throw new Error('Database not connected');
    }
    return await this.pool.connect();
  }

  getStatus() {
    return {
      isConnected: this.isConnected,
    };
  }
}

let dbInstance = null;

export function getDatabase() {
  if (!dbInstance) {
    dbInstance = new DatabaseConnection();
  }
  return dbInstance;
}

export const db = getDatabase();