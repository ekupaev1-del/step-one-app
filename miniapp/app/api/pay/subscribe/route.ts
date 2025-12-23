import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import crypto from "crypto";

// Subscription price: 199 RUB
const SUBSCRIPTION_AMOUNT = 199.0;

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

/**
 * Clean production-ready subscription payment endpoint
 * 
 * STRICT RULES:
 * 1. One initial payment: 199 RUB
 * 2. Recurring=true on FIRST payment (card binding)
 * 3. Signature: MerchantLogin:OutSum:InvId:Password1 (NO Receipt, NO Shp_*, NO Recurring)
 * 4. InvId: Math.floor(Date.now() / 1000) - seconds timestamp, digits only
 */
export async function POST(req: Request) {
  try {
    console.log("[pay/subscribe] ========== SUBSCRIPTION PAYMENT ==========");
    console.log("[pay/subscribe] Request received at:", new Date().toISOString());
    
    const supabase = createServerSupabaseClient();
    const body = await req.json();
    const { userId } = body;

    console.log("[pay/subscribe] Request body:", { userId });

    // Validate userId
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "userId обязателен" },
        { status: 400 }
      );
    }

    const numericUserId = typeof userId === "string" ? Number(userId) : userId;
    
    if (!Number.isFinite(numericUserId) || numericUserId <= 0) {
      return NextResponse.json(
        { ok: false, error: "userId должен быть положительным числом" },
        { status: 400 }
      );
    }

    // Check environment variables
    const merchantLogin = process.env.ROBOKASSA_MERCHANT_LOGIN;
    const password1 = process.env.ROBOKASSA_PASSWORD1;

    if (!merchantLogin || !password1) {
      return NextResponse.json(
        { 
          ok: false, 
          error: "ROBOKASSA_MERCHANT_LOGIN или ROBOKASSA_PASSWORD1 не заданы" 
        },
        { status: 500 }
      );
    }

    console.log("[pay/subscribe] MerchantLogin:", merchantLogin);
    console.log("[pay/subscribe] UserId:", numericUserId);
    console.log("[pay/subscribe] Amount:", SUBSCRIPTION_AMOUNT, "RUB");

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("id", numericUserId)
      .maybeSingle();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "Пользователь не найден" },
        { status: 404 }
      );
    }

    // Generate InvId: Math.floor(Date.now() / 1000) - seconds timestamp
    const InvId = Math.floor(Date.now() / 1000).toString();
    
    // Validate InvId: must contain ONLY digits
    if (!InvId || !/^\d+$/.test(InvId)) {
      throw new Error(`InvId must be numeric and defined. Got: ${InvId}`);
    }
    
    console.log("[pay/subscribe] Generated InvId:", InvId);
    console.log("[pay/subscribe] InvId type:", typeof InvId);
    console.log("[pay/subscribe] InvId is numeric:", /^\d+$/.test(InvId));

    const amountStr = SUBSCRIPTION_AMOUNT.toFixed(2); // "199.00"

    // Validate OutSum
    if (amountStr !== "199.00") {
      throw new Error(`Invalid OutSum: expected "199.00", got "${amountStr}"`);
    }

    // CRITICAL: Signature formula EXACTLY as Robokassa expects:
    // MerchantLogin:OutSum:InvId:Password1
    // NOTHING else included (no Recurring, no Receipt, no Shp_*)
    const signatureBase = `${merchantLogin}:${amountStr}:${InvId}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();
    
    // Validate signature
    if (!signatureValue || signatureValue.length !== 32) {
      throw new Error(`Invalid signature generated: ${signatureValue}`);
    }

    // DEBUG: Log signature details
    const signatureBaseForLog = `${merchantLogin}:${amountStr}:${InvId}:[PASSWORD_HIDDEN]`;
    
    console.log("[pay/subscribe] ========== SIGNATURE DEBUG ==========");
    console.log("[pay/subscribe] Signature base (BEFORE md5, WITHOUT password):", signatureBaseForLog);
    console.log("[pay/subscribe] Signature base (FULL):", signatureBase);
    console.log("[pay/subscribe] Signature value (md5):", signatureValue);
    console.log("[pay/subscribe] Signature formula: MerchantLogin:OutSum:InvId:Password1");
    console.log("[pay/subscribe] ======================================");

    // Robokassa payment URL
    const robokassaDomain = process.env.ROBOKASSA_DOMAIN || "auth.robokassa.ru";
    const robokassaActionUrl = `https://${robokassaDomain}/Merchant/Index.aspx`;
    
    // Build form data
    // IMPORTANT: Recurring=true is included in POST, but NOT in signature
    const formData: Record<string, string> = {
      MerchantLogin: merchantLogin,
      OutSum: amountStr, // "199.00"
      InvId: InvId, // Seconds timestamp
      Description: "Подписка Step One — 1 месяц",
      Recurring: "true", // Card binding on first payment
      SignatureValue: signatureValue,
    };
    
    // NOTE: Receipt is NOT included initially (can cause errors)
    // If needed later, add Receipt to POST but NOT to signature
    
    // NOTE: Shp_userId is NOT included (not in signature formula)
    // If needed, add to POST but NOT to signature
    
    // Validate all required fields
    const requiredFields = ["MerchantLogin", "OutSum", "InvId", "Description", "Recurring", "SignatureValue"];
    const missingFields = requiredFields.filter(field => !formData[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }
    
    // Validate InvId format
    if (!/^\d+$/.test(formData.InvId)) {
      throw new Error(`Invalid InvId format: ${formData.InvId}. Must contain only digits.`);
    }
    
    console.log("[pay/subscribe] ✅ All required fields present");
    
    // DEV console.log BEFORE submit
    console.log("[pay/subscribe] ========== DEV DEBUG BEFORE SUBMIT ==========");
    console.log("[pay/subscribe] InvId:", InvId);
    console.log("[pay/subscribe] OutSum:", amountStr);
    console.log("[pay/subscribe] SignatureValue:", signatureValue);
    console.log("[pay/subscribe] Recurring:", formData.Recurring);
    console.log("[pay/subscribe] =============================================");

    // Save payment to DB for tracking
    try {
      const { error: paymentInsertError } = await supabase
        .from("payments")
        .insert({
          user_id: numericUserId,
          invoice_id: InvId,
          previous_invoice_id: null, // First payment (parent)
          amount: SUBSCRIPTION_AMOUNT,
          status: "pending",
          is_recurring: true, // First payment with Recurring=true
        });
      
      if (paymentInsertError) {
        console.warn("[pay/subscribe] Warning: Failed to save payment to DB:", paymentInsertError.message);
      } else {
        console.log("[pay/subscribe] ✅ Payment saved to DB, invoice_id:", InvId);
      }
    } catch (paymentErr: any) {
      console.warn("[pay/subscribe] Warning: DB error (ignored):", paymentErr.message);
    }

    // Return payment form data
    const response = {
      ok: true, 
      actionUrl: robokassaActionUrl,
      formData: formData,
      InvId: InvId,
      amount: SUBSCRIPTION_AMOUNT,
      method: "POST",
      // DEBUG: Add signature info for dev mode
      debugSignature: process.env.NODE_ENV !== "production" || process.env.DEBUG_ROBOKASSA === "true" ? {
        base: signatureBaseForLog,
        md5: signatureValue,
        fullBase: signatureBase,
      } : undefined,
    };
    
    console.log("[pay/subscribe] ✅ Returning response:", {
      ok: response.ok,
      hasActionUrl: !!response.actionUrl,
      hasFormData: !!response.formData,
      formDataKeys: Object.keys(response.formData),
      InvId: response.InvId,
    });
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[pay/subscribe] error", error);
    console.error("[pay/subscribe] error stack", error.stack);
    console.error("[pay/subscribe] error details:", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint,
    });
    
    return NextResponse.json(
      { 
        ok: false, 
        error: error.message || "Internal error",
        details: process.env.NODE_ENV === "development" ? {
          message: error?.message,
          code: error?.code,
          details: error?.details,
          hint: error?.hint,
        } : undefined,
      },
      { status: 500 }
    );
  }
}
