/**
 * /api/me - Check if Telegram user exists in Supabase
 * 
 * Validates Telegram WebApp initData and checks user by telegram_id
 * Returns: { exists: boolean, user?: {...} }
 */

import { NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import crypto from "crypto";

export const dynamic = 'force-dynamic';

/**
 * Validates Telegram WebApp initData signature
 */
function validateInitData(initData: string, botToken: string): boolean {
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    // Sort parameters and create data check string
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    // Create secret key from bot token
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    // Calculate hash
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return calculatedHash === hash;
  } catch (error) {
    console.error('[api/me] Error validating initData:', error);
    return false;
  }
}

/**
 * Extracts Telegram user ID from initData
 */
function extractTelegramUserId(initData: string): number | null {
  try {
    const urlParams = new URLSearchParams(initData);
    const userParam = urlParams.get('user');
    if (!userParam) return null;

    const user = JSON.parse(userParam);
    return user?.id ? Number(user.id) : null;
  } catch (error) {
    console.error('[api/me] Error extracting user ID:', error);
    return null;
  }
}

export async function GET(req: Request) {
  try {
    // Get initData from header or query param
    const initDataHeader = req.headers.get('x-telegram-init-data');
    const url = new URL(req.url);
    const initDataQuery = url.searchParams.get('initData');
    const initData = initDataHeader || initDataQuery;

    if (!initData) {
      return NextResponse.json(
        { exists: false, error: 'Telegram initData is required' },
        { status: 400 }
      );
    }

    // Get bot token from environment (server-side only)
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.error('[api/me] TELEGRAM_BOT_TOKEN is not set');
      return NextResponse.json(
        { exists: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Validate initData signature
    if (!validateInitData(initData, botToken)) {
      return NextResponse.json(
        { exists: false, error: 'Invalid initData signature' },
        { status: 401 }
      );
    }

    // Extract Telegram user ID
    const telegramUserId = extractTelegramUserId(initData);
    if (!telegramUserId || !Number.isFinite(telegramUserId)) {
      return NextResponse.json(
        { exists: false, error: 'Invalid Telegram user ID' },
        { status: 400 }
      );
    }

    // Query Supabase users table by telegram_id
    const supabase = getServerSupabaseClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, telegram_id, name, calories, privacy_accepted, terms_accepted')
      .eq('telegram_id', telegramUserId)
      .maybeSingle();

    if (error) {
      console.error('[api/me] Supabase error:', error);
      return NextResponse.json(
        { exists: false, error: 'Database error' },
        { status: 500 }
      );
    }

    if (user) {
      return NextResponse.json({
        exists: true,
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          name: user.name,
          calories: user.calories,
          privacy_accepted: user.privacy_accepted,
          terms_accepted: user.terms_accepted,
        }
      });
    }

    return NextResponse.json({ exists: false });
  } catch (error: any) {
    console.error('[api/me] Unexpected error:', error);
    return NextResponse.json(
      { exists: false, error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
