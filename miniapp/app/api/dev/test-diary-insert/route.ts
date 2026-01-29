/**
 * DEV-ONLY: Test endpoint for simulating diary insert
 * GET /api/dev/test-diary-insert?telegram_user_id=123&text=test
 * 
 * This endpoint is for testing diary inserts in production.
 * Should be disabled or protected in production.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Only allow in non-production or with explicit debug flag
  const isDev = process.env.NODE_ENV !== "production";
  const debugEnabled = process.env.DEBUG_DIARY_TEST === "true";
  
  if (!isDev && !debugEnabled) {
    return NextResponse.json(
      { ok: false, error: "This endpoint is disabled in production" },
      { status: 403 }
    );
  }

  const requestId = `test-diary-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const url = new URL(req.url);
    const telegramUserId = url.searchParams.get("telegram_user_id");
    const text = url.searchParams.get("text") || "Тестовый приём пищи";

    if (!telegramUserId) {
      return NextResponse.json(
        { ok: false, error: "telegram_user_id parameter is required" },
        { status: 400 }
      );
    }

    const telegramUserIdNum = Number(telegramUserId);
    if (!Number.isFinite(telegramUserIdNum) || telegramUserIdNum <= 0) {
      return NextResponse.json(
        { ok: false, error: "telegram_user_id must be a positive number" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // Get user_id from users table
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("telegram_id", telegramUserIdNum)
      .maybeSingle();

    if (userError || !userData) {
      return NextResponse.json({
        ok: false,
        error: "User not found",
        requestId,
        debug: {
          telegram_user_id: telegramUserIdNum,
          userError: userError ? {
            code: userError.code,
            message: userError.message,
            details: userError.details,
            hint: userError.hint,
          } : null,
        },
      }, { status: 404 });
    }

    // Insert test diary entry (use 'api' source for test endpoint)
    const diaryEntry = {
      user_id: userData.id,
      telegram_user_id: telegramUserIdNum,
      meal_text: text,
      calories: 100,
      protein: 10,
      fat: 5,
      carbs: 10,
      source: 'api', // Use 'api' instead of 'test' to match CHECK constraint
      parsed_json: { test: true },
    };

    const { data: insertedData, error: insertError } = await supabase
      .from("diary")
      .insert(diaryEntry)
      .select("id, user_id, meal_text, created_at")
      .single();

    if (insertError) {
      // Log to app_errors
      await supabase.from("app_errors").insert({
        request_id: requestId,
        context: {
          telegram_user_id: telegramUserIdNum,
          user_id: userData.id,
          input_text: text,
          table_name: 'diary',
          operation: 'insert',
          supabase_error: {
            code: insertError.code || 'UNKNOWN',
            message: insertError.message || 'Unknown error',
            details: insertError.details || null,
            hint: insertError.hint || null,
          },
        },
      });

      return NextResponse.json({
        ok: false,
        error: "Insert failed",
        requestId,
        error_code: insertError.code || 'DB_ERROR',
        debug: {
          supabase_error: {
            code: insertError.code,
            message: insertError.message,
            details: insertError.details,
            hint: insertError.hint,
          },
          payload: diaryEntry,
        },
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      requestId,
      inserted: insertedData,
      message: "Test diary entry inserted successfully",
    });
  } catch (error: any) {
    console.error(`[test-diary-insert:${requestId}] Unexpected error:`, error);
    return NextResponse.json({
      ok: false,
      error: error?.message || "Internal server error",
      requestId,
    }, { status: 500 });
  }
}
