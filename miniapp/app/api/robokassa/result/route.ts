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
      return NextResponse.json(
        { ok: false, error: "ROBOKASSA_PASSWORD2 не задан" },
        { status: 500 }
      );
    }

    const params = await parseParams(req);
    const outSum = params.get("OutSum");
    const invId = params.get("InvId");
    const signature = params.get("SignatureValue");
    const shpUserId = params.get("Shp_userId"); // Параметр для подписки
    const subscriptionId = params.get("SubscriptionId"); // ID подписки от Robokassa

    console.log("[robokassa/result] ========== PAYMENT RESULT ==========");
    console.log("[robokassa/result] OutSum:", outSum);
    console.log("[robokassa/result] InvId:", invId);
    console.log("[robokassa/result] Shp_userId:", shpUserId);
    console.log("[robokassa/result] SubscriptionId:", subscriptionId);
    console.log("[robokassa/result] All params:", Object.fromEntries(params.entries()));

    if (!outSum || !invId || !signature) {
      return NextResponse.json(
        { ok: false, error: "Не хватает параметров OutSum/InvId/SignatureValue" },
        { status: 400 }
      );
    }

    // Проверка подписи: OutSum:InvId:Password2[:Shp_параметры]
    // Shp_параметры должны быть отсортированы по алфавиту
    let signatureBase = `${outSum}:${invId}:${password2}`;
    if (shpUserId) {
      // Добавляем Shp_параметры в алфавитном порядке
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

    // Определяем userId: либо из Shp_userId (для подписки), либо из платежа
    let userId: number | null = null;
    
    if (shpUserId) {
      // Для подписки используем Shp_userId
      userId = Number(shpUserId);
      console.log("[robokassa/result] Using Shp_userId:", userId);
    } else {
      // Для обычного платежа ищем по invoice_id
      const { data: payment, error: paymentError } = await supabase
        .from("payments")
        .select("id, user_id, is_recurring, previous_invoice_id")
        .eq("invoice_id", invId)
        .maybeSingle();

      if (paymentError || !payment) {
        console.error("[robokassa/result] Payment not found for InvId:", invId);
        return NextResponse.json(
          { ok: false, error: "Платёж не найден" },
          { status: 404 }
        );
      }
      
      userId = payment.user_id;
      console.log("[robokassa/result] Found payment, userId:", userId);
    }

    if (!userId || !Number.isFinite(userId)) {
      return NextResponse.json(
        { ok: false, error: "Не удалось определить userId" },
        { status: 400 }
      );
    }

    const now = new Date();
    // Активируем триал на 3 дня после первой оплаты
    const trialEndAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    // После окончания триала подписка будет активна еще 30 дней
    const subscriptionEnd = new Date(trialEndAt.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Сохраняем или обновляем платёж
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id")
      .eq("invoice_id", invId)
      .maybeSingle();

    if (existingPayment) {
      // Обновляем существующий платёж
      await supabase
        .from("payments")
        .update({ status: "success" })
        .eq("id", existingPayment.id);
      console.log("[robokassa/result] Updated payment:", existingPayment.id);
    } else {
      // Создаем новый платёж (для подписки)
      await supabase.from("payments").insert({
        user_id: userId,
        invoice_id: invId,
        previous_invoice_id: subscriptionId || null,
        amount: Number(outSum),
        status: "success",
        is_recurring: !!subscriptionId,
      });
      console.log("[robokassa/result] Created new payment for subscription");
    }

    // Обновляем пользователя: активируем триал на 3 дня
    const updateData: any = {
      subscription_status: "trial",
      trial_end_at: trialEndAt.toISOString(),
      subscription_end_at: subscriptionEnd.toISOString(),
      last_payment_status: "success",
    };

    // Сохраняем SubscriptionId для рекуррентных платежей
    // Используем robokassa_parent_invoice_id для хранения SubscriptionId
    if (subscriptionId) {
      // Для подписки сохраняем SubscriptionId в robokassa_parent_invoice_id
      updateData.robokassa_parent_invoice_id = subscriptionId;
    } else {
      // Для обычного платежа используем invId
      updateData.robokassa_parent_invoice_id = invId;
    }

    await supabase
      .from("users")
      .update(updateData)
      .eq("id", userId);

    console.log("[robokassa/result] ✅ Subscription activated for user:", userId);
    console.log("[robokassa/result] Trial ends at:", trialEndAt.toISOString());
    console.log("[robokassa/result] Subscription ends at:", subscriptionEnd.toISOString());
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
