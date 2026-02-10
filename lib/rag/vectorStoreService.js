

import { GoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@google/generative-ai';
// Note: `hnswlib-node` is a native module and can cause bundler/runtime errors
// when evaluated at import time in some Next.js runtimes (RSC). We will
// dynamically import it inside `initializeVectorStore` to avoid evaluation
// during module load.
import fs from 'fs';
import path from 'path'; // <-- WAJIB import 'path'

// --- Konfigurasi ---
// ✅ PERBAIKAN: Gunakan path.join(process.cwd()) untuk path absolut
const MARKDOWN_PATH = path.join(process.cwd(), 'lib', 'context', 'sda_context.md');
const EMBEDDING_MODEL_NAME = 'text-embedding-004';
const EMBEDDING_DIMENSION = 768;
const MAX_CHUNKS = 50;
const HNSW_SPACE = 'cosine';

console.log("🔑 GEMINI_API_KEY:", process.env.GEMINI_API_KEY ? "TERDETEKSI ✅" : "❌ TIDAK ADA");
if (!process.env.GEMINI_API_KEY) {
  console.warn("⚠️  WARNING: GEMINI_API_KEY tidak ada. Vector store akan dinonaktifkan sementara.");
  // throw new Error("Missing GEMINI_API_KEY in environment variables");
}

const globalStore = global;

if (!globalStore.vectorStore) {
  globalStore.vectorStore = {
    isInitialized: false,
    vectorIndex: null,
    textChunks: [],
    geminiEmbedder: null,
    useBruteForce: false,
    embeddings: [],
  };
}

const _chunkMarkdown = (markdownContent) => {
  if (!markdownContent) {
    return [];
  }
  const chunks = [];
  let idCounter = 0;
  const parts = markdownContent.split(/\n---\n/);

  for (const part of parts) {
    if (part.trim().length === 0) continue;
    let title = 'General Context';
    const titleMatch = part.match(/##\s*`?(.*?)`?(\s*–|$)/);
    if (titleMatch && titleMatch[1]) {
      title = titleMatch[1].trim();
    } else {
      const numberedTitleMatch = part.match(/##\s*\d+\.?\s*`?(.*?)`?(\s*–|$)/);
      if (numberedTitleMatch && numberedTitleMatch[1]) {
        title = numberedTitleMatch[1].trim();
      }
    }
    chunks.push({
      id: idCounter,
      title: title,
      content: part.trim(),
    });
    idCounter++;
  }
  return chunks;
};

async function _getEmbedding(text) {
  const result = await globalStore.vectorStore.geminiEmbedder.embedContent(text);
  return result.embedding.values;
}

// ✅ PERBAIKAN: Ubah nama fungsi menjadi 'initializeVectorStore' (Anda salah ketik 'initializedVectorStore')
const initializeVectorStore = async () => {
  if (globalStore.vectorStore.isInitialized) return true;

  console.log('[VectorStore] Menginisialisasi...');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  const genAI = new GoogleGenerativeAI(apiKey);

  // model embedding, bukan generative
  globalStore.vectorStore.geminiEmbedder = genAI.getGenerativeModel({
    model: "text-embedding-004"
  });

  console.log('[VectorStore] Menginisialisasi in-memory vector store...');

  try {
    // ✅ PERBAIKAN: Inisialisasi klien Gemini yang benar
    globalStore.vectorStore.geminiEmbedder = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      .getGenerativeModel({ model: EMBEDDING_MODEL_NAME });

    // Dynamically import hnswlib-node to avoid native module evaluation at import
    // time which can break server/runtime bundlers (RSC). This keeps the module
    // safe to import even if the native bindings are unavailable at build time.
    let HierarchicalNSW = null;
    try {
      const hnsw = await import('hnswlib-node');
      HierarchicalNSW = hnsw.HierarchicalNSW;
      globalStore.vectorStore.vectorIndex = new HierarchicalNSW(HNSW_SPACE, EMBEDDING_DIMENSION);
      globalStore.vectorStore.vectorIndex.initIndex(MAX_CHUNKS);
      globalStore.vectorStore.useBruteForce = false;
    } catch (err) {
      // Fallback to brute-force search if native module not available
      console.warn('[VectorStore] hnswlib-node failed to load, falling back to brute-force search:', err.message);
      globalStore.vectorStore.vectorIndex = null;
      globalStore.vectorStore.useBruteForce = true;
      globalStore.vectorStore.embeddings = [];
    }

    // Baca file menggunakan path absolut
    const markdownContent = fs.readFileSync(MARKDOWN_PATH, 'utf-8');
    const chunks = _chunkMarkdown(markdownContent);

    if (chunks.length === 0) {
      throw new Error(`Tidak ada chunk yang ditemukan di ${MARKDOWN_PATH}. Periksa format file.`);
    }
    globalStore.vectorStore.textChunks = chunks;

    console.log(`[VectorStore] Memulai embedding untuk ${chunks.length} chunk...`);
    for (const chunk of chunks) {
      const embedding = await _getEmbedding(chunk.content);
      if (globalStore.vectorStore.useBruteForce) {
        globalStore.vectorStore.embeddings.push(embedding);
      } else {
        globalStore.vectorStore.vectorIndex.addPoint(embedding, chunk.id);
      }
    }

    globalStore.vectorStore.isInitialized = true;
    console.log("[VectorStore] ✅ Selesai inisialisasi.");
    return true;

  } catch (error) {
    console.error('[VectorStore] Inisialisasi Gagal Total:', error);
    globalStore.vectorStore = {
      isInitialized: false,
      vectorIndex: null,
      textChunks: [],
      geminiEmbedder: null,
    };
    return false;
  }
};

export const vectorSearch = async (queryText, k = 5) => {
  try {
    if (!globalStore.vectorStore.isInitialized) {
      // ✅ PERBAIKAN: Panggil fungsi dengan nama yang benar
      const initialized = await initializeVectorStore();
      if (!initialized) {
        throw new Error("Vector Store tidak dapat diinisialisasi.");
      }
    }

    const queryEmbedding = await _getEmbedding(queryText);

    // If we're using brute-force fallback, compute cosine similarities
    if (globalStore.vectorStore.useBruteForce || !globalStore.vectorStore.vectorIndex) {
      const embeddings = globalStore.vectorStore.embeddings || [];
      if (embeddings.length === 0) {
        return { success: true, results: [] };
      }

      const cosine = (a, b) => {
        let dot = 0, na = 0, nb = 0;
        for (let i = 0; i < a.length; i++) {
          dot += a[i] * b[i];
          na += a[i] * a[i];
          nb += b[i] * b[i];
        }
        if (na === 0 || nb === 0) return 0;
        return dot / (Math.sqrt(na) * Math.sqrt(nb));
      };

      const similarities = embeddings.map((emb, idx) => ({ idx, sim: cosine(queryEmbedding, emb) }));
      similarities.sort((a, b) => b.sim - a.sim);
      const top = similarities.slice(0, k);

      const results = top.map(item => {
        const chunk = globalStore.vectorStore.textChunks[item.idx];
        if (!chunk) return null;
        return {
          id: chunk.id,
          title: chunk.title,
          content: chunk.content,
          similarity: item.sim,
        };
      }).filter(Boolean);

      return { success: true, results };
    }

    const searchResult = globalStore.vectorStore.vectorIndex.searchKnn(queryEmbedding, k);

    const results = searchResult.neighbors.map((chunkId, index) => {
      const chunk = globalStore.vectorStore.textChunks.find(c => c.id === chunkId);
      if (!chunk) return null; // Pengaman jika chunk tidak ditemukan
      const similarity = 1 - searchResult.distances[index];
      return {
        id: chunk.id,
        title: chunk.title,
        content: chunk.content,
        similarity: similarity,
      };
    }).filter(Boolean); // Hapus hasil null

    return { success: true, results: results };

  } catch (error) {
    console.error('[VectorSearch] Gagal melakukan pencarian:', error);
    return { success: false, results: [], error: error.message };
  }
};