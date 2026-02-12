import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * Document Loader Service
 * Loads and chunks company documents (MD, TXT, PDF)
 */

import { GoogleGenerativeAI } from '@google/generative-ai';

const COMPANY_DOCS_PATH = path.join(process.cwd(), 'lib', 'context', 'company');
const MAX_CHUNK_SIZE = 512; // tokens (roughly 2048 chars)
const CHARS_PER_TOKEN = 4; // approximate

// Initialize Gemini for OCR (fallback)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Use Gemini 2.0 Flash given it's available and fast
const VISION_MODEL_NAME = 'gemini-2.5-flash';

/**
 * Load all company documents
 * @returns {Array} Array of chunks with metadata
 */
export async function loadCompanyDocs() {
    if (!fs.existsSync(COMPANY_DOCS_PATH)) {
        console.warn(`[DocumentLoader] Company docs directory not found: ${COMPANY_DOCS_PATH}`);
        return [];
    }

    const chunks = [];
    await scanDirectory(COMPANY_DOCS_PATH, chunks);

    console.log(`[DocumentLoader] Loaded ${chunks.length} chunks from company documents`);
    return chunks;
}

/**
 * Recursively scan directory for supported files
 */
async function scanDirectory(dir, chunks, basePath = '') {
    const items = fs.readdirSync(dir);

    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            await scanDirectory(fullPath, chunks, path.join(basePath, item));
        } else if (stat.isFile()) {
            const ext = path.extname(item).toLowerCase();

            if (['.md', '.txt'].includes(ext)) {
                await loadTextFile(fullPath, chunks, basePath);
            } else if (ext === '.pdf') {
                await loadPdfFile(fullPath, chunks, basePath);
            }
        }
    }
}

/**
 * Load markdown or text file
 */
async function loadTextFile(filePath, chunks, category) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const fileName = path.basename(filePath);
        const lastModified = fs.statSync(filePath).mtime;

        // Split into chunks
        const fileChunks = chunkText(content, MAX_CHUNK_SIZE * CHARS_PER_TOKEN);

        fileChunks.forEach((chunk, index) => {
            chunks.push({
                content: chunk,
                metadata: {
                    fileName,
                    category: category || 'general',
                    type: 'document',
                    section: `Part ${index + 1}/${fileChunks.length}`,
                    lastModified: lastModified.toISOString(),
                }
            });
        });

        console.log(`[DocumentLoader] Loaded ${fileChunks.length} chunks from ${fileName}`);
    } catch (error) {
        console.error(`[DocumentLoader] Error loading ${filePath}:`, error.message);
    }
}

/**
 * Load PDF file
 */
async function loadPdfFile(filePath, chunks, category) {
    try {
        const dataBuffer = fs.readFileSync(filePath);
        let text = '';

        try {
            const data = await pdfParse(dataBuffer);
            text = data.text;
        } catch (parseError) {
            console.warn(`[DocumentLoader] pdf-parse failed for ${path.basename(filePath)}, trying OCR fallback...`);
        }

        const fileName = path.basename(filePath);
        const lastModified = fs.statSync(filePath).mtime;

        // Check if text is sufficient (if < 100 chars, assume scanned/image PDF)
        if (!text || text.trim().length < 500) {
            console.log(`[DocumentLoader] 🔍 Detected scanned/image PDF: ${fileName}. Using Gemini Vision OCR...`);
            text = await performOCR(dataBuffer, fileName);

            if (!text) {
                console.warn(`[DocumentLoader] ⚠️ OCR failed or returned empty for ${fileName}`);
                return;
            }
        }

        // Chunk text
        const fileChunks = chunkText(text, MAX_CHUNK_SIZE * CHARS_PER_TOKEN);

        fileChunks.forEach((chunk, index) => {
            chunks.push({
                content: chunk,
                metadata: {
                    fileName,
                    category: category || 'general',
                    type: 'pdf',
                    section: `Page ${index + 1}/${fileChunks.length}`,
                    lastModified: lastModified.toISOString(),
                }
            });
        });

        console.log(`[DocumentLoader] Loaded ${fileChunks.length} chunks from PDF ${fileName}`);
    } catch (error) {
        console.error(`[DocumentLoader] Error loading PDF ${filePath}:`, error.message);
    }
}

/**
 * Perform OCR using Gemini Vision
 */
async function performOCR(buffer, fileName) {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.warn('[DocumentLoader] GEMINI_API_KEY missing, skipping OCR');
            return '';
        }

        const model = genAI.getGenerativeModel({ model: VISION_MODEL_NAME });

        // Convert buffer to base64
        const data = buffer.toString('base64');

        const prompt = "Extract all text from this PDF document. Preserve structure like headers and lists where possible. Output ONLY the extracted text.";

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    data: data,
                    mimeType: "application/pdf",
                },
            },
        ]);

        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error(`[DocumentLoader] OCR Error for ${fileName}:`, error.message);
        return '';
    }
}

/**
 * Chunk text into smaller pieces
 */
function chunkText(text, maxChars) {
    const chunks = [];

    // Split by sections (## headers for markdown)
    const sections = text.split(/\n##\s+/);

    for (const section of sections) {
        if (section.trim().length === 0) continue;

        if (section.length <= maxChars) {
            // Section fits in one chunk
            chunks.push(section.trim());
        } else {
            // Split section into smaller chunks
            const paragraphs = section.split(/\n\n+/);
            let currentChunk = '';

            for (const para of paragraphs) {
                if ((currentChunk + para).length <= maxChars) {
                    currentChunk += (currentChunk ? '\n\n' : '') + para;
                } else {
                    if (currentChunk) {
                        chunks.push(currentChunk.trim());
                    }
                    currentChunk = para;
                }
            }

            if (currentChunk) {
                chunks.push(currentChunk.trim());
            }
        }
    }

    return chunks.filter(c => c.length > 50); // Filter out too-short chunks
}

/**
 * Get document stats
 */
export function getDocumentStats() {
    if (!fs.existsSync(COMPANY_DOCS_PATH)) {
        return { files: 0, directories: 0 };
    }

    let files = 0;
    let directories = 0;

    function countItems(dir) {
        const items = fs.readdirSync(dir);

        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                directories++;
                countItems(fullPath);
            } else if (stat.isFile()) {
                const ext = path.extname(item).toLowerCase();
                if (['.md', '.txt', '.pdf'].includes(ext)) {
                    files++;
                }
            }
        }
    }

    countItems(COMPANY_DOCS_PATH);

    return { files, directories };
}
