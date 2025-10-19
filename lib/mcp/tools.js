import { schemaService } from '../database/schemaService';
import { queryExecutor } from '../database/queryExecutor';
import { z } from 'zod';

export const mcpTools = {
  getDatabaseSchema: {
    description: 'Mengambil skema lengkap dari database PostgreSQL yang terhubung. Gunakan ini sebagai langkah pertama jika Anda tidak yakin dengan struktur tabel atau kolom yang tersedia untuk menjawab pertanyaan.',
    input: z.object({}), 
    handler: async () => {
      console.log('MCP Tool: getDatabaseSchema executed');
      const schema = await schemaService.getFullSchema();
      return schema.schema || 'Tidak dapat mengambil skema.';
    },
  },

  executeQuery: {
    description: 'Menjalankan query SQL SELECT yang aman terhadap database. Gunakan ini setelah Anda mengetahui skema dan telah menyusun query yang tepat untuk menjawab pertanyaan pengguna. Hanya query SELECT yang diizinkan.',
    input: z.object({
      query: z.string().describe("Query SQL SELECT yang valid untuk dijalankan. Selalu gunakan LIMIT untuk membatasi hasil."),
    }),
    handler: async ({ query }) => {
      console.log(`MCP Tool: executeQuery executed with query: ${query}`);
      
      const validation = queryExecutor.validateQuery(query);
      if (!validation.valid) {
        throw new Error(validation.error);
      }
      
      const result = await queryExecutor.executeQuery(query);
      if (!result.success) {
        throw new Error(result.error);
      }
      
      // Mengubah hasil menjadi format string JSON 
      return JSON.stringify(result.rows, null, 2);
    },
  },
};