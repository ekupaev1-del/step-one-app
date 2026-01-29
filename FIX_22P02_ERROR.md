# Fix for PostgreSQL Error 22P02 (invalid_text_representation)

## Root Cause

The error `22P02 invalid_text_representation` occurred when inserting diary entries because:

1. **Type Mismatch**: OpenAI API or the parsing logic sometimes returns numeric values as **strings** (e.g., `"300"` instead of `300`)
2. **PostgreSQL Schema**: The `diary` table expects:
   - `calories`, `protein`, `fat`, `carbs`: `NUMERIC(10, 2)` (numbers, not strings)
   - `user_id`, `telegram_user_id`, `message_id`, `chat_id`: `BIGINT` (integers, not strings)
3. **No Type Validation**: The code was directly inserting values without ensuring they matched the expected PostgreSQL types

### Exact Failing Column

The error could occur on any numeric column, but most commonly:
- `calories` - if OpenAI returned `"300 грамм"` or `"300"` as a string
- `protein`, `fat`, `carbs` - if returned as strings like `"25.5"` instead of `25.5`
- `user_id` - if somehow passed as a string instead of number

## Solution Implemented

### 1. Created `normalizeDiaryEntry()` Function

**Location**: 
- `miniapp/lib/diaryNormalize.ts`
- `bot/src/services/diaryNormalize.ts`

**Features**:
- Converts string numbers to actual numbers using `parseFloat()`
- Strips units like "грамм", "гр", "g", "pcs" from numeric strings
- Validates all numeric fields are finite, non-NaN numbers
- Ensures non-negative values (clamps to 0)
- Handles null/undefined gracefully with defaults
- Validates required fields (`user_id`, `meal_text`)

**Key Functions**:
- `safeParseNumber()`: Converts any value to a number, stripping units
- `safeParseInteger()`: Converts any value to an integer (for IDs)

### 2. Enhanced Error Logging

**Added detailed logging** that includes:
- **Function/controller name**: `DB_INSERT:${requestId}`
- **Raw payload**: Original values with types (`typeof`)
- **Normalized payload**: After type conversion
- **PostgreSQL error details**:
  - `code`: Error code (e.g., "22P02")
  - `message`: Error message
  - `details`: Detailed error information
  - `hint`: PostgreSQL hint
  - `where`, `schema`, `table`, `column`, `constraint`: Location of error

**Example log output**:
```json
{
  "postgresError": {
    "code": "22P02",
    "message": "invalid input syntax for type numeric",
    "details": "Value \"300 грамм\" cannot be converted to numeric",
    "column": "calories"
  },
  "normalizedPayload": {
    "calories": 300,
    "type": "number"
  }
}
```

### 3. Updated Both Code Paths

**Webhook Route** (`miniapp/app/api/telegram/webhook/route.ts`):
- Normalizes payload before insert
- Logs raw and normalized payloads
- Enhanced error logging with full Postgres details

**Bot Code** (`bot/src/index.ts`):
- Same normalization applied
- Same enhanced logging

## How It Works

### Before (Problematic):
```typescript
const diaryEntry = {
  user_id: userId,
  calories: mealAnalysis.calories, // Could be string "300"
  protein: mealAnalysis.protein,  // Could be string "25.5"
  // ...
};
await supabase.from("diary").insert(diaryEntry); // ❌ 22P02 error
```

### After (Fixed):
```typescript
const rawDiaryEntry = {
  user_id: userId,
  calories: mealAnalysis.calories, // Could be string "300"
  protein: mealAnalysis.protein,  // Could be string "25.5"
  // ...
};

// Normalize: convert strings to numbers, strip units
const diaryEntry = normalizeDiaryEntry(rawDiaryEntry);
// Now: calories = 300 (number), protein = 25.5 (number)

await supabase.from("diary").insert(diaryEntry); // ✅ Success
```

## Testing

Unit tests added in `miniapp/lib/__tests__/diaryNormalize.test.ts`:
- ✅ Valid numeric values
- ✅ String numbers conversion
- ✅ Strings with units ("300 грамм" → 300)
- ✅ Null/undefined handling
- ✅ Invalid values (defaults to 0)
- ✅ Non-negative enforcement

## Verification

After deployment, verify:
1. Send test message: "2 вареных яйца и булгур 300"
2. Check logs for:
   - `[DB_INSERT:${requestId}] Raw payload types` - shows original types
   - `[DB_INSERT:${requestId}] Normalized payload types` - shows converted types
   - No `22P02` errors in logs
3. Check `app_logs` table for detailed error information if any issues occur

## Files Changed

1. **New Files**:
   - `miniapp/lib/diaryNormalize.ts` - Normalization function
   - `bot/src/services/diaryNormalize.ts` - Bot version
   - `miniapp/lib/__tests__/diaryNormalize.test.ts` - Unit tests

2. **Modified Files**:
   - `miniapp/app/api/telegram/webhook/route.ts` - Added normalization and enhanced logging
   - `bot/src/index.ts` - Added normalization and enhanced logging

## Summary

**Root Cause**: String values being inserted into numeric PostgreSQL columns

**Fix**: Type normalization that converts strings to numbers, strips units, and validates all values before database insert

**Result**: All diary entries now have correct types, preventing `22P02` errors
