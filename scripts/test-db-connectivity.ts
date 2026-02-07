/**
 * Test script to verify database connectivity and basic operations
 * Run with: npx tsx scripts/test-db-connectivity.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, "../.env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("❌ Missing environment variables:");
  console.error("   SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL:", !!supabaseUrl);
  console.error("   SUPABASE_SERVICE_ROLE_KEY:", !!supabaseServiceKey);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function testDatabase() {
  console.log("🧪 Testing database connectivity...\n");

  // Test 1: Select from users
  console.log("Test 1: SELECT from users table");
  const { data: users, error: usersError } = await supabase
    .from("users")
    .select("id, telegram_id")
    .limit(1);

  if (usersError) {
    console.error("❌ Failed:", {
      code: usersError.code,
      message: usersError.message,
      details: usersError.details,
      hint: usersError.hint,
    });
    return false;
  }
  console.log("✅ Success:", `Found ${users?.length || 0} users\n`);

  // Test 2: Insert test user (if doesn't exist)
  console.log("Test 2: INSERT into users table");
  const testTelegramId = 999999999;
  const { data: testUser, error: insertError } = await supabase
    .from("users")
    .upsert({ telegram_id: testTelegramId }, { onConflict: "telegram_id" })
    .select("id")
    .single();

  if (insertError) {
    console.error("❌ Failed:", {
      code: insertError.code,
      message: insertError.message,
      details: insertError.details,
      hint: insertError.hint,
    });
    return false;
  }
  console.log("✅ Success:", `Created/updated user with id: ${testUser?.id}\n`);

  // Test 3: Insert into diary
  if (testUser?.id) {
    console.log("Test 3: INSERT into diary table");
    const { data: diaryEntry, error: diaryError } = await supabase
      .from("diary")
      .insert({
        user_id: testUser.id,
        telegram_user_id: testTelegramId,
        meal_text: "Test meal - 2 boiled eggs",
        calories: 140,
        protein: 12,
        fat: 10,
        carbs: 1,
        source: "text",
        channel: "api",
      })
      .select("id")
      .single();

    if (diaryError) {
      console.error("❌ Failed:", {
        code: diaryError.code,
        message: diaryError.message,
        details: diaryError.details,
        hint: diaryError.hint,
        constraint: (diaryError as any).constraint,
        table: (diaryError as any).table,
        column: (diaryError as any).column,
      });
      return false;
    }
    console.log("✅ Success:", `Created diary entry with id: ${diaryEntry?.id}\n`);

    // Cleanup: Delete test diary entry
    if (diaryEntry?.id) {
      await supabase.from("diary").delete().eq("id", diaryEntry.id);
      console.log("🧹 Cleaned up test diary entry\n");
    }
  }

  // Test 4: Cleanup test user
  if (testUser?.id) {
    console.log("Test 4: DELETE test user");
    const { error: deleteError } = await supabase
      .from("users")
      .delete()
      .eq("id", testUser.id);

    if (deleteError) {
      console.error("⚠️  Cleanup warning:", deleteError.message);
    } else {
      console.log("✅ Cleaned up test user\n");
    }
  }

  console.log("✅ All tests passed! Database is working correctly.");
  return true;
}

testDatabase()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("❌ Unexpected error:", error);
    process.exit(1);
  });
