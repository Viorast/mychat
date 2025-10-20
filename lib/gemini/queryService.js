import { geminiClient } from './client.js';
import { schemaService } from '../database/schemaService.js';

class QueryService {
  constructor() {
    this.client = geminiClient;
  }

  async generateSQLQuery(userPrompt, schema, history = [], additionalContext = {}) {
      if (this.client.isDemoMode || (schema && schema.isDemo)) {
        console.log('🔶 Running in demo mode');
        return this.getSafeFallbackResponse('Demo mode is active.');
      }

      try {
        const systemPrompt = this.buildSystemPrompt(schema, userPrompt, history, additionalContext);
        console.log('🤖 Sending enhanced prompt to Gemini AI...');

        const response = await this.client.generateResponse(userPrompt, systemPrompt);

        if (!response.success) {
          console.warn('⚠️ Gemini response not successful, using safe fallback.');
          return this.getSafeFallbackResponse('Gagal mendapatkan respons dari AI.');
        }

        const parsedResponse = this.parseAIResponse(response.text);
        console.log('✅ AI Response parsed:', {
          status: parsedResponse.status,
          needsQuery: parsedResponse.needs_query_execution,
        });

        return parsedResponse;

      } catch (error) {
        console.error('❌ Query generation error:', error);
        return this.getSafeFallbackResponse(error.message);
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
      ).slice(0, 2);
      
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

  buildSystemPrompt(schema, userPrompt, history = [], additionalContext = {}) {
    const contextInfo = schema.schema;
    const historyText = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    let additionalContextText = '';
    // ... (logika untuk additionalContextText tetap sama)

    return `
# PERAN DAN TUJUAN
Anda adalah "TmaChat", seorang Asisten Data Internal yang ahli.
Tujuan utama Anda adalah menjawab pertanyaan pengguna tentang data perusahaan dengan dua cara:
1.  **Jika pertanyaan bisa dijawab dengan query SQL**: Terjemahkan pertanyaan menjadi query SQL yang akurat.
2.  **Jika pertanyaan adalah tentang struktur data (meta-question)**: Jawab langsung berdasarkan informasi skema yang Anda miliki tanpa membuat query.

# SKEMA DATA YANG TERSEDIA
Berikut adalah struktur data yang bisa Anda akses. Ini adalah satu-satunya sumber kebenaran Anda.
\`\`\`
${contextInfo}
\`\`\`
${additionalContextText}
# RIWAYAT PERCAKAPAN SEBELUMNYA
${historyText}

# ATURAN INTERAKSI (SANGAT PENTING)
- Selalu gunakan bahasa Indonesia yang profesional dan ramah.
- JANGAN pernah mengekspos istilah teknis seperti "database", "query", "SQL" kepada pengguna.

# MEKANISME RESPON JSON (WAJIB IKUTI)
Anda HARUS merespons HANYA dalam format JSON murni.

---
## CONTOH-CONTOH RESPON JSON

### 1. Pertanyaan yang Membutuhkan Query Data
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

### 2. Pertanyaan Tentang Struktur/Meta-Data (TIDAK PERLU QUERY)
   - **User Prompt**: "tabel apa saja yang ada di skema SDA?"
   - **JSON Respons Anda**:
     \`\`\`json
     {
       "status": "success",
       "query": null,
       "response_type": "direct",
       "message": "Tentu, data yang tersedia terorganisir dalam beberapa bagian, termasuk: 'customers', 'ap_devices', dan 'network_usage'. Apakah Anda ingin mengetahui detail dari salah satunya?"
     }
     \`\`\`

### 3. Pertanyaan di Luar Konteks
   - **User Prompt**: "rekomendasi film?"
   - **JSON Respons Anda**:
     \`\`\`json
     {
       "status": "out_of_context",
       "message": "Mohon maaf, saya hanya dapat membantu dengan pertanyaan seputar data jaringan dan pelanggan.",
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
      console.log('Raw AI Response:', responseText.substring(0, 200) + '...');
      let cleaned = responseText.trim().replace(/^```json\s*|```$/g, '');
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        status: parsed.status || 'success',
        response_type: parsed.response_type || 'direct',
        message: parsed.message || null,
        query: parsed.query || null,
        text_template: parsed.text_template || null,
        needs_query_execution: Boolean(parsed.query),
        needs_ai_analysis: parsed.response_type === 'analysis'
      };
    } catch (error) {
      console.error('AI response parsing error:', error.message);
      // Fallback ke respons aman, bukan demo response.
      return this.getSafeFallbackResponse('Saya mengalami sedikit kendala dalam memahami format respons. Bisakah Anda mencoba bertanya dengan cara lain?');
    }
  }

  getSafeFallbackResponse(errorMessage) {
    console.log(`Generating safe fallback response due to: ${errorMessage}`);
    return {
      status: 'error',
      response_type: 'direct',
      message: errorMessage || "Maaf, terjadi kesalahan internal. Silakan coba lagi.",
      query: null,
      text_template: null,
      needs_query_execution: false,
      needs_ai_analysis: false
    };
  }

  async analyzeQueryResults(userPrompt, queryResults, textTemplate) {
      console.log('Analyzing query results:', {
        resultsCount: queryResults.length,
        hasTemplate: !!textTemplate
      });

      try {
        if (!queryResults || queryResults.length === 0) {
          return 'Tidak ada data yang ditemukan dengan kriteria tersebut.';
        }
        if (textTemplate && textTemplate.includes('[[results]]')) {
          const resultsList = queryResults.map(row => {
           
            return Object.values(row).join(', ');
          }).join('\n'); 

          return textTemplate.replace('[[results]]', resultsList);
        }
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