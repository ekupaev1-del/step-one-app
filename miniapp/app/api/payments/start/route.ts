/**
 * Payment Start Endpoint (Rebuilt)
 * POST /api/payments/start
 * 
 * Creates a payment record and returns Robokassa payment URL
 * 
 * Request body:
 * {
 *   planCode?: string,  // e.g. 'trial_3d_199'
 *   userId?: number,     // internal app user id (optional)
 *   telegramUserId: number  // REQUIRED: Telegram user ID from Telegram.WebApp.initDataUnsafe.user.id
 * }
 * 
 * Response:
 * {
 *   ok: true,
 *   paymentUrl: string,
 *   invId: string,
 *   debugId: string
 * }
 */

import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import { generateRobokassaUrl } from "../../../../lib/robokassa";

export const dynamic = "force-dynamic";

/**
 * Generate unique inv_id (number) for Robokassa
 * Format: timestamp_ms * 1000 + random(0-999)
 * This ensures uniqueness and fits within bigint range
 * Returns as number (JavaScript number can safely represent integers up to 2^53)
 */
function generateInvId(): number {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return timestamp * 1000 + random;
}

/**
 * Retry inv_id generation if conflict occurs
 */
async function generateUniqueInvId(
  supabase: any,
  maxRetries: number = 5
): Promise<number> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const invId = generateInvId();
    
    // Check if inv_id already exists
    const { data, error } = await supabase
      .from("payments")
      .select("inv_id")
      .eq("inv_id", invId)
      .limit(1);
    
    if (error) {
      // If error is not about missing column, throw
      if (!error.message.includes("Could not find") && !error.message.includes("schema cache")) {
        throw error;
      }
      // Schema cache issue - return generated ID anyway
      return invId;
    }
    
    if (!data || data.length === 0) {
      // inv_id is unique, return it
      return invId;
    }
    
    // Conflict - retry with new ID
    if (attempt < maxRetries - 1) {
      await new Promise(resolve => setTimeout(resolve, 10)); // Small delay
    }
  }
  
  // If all retries failed, throw error
  throw new Error(`Failed to generate unique inv_id after ${maxRetries} attempts`);
}

export async function POST(req: Request) {
  const requestId = Date.now().toString();
  const debugId = `pay-${requestId}`;
  const startTime = Date.now();
  
  try {
    // Parse request body
    let body: any;
    try {
      body = await req.json();
    } catch (parseError: any) {
      console.error(`[payments/start:${debugId}] PARSE_ERROR`, {
        error: parseError.message,
        requestId: debugId
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid JSON body",
          details: "Expected JSON",
          debugId
        },
        { status: 400 }
      );
    }
    
    // Log received request for debugging
    const receivedKeys = Object.keys(body);
    const safePreview = (obj: any) => {
      try {
        const preview: any = {};
        for (const key in obj) {
          if (typeof obj[key] === 'string' || typeof obj[key] === 'number') {
            preview[key] = String(obj[key]).substring(0, 20);
          } else {
            preview[key] = typeof obj[key];
          }
        }
        return preview;
      } catch {
        return { error: "Could not preview" };
      }
    };
    
    console.log(`[payments/start:${debugId}] REQUEST_RECEIVED`, {
      requestId: debugId,
      receivedKeys,
      receivedBodyPreview: safePreview(body),
      timestamp: new Date().toISOString()
    });
    
    // Extract telegram_user_id from ALL possible keys (REQUIRED)
    const telegramUserId = body.telegramUserId || 
                          body.telegram_user_id || 
                          body.tgUserId || 
                          body.tg_user_id ||
                          null;
    
    // Log what we found
    console.log(`[payments/start:${debugId}] TELEGRAM_USER_ID_EXTRACTION`, {
      requestId: debugId,
      telegramUserIdType: typeof telegramUserId,
      telegramUserIdValue: telegramUserId ? String(telegramUserId).slice(0, 6) + "..." : null,
      foundInKeys: receivedKeys.filter(k => k.toLowerCase().includes('telegram') || k.toLowerCase().includes('tg')),
      allKeys: receivedKeys
    });
    
    // Validate telegram_user_id BEFORE any DB operations
    if (!telegramUserId) {
      console.error(`[payments/start:${debugId}] VALIDATION_ERROR_MISSING_TELEGRAM_USER_ID`, {
        error: "telegramUserId is required",
        receivedKeys,
        receivedBodyPreview: safePreview(body),
        requestId: debugId
      });
      return NextResponse.json(
        {
          ok: false,
          error: "telegram_user_id_missing",
          details: "telegramUserId is required. Open inside Telegram or pass Telegram.WebApp.initDataUnsafe.user.id",
          debug: {
            requestId: debugId,
            receivedKeys,
            receivedBodyPreview: safePreview(body),
            suggestion: "Ensure you're opening the app inside Telegram bot, or explicitly pass telegramUserId in request body"
          },
          debugId
        },
        { status: 400 }
      );
    }
    
    // Normalize to number (safe conversion)
    let numericTelegramUserId: number;
    if (typeof telegramUserId === 'string') {
      numericTelegramUserId = parseInt(telegramUserId, 10);
    } else if (typeof telegramUserId === 'number') {
      numericTelegramUserId = telegramUserId;
    } else {
      console.error(`[payments/start:${debugId}] VALIDATION_ERROR_INVALID_TYPE`, {
        error: "Invalid telegramUserId type",
        received: telegramUserId,
        type: typeof telegramUserId
      });
      return NextResponse.json(
        {
          ok: false,
          error: "telegram_user_id_invalid_type",
          details: `telegramUserId must be a number or numeric string, got ${typeof telegramUserId}`,
          debug: {
            requestId: debugId,
            receivedValue: String(telegramUserId),
            receivedType: typeof telegramUserId
          },
          debugId
        },
        { status: 400 }
      );
    }
    
    // Validate it's a valid positive integer
    if (!Number.isFinite(numericTelegramUserId) || numericTelegramUserId <= 0 || !Number.isInteger(numericTelegramUserId)) {
      console.error(`[payments/start:${debugId}] VALIDATION_ERROR_INVALID_VALUE`, {
        error: "Invalid telegramUserId value",
        received: telegramUserId,
        parsed: numericTelegramUserId
      });
      return NextResponse.json(
        {
          ok: false,
          error: "telegram_user_id_invalid_value",
          details: `telegramUserId must be a positive integer, got: ${telegramUserId}`,
          debug: {
            requestId: debugId,
            receivedValue: String(telegramUserId),
            parsedValue: numericTelegramUserId
          },
          debugId
        },
        { status: 400 }
      );
    }
    
    console.log(`[payments/start:${debugId}] TELEGRAM_USER_ID_VALIDATED`, {
      requestId: debugId,
      telegramUserId: numericTelegramUserId,
      timestamp: new Date().toISOString()
    });
    
    // Extract optional fields
    const planCode = body.planCode || "trial_3d_199";
    const userId = body.userId ? Number(body.userId) : null;
    const amount = "1.00"; // 1 RUB for trial
    const isTest = process.env.ROBOKASSA_TEST_MODE === "true" || process.env.ROBOKASSA_TEST_MODE === "1";
    
    // Check for debug mode
    const url = new URL(req.url);
    const debugMode = url.searchParams.get("debug") === "1" || req.headers.get("x-debug") === "1" || process.env.NODE_ENV !== "production";
    
    console.log(`[payments/start:${debugId}] CREATE_PAYMENT_START`, {
      telegramUserId: numericTelegramUserId,
      userId,
      planCode,
      amount,
      isTest,
      requestId: debugId,
      timestamp: new Date().toISOString()
    });
    
    // Initialize Supabase client
    const supabase = createServerSupabaseClient();
    
    // Generate unique inv_id BEFORE insert
    let invId: number;
    try {
      invId = await generateUniqueInvId(supabase);
      console.log(`[payments/start:${debugId}] GENERATED_INV_ID`, {
        invId: invId,
        requestId: debugId
      });
    } catch (invIdError: any) {
      console.error(`[payments/start:${debugId}] INV_ID_GENERATION_ERROR`, {
        error: invIdError.message,
        requestId: debugId
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to generate invoice ID",
          details: invIdError.message,
          debugId
        },
        { status: 500 }
      );
    }
    
    // Generate Robokassa payment URL and signature
    const description = "Пробный период 3 дня";
    const result = generateRobokassaUrl(
      amount,
      invId.toString(),
      description,
      numericTelegramUserId.toString(),
      planCode,
      isTest,
      debugMode
    );
    
    const paymentUrl = typeof result === "string" ? result : result.paymentUrl;
    const debug = typeof result === "string" ? undefined : result.debug;
    
    if (!paymentUrl || typeof paymentUrl !== "string" || !paymentUrl.startsWith("https://")) {
      console.error(`[payments/start:${debugId}] URL_GENERATION_ERROR`, {
        error: "Invalid payment URL generated",
        urlType: typeof paymentUrl,
        urlPrefix: paymentUrl?.substring(0, 20)
      });
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to generate payment URL",
          details: "Generated URL is invalid",
          debugId
        },
        { status: 500 }
      );
    }
    
    // Insert payment record with ALL required fields
    const { data: paymentRecord, error: insertError } = await supabase
      .from("payments")
      .insert({
        telegram_user_id: numericTelegramUserId,
        user_id: userId,
        plan_code: planCode,
        amount: parseFloat(amount),
        currency: "RUB",
        inv_id: invId, // number, not string
        description: description,
        status: "created",
        payment_url: paymentUrl,
        provider: "robokassa",
        provider_payload: debug ? { signature: debug.signatureValue?.substring(0, 6) + "..." } : {}
      })
      .select("id, inv_id, telegram_user_id, created_at")
      .single();
    
    if (insertError || !paymentRecord) {
      const errorDetails = insertError?.message || "No payment record returned";
      
      // Extract failing column name from error if possible
      const columnMatch = errorDetails.match(/column "(\w+)" of relation "payments"/);
      const failingColumn = columnMatch ? columnMatch[1] : null;
      
      console.error(`[payments/start:${debugId}] CREATE_PAYMENT_ERROR`, {
        errorMessage: "Failed to create payment record",
        error: errorDetails,
        failingColumn,
        insertPayload: {
          telegram_user_id: numericTelegramUserId,
          user_id: userId,
          plan_code: planCode,
          amount: parseFloat(amount),
          currency: "RUB",
          inv_id: invId.toString(),
          description: description,
          status: "created",
          payment_url: paymentUrl.substring(0, 50) + "...",
          provider: "robokassa"
        },
        requestId: debugId,
        timestamp: new Date().toISOString()
      });
      
      return NextResponse.json(
        {
          ok: false,
          error: "Failed to create payment record",
          details: errorDetails,
          failingColumn,
          hint: failingColumn 
            ? `Column '${failingColumn}' is missing or has wrong type. Run migration rebuild_payments_table.sql in Supabase SQL Editor.`
            : "Check database migration and ensure all columns exist.",
          debugId,
          debug: debugMode ? {
            requestId: debugId,
            timestamp: new Date().toISOString(),
            environment: {
              nodeEnv: process.env.NODE_ENV || "unknown",
              vercelEnv: process.env.VERCEL_ENV || "unknown"
            },
            dbError: insertError ? {
              message: insertError.message,
              code: insertError.code,
              details: insertError.details,
              hint: insertError.hint
            } : null
          } : undefined
        },
        { status: 500 }
      );
    }
    
    const elapsed = Date.now() - startTime;
    
    console.log(`[payments/start:${debugId}] CREATE_PAYMENT_OK`, {
      paymentId: paymentRecord.id,
      invId: invId.toString(),
      telegramUserId: numericTelegramUserId,
      userId,
      planCode,
      amount,
      paymentUrlLength: paymentUrl.length,
      elapsed,
      requestId: debugId,
      timestamp: new Date().toISOString()
    });
    
    // Return success response
    return NextResponse.json({
      ok: true,
      paymentUrl,
      invId: invId.toString(),
      debugId,
      debug: debugMode ? {
        requestId: debugId,
        paymentId: paymentRecord.id,
        invId: invId.toString(),
        telegramUserId: numericTelegramUserId,
        planCode,
        amount,
        signature: debug?.signatureValue?.substring(0, 6) + "...",
        timestamp: new Date().toISOString()
      } : undefined
    });
    
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[payments/start:${debugId}] UNEXPECTED_ERROR`, {
      error: error.message,
      stack: error.stack,
      elapsed,
      requestId: debugId,
      timestamp: new Date().toISOString()
    });
    
    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
        details: error.message,
        debugId
      },
      { status: 500 }
    );
  }
}
