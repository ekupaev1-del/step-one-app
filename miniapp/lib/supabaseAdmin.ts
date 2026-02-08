import { createClient } from "@supabase/supabase-js";
// @ts-ignore - root lib is outside miniapp scope, use relative import
import { getSupabaseServerConfig, logSupabaseConfig } from "../../lib/supabase-config";

export const createServerSupabaseClient = () => {
  // Use shared config module (single source of truth)
  const config = getSupabaseServerConfig();
  
  // Log connection info (safe, no secrets)
  logSupabaseConfig(config, 'supabaseAdmin');

  return createClient(config.url, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
};
