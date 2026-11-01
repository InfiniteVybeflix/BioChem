/**
 * Typed, safe environment access.
 *
 * ⚠️ PUBLIC (NEXT_PUBLIC_*) values MUST be read as STATIC member
 * expressions (`process.env.NEXT_PUBLIC_X`). Next.js/Turbopack inlines
 * only static references into the client bundle at build time — dynamic
 * lookups like `process.env[name]` are NOT inlined and resolve to
 * `undefined` in the browser (the deployed process shim has `env: {}`).
 * That exact bug is why login/signup showed "the platform isn't fully
 * connected yet" while the server worked fine.
 *
 * Server-only secrets are read inside getters. Dynamic access is safe
 * there because they only ever run in the Node.js runtime. Do not move
 * a NEXT_PUBLIC_* value into a getter, and do not read a public value
 * through a helper with a variable key.
 */

export const env = {
  // ---- Public (inlined into the client bundle at BUILD time) ----
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,

  // ---- Server-only secrets (dynamic runtime access is fine here) ----
  serviceRoleKey: () => readServer("SUPABASE_SERVICE_ROLE_KEY"),

  gatewayUrl: () => readServer("AEVIBRON_GATEWAY_URL"),
  gatewayApiKey: () => readServer("AEVIBRON_API_KEY"),
  gatewayChatPath: () => readServer("AEVIBRON_CHAT_PATH") ?? "/api/v1/chat",
  gatewayStatusPath: () => readServer("AEVIBRON_STATUS_PATH") ?? "/api/v1/status",
  gatewayTimeoutMs: () => Number(readServer("AEVIBRON_TIMEOUT_MS") ?? 45_000),

  cronSecret: () => readServer("CRON_SECRET"),

  // ---- Operations console (single administrator, env-only) ----
  // The console lives at /{ADMIN_ROUTE_PATH}/… — no /admin route
  // exists anywhere in the app. Credentials live ONLY in these
  // variables (Vercel → Environment Variables); there is no
  // administrator account in the database and no fallback.
  adminRoutePath: () => readServer("ADMIN_ROUTE_PATH"),
  adminEmail: () => readServer("ADMIN_EMAIL"),
  adminPassword: () => readServer("ADMIN_PASSWORD"),
  adminSessionSecret: () => readServer("ADMIN_SESSION_SECRET"),

  // ---- Support ----
  // Optional webhook (Discord/Slack/custom) pinged when a new
  // support ticket arrives so the team can react instantly.
  supportWebhookUrl: () => readServer("SUPPORT_WEBHOOK_URL"),

  vapidPrivateKey: () => readServer("VAPID_PRIVATE_KEY"),
  vapidSubject: () => readServer("VAPID_SUBJECT") ?? "mailto:admin@example.com",

  digestSendHourUtc: () => Number(readServer("DIGEST_SEND_HOUR_UTC") ?? 18),
} as const;

function readServer(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function isGatewayConfigured(): boolean {
  return Boolean(env.gatewayUrl() && env.gatewayApiKey());
}

export function isPushConfigured(): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey());
}
