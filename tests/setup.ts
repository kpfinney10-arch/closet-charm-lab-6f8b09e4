import "dotenv/config";

const required = [
  "STAGING_SUPABASE_URL",
  "STAGING_SUPABASE_PUBLISHABLE_KEY",
  "STAGING_SUPABASE_SERVICE_ROLE_KEY",
];

const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  throw new Error(
    `Missing env vars for RLS tests: ${missing.join(", ")}. ` +
      `Create tests/.env (see tests/rls/README.md) and point it at a STAGING project — never production.`,
  );
}

if (process.env.STAGING_SUPABASE_URL?.includes("vnutvxlcosyuihbhglrr")) {
  throw new Error(
    "Refusing to run RLS tests against the live project. Point STAGING_SUPABASE_URL at a separate staging Supabase project.",
  );
}
