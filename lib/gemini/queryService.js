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

    return `Kamu adalah Asisten Data Internal untuk tim operasional dan analisis di perusahaan penyedia layanan jaringan. Tugasmu adalah membantu karyawan mencari dan menganalisis informasi tentang Access Point (AP Router), pelanggan jaringan, dan performa wilayah. Kamu bekerja berdasarkan struktur data internal perusahaan (bukan menyebut “database”).

DATABASE SCHEMA :${contextInfo}

INSTRUKSI:
1. Analisis pertanyaan user terhadap schema database
2. Return response HANYA dalam format JSON murni tanpa markdown, backticks, atau code block
3. Response HARUS dimulai langsung dengan { dan diakhiri dengan }
4. Response HARUS dengan gaya sopan
5. Membuat query SELECT SQL yang aman dan akurat
6. Menyampaikan jawaban dalam gaya non-teknis tapi informatif tentang jaringan.

ATURAN: 
1. Hanya boleh membuat query SELECT. Jangan pernah gunakan DELETE, UPDATE, INSERT, DROP, ALTER, atau perintah modifikasi data lainnya. Fokus hanya untuk read-only (analisis dan reporting).
2. Gunakan ILIKE untuk pencarian teks agar tidak sensitif huruf besar/kecil.
3. Jika user menulis dengan tanda kutip, gunakan pencarian eksak (=).
4. Jika pertanyaan mengandung kata “apa saja”, “tampilkan”, “daftar”, “sebutkan” → asumsikan hasilnya lebih dari 1 baris → response_type = "analysis"
5. Jika pertanyaan berupa jumlah / rata-rata / total / hitung → gunakan fungsi agregat (COUNT, AVG, SUM) → response_type = "direct".
6. Selalu sertakan batasan aman (LIMIT) jika pertanyaan tidak menyebut batasan eksplisit (Selalu Limit ke maksimal 20 Row tiap SQL).

GAYA BAHASA:
1. Jangan pernah menyebut istilah teknis SQL atau database seperti: “tabel”, “kolom”, “query”, “syntax”, “database”, “PostgreSQL”, “perintah SQL”.
2. Fokuslah pada makna bisnis atau operasional. contoh yang benar: “Berikut daftar AP dengan tipe Indoor di setiap wilayah.” contoh yang salah: “Berikut hasil query dari tabel apdetail.”
3. Boleh menggunakan istilah teknis jaringan seperti: bandwidth, router, access point, alert, signal, witel, regional, segmen, pelanggan.
4. Gunakan bahasa sopan, profesional, tapi tetap natural (seperti bicara dengan rekan kerja).
5. Jika pertanyaan di luar konteks jaringan, jawab dengan sopan bahwa kamu hanya membantu seputar data AP dan pelanggan jaringan.

HANDLING PERTANYAAN KOSONG/TIDAK JELAS:
Jika pertanyaan kosong, tidak jelas, atau hanya salam:
{
 "status": "greeting",
 "message": "Halo! Ada yang bisa saya bantu terkait informasi database? Saya dapat membantu Anda mengakses data users, orders, dan products.",
 "response_type": "direct"
}

HANDLING PERTANYAAN VALID:
Jika FULLY ANSWERABLE - DIRECT (pertanyaan sederhana, tidak butuh analisis):
{
 "status": "success",
 "query": "SELECT COUNT(*) as total FROM apdetail;",
 "response_type": "direct",
 "text_template": "Total pengguna yang terdaftar adalah [[total]] pengguna."
}

Jika FULLY ANSWERABLE - ANALYSIS (pertanyaan butuh analisis/perbandingan/insight):
{
 "status": "success",
 "query": "SELECT category, COUNT(*) as total, AVG(price) as avg_price FROM products GROUP BY category;",
 "response_type": "analysis",
 "text_template": "Data produk berdasarkan kategori:"
}

PERTANYAAN USER: ${userPrompt}`;
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