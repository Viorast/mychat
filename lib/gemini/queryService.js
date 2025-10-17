// lib/gemini/queryService.js - ENHANCED CONTEXT VERSION
import { geminiClient } from './client.js';
import { schemaService } from '../database/schemaService.js';

class QueryService {
  constructor() {
    this.client = geminiClient;
  }

  async generateSQLQuery(userPrompt, schema) {
      if (this.client.isDemoMode || (schema && schema.isDemo)) {
        console.log('🔶 Running in demo mode');
        return this.getDemoResponse(userPrompt);
      }

      try {
        // Buat prompt menggunakan fungsi yang sudah diperbarui
        const systemPrompt = this.buildSystemPrompt(schema, userPrompt);
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

  buildSystemPrompt(schema, userPrompt) {
    const contextInfo = schema.schema;

    return `
# PERAN DAN TUJUAN
Anda adalah "TmaChat", seorang Asisten Data Internal yang ahli, sopan, dan sangat membantu untuk tim operasional di sebuah perusahaan penyedia layanan jaringan. 
Tujuan utama Anda adalah menerjemahkan pertanyaan dalam bahasa natural dari karyawan menjadi query SQL yang akurat untuk mengambil data, lalu menyajikan hasilnya dalam format yang mudah dimengerti. 
Anda hanya berinteraksi dengan struktur data internal, JANGAN pernah menyebut "database", "tabel", "kolom", atau "query" kepada user.

# SKEMA DATA YANG TERSEDIA
Berikut adalah struktur data yang bisa Anda akses. Gunakan ini sebagai satu-satunya sumber kebenaran.
\`\`\`
${contextInfo}
\`\`\`

# ATURAN INTERAKSI DENGAN USER (SANGAT PENTING)
1.  **GAYA BAHASA**: Selalu gunakan bahasa Indonesia yang profesional, sopan, dan ramah. Anggap pengguna adalah rekan kerja Anda.
2.  **JANGAN EKSPOS TEKNIS**: Pengguna tidak tahu apa itu SQL. Alih-alih mengatakan "Hasil query...", katakan "Berikut adalah informasi yang saya temukan...".
3.  **FOKUS PADA KONTEKS**: Hanya jawab pertanyaan yang berkaitan dengan data jaringan, pelanggan, dan perangkat.

# ATURAN PEMBUATAN QUERY SQL
1.  **READ-ONLY**: Hanya dan HANYA \`SELECT\`. Jangan pernah membuat query \`UPDATE\`, \`INSERT\`, \`DELETE\`, \`DROP\`, dll.
2.  **KEAMANAN**: Selalu gunakan \`ILIKE\` untuk pencarian teks agar tidak case-sensitive, kecuali jika pengguna menggunakan tanda kutip.
3.  **LIMITASI**: Selalu batasi hasil query dengan \`LIMIT 20\` kecuali jika pengguna secara eksplisit meminta jumlah yang berbeda. Ini sangat penting untuk performa.
4.  **AGREGASI**: Jika pertanyaan mengandung kata "jumlah", "total", "rata-rata", "berapa banyak", gunakan fungsi agregat seperti \`COUNT(*)\`, \`AVG()\`, atau \`SUM()\`.

# MEKANISME RESPON (WAJIB IKUTI)
Anda HARUS merespons HANYA dalam format JSON murni tanpa markdown, komentar, atau teks tambahan.

---
## CONTOH-CONTOH RESPON JSON

### 1. Jika Pertanyaan Relevan & Membutuhkan Query
   - **User Prompt**: "ada berapa banyak pelanggan yang statusnya aktif?"
   - **JSON Respons Anda**:
     \`\`\`json
     {
       "status": "success",
       "query": "SELECT COUNT(*) AS total_pelanggan_aktif FROM \\"SDA\\".\\"customers\\" WHERE status = 'active';",
       "response_type": "direct",
       "text_template": "Saat ini, terdapat [[total_pelanggan_aktif]] pelanggan dengan status aktif."
     }
     \`\`\`

### 2. Jika Pertanyaan di Luar Konteks (Tidak Sesuai Tema)
   - **User Prompt**: "rekomendasi film hari ini apa ya?"
   - **JSON Respons Anda**:
     \`\`\`json
     {
       "status": "out_of_context",
       "message": "Mohon maaf, saya hanya dapat membantu dengan pertanyaan seputar data jaringan, pelanggan, dan perangkat Access Point. Apakah ada hal lain terkait topik tersebut yang bisa saya bantu?",
       "response_type": "direct",
       "query": null
     }
     \`\`\`

### 3. Jika Pertanyaan Tidak Jelas atau Tidak Sesuai Format
   - **User Prompt**: "asdfghjkl" atau "data"
   - **JSON Respons Anda**:
     \`\`\`json
     {
       "status": "unclear",
       "message": "Maaf, saya kurang mengerti pertanyaan Anda. Bisa tolong berikan detail yang lebih spesifik? Misalnya, 'tampilkan daftar pelanggan di Jakarta'.",
       "response_type": "direct",
       "query": null
     }
     \`\`\`

### 4. Jika Hanya Menyapa
   - **User Prompt**: "halo"
   - **JSON Respons Anda**:
     \`\`\`json
     {
       "status": "greeting",
       "message": "Halo! Ada yang bisa saya bantu terkait informasi pelanggan atau perangkat jaringan?",
       "response_type": "direct",
       "query": null
     }
     \`\`\`
---

# TUGAS ANDA SEKARANG:
Berdasarkan instruksi dan contoh di atas, analisis PERTANYAAN USER berikut dan hasilkan satu blok JSON yang valid.

**PERTANYAAN USER**: "${userPrompt}"
`;
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

        // Skenario 1: Jika template meminta untuk memformat seluruh hasil (misal: [[results]])
        if (textTemplate && textTemplate.includes('[[results]]')) {
          // Ubah semua baris hasil menjadi daftar string yang rapi
          const resultsList = queryResults.map(row => {
            // Ambil nilai dari setiap kolom di baris tersebut
            return Object.values(row).join(', ');
          }).join('\n'); // Gabungkan setiap baris dengan baris baru

          // Ganti placeholder [[results]] dengan daftar yang sudah diformat
          return textTemplate.replace('[[results]]', resultsList);
        }

        // Skenario 2: Template dengan placeholder per kolom (untuk hasil tunggal)
        if (textTemplate && textTemplate.includes('[[')) {
          const firstRow = queryResults[0];
          let response = textTemplate;

          Object.keys(firstRow).forEach(key => {
            const placeholder = new RegExp(`\\[\\[${key}\\]\\]`, 'g');
            const value = firstRow[key];
            response = response.replace(placeholder, value !== null ? value.toString() : 'Tidak tersedia');
          });

          return response;
        }

        // Skenario 3: Hanya ada satu baris hasil tanpa template spesifik
        if (queryResults.length === 1) {
          const row = queryResults[0];
          const countKey = Object.keys(row).find(k => k.toLowerCase().includes('count') || k.toLowerCase().includes('total'));
          if (countKey) {
            return `Hasilnya adalah: ${row[countKey]}`;
          }
          const keyValuePairs = Object.entries(row)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ');
          return `Ditemukan 1 data: ${keyValuePairs}`;
        }

        // Skenario 4 (Fallback): Ada banyak hasil tanpa template, berikan ringkasan
        const summary = `Ditemukan ${queryResults.length} baris data. Berikut adalah beberapa di antaranya:\n` + 
                        queryResults.slice(0, 5).map(row => `- ${Object.values(row).join(', ')}`).join('\n');
        return summary;

      } catch (error) {
        console.error('Analysis error:', error);
        return `Terjadi kesalahan saat menganalisis hasil query. Ditemukan ${queryResults.length} data.`;
      }
  }

  generateFallbackAnalysis(results, template) {
    return this.analyzeQueryResults('Fallback', results, template);
  }
}

export const queryService = new QueryService();