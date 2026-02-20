import { queryExecutor } from "../../../database/queryExecutor.js";

const MAX_RETRIEVED_RECORDS = 50;
const RERANK_FAILURE_CONTEXT = "Tidak ada konteks skema yang relevan ditemukan.";

export class SqlExecutionService {
    constructor(dbExecutor = queryExecutor) {
        this.dbExecutor = dbExecutor;
    }

    /**
     * Langkah 4: Eksekusi SQL
     */
    async retrieveData(sqlQuery) {
        if (!sqlQuery) {
            return { success: false, data: null, error: 'No query provided for retrieval.' };
        }
        console.log('[RAG v1.4] Step 4: Retrieving data with query:', sqlQuery);

        const validation = this.dbExecutor.validateQuery(sqlQuery);
        if (!validation.valid) {
            console.error('[RAG v1.4] Invalid query detected:', validation.error);
            return { success: false, data: null, error: `Invalid query detected: ${validation.error}` };
        }

        try {
            const result = await this.dbExecutor.executeQuery(sqlQuery);
            if (!result.success) {
                console.error('[RAG v1.4] Database query failed:', result.error);
                return { success: false, data: null, error: result.error };
            }

            console.log(`[RAG v1.4] Retrieved ${result.rowCount} records.`);
            const limitedData = result.rows.slice(0, MAX_RETRIEVED_RECORDS);
            return { success: true, data: limitedData, error: null };

        } catch (error) {
            console.error('[RAG v1.4] Exception during data retrieval:', error);
            return { success: false, data: null, error: `Database execution failed: ${error.message}` };
        }
    }

    formatData(retrievedData) {
        if (!retrievedData || retrievedData.length === 0) {
            return "Tidak ada data relevan yang ditemukan di database untuk pertanyaan ini.";
        }

        console.log('[RAG v1.4] Step 5: Formatting data for LLM...');
        try {
            let jsonDataString = JSON.stringify(retrievedData, null, 2);
            return jsonDataString;
        } catch (error) {
            console.error('[RAG v1.4] Error formatting data:', error);
            return "Terjadi kesalahan internal saat memformat data yang diambil.";
        }
    }
}

export const sqlExecutionService = new SqlExecutionService();
