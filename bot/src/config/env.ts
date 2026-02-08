import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Загружаем .env из корня папки bot/
dotenv.config({ path: join(__dirname, "../../.env") });

// ПРАВИЛЬНЫЙ Supabase Project URL (из Dashboard → API Settings)
const EXPECTED_SUPABASE_URL = "https://ipgxnqplwzptxyfjjsrr.supabase.co";
const EXPECTED_PROJECT_REF = "ipgxnqplwzptxyfjjsrr";

interface EnvConfig {
  telegramBotToken: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  openaiApiKey: string;
}

/**
 * Extracts project reference from Supabase URL
 */
function extractProjectRef(url: string): string | null {
  try {
    const match = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Validates Supabase URL matches expected project
 */
function validateSupabaseUrl(url: string | undefined): string {
  if (!url) {
    console.error("❌ CRITICAL: SUPABASE_URL is not set!");
    console.error("   Set SUPABASE_URL in .env file or environment variables");
    console.error(`   Expected: ${EXPECTED_SUPABASE_URL}`);
    process.exit(1);
  }

  // Normalize URL (remove trailing slash)
  const normalizedUrl = url.trim().replace(/\/$/, '');
  const projectRef = extractProjectRef(normalizedUrl);

  if (normalizedUrl !== EXPECTED_SUPABASE_URL) {
    console.error("❌ CRITICAL: Wrong Supabase project URL!");
    console.error(`   Current:  ${normalizedUrl}`);
    console.error(`   Expected: ${EXPECTED_SUPABASE_URL}`);
    console.error(`   Project ref: ${projectRef || 'UNKNOWN'} (expected: ${EXPECTED_PROJECT_REF})`);
    console.error("");
    console.error("   Fix: Update SUPABASE_URL in .env file or environment variables");
    console.error(`   Set: SUPABASE_URL=${EXPECTED_SUPABASE_URL}`);
    process.exit(1);
  }

  if (projectRef !== EXPECTED_PROJECT_REF) {
    console.error("❌ CRITICAL: Project ref mismatch!");
    console.error(`   Current:  ${projectRef}`);
    console.error(`   Expected: ${EXPECTED_PROJECT_REF}`);
    process.exit(1);
  }

  return normalizedUrl;
}

function validateEnv(): EnvConfig {
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  
  // ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ: только SUPABASE_URL (без fallback)
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const missing: string[] = [];

  if (!telegramBotToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!openaiApiKey) missing.push("OPENAI_API_KEY");

  if (missing.length > 0) {
    console.error("❌ Ошибка: отсутствуют переменные окружения:");
    missing.forEach((key) => console.error(`   - ${key}`));
    console.error("\nСоздайте файл .env в папке bot/ на основе .env.example");
    process.exit(1);
  }

  // ЖЁСТКАЯ ПРОВЕРКА: URL должен быть правильным
  const validatedUrl = validateSupabaseUrl(supabaseUrl);

  // Проверяем, что ключи не заглушки
  if (openaiApiKey === "sk-your-openai-api-key-here") {
    console.error("❌ OPENAI_API_KEY содержит заглушку! Замените на реальный ключ в bot/.env");
    process.exit(1);
  }

  if (telegramBotToken === "your-telegram-bot-token-here") {
    console.error("❌ TELEGRAM_BOT_TOKEN содержит заглушку! Замените на реальный токен в bot/.env");
    process.exit(1);
  }

  // Проверяем тип ключа
  if (supabaseServiceRoleKey.length < 200) {
    console.error("❌ SUPABASE_SERVICE_ROLE_KEY appears to be anon key!");
    console.error("   Service role key should be 200+ characters long");
    console.error("   Get the correct key from Supabase Dashboard → Settings → API → service_role key");
    process.exit(1);
  }

  // Логируем успешную валидацию
  console.log("✅ Environment validation passed");
  console.log(`   Supabase URL: ${validatedUrl}`);
  console.log(`   Project ref: ${EXPECTED_PROJECT_REF}`);
  console.log(`   Key type: service_role (${supabaseServiceRoleKey.substring(0, 6)}...${supabaseServiceRoleKey.slice(-4)})`);

  return {
    telegramBotToken: telegramBotToken!,
    supabaseUrl: validatedUrl,
    supabaseServiceRoleKey: supabaseServiceRoleKey!,
    openaiApiKey: openaiApiKey!,
  };
}

export const env = validateEnv();
