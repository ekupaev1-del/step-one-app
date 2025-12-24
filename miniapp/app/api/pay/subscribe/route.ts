import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";
import crypto from "crypto";

// Subscription price: 199 RUB
const SUBSCRIPTION_AMOUNT = 199.0;

function md5(input: string): string {
  return crypto.createHash("md5").update(input).digest("hex");
}

/**
 * Subscription payment endpoint with Recurring=true
 * 
 * Creates payment form for first subscription payment with card binding
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

    // Generate unique InvId: Math.floor(Date.now() / 1000) - seconds timestamp
    let InvId: string;
    let attempts = 0;
    const maxAttempts = 10;
    
    do {
      InvId = Math.floor(Date.now() / 1000).toString();
      
      // Validate InvId: must contain ONLY digits
      if (!InvId || !/^\d+$/.test(InvId)) {
        throw new Error(`InvId must be numeric and defined. Got: ${InvId}`);
      }
      
      // Check if InvId already exists in database
      const { data: existingPayment } = await supabase
        .from("payments")
        .select("id")
        .eq("invoice_id", InvId)
        .maybeSingle();
      
      if (!existingPayment) {
        // InvId is unique, can use it
        break;
      }
      
      attempts++;
      console.warn(`[pay/subscribe] InvId ${InvId} already exists, generating new one (attempt ${attempts}/${maxAttempts})`);
      
      // Small delay before next attempt
      await new Promise(resolve => setTimeout(resolve, 100));
    } while (attempts < maxAttempts);
    
    if (attempts >= maxAttempts) {
      throw new Error(`Failed to generate unique InvId after ${maxAttempts} attempts`);
    }
    
    console.log("[pay/subscribe] Generated unique InvId:", InvId);

    // OutSum must be string with 2 decimal places: "199.00"
    const amountStr = SUBSCRIPTION_AMOUNT.toFixed(2); // "199.00"
    
    if (amountStr !== "199.00") {
      throw new Error(`Invalid OutSum: expected "199.00", got "${amountStr}"`);
    }

    // Signature formula: MerchantLogin:OutSum:InvId:Password1
    // Description and Recurring are NOT included in signature
    const signatureBase = `${merchantLogin}:${amountStr}:${InvId}:${password1}`;
    const signatureValue = md5(signatureBase).toLowerCase();
    
    // Validate signature
    if (!signatureValue || signatureValue.length !== 32) {
      throw new Error(`Invalid signature generated: ${signatureValue}`);
    }

    console.log("[pay/subscribe] ========== SIGNATURE DEBUG ==========");
    console.log("[pay/subscribe] Signature base (WITHOUT password):", `${merchantLogin}:${amountStr}:${InvId}:[PASSWORD_HIDDEN]`);
    console.log("[pay/subscribe] Signature value (md5):", signatureValue);
    console.log("[pay/subscribe] Signature formula: MerchantLogin:OutSum:InvId:Password1");
    console.log("[pay/subscribe] NOTE: Description and Recurring are NOT in signature");
    console.log("[pay/subscribe] ======================================");

    // Robokassa payment URL
    const robokassaDomain = process.env.ROBOKASSA_DOMAIN || "auth.robokassa.ru";
    const robokassaActionUrl = `https://${robokassaDomain}/Merchant/Index.aspx`;
    
    // Build form data with required fields for subscription
    // Description and Recurring are included in POST but NOT in signature
    const formData: Record<string, string> = {
      MerchantLogin: merchantLogin,
      OutSum: amountStr, // "199.00" (string with 2 decimal places)
      InvId: InvId, // Seconds timestamp
      Description: "Подписка Step One — 1 месяц",
      Recurring: "true", // Card binding for recurring payments
      SignatureValue: signatureValue,
    };
    
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
          is_recurring: true, // First payment with Recurring=true (card binding)
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
