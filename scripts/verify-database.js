// scripts/verify-database.js
// Verifies database schema and connection for tmachat application

import pg from 'pg';
const { Pool } = pg;

async function verifyDatabase() {
    console.log('🔍 Verifying tmachat database setup...\n');

    // Get connection string from environment or use default
    const connectionString = process.env.APP_DATABASE_URL ||
        "postgresql://postgres:root@localhost:5432/tmachat_app";

    const pool = new Pool({ connectionString });

    try {
        // Test connection
        console.log('1️⃣  Testing database connection...');
        const testResult = await pool.query('SELECT NOW()');
        console.log(`✅ Connected to database at ${testResult.rows[0].now}\n`);

        // Check for required tables
        console.log('2️⃣  Checking required tables...');
        const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name IN ('users', 'chats', 'messages', 'chat_groups')
      ORDER BY table_name
    `;
        const tablesResult = await pool.query(tablesQuery);

        const expectedTables = ['chats', 'chat_groups', 'messages', 'users'];
        const foundTables = tablesResult.rows.map(r => r.table_name);

        expectedTables.forEach(table => {
            if (foundTables.includes(table)) {
                console.log(`   ✅ ${table}`);
            } else {
                console.log(`   ❌ ${table} - MISSING!`);
            }
        });

        // Check for default user
        console.log('\n3️⃣  Checking default user...');
        const userQuery = `
      SELECT id, email, name, auth_type 
      FROM users 
      WHERE id = '00000000-0000-0000-0000-000000000001'
    `;
        const userResult = await pool.query(userQuery);

        if (userResult.rows.length > 0) {
            const user = userResult.rows[0];
            console.log(`   ✅ Default user found:`);
            console.log(`      - Email: ${user.email}`);
            console.log(`      - Name: ${user.name}`);
            console.log(`      - Auth Type: ${user.auth_type}`);
        } else {
            console.log('   ❌ Default user NOT found!');
        }

        // Check for default group
        console.log('\n4️⃣  Checking default group...');
        const groupQuery = `
      SELECT id, name, user_id 
      FROM chat_groups 
      WHERE id = '00000000-0000-0000-0000-000000000001'
    `;
        const groupResult = await pool.query(groupQuery);

        if (groupResult.rows.length > 0) {
            const group = groupResult.rows[0];
            console.log(`   ✅ Default group found:`);
            console.log(`      - Name: ${group.name}`);
            console.log(`      - User ID: ${group.user_id}`);
        } else {
            console.log('   ❌ Default group NOT found!');
        }

        // Check existing data
        console.log('\n5️⃣  Checking existing data...');
        const chatsCount = await pool.query('SELECT COUNT(*) FROM chats WHERE deleted_at IS NULL');
        const messagesCount = await pool.query('SELECT COUNT(*) FROM messages WHERE deleted_at IS NULL');

        console.log(`   📊 Active chats: ${chatsCount.rows[0].count}`);
        console.log(`   📊 Active messages: ${messagesCount.rows[0].count}`);

        // Check soft-deleted data
        const deletedChats = await pool.query('SELECT COUNT(*) FROM chats WHERE deleted_at IS NOT NULL');
        const deletedMessages = await pool.query('SELECT COUNT(*) FROM messages WHERE deleted_at IS NOT NULL');

        console.log(`   🗑️  Soft-deleted chats: ${deletedChats.rows[0].count}`);
        console.log(`   🗑️  Soft-deleted messages: ${deletedMessages.rows[0].count}`);

        // Check for important indexes
        console.log('\n6️⃣  Checking indexes...');
        const indexQuery = `
      SELECT 
        tablename,
        indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename IN ('users', 'chats', 'messages', 'chat_groups')
      ORDER BY tablename, indexname
    `;
        const indexResult = await pool.query(indexQuery);

        console.log(`   📑 Found ${indexResult.rows.length} indexes:`);
        let currentTable = '';
        indexResult.rows.forEach(row => {
            if (row.tablename !== currentTable) {
                console.log(`\n   ${row.tablename}:`);
                currentTable = row.tablename;
            }
            console.log(`      - ${row.indexname}`);
        });

        console.log('\n✅ Database verification complete!\n');

    } catch (error) {
        console.error('\n❌ Database verification failed:');
        console.error(error.message);
        console.error('\nPlease ensure:');
        console.error('1. PostgreSQL is running');
        console.error('2. Database "tmachat_app" exists');
        console.error('3. Schema has been created (run the SQL schema from user)');
        console.error('4. Environment variable APP_DATABASE_URL is set correctly\n');
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Run verification
verifyDatabase();
