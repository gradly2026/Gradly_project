import { createClient } from "@supabase/supabase-js";

const supabaseAdminUrl = process.env.SUPABASE_URL;
const supabaseAdminServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseAdminUrl || !supabaseAdminServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
  );
}

export const supabaseAdmin = createClient(
  supabaseAdminUrl,
  supabaseAdminServiceRoleKey,
  {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
    },
  },
);
