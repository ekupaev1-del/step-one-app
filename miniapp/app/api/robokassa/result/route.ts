import { NextResponse } from "next/server";
import crypto from "crypto";
import { createServerSupabaseClient } from "../../../../lib/supabaseAdmin";

function md5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

async function parseParams(req: Request) {
  const urlParams = new URL(req.url).searchParams;
  if (req.method === "POST") {
    const text = await req.text();
    const formParams = new URLSearchParams(text);
    formParams.forEach((value, key) => urlParams.set(key, value));
  }
  return urlParams;
}

export async function POST(req: Request) {
  return handle(req);
}

export async function GET(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  try {
    const password2 = process.env.ROBOKASSA_PASSWORD2;
    if (!password2) {
      console.error("[robokassa/result] ROBOKASSA_PASSWORD2 не задан");
      return NextResponse.json(
        { ok: false, error: "ROBOKASSA_PASSWORD2 не задан" },
        { status: 500 }
      );
    }

    const params = await parseParams(req);
    const outSum = params.get("OutSum");
    const invId = params.get("InvId");
    const signature = params.get("SignatureValue");
    const shpUserId = params.get("Shp_userId");

    console.log("[robokassa/result] ========== PAYMENT RESULT ==========");
    console.log("[robokassa/result] OutSum:", outSum);
    console.log("[robokassa/result] InvId:", invId);
    console.log("[robokassa/result] Shp_userId:", shpUserId);
    console.log("[robokassa/result] All params:", Object.fromEntries(params.entries()));

    if (!outSum || !invId || !signature) {
      return NextResponse.json(
        { ok: false, error: "Не хватает параметров OutSum/InvId/SignatureValue" },
        { status: 400 }
      );
    }

    // Проверка подписи: OutSum:InvId:Password2[:Shp_параметры]
    let signatureBase = `${outSum}:${invId}:${password2}`;
    if (shpUserId) {
      signatureBase += `:Shp_userId=${shpUserId}`;
    }
    
    const computed = md5(signatureBase).toLowerCase();
    console.log("[robokassa/result] Signature base:", signatureBase);
    console.log("[robokassa/result] Computed signature:", computed);
    console.log("[robokassa/result] Received signature:", signature);
    
    if (computed !== signature.toLowerCase()) {
      console.error("[robokassa/result] ❌ Signature mismatch!");
      return NextResponse.json(
        { ok: false, error: "Неверная подпись" },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();
    const amount = Number(outSum);

    // Определяем userId
    let userId: number | null = null;
    
    if (shpUserId) {
      userId = Number(shpUserId);
      console.log("[robokassa/result] Using Shp_userId:", userId);
    } else {
      const { data: payment } = await supabase
      .from("payments")
        .select("user_id")
      .eq("invoice_id", invId)
      .maybeSingle();

      if (!payment) {
      return NextResponse.json(
        { ok: false, error: "Платёж не найден" },
        { status: 404 }
      );
    }

      userId = payment.user_id;
    }

    if (!userId || !Number.isFinite(userId)) {
      return NextResponse.json(
        { ok: false, error: "Не удалось определить userId" },
        { status: 400 }
      );
    }

    // Сохраняем или обновляем платёж
    const { data: existingPayment, error: paymentError } = await supabase
      .from("payments")
      .select("id")
      .eq("invoice_id", invId)
      .maybeSingle();

    if (paymentError) {
      console.error("[robokassa/result] Error fetching payment:", paymentError);
    }

    if (existingPayment) {
      const { error: updateError } = await supabase
        .from("payments")
        .update({ status: "success" })
        .eq("id", existingPayment.id);
      
      if (updateError) {
        console.error("[robokassa/result] Error updating payment:", updateError);
        throw new Error(`Failed to update payment: ${updateError.message}`);
      }
    } else {
      const { error: insertError } = await supabase.from("payments").insert({
        user_id: userId,
        invoice_id: invId,
        previous_invoice_id: null,
        amount: amount,
        status: "success",
        is_recurring: true, // первый платеж 199 с Recurring=true
      });
      
      if (insertError) {
        console.error("[robokassa/result] Error inserting payment:", insertError);
        throw new Error(`Failed to insert payment: ${insertError.message}`);
      }
    }

    // STEP 3: Логика обработки платежа
    const now = new Date();
    
    // STEP 3: Первый оплачиваемый платеж = 199 RUB (с Recurring=true)
    // Триал 3 дня ведётся в БД и не связан с Robokassa
    // Если оплата 199 — активируем подписку и сохраняем parent invoice
    if (Math.abs(amount - 199) < 0.01) {
      const nextChargeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней

      const updatePayload: Record<string, string> = {
        subscription_status: "active",
        paid_until: nextChargeAt.toISOString(),
        next_charge_at: nextChargeAt.toISOString(),
        last_payment_status: "success",
      };
      // Сохраняем parent invoice если ещё не сохранён
      updatePayload["robokassa_initial_invoice_id"] = invId;

      const { error: updateError } = await supabase
        .from("users")
        .update(updatePayload)
        .eq("id", userId);

      if (updateError) {
        console.error("[robokassa/result] Error updating user for subscription:", updateError);
        throw new Error(`Failed to activate subscription: ${updateError.message}`);
      }

      console.log("[robokassa/result] ✅ Subscription activated for user:", userId);
      console.log("[robokassa/result] Parent invoice ID:", invId);
      console.log("[robokassa/result] Next charge at:", nextChargeAt.toISOString());

      // Уведомляем бота об успешной подписке
      try {
        const { data: user } = await supabase
          .from("users")
          .select("telegram_id")
          .eq("id", userId)
          .maybeSingle();

        if (user?.telegram_id) {
          const notifyUrl = `${process.env.MINIAPP_BASE_URL || "https://step-one-app-git-dev-emins-projects-4717eabc.vercel.app"}/api/notify-bot`;
          await fetch(notifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId,
              message: "✅ Подписка оформлена! Доступ активен до " + nextChargeAt.toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              }) + ".",
              sendMenu: true,
            }),
          });
        }
      } catch (notifyError) {
        console.error("[robokassa/result] Error notifying bot:", notifyError);
      }
    } else {
      // Recurring платежи после первого
      const { data: payment } = await supabase
        .from("payments")
        .select("previous_invoice_id")
        .eq("invoice_id", invId)
        .maybeSingle();

      if (payment?.previous_invoice_id) {
        const nextChargeAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней

        const { error: updateError } = await supabase
          .from("users")
          .update({
            subscription_status: "active",
            next_charge_at: nextChargeAt.toISOString(),
            paid_until: nextChargeAt.toISOString(),
            last_payment_status: "success",
          })
          .eq("id", userId);

        if (updateError) {
          console.error("[robokassa/result] Error updating user for subscription:", updateError);
          throw new Error(`Failed to activate subscription: ${updateError.message}`);
        }

        console.log("[robokassa/result] ✅ Subscription renewed for user:", userId);
        console.log("[robokassa/result] Next charge at:", nextChargeAt.toISOString());

        // Отправляем уведомление боту об успешном платеже
        try {
          const { data: user } = await supabase
            .from("users")
            .select("telegram_id")
            .eq("id", userId)
            .maybeSingle();
          
          if (user?.telegram_id) {
            const notifyUrl = `${process.env.MINIAPP_BASE_URL || "https://step-one-app-git-dev-emins-projects-4717eabc.vercel.app"}/api/notify-bot`;
            await fetch(notifyUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId,
                message: "✅ Подписка продлена! Доступ активен до " + nextChargeAt.toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }) + ".",
              }),
            });
          }
        } catch (notifyError) {
          console.error("[robokassa/result] Error notifying bot:", notifyError);
        }
      }
    }

    console.log("[robokassa/result] =========================================");

    return new NextResponse("OK", { status: 200 });
  } catch (error: any) {
    console.error("[robokassa/result] error", error);
    console.error("[robokassa/result] error stack", error.stack);
    console.error("[robokassa/result] error details:", {
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
