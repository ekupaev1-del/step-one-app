/**
 * Normalizes and validates diary entry payload before database insert
 * Ensures all types match PostgreSQL schema requirements
 */

export interface MealAnalysis {
  description: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

export interface NormalizedDiaryEntry {
  user_id: number;
  telegram_user_id: number | null;
  meal_text: string;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  source: string; // Content type: 'text', 'photo', or 'audio'
  channel?: string; // Communication channel: 'telegram', 'webapp', 'admin', 'api'
  message_id: number | null;
  chat_id: number | null;
  parsed_json: any;
}

/**
 * Safely converts a value to a number, handling strings, null, undefined
 * Strips units like "грамм", "гр", "g", "pcs", etc.
 */
function safeParseNumber(value: any, fieldName: string, defaultValue: number = 0): number {
  if (value === null || value === undefined) {
    return defaultValue;
  }

  // If already a number, validate it
  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      console.warn(`[normalizeDiaryEntry] Invalid number for ${fieldName}: ${value}, using default ${defaultValue}`);
      return defaultValue;
    }
    return Math.max(0, value); // Ensure non-negative
  }

  // If string, try to parse
  if (typeof value === 'string') {
    // Remove common units and whitespace
    let cleaned = value
      .trim()
      .toLowerCase()
      .replace(/[^\d.,-]/g, '') // Remove all non-numeric except digits, dots, commas, minus
      .replace(/,/g, '.') // Replace comma with dot
      .replace(/[^\d.-]/g, ''); // Remove any remaining non-numeric except dot and minus

    // Try to parse
    const parsed = parseFloat(cleaned);
    if (isNaN(parsed) || !isFinite(parsed)) {
      console.warn(`[normalizeDiaryEntry] Could not parse ${fieldName} from "${value}", using default ${defaultValue}`);
      return defaultValue;
    }
    return Math.max(0, parsed);
  }

  // Try to convert to number
  const converted = Number(value);
  if (isNaN(converted) || !isFinite(converted)) {
    console.warn(`[normalizeDiaryEntry] Could not convert ${fieldName} from ${typeof value} "${value}", using default ${defaultValue}`);
    return defaultValue;
  }

  return Math.max(0, converted);
}

/**
 * Safely converts a value to a number (for IDs), handling strings, null, undefined
 */
function safeParseInteger(value: any, fieldName: string, allowNull: boolean = true): number | null {
  if (value === null || value === undefined) {
    return allowNull ? null : 0;
  }

  if (typeof value === 'number') {
    if (isNaN(value) || !isFinite(value)) {
      console.warn(`[normalizeDiaryEntry] Invalid integer for ${fieldName}: ${value}`);
      return allowNull ? null : 0;
    }
    return Math.floor(value); // Ensure integer
  }

  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || !isFinite(parsed)) {
      console.warn(`[normalizeDiaryEntry] Could not parse integer ${fieldName} from "${value}"`);
      return allowNull ? null : 0;
    }
    return parsed;
  }

  const converted = Number(value);
  if (isNaN(converted) || !isFinite(converted)) {
    console.warn(`[normalizeDiaryEntry] Could not convert ${fieldName} to integer from ${typeof value} "${value}"`);
    return allowNull ? null : 0;
  }

  return Math.floor(converted);
}

/**
 * Normalizes a diary entry payload to ensure all types match PostgreSQL schema
 */
export function normalizeDiaryEntry(input: {
  user_id: any;
  telegram_user_id?: any;
  meal_text: any;
  calories: any;
  protein: any;
  fat: any;
  carbs: any;
  source?: any; // Content type: 'text', 'photo', 'audio'
  channel?: any; // Communication channel: 'telegram', 'webapp', 'admin', 'api'
  message_id?: any;
  chat_id?: any;
  parsed_json?: any;
}): NormalizedDiaryEntry {
  // Validate required fields
  if (!input.user_id) {
    throw new Error('user_id is required');
  }

  if (!input.meal_text || typeof input.meal_text !== 'string') {
    throw new Error('meal_text must be a non-empty string');
  }

  // Normalize source to ensure it's one of: 'text', 'photo', 'audio'
  const sourceValue = input.source ? String(input.source).toLowerCase() : 'text';
  const validSource = ['text', 'photo', 'audio'].includes(sourceValue) ? sourceValue : 'text';

  // Normalize all numeric fields
  const normalized: NormalizedDiaryEntry = {
    user_id: safeParseInteger(input.user_id, 'user_id', false) || 0,
    telegram_user_id: input.telegram_user_id ? safeParseInteger(input.telegram_user_id, 'telegram_user_id', true) : null,
    meal_text: String(input.meal_text).trim(),
    calories: safeParseNumber(input.calories, 'calories', 0),
    protein: safeParseNumber(input.protein, 'protein', 0),
    fat: safeParseNumber(input.fat, 'fat', 0),
    carbs: safeParseNumber(input.carbs, 'carbs', 0),
    source: validSource, // Content type: 'text', 'photo', or 'audio'
    channel: input.channel ? String(input.channel) : 'telegram', // Default to 'telegram' if not specified
    message_id: input.message_id ? safeParseInteger(input.message_id, 'message_id', true) : null,
    chat_id: input.chat_id ? safeParseInteger(input.chat_id, 'chat_id', true) : null,
    parsed_json: input.parsed_json || null,
  };

  // Validate meal_text is not empty after trim
  if (normalized.meal_text.length === 0) {
    throw new Error('meal_text cannot be empty');
  }

  return normalized;
}

/**
 * Logs the payload with detailed type information for debugging
 */
export function logPayloadDetails(
  functionName: string,
  rawPayload: any,
  normalizedPayload: NormalizedDiaryEntry
): void {
  const typeInfo = Object.keys(rawPayload).map((key) => {
    const rawValue = rawPayload[key];
    const normalizedValue = normalizedPayload[key as keyof NormalizedDiaryEntry];
    return {
      key,
      rawType: typeof rawValue,
      rawValue: typeof rawValue === 'object' ? JSON.stringify(rawValue).substring(0, 100) : String(rawValue).substring(0, 100),
      normalizedType: typeof normalizedValue,
      normalizedValue: typeof normalizedValue === 'object' ? JSON.stringify(normalizedValue).substring(0, 100) : String(normalizedValue).substring(0, 100),
    };
  });

  console.log(`[${functionName}] Payload normalization:`, JSON.stringify(typeInfo, null, 2));
}
