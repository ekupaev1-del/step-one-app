/**
 * Apply Payments Table Schema Migration
 * 
 * This script attempts to apply the migration via Supabase Management API
 * Falls back to showing SQL for manual execution if API is not available
 * 
 * Usage:
 *   node apply-migration.js
 * 
 * Requires:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
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

/**
 * Read migration file
 */
function readMigrationFile() {
  const migrationPath = path.join(__dirname, "migrations", "fix_payments_table_schema.sql");
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }
  return fs.readFileSync(migrationPath, "utf-8");
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Applying payments table schema migration...\n");
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

    // Note: Supabase JS client cannot execute DDL statements
    console.log("⚠️  Note: Supabase JS client cannot execute DDL statements (CREATE TABLE, ALTER TABLE)");
    console.log("    DDL must be executed via SQL Editor or Supabase CLI.\n");
    
    console.log("📋 Please execute this SQL in Supabase SQL Editor:\n");
    console.log("=".repeat(80));
    console.log(sql);
    console.log("=".repeat(80));
    console.log("\n");

    console.log("📝 Steps to apply migration:");
    console.log("   1. Open Supabase Dashboard → SQL Editor");
    console.log("   2. Copy the SQL above");
    console.log("   3. Paste into SQL Editor");
    console.log("   4. Click 'Run' to execute");
    console.log("   5. Wait 1-2 minutes for schema cache to refresh");
    console.log("   6. Verify with:");
    console.log("\n      SELECT column_name, data_type, is_nullable");
    console.log("      FROM information_schema.columns");
    console.log("      WHERE table_name = 'payments'");
    console.log("      ORDER BY ordinal_position;\n");

  } catch (error) {
    console.error(`\n❌ Error:`, error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
