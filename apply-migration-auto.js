/**
 * Auto-apply Migration Script
 * Attempts to apply migration via Supabase API
 * 
 * Note: Supabase JS client cannot execute DDL directly
 * This script will output SQL for manual execution
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  console.error("   Set them in .env.local or export in terminal");
  process.exit(1);
}

/**
 * Read migration file
 */
function readMigrationFile() {
  const migrationPath = path.join(__dirname, "migrations", "20241220_fix_payments_schema_complete.sql");
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }
  return fs.readFileSync(migrationPath, "utf-8");
}

/**
 * Execute SQL via Supabase RPC (if function exists)
 * Note: This won't work for DDL, but we'll try
 */
async function tryExecuteSQL(supabase, sql) {
  // Try to execute via RPC if exec_sql function exists
  try {
    const { data, error } = await supabase.rpc("exec_sql", { sql_query: sql });
    if (!error) {
      return { success: true, data };
    }
  } catch (e) {
    // RPC function doesn't exist, which is expected
  }
  
  return { success: false, reason: "DDL not supported via PostgREST" };
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Attempting to apply payments schema migration...\n");
  console.log(`📡 Supabase URL: ${SUPABASE_URL}\n`);

  try {
    // Read migration file
    console.log("📄 Reading migration file...");
    const sql = readMigrationFile();
    console.log(`✅ Migration file loaded (${sql.length} characters)\n`);

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify connection
    console.log("🔍 Verifying database connection...");
    const { data, error } = await supabase.from("users").select("id").limit(1);
    if (error) {
      console.error(`❌ Database connection error:`, error.message);
      process.exit(1);
    }
    console.log("✅ Database connection verified\n");

    // Try to execute migration
    console.log("⚠️  Attempting to execute migration via API...");
    console.log("   (Note: DDL operations may not be supported)\n");
    
    const result = await tryExecuteSQL(supabase, sql);
    
    if (result.success) {
      console.log("✅ Migration executed successfully via API!");
      console.log("   Reloading schema cache...\n");
      
      // Try to reload schema cache
      try {
        await supabase.rpc("pg_notify", { channel: "pgrst", payload: "reload schema" });
        console.log("✅ Schema cache reload requested");
      } catch (e) {
        console.log("⚠️  Could not reload schema cache via API");
        console.log("   Please run: SELECT pg_notify('pgrst', 'reload schema'); in SQL Editor");
      }
      
      return;
    }

    // If API execution failed, output SQL for manual execution
    console.log("⚠️  Cannot execute DDL via Supabase JS client");
    console.log("   Supabase PostgREST API does not support CREATE TABLE / ALTER TABLE\n");
    
    console.log("📋 Please execute this SQL manually in Supabase SQL Editor:\n");
    console.log("=".repeat(80));
    console.log(sql);
    console.log("=".repeat(80));
    console.log("\n");

    console.log("📝 Steps:");
    console.log("   1. Open https://app.supabase.com → Your Project → SQL Editor");
    console.log("   2. Copy the SQL above");
    console.log("   3. Paste into SQL Editor");
    console.log("   4. Click 'Run' or press Ctrl+Enter");
    console.log("   5. After success, run: SELECT pg_notify('pgrst', 'reload schema');");
    console.log("   6. Wait 10-30 seconds for cache to reload\n");

  } catch (error) {
    console.error(`\n❌ Error:`, error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
