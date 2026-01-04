import { Pool } from 'pg';

class AppDatabaseConnection {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    try {
      // Fallback for development if not set, though it should be set in .env
      const connectionString = process.env.APP_DATABASE_URL || "postgresql://postgres:root@localhost:5432/tmachat_app";

      if (!connectionString) {
        console.warn('⚠️ APP_DATABASE_URL not set. Chat history will not be persistent.');
        return;
      }

      this.pool = new Pool({
        connectionString,
        max: 10, // Higher max connections for app DB
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });

      this.testConnection();
      
    } catch (error) {
      console.error('❌ App Database connection initialization failed:', error);
      this.isConnected = false;
    }
  }

  async testConnection() {
    try {
      const client = await this.pool.connect();
      // Test query
      await client.query('SELECT NOW()');
      console.log('✅ Connected to App Database (tmachat_app)');
      client.release();
      this.isConnected = true;
    } catch (error) {
      console.error('❌ App Database connection test failed:', error.message);
      this.isConnected = false;
      // Optional: Retry logic could go here
    }
  }

  async query(text, params = []) {
    if (!this.pool) {
      throw new Error('App Database not initialized');
    }

    try {
      const result = await this.pool.query(text, params);
      return result;
    } catch (error) {
      console.error('App Database query error:', error.message);
      throw error;
    }
  }

  async getClient() {
    if (!this.pool) {
      throw new Error('App Database not initialized');
    }
    return await this.pool.connect();
  }
}

// Singleton instance
let appDbInstance = null;

export function getAppDatabase() {
  if (!appDbInstance) {
    appDbInstance = new AppDatabaseConnection();
  }
  return appDbInstance;
}

export const appDb = getAppDatabase();
