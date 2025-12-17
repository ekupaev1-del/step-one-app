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
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id")
      .eq("invoice_id", invId)
      .maybeSingle();

    if (existingPayment) {
      await supabase
        .from("payments")
        .update({ status: "success" })
        .eq("id", existingPayment.id);
    } else {
      await supabase.from("payments").insert({
        user_id: userId,
        invoice_id: invId,
        previous_invoice_id: null,
        amount: amount,
        status: "success",
        is_recurring: amount === 1, // Первый платеж 1 RUB - это родительский для рекуррентных
      });
    }

    // Логика обработки платежа
    const now = new Date();
    
    if (amount === 1) {
      // Это первый платеж 1 RUB - активируем триал
      const trialEndAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 дня
      
      await supabase
        .from("users")
        .update({
          subscription_status: "trial",
          trial_end_at: trialEndAt.toISOString(),
          robokassa_parent_invoice_id: invId, // Сохраняем parent invoice ID для рекуррентных платежей
          last_payment_status: "success",
        })
        .eq("id", userId);

      console.log("[robokassa/result] ✅ Trial activated for user:", userId);
      console.log("[robokassa/result] Trial ends at:", trialEndAt.toISOString());
      console.log("[robokassa/result] Parent invoice ID:", invId);

      // Отправляем уведомление боту о активации триала
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
              message: "🎉 Триал активирован! У вас есть 3 дня полного доступа ко всем функциям бота.",
            }),
          });
        }
      } catch (notifyError) {
        console.error("[robokassa/result] Error notifying bot:", notifyError);
      }
    } else if (amount === 199) {
      // Это рекуррентный платеж 199 RUB - активируем подписку на 30 дней
      const paidUntil = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 дней
      
      await supabase
        .from("users")
        .update({
          subscription_status: "active",
          paid_until: paidUntil.toISOString(),
          last_payment_status: "success",
        })
        .eq("id", userId);

      console.log("[robokassa/result] ✅ Subscription activated for user:", userId);
      console.log("[robokassa/result] Paid until:", paidUntil.toISOString());

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
              message: "✅ Подписка продлена! Доступ активен до " + paidUntil.toLocaleDateString("ru-RU", {
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

    console.log("[robokassa/result] =========================================");

    return new NextResponse("OK", { status: 200 });
  } catch (error: any) {
    console.error("[robokassa/result] error", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
