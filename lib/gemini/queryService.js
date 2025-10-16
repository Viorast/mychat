// lib/gemini/queryService.js - ENHANCED CONTEXT VERSION
import { geminiClient } from './client.js';
import { schemaService } from '../database/schemaService.js';

class QueryService {
  constructor() {
    this.client = geminiClient;
  }

  async generateSQLQuery(userPrompt, schema) {
    // Jika Gemini client dalam demo mode atau schema demo, return response demo
    if (this.client.isDemoMode || (schema && schema.isDemo)) {
      console.log('🔶 Running in demo mode');
      return this.getDemoResponse(userPrompt);
    }

    try {
      // Dapatkan additional context (row counts, sample data)
      const additionalContext = await this.getAdditionalContext(schema);
      
      const systemPrompt = this.buildSystemPrompt(schema, additionalContext);
      console.log('🤖 Sending enhanced prompt to Gemini AI...');
      
      const response = await this.client.generateResponse(userPrompt, systemPrompt);
      
      if (!response.success) {
        console.warn('⚠️ Gemini response not successful, using demo response');
        return this.getDemoResponse(userPrompt);
      }

      const parsedResponse = this.parseAIResponse(response.text);
      console.log('✅ AI Response parsed:', {
        status: parsedResponse.status,
        needsQuery: parsedResponse.needs_query_execution,
        needsAnalysis: parsedResponse.needs_ai_analysis
      });

      return parsedResponse;

    } catch (error) {
      console.error('❌ Query generation error:', error);
      return this.getDemoResponse(userPrompt);
    }
  }

  async getAdditionalContext(schema) {
    try {
      // Get table row counts
      const rowCounts = await schemaService.getTableRowCounts();
      
      // Get sample data untuk tabel utama
      const sampleData = {};
      const mainTables = schema.tables?.filter(table => 
        table.includes('customer') || table.includes('ap') || table.includes('user')
      ).slice(0, 2); // Ambil maksimal 2 tabel sample
      
      for (const table of mainTables) {
        const sample = await schemaService.getSampleData(table, 2);
        if (sample.data && sample.data.length > 0) {
          sampleData[table] = sample.data;
        }
      }
      
      return {
        rowCounts,
        sampleData
      };
    } catch (error) {
      console.error('Error getting additional context:', error);
      return {};
    }
  }

  buildSystemPrompt(schema, additionalContext = {}) {
    const { rowCounts, sampleData } = additionalContext;
    
    let contextInfo = schema.schema;
    
    // Tambahkan row counts jika available
    if (rowCounts && !rowCounts.isDemo) {
      contextInfo += "\n\n📈 JUMLAH DATA PER TABEL:\n";
      Object.entries(rowCounts).forEach(([table, count]) => {
        contextInfo += `   ${table}: ${count} records\n`;
      });
    }
    
    // Tambahkan sample data jika available
    if (sampleData && Object.keys(sampleData).length > 0) {
      contextInfo += "\n\n📋 CONTOH DATA:\n";
      Object.entries(sampleData).forEach(([table, data]) => {
        contextInfo += `   ${table}:\n`;
        data.forEach((row, index) => {
          contextInfo += `     Record ${index + 1}: ${JSON.stringify(row)}\n`;
        });
      });
    }

    return `ANDA ADALAH ASISTEN DATABASE INTERNAL PERUSAHAAN JARINGAN

# KONTEKS DATABASE ANDA:
${contextInfo}

# INSTRUKSI KHUSUS:
1. ANDA MEMILIKI AKSES PENUH KE SCHEMA DI ATAS - GUNAKAN INFORMASI INI UNTUK MENJAWAB PERTANYAAN
2. JANGAN KATAKAN "saya tidak memiliki akses" atau "saya tidak tahu" tentang database ini
3. BERIKAN JAWABAN SPESIFIK BERDASARKAN SCHEMA YANG ADA
4. JIKA DATA TIDAK TERSEDIA DI SCHEMA, SARANKAN TABEL TERDEKAT YANG RELEVAN

# CONTOH JAWABAN YANG BENAR:
❌ SALAH: "Saya tidak bisa mengakses database"
✅ BENAR: "Berdasarkan schema, data customer tersimpan di tabel SDA.customers. Query untuk menghitung total customer: SELECT COUNT(*) FROM \\"SDA\\".\\"customers\\""

❌ SALAH: "Saya tidak tahu tabel apa yang berisi data customer"  
✅ BENAR: "Data customer ada di tabel \\"SDA\\".\\"customers\\" dengan kolom: customer_id, customer_name, email, dll."

# ATURAN QUERY:
- Hanya SELECT queries
- Gunakan quoted table names: \\"SDA\\".\\"nama_tabel\\"
- LIMIT 20 untuk queries yang return banyak data
- Gunakan ILIKE untuk text search

# FORMAT RESPONSE WAJIB (JSON):
{
  "status": "success",
  "response_type": "direct|analysis", 
  "message": "Jawaban natural bahasa Indonesia berdasarkan schema",
  "query": "SQL query atau null",
  "text_template": "Template dengan [[placeholder]]",
  "needs_query_execution": true|false,
  "needs_ai_analysis": true|false
}

# PERTANYAAN USER:
${userPrompt}`;
  }

  parseAIResponse(responseText) {
    try {
      console.log('📝 Raw AI Response:', responseText.substring(0, 200) + '...');

      let cleaned = responseText.trim();
      cleaned = cleaned.replace(/```json\s*/gi, '');
      cleaned = cleaned.replace(/```javascript\s*/gi, '');
      cleaned = cleaned.replace(/```sql\s*/gi, '');
      cleaned = cleaned.replace(/```\s*/g, '');
      cleaned = cleaned.replace(/^['"]|['"]$/g, '');
      
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('❌ No JSON object found in response');
        throw new Error('Invalid response format - no JSON found');
      }
      
      const jsonString = jsonMatch[0];
      console.log('🔍 Extracted JSON:', jsonString.substring(0, 150) + '...');
      
      const parsed = JSON.parse(jsonString);
      
      const result = {
        status: parsed.status || 'success',
        response_type: parsed.response_type || 'direct',
        message: parsed.message || 'Tidak ada pesan yang diberikan',
        query: parsed.query || null,
        text_template: parsed.text_template || null,
        needs_query_execution: Boolean(parsed.query),
        needs_ai_analysis: parsed.response_type === 'analysis'
      };

      console.log('✅ Parsed successfully:', result);
      return result;

    } catch (error) {
      console.error('❌ AI response parsing error:', error.message);
      return this.getDemoResponse();
    }
  }

  getDemoResponse(userPrompt = '') {
    console.log('🎭 Generating demo response for:', userPrompt);

    const lowerPrompt = userPrompt.toLowerCase();
    
    // Response untuk pertanyaan tentang customer
    if (lowerPrompt.includes('customer') || lowerPrompt.includes('pelanggan')) {
      return {
        status: 'success',
        response_type: 'direct',
        message: `Berdasarkan schema database, data customer tersimpan di tabel "SDA"."customers". Tabel ini memiliki kolom: customer_id, customer_name, email, phone_number, address, status.`,
        query: 'SELECT COUNT(*) as total_customers FROM "SDA"."customers"',
        text_template: 'Total customer dalam database: [[total_customers]]',
        needs_query_execution: true,
        needs_ai_analysis: false
      };
    }
    
    // Response untuk pertanyaan tentang access point
    if (lowerPrompt.includes('access point') || lowerPrompt.includes('ap') || lowerPrompt.includes('router')) {
      return {
        status: 'success', 
        response_type: 'analysis',
        message: `Data Access Point tersimpan di tabel "SDA"."ap_devices". Tabel ini berelasi dengan tabel customers melalui customer_id.`,
        query: 'SELECT ap_id, location, device_type, status FROM "SDA"."ap_devices" LIMIT 10',
        text_template: 'Daftar Access Point:',
        needs_query_execution: true,
        needs_ai_analysis: true
      };
    }

    // Default response
    return {
      status: 'success',
      response_type: 'direct',
      message: `Saya menganalisis pertanyaan Anda tentang database jaringan. Dalam mode live, saya akan memberikan informasi spesifik dari schema database yang tersedia.`,
      query: 'SELECT COUNT(*) as total_users FROM "public"."users"',
      text_template: 'Total pengguna sistem: [[total_users]]',
      needs_query_execution: true,
      needs_ai_analysis: false
    };
  }

  async analyzeQueryResults(userPrompt, queryResults, textTemplate) {
    console.log('🧠 Analyzing query results:', {
      resultsCount: queryResults.length,
      hasTemplate: !!textTemplate
    });

    try {
      if (!queryResults || queryResults.length === 0) {
        return 'Tidak ada data yang ditemukan dengan kriteria tersebut.';
      }

      if (textTemplate && textTemplate.includes('[[')) {
        const firstRow = queryResults[0];
        let response = textTemplate;
        
        Object.keys(firstRow).forEach(key => {
          const placeholder = `[[${key}]]`;
          const value = firstRow[key];
          response = response.replace(new RegExp(placeholder, 'g'), value !== null ? value.toString() : 'Tidak tersedia');
        });
        
        return response;
      }

      // Default analysis
      if (queryResults.length === 1) {
        const row = queryResults[0];
        if (row.total_customers !== undefined) {
          return `Total customer dalam sistem: ${row.total_customers}`;
        } else if (row.total_users !== undefined) {
          return `Total pengguna sistem: ${row.total_users}`;
        } else {
          const keyValuePairs = Object.entries(row)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
          return `Data: ${keyValuePairs}`;
        }
      } else {
        return `Ditemukan ${queryResults.length} record data. ${textTemplate || 'Berikut hasil query database.'}`;
      }
    } catch (error) {
      console.error('Analysis error:', error);
      return `Ditemukan ${queryResults.length} data. ${textTemplate || 'Berikut hasil analisis data.'}`;
    }
  }

  generateFallbackAnalysis(results, template) {
    return this.analyzeQueryResults('Fallback', results, template);
  }
}

export const queryService = new QueryService();