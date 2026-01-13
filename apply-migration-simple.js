/**
 * Simple Migration Script
 * Outputs SQL for manual execution in Supabase SQL Editor
 */

const fs = require("fs");
const path = require("path");

function main() {
  console.log("🚀 Payments Table Schema Migration\n");
  
  try {
    const migrationPath = path.join(__dirname, "migrations", "fix_payments_table_schema.sql");
    
    if (!fs.existsSync(migrationPath)) {
      console.error(`❌ Migration file not found: ${migrationPath}`);
      process.exit(1);
    }
    
    const sql = fs.readFileSync(migrationPath, "utf-8");
    
    console.log("📋 Copy this SQL and execute in Supabase SQL Editor:\n");
    console.log("=".repeat(80));
    console.log(sql);
    console.log("=".repeat(80));
    console.log("\n");
    console.log("📝 Steps:");
    console.log("   1. Open https://app.supabase.com → Your Project → SQL Editor");
    console.log("   2. Paste the SQL above");
    console.log("   3. Click 'Run' or press Ctrl+Enter");
    console.log("   4. Wait for success message");
    console.log("   5. Wait 1-2 minutes for schema cache to refresh\n");
    
  } catch (error) {
    console.error(`❌ Error:`, error.message);
    process.exit(1);
  }
}

main();
