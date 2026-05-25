require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "gradly123@gradly.app";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "gradly123";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Holamundo$503";
const ADMIN_NAME = process.env.ADMIN_NAME || "Administrador Gradly";
const ADMIN_ROLE = "admin";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Copy .env.local.example to .env.local and set your Supabase credentials.",
  );
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    detectSessionInUrl: false,
  },
});

async function findUserByEmail(email) {
  if (supabaseAdmin.auth?.admin?.getUserByEmail) {
    const { data, error } =
      await supabaseAdmin.auth.admin.getUserByEmail(email);
    if (error) {
      if (error?.message?.toLowerCase().includes("user not found")) {
        return null;
      }
      throw error;
    }
    return data?.user ?? null;
  }

  if (supabaseAdmin.auth?.admin?.listUsers) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      query: email,
    });
    if (error) throw error;
    const users = (data?.users || []).filter((user) => user.email === email);
    return users.length > 0 ? users[0] : null;
  }

  throw new Error(
    "Unable to find user by email: unsupported Supabase admin client API.",
  );
}

async function main() {
  console.log("Creating admin user with username:", ADMIN_USERNAME);

  let adminUser = await findUserByEmail(ADMIN_EMAIL);

  if (!adminUser) {
    console.log("Admin user not found, creating new Supabase auth user...");
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: {
        role: ADMIN_ROLE,
        username: ADMIN_USERNAME,
        nombre: ADMIN_NAME,
      },
    });

    if (error) {
      throw error;
    }

    adminUser = data?.user;
  } else {
    console.log("Admin user already exists with id:", adminUser.id);
  }

  if (!adminUser?.id) {
    throw new Error("Could not determine admin user id.");
  }

  console.log("Ensuring admin profile exists in profiles table...");
  const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
    {
      id: adminUser.id,
      email: ADMIN_EMAIL,
      username: ADMIN_USERNAME,
      role: ADMIN_ROLE,
      nombre: ADMIN_NAME,
    },
    { onConflict: ["id"], ignoreDuplicates: false },
  );

  if (profileError) {
    throw profileError;
  }

  console.log("Ensuring admin permissions are assigned...");

  const { data: permissions, error: permissionsError } = await supabaseAdmin
    .from("permissions")
    .select("key");

  if (permissionsError) {
    throw permissionsError;
  }

  if (Array.isArray(permissions) && permissions.length > 0) {
    const rolePermissions = permissions.map((permission) => ({
      role: ADMIN_ROLE,
      permission_key: permission.key,
    }));

    const { error: rolePermissionsError } = await supabaseAdmin
      .from("role_permissions")
      .upsert(rolePermissions, { onConflict: ["role", "permission_key"] });

    if (rolePermissionsError) {
      throw rolePermissionsError;
    }
  }

  console.log("Admin user creation and role setup completed successfully.");
  console.log(`Login using username: ${ADMIN_USERNAME}`);
  console.log(`Password: ${ADMIN_PASSWORD}`);
  console.log(`Email: ${ADMIN_EMAIL}`);
}

main().catch((err) => {
  console.error("Error creating admin user:", err.message || err);
  process.exit(1);
});
