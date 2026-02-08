/**
 * Legacy export for backward compatibility
 * @deprecated Use getServerSupabaseClient from @/lib/supabase/server instead
 */
import { getServerSupabaseClient } from "./supabase/server";

export const createServerSupabaseClient = () => {
  // Re-export from new single source of truth
  return getServerSupabaseClient();
};
