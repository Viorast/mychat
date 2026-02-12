import pg from 'pg';
const { Client } = pg;

const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:root@localhost:5432/tmachat_local'
});

async function checkSchema() {
    try {
        await client.connect();
        console.log("Connected to database.");

        // Check log_absen
        console.log("\n--- log_absen Columns (Direct Query) ---");
        try {
            const res1 = await client.query(`SELECT * FROM "SDA"."log_absen" LIMIT 1`);
            console.log("Columns:", res1.fields.map(f => f.name).join(", "));
            console.log("Sample Row:", res1.rows[0]);
        } catch (e) {
            console.log("Error querying log_absen:", e.message);
        }

        // Check m_ticket
        console.log("\n--- m_ticket Columns (Direct Query) ---");
        try {
            const res2 = await client.query(`SELECT * FROM "SDA"."m_ticket" LIMIT 1`);
            console.log("Columns:", res2.fields.map(f => f.name).join(", "));
            console.log("Sample Row:", res2.rows[0]);
        } catch (e) {
            console.log("Error querying m_ticket:", e.message);
        }

    } catch (err) {
        console.error("Connection Error:", err);
    } finally {
        await client.end();
    }
}

checkSchema();
