import { SUPABASE_URL, SUPABASE_KEY } from "./config.js";

export const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
