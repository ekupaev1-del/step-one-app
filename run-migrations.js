/**
 * Migration Runner Script
 * Executes database migrations via Supabase Management API
 * 
 * Usage: node run-migrations.js
 * 
 * Requires:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - MIGRATION_SECRET (optional, for API endpoint)
 */

const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Read migration file
 */
function readMigrationFile(filename) {
  const migrationPath = path.join(__dirname, "migrations", filename);
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }
  return fs.readFileSync(migrationPath, "utf-8");
}

/**
 * Execute SQL via Supabase PostgREST (limited to DML)
 * For DDL, we need to use Supabase SQL Editor or Management API
 */
async function executeMigration(filename) {
  console.log(`\n📄 Executing migration: ${filename}`);
  
  const sql = readMigrationFile(filename);
  
  // Note: Supabase JS client cannot execute DDL statements directly
  // We need to use the Management API or SQL Editor
  // This script will output the SQL for manual execution
  
  console.log(`\n⚠️  Supabase JS client cannot execute DDL statements directly.`);
  console.log(`\n📋 Please execute this SQL in Supabase SQL Editor:\n`);
  console.log("=" .repeat(80));
  console.log(sql);
  console.log("=" .repeat(80));
  
  // Try to execute simple queries to verify connection
  try {
    const { data, error } = await supabase.from("users").select("id").limit(1);
    if (error) {
      console.error(`\n❌ Database connection error:`, error.message);
    } else {
      console.log(`\n✅ Database connection verified`);
    }
  } catch (e) {
    console.error(`\n❌ Error:`, e.message);
  }
  
  return { success: true, requiresManualExecution: true };
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Starting database migrations...\n");
  
  const migrations = [
    "create_payments_table_v2.sql",
    "create_subscriptions_table_v2.sql",
  ];
  
  for (const migration of migrations) {
    try {
      await executeMigration(migration);
    } catch (error) {
      console.error(`\n❌ Failed to execute ${migration}:`, error.message);
      process.exit(1);
    }
  }
  
  console.log("\n✅ All migrations prepared. Please execute SQL in Supabase SQL Editor.");
  console.log("\n📝 Next steps:");
  console.log("   1. Open Supabase Dashboard → SQL Editor");
  console.log("   2. Copy and paste the SQL from above");
  console.log("   3. Click 'Run' to execute");
  console.log("   4. Wait 1-2 minutes for schema cache to refresh\n");
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
