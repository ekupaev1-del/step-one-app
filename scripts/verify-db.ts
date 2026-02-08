#!/usr/bin/env tsx
/**
 * Database verification script
 * Checks that required tables and columns exist
 * Prints exact SQL to fix if mismatches found
 */

import { createClient } from "@supabase/supabase-js";
import { getSupabaseContext, logSupabaseContext } from "../lib/debugSupabaseContext";

const REQUIRED_TABLES = [
  {
    name: 'users',
    requiredColumns: ['id', 'telegram_id', 'calories', 'goal', 'activity', 'protein', 'fat', 'carbs', 'water_goal_ml'],
  },
  {
    name: 'reminders',
    requiredColumns: ['id', 'user_id', 'type', 'time'],
  },
  {
    name: 'app_logs',
    requiredColumns: ['id', 'level', 'source', 'request_id', 'user_id', 'telegram_user_id', 'chat_id'],
  },
  {
    name: 'diary',
    requiredColumns: ['id', 'user_id', 'source', 'meal_text', 'created_at'],
  },
  {
    name: 'water_logs',
    requiredColumns: ['id', 'user_id', 'amount_ml', 'created_at'],
  },
];

async function verifyDatabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error('❌ Missing environment variables:');
    if (!url) console.error('   - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL');
    if (!key) console.error('   - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // Log context
  const context = getSupabaseContext(url, key, REQUIRED_TABLES.map(t => t.name));
  console.log('\n=== Database Verification ===\n');
  logSupabaseContext(context);
  console.log('');

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Get database fingerprint
  try {
    const { data: dbInfo, error: dbError } = await supabase.rpc('exec_sql', {
      sql_text: "SELECT current_database() as database, current_schema() as schema",
    });

    if (!dbError && dbInfo) {
      console.log('✅ Database connection successful');
      if (typeof dbInfo === 'object' && !Array.isArray(dbInfo)) {
        console.log(`   Database: ${(dbInfo as any).database || 'unknown'}`);
        console.log(`   Schema: ${(dbInfo as any).schema || 'unknown'}`);
      }
    } else {
      console.log('⚠️  Could not get database info (exec_sql may not be available)');
    }
  } catch (err) {
    console.log('⚠️  exec_sql function not available (run migration 0007)');
  }

  console.log(`\n📋 Checking ${REQUIRED_TABLES.length} tables...\n`);

  const issues: string[] = [];
  const fixes: string[] = [];

  for (const tableSpec of REQUIRED_TABLES) {
    console.log(`Checking table: ${tableSpec.name}`);
    
    // Check if table exists
    const { data, error } = await supabase
      .from(tableSpec.name)
      .select('*')
      .limit(0);

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.log(`  ❌ Table does not exist`);
        issues.push(`Table '${tableSpec.name}' does not exist`);
        fixes.push(`-- Create table ${tableSpec.name}\n-- Run migration 0001_init.sql or 0003_restore_complete_schema.sql`);
      } else if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        console.log(`  ⚠️  Table exists but PostgREST cache is stale`);
        issues.push(`Table '${tableSpec.name}' exists but schema cache needs reload`);
        fixes.push(`SELECT pg_notify('pgrst', 'reload schema');`);
      } else {
        console.log(`  ❌ Error: ${error.message}`);
        issues.push(`Table '${tableSpec.name}': ${error.message}`);
      }
      console.log('');
      continue;
    }

    console.log(`  ✅ Table exists`);

    // Check columns using RPC if available
    let existingColumns: string[] = [];
    try {
      const { data: colsData, error: colsError } = await supabase.rpc('get_table_columns', {
        table_name_param: tableSpec.name,
      });

      if (!colsError && colsData && Array.isArray(colsData)) {
        existingColumns = colsData.map((row: any) => String(row.column_name || '').toLowerCase());
      }
    } catch {
      // RPC not available, will check via SELECT
    }

    // Check each required column
    const missingColumns: string[] = [];
    for (const col of tableSpec.requiredColumns) {
      if (existingColumns.length > 0) {
        // Use RPC result
        if (!existingColumns.includes(col.toLowerCase())) {
          missingColumns.push(col);
        }
      } else {
        // Fallback: try SELECT
        const { error: colError } = await supabase
          .from(tableSpec.name)
          .select(col)
          .limit(0);

        if (colError && (colError.code === '42703' || colError.message?.includes('column'))) {
          missingColumns.push(col);
        }
      }
    }

    if (missingColumns.length > 0) {
      console.log(`  ❌ Missing columns: ${missingColumns.join(', ')}`);
      issues.push(`Table '${tableSpec.name}' missing columns: ${missingColumns.join(', ')}`);
      
      // Generate fix SQL
      fixes.push(`-- Add missing columns to ${tableSpec.name}`);
      for (const col of missingColumns) {
        if (tableSpec.name === 'users') {
          if (col === 'calories') {
            fixes.push(`ALTER TABLE users ADD COLUMN IF NOT EXISTS calories INTEGER NOT NULL DEFAULT 0 CHECK (calories >= 0);`);
          } else if (col === 'goal') {
            fixes.push(`ALTER TABLE users ADD COLUMN IF NOT EXISTS goal TEXT CHECK (goal IN ('lose', 'maintain', 'gain'));`);
          } else if (col === 'protein') {
            fixes.push(`ALTER TABLE users ADD COLUMN IF NOT EXISTS protein NUMERIC(6, 2) DEFAULT 0 CHECK (protein >= 0);`);
          } else if (col === 'fat') {
            fixes.push(`ALTER TABLE users ADD COLUMN IF NOT EXISTS fat NUMERIC(6, 2) DEFAULT 0 CHECK (fat >= 0);`);
          } else if (col === 'carbs') {
            fixes.push(`ALTER TABLE users ADD COLUMN IF NOT EXISTS carbs NUMERIC(6, 2) DEFAULT 0 CHECK (carbs >= 0);`);
          } else if (col === 'water_goal_ml') {
            fixes.push(`ALTER TABLE users ADD COLUMN IF NOT EXISTS water_goal_ml INTEGER CHECK (water_goal_ml > 0 AND water_goal_ml < 10000);`);
          } else if (col === 'activity') {
            fixes.push(`ALTER TABLE users ADD COLUMN IF NOT EXISTS activity TEXT CHECK (activity IN ('sedentary', 'light', 'moderate', 'active', 'very_active'));`);
          }
        } else if (tableSpec.name === 'water_logs' && col === 'created_at') {
          fixes.push(`ALTER TABLE water_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();`);
        }
      }
      fixes.push('');
    } else {
      console.log(`  ✅ All required columns exist`);
    }
    console.log('');
  }

  // Summary
  console.log('=== Summary ===\n');
  if (issues.length === 0) {
    console.log('✅ All checks passed! Database schema is correct.\n');
  } else {
    console.log(`❌ Found ${issues.length} issue(s):\n`);
    issues.forEach((issue, idx) => {
      console.log(`  ${idx + 1}. ${issue}`);
    });
    console.log('\n=== SQL to Fix ===\n');
    console.log(fixes.join('\n'));
    console.log('\n=== Reload Schema Cache ===\n');
    console.log("SELECT pg_notify('pgrst', 'reload schema');\n");
  }
}

verifyDatabase().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
