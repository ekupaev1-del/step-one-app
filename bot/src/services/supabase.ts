/**
 * Bot Supabase client - uses single source of truth from lib/supabase/client
 * This module is kept for backward compatibility with existing imports
 */

import { getBotSupabaseClient } from "../lib/supabase/client.js";

// Re-export the client from the new single source of truth
export const supabase = getBotSupabaseClient();


