import fetch from "node-fetch";
import crypto from "crypto";
import { supabase } from "./supabase.js";
import { env } from "../config/env.js";

const AMOUNT = 199;
const DESCRIPTION = "Подписка на сервис питания Step One";
const RECURRING_URL = "https://auth.robokassa.ru/Merchant/Recurring";

function md5(input: string) {
  return crypto.createHash("md5").update(input).digest("hex");
}

function buildReceipt(amount: number) {
  const receipt = {
    sno: "none",
    items: [
      {
        name: DESCRIPTION,
        quantity: 1,
        sum: amount,
        payment_method: "full_payment",
        payment_object: "service",
        tax: "none",
      },
    ],
  };
  const json = JSON.stringify(receipt);
  return { json, encoded: encodeURIComponent(json) };
}

async function chargeUser(user: any) {
  const invoiceId = `rec_${user.id}_${Date.now()}`;
  const { json: receiptJson, encoded: receiptEncoded } = buildReceipt(AMOUNT);

  // SignatureValue: MerchantLogin:OutSum:InvoiceID:Receipt:Password1 (без PreviousInvoiceID)
  const signatureBase = `${env.robokassaMerchantLogin}:${AMOUNT}:${invoiceId}:${receiptJson}:${env.robokassaPassword1}`;
  const signatureValue = md5(signatureBase);

  const body = new URLSearchParams({
    MerchantLogin: env.robokassaMerchantLogin,
    InvoiceID: invoiceId,
    PreviousInvoiceID: user.robokassa_parent_invoice_id,
    OutSum: AMOUNT.toString(),
    Description: DESCRIPTION,
    SignatureValue: signatureValue,
    Receipt: receiptEncoded,
  });

  // Записываем платеж как pending перед запросом
  const { data: paymentRow } = await supabase
    .from("payments")
    .insert({
      user_id: user.id,
      invoice_id: invoiceId,
      previous_invoice_id: user.robokassa_parent_invoice_id,
      amount: AMOUNT,
      status: "pending",
      is_recurring: true,
    })
    .select("id")
    .maybeSingle();

  try {
    const response = await fetch(RECURRING_URL, {
      method: "POST",
      body,
    });
    const text = await response.text();

    const status =
      response.ok && text.toLowerCase().includes("ok") ? "sent" : "processing";

    if (paymentRow) {
      await supabase
        .from("payments")
        .update({ status })
        .eq("id", paymentRow.id);
    }

    await supabase
      .from("users")
      .update({ last_payment_status: status })
      .eq("id", user.id);
  } catch (error: any) {
    console.error("[recurring] charge error", error);
    if (paymentRow) {
      await supabase
        .from("payments")
        .update({ status: "fail" })
        .eq("id", paymentRow.id);
    }
    await supabase
      .from("users")
      .update({ last_payment_status: "fail" })
      .eq("id", user.id);
  }
}

export async function runRecurringBilling() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data: users, error } = await supabase
    .from("users")
    .select("id, subscription_end_at, robokassa_parent_invoice_id")
    .eq("subscription_status", "active")
    .not("robokassa_parent_invoice_id", "is", null)
    .lte("subscription_end_at", tomorrow);

  if (error) {
    console.error("[recurring] fetch users error", error);
    return;
  }

  if (!users || users.length === 0) return;

  for (const user of users) {
    await chargeUser(user);
  }
}

export function startRecurringBillingScheduler() {
  console.log("⏰ Scheduler автосписаний запущен (каждые 6 часов)");
  setInterval(() => {
    runRecurringBilling().catch((err) =>
      console.error("[recurring] scheduler error", err)
    );
  }, 6 * 60 * 60 * 1000);
}
