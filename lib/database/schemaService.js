import { getDatabase } from './connection.js';

class SchemaService {
  constructor() {
    this.db = getDatabase();
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000;
  }

  async getFullSchema() {
    const cacheKey = 'full_schema';
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    try {
      // Jika database tidak connected, return demo schema
      if (!this.db.isConnected) {
        return this.getDemoSchema();
      }

      // Set search_path dengan schema names yang properly quoted
      await this.db.query('SET search_path TO "public", "SDA"');
      
      // Enhanced schema query 
      const schemaQuery = `
        SELECT 
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable,
          c.column_default,
          pgd.description as column_comment,
          tc.constraint_type,
          kcu2.table_schema AS foreign_table_schema,
          kcu2.table_name AS foreign_table_name,
          kcu2.column_name AS foreign_column_name
        FROM information_schema.columns c
        LEFT JOIN pg_catalog.pg_statio_all_tables st ON 
          c.table_schema = st.schemaname AND c.table_name = st.relname
        LEFT JOIN pg_catalog.pg_description pgd ON 
          pgd.objoid = st.relid AND pgd.objsubid = c.ordinal_position
        LEFT JOIN information_schema.key_column_usage kcu ON 
          c.table_schema = kcu.table_schema AND 
          c.table_name = kcu.table_name AND 
          c.column_name = kcu.column_name
        LEFT JOIN information_schema.table_constraints tc ON 
          kcu.constraint_name = tc.constraint_name AND 
          kcu.table_schema = tc.table_schema
        LEFT JOIN information_schema.referential_constraints rc ON 
          tc.constraint_name = rc.constraint_name AND 
          tc.table_schema = rc.constraint_schema
        LEFT JOIN information_schema.key_column_usage kcu2 ON 
          rc.unique_constraint_name = kcu2.constraint_name AND 
          rc.unique_constraint_schema = kcu2.constraint_schema
        WHERE c.table_schema IN ('public', 'SDA')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position;
      `;

      const result = await this.db.query(schemaQuery);
      const formattedSchema = this.formatDetailedSchema(result.rows);
      
      this.cache.set(cacheKey, {
        data: formattedSchema,
        timestamp: Date.now()
      });
      
      return formattedSchema;
    } catch (error) {
      console.error('Schema service error:', error);
      // Return demo schema jika error
      return this.getDemoSchema();
    }
  }

  formatDetailedSchema(rows) {
    const tables = {};
    const tableComments = {};
    
    rows.forEach(row => {
      const fullTableName = `"${row.table_schema}"."${row.table_name}"`;
      
      if (!tables[fullTableName]) {
        tables[fullTableName] = [];
      }
      
      let colDescription = `${row.column_name}:${row.data_type}`;
      
      // Tambahkan constraints
      if (row.constraint_type === 'PRIMARY KEY') {
        colDescription += ' (PRIMARY KEY)';
      } else if (row.constraint_type === 'FOREIGN KEY') {
        colDescription += ` → "${row.foreign_table_schema}"."${row.foreign_table_name}"."${row.foreign_column_name}"`;
      }
      
      // Tambahkan nullable info
      if (row.is_nullable === 'NO') {
        colDescription += ' [NOT NULL]';
      }
      
      // Tambahkan default value jika ada
      if (row.column_default) {
        colDescription += ` DEFAULT ${row.column_default}`;
      }
      
      tables[fullTableName].push(colDescription);
      
      // Simpan table comments jika ada
      if (row.column_comment && !tableComments[fullTableName]) {
        tableComments[fullTableName] = row.column_comment;
      }
    });

    // Format schema dengan deskripsi yang lebih baik
    let schemaDescription = "SCHEMA DATABASE POSTGRESQL:\n\n";
    
    Object.entries(tables).forEach(([table, columns]) => {
      schemaDescription += `TABEL: ${table}\n`;
      if (tableComments[table]) {
        schemaDescription += `   Deskripsi: ${tableComments[table]}\n`;
      }
      schemaDescription += `   Kolom:\n`;
      columns.forEach(col => {
        schemaDescription += `     - ${col}\n`;
      });
      schemaDescription += '\n';
    });

    return {
      schema: schemaDescription,
      raw: rows,
      tables: Object.keys(tables),
      isDemo: false
    };
  }

  async getTableRowCounts() {
    try {
      if (!this.db.isConnected) {
        return { isDemo: true };
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
          const countResult = await this.db.query(`SELECT COUNT(*) FROM ${fullTableName}`);
          counts[fullTableName] = parseInt(countResult.rows[0].count, 10);
        } catch (countError) {
          console.error(`Could not count rows for ${fullTableName}:`, countError);
          counts[fullTableName] = 'N/A';
        }
      }

      return counts;
    } catch (error) {
      console.error('Error getting table row counts:', error);
      return {};
    }
  }

  async getSampleData(tableName, limit = 3) {
    try {
      if (!this.db.isConnected) {
        return { isDemo: true, data: [] };
      }

      await this.db.query('SET search_path TO "public", "SDA"');
      
      const match = tableName.match(/"([^"]+)"\."([^"]+)"/);
      if (!match) {
        throw new Error('Invalid table format');
      }
      
      const schema = match[1];
      const table = match[2];
      
      const sampleQuery = `SELECT * FROM "${schema}"."${table}" LIMIT $1`;
      const result = await this.db.query(sampleQuery, [limit]);
      
      return {
        table: tableName,
        data: result.rows,
        count: result.rowCount
      };
    } catch (error) {
      console.error(`Error getting sample data for ${tableName}:`, error);
      return { error: error.message, data: [] };
    }
  }

  getDemoSchema() {
    console.log('Using demo schema - Database not connected');
    
    const demoSchema = `
SCHEMA DATABASE POSTGRESQL - DEMO MODE:

TABEL: "SDA"."customers"
   Deskripsi: Tabel data pelanggan jaringan
   Kolom:
     - customer_id:integer (PRIMARY KEY)
     - customer_name:text [NOT NULL]
     - email:text
     - phone_number:text
     - address:text
     - created_at:timestamp DEFAULT CURRENT_TIMESTAMP
     - status:text DEFAULT 'active'

TABEL: "SDA"."ap_devices"  
   Deskripsi: Data Access Point devices
   Kolom:
     - ap_id:integer (PRIMARY KEY)
     - location:text [NOT NULL]
     - device_type:text
     - status:text
     - customer_id:integer → "SDA"."customers"."customer_id"
     - installed_date:timestamp
     - last_maintenance:timestamp

TABEL: "SDA"."network_usage"
   Deskripsi: Data penggunaan jaringan
   Kolom:
     - usage_id:integer (PRIMARY KEY)
     - ap_id:integer → "SDA"."ap_devices"."ap_id"
     - bandwidth_usage:numeric
     - connected_users:integer
     - timestamp:timestamp [NOT NULL]

TABEL: "public"."users"
   Deskripsi: User system aplikasi
   Kolom:
     - user_id:integer (PRIMARY KEY)
     - username:text [NOT NULL]
     - role:text DEFAULT 'user'
     - created_at:timestamp DEFAULT CURRENT_TIMESTAMP
`;

    return {
      schema: demoSchema,
      raw: [],
      tables: [
        '"SDA"."customers"',
        '"SDA"."ap_devices"', 
        '"SDA"."network_usage"',
        '"public"."users"'
      ],
      isDemo: true
    };
  }

  clearCache() {
    this.cache.clear();
  }
}

export const schemaService = new SchemaService();