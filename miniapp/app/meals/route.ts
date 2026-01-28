import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseAdmin";
import { getBearerTokenFromRequest, verifyAppToken, AppTokenError } from "@/lib/appToken";

export const dynamic = "force-dynamic";

const ALLOWED_SOURCES = new Set(["telegram", "ios", "miniapp", "api", "admin", "unknown"]);

function isUuid(value: string): boolean {
  // Accept any RFC4122 UUID (v1-v5). Good enough for subject validation.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parseDateOnly(dateStr: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error("date must be YYYY-MM-DD");
  }
  // Validate actual date (e.g., 2025-02-31 should fail)
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) throw new Error("date is invalid");
  const normalized = d.toISOString().slice(0, 10);
  if (normalized !== dateStr) throw new Error("date is invalid");
  return dateStr;
}

function requireUserId(req: Request): { userId: string; telegramId?: number } {
  const token = getBearerTokenFromRequest(req);
  if (!token) throw new Error("Missing Authorization Bearer token");

  const secret = process.env.APP_JWT_SECRET || "";
  const payload = verifyAppToken(token, secret);
  const userId = payload.sub;
  if (!isUuid(userId)) throw new Error("Invalid token subject (expected UUID)");
  return { userId, telegramId: payload.telegram_id };
}

type MealsPostBody =
  | {
      date: string;
      items: Array<{ foodId: number; foodName: string; weightGr: number }>;
      source: "telegram" | "ios" | "miniapp" | "api" | "admin" | "unknown";
    }
  | {
      // Legacy adapter (temporary): allows Telegram bot / old clients to send macros.
      date: string;
      source: "telegram" | "ios" | "miniapp" | "api" | "admin" | "unknown";
      meal_text: string;
      calories?: number;
      protein?: number;
      fat?: number;
      carbs?: number;
      legacy_payload?: any;
    };

function isNumberIntSafe(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER;
}

function assertItems(items: unknown): asserts items is Array<{ foodId: number; foodName: string; weightGr: number }> {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("items must be a non-empty array");
  }
  for (const [idx, it] of items.entries()) {
    if (!it || typeof it !== "object") throw new Error(`items[${idx}] must be an object`);
    const anyIt: any = it;

    // IMPORTANT: no strings in numeric fields
    if (!isNumberIntSafe(anyIt.foodId) || anyIt.foodId <= 0) {
      throw new Error(`items[${idx}].foodId must be a positive integer number`);
    }
    if (typeof anyIt.foodName !== "string" || anyIt.foodName.trim().length === 0) {
      throw new Error(`items[${idx}].foodName must be a non-empty string`);
    }
    if (!isNumberIntSafe(anyIt.weightGr) || anyIt.weightGr <= 0) {
      throw new Error(`items[${idx}].weightGr must be a positive integer number`);
    }
  }
}

export async function GET(req: Request) {
  try {
    const { userId } = requireUserId(req);

    const url = new URL(req.url);
    const dateStr = url.searchParams.get("date");
    if (!dateStr) {
      return NextResponse.json({ ok: false, error: "date query param is required" }, { status: 400 });
    }
    const date = parseDateOnly(dateStr);

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from("meals")
      .select(
        "id, date, source, created_at, meal_text, calories, protein, fat, carbs, legacy_payload, meal_items(food_id, food_name, weight_gr)"
      )
      .eq("user_id", userId)
      .eq("date", date)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, meals: data || [] });
  } catch (e: any) {
    const msg = e instanceof AppTokenError ? e.message : e?.message || "Internal error";
    const status = e instanceof AppTokenError || msg.includes("Authorization") ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { userId, telegramId } = requireUserId(req);
    const supabase = createServerSupabaseClient();

    const body: MealsPostBody | null = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const anyBody: any = body;
    const date = parseDateOnly(anyBody.date);
    const source = anyBody.source;
    if (typeof source !== "string" || !ALLOWED_SOURCES.has(source)) {
      return NextResponse.json(
        { ok: false, error: `source must be one of: ${Array.from(ALLOWED_SOURCES).join(", ")}` },
        { status: 400 }
      );
    }

    // New structured format
    if ("items" in anyBody) {
      assertItems(anyBody.items);

      // Insert meal
      const { data: meal, error: mealErr } = await supabase
        .from("meals")
        .insert({
          user_id: userId,
          date,
          source,
          legacy_payload: {
            source: "structured",
            telegram_id: telegramId ?? null,
          },
        })
        .select("id, date, source, created_at")
        .single();

      if (mealErr || !meal) {
        return NextResponse.json({ ok: false, error: mealErr?.message || "Failed to create meal" }, { status: 500 });
      }

      const itemsInsert = anyBody.items.map((it: any) => ({
        meal_id: meal.id,
        food_id: it.foodId,
        food_name: String(it.foodName).trim(),
        weight_gr: it.weightGr,
      }));

      const { error: itemsErr } = await supabase.from("meal_items").insert(itemsInsert);
      if (itemsErr) {
        return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, mealId: meal.id });
    }

    // Legacy adapter (temporary)
    if (typeof anyBody.meal_text === "string" && anyBody.meal_text.trim().length > 0) {
      const calories = anyBody.calories;
      const protein = anyBody.protein;
      const fat = anyBody.fat;
      const carbs = anyBody.carbs;

      // IMPORTANT: numeric fields must be numbers (no implicit casts)
      const numbers = { calories, protein, fat, carbs };
      for (const [k, v] of Object.entries(numbers)) {
        if (v === undefined) continue;
        if (typeof v !== "number" || !Number.isFinite(v)) {
          return NextResponse.json({ ok: false, error: `${k} must be a number` }, { status: 400 });
        }
      }

      const { data: meal, error: mealErr } = await supabase
        .from("meals")
        .insert({
          user_id: userId,
          date,
          source,
          meal_text: anyBody.meal_text.trim(),
          calories: calories ?? null,
          protein: protein ?? null,
          fat: fat ?? null,
          carbs: carbs ?? null,
          legacy_payload: anyBody.legacy_payload ?? { telegram_id: telegramId ?? null },
        })
        .select("id")
        .single();

      if (mealErr || !meal) {
        return NextResponse.json({ ok: false, error: mealErr?.message || "Failed to create meal" }, { status: 500 });
      }

      return NextResponse.json({ ok: true, mealId: meal.id, legacy: true });
    }

    return NextResponse.json(
      {
        ok: false,
        error:
          "Unsupported body. Use { date, items: [{ foodId, foodName, weightGr }], source } or legacy { date, meal_text, ... }",
      },
      { status: 400 }
    );
  } catch (e: any) {
    const msg = e instanceof AppTokenError ? e.message : e?.message || "Internal error";
    const status = e instanceof AppTokenError || msg.includes("Authorization") ? 401 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}

