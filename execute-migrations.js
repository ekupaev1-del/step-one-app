/**
 * Execute Migrations via Supabase Management API
 * 
 * This script executes SQL migrations directly via Supabase REST API
 * 
 * Usage:
 *   node execute-migrations.js
 * 
 * Requires:
 *   - NEXT_PUBLIC_SUPABASE_URL (e.g., https://xxxxx.supabase.co)
 *   - SUPABASE_SERVICE_ROLE_KEY
 */

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
function readMigrationFile(filename) {
  const migrationPath = path.join(__dirname, "migrations", filename);
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }
  return fs.readFileSync(migrationPath, "utf-8");
}

/**
 * Execute SQL via Supabase REST API (PostgREST)
 * Note: PostgREST doesn't support DDL, so we use the SQL Editor API endpoint
 */
async function executeSQL(sql) {
  // Extract project ref from URL
  const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  if (!projectRef) {
    throw new Error("Invalid Supabase URL format");
  }

  // Use Supabase Management API to execute SQL
  // This requires the project API key
  const managementUrl = `https://api.supabase.com/v1/projects/${projectRef}/sql`;
  
  try {
    const response = await fetch(managementUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: sql,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    return await response.json();
  } catch (error) {
    // If Management API doesn't work, try direct PostgREST
    // But PostgREST doesn't support DDL, so we'll output SQL for manual execution
    throw error;
  }
}

/**
 * Main function
 */
async function main() {
  console.log("🚀 Starting database migrations execution...\n");
  console.log(`📡 Supabase URL: ${SUPABASE_URL}\n`);

  // Read combined migration file
  const migrationFile = "run-all-migrations.sql";
  
  try {
    console.log(`📄 Reading migration file: ${migrationFile}`);
    const sql = readMigrationFile(migrationFile);
    console.log(`✅ Migration file loaded (${sql.length} characters)\n`);

    console.log("⚠️  Note: Supabase JS client and PostgREST cannot execute DDL statements directly.");
    console.log("    DDL (CREATE TABLE, ALTER TABLE) must be executed via SQL Editor.\n");
    
    console.log("📋 Please execute this SQL in Supabase SQL Editor:\n");
    console.log("=".repeat(80));
    console.log(sql);
    console.log("=".repeat(80));
    console.log("\n");

    // Try to verify connection
    try {
      const { createClient } = require("@supabase/supabase-js");
      const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
      
      const { data, error } = await supabase.from("users").select("id").limit(1);
      if (error) {
        console.error(`❌ Database connection error:`, error.message);
      } else {
        console.log(`✅ Database connection verified`);
        console.log(`   Users table accessible\n`);
      }
    } catch (e) {
      console.warn(`⚠️  Could not verify connection:`, e.message);
    }

    console.log("📝 Next steps:");
    console.log("   1. Open Supabase Dashboard → SQL Editor");
    console.log("   2. Copy the SQL above");
    console.log("   3. Paste into SQL Editor");
    console.log("   4. Click 'Run' to execute");
    console.log("   5. Wait 1-2 minutes for schema cache to refresh");
    console.log("   6. Verify tables created:\n");
    console.log("      SELECT table_name FROM information_schema.tables");
    console.log("      WHERE table_schema = 'public'");
    console.log("      AND table_name IN ('payments', 'subscriptions');\n");

  } catch (error) {
    console.error(`\n❌ Error:`, error.message);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("\n❌ Fatal error:", error);
  process.exit(1);
});
