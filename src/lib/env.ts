/**
 * Typed, safe environment access.
 *
 * Public values are read directly from process.env (inlined by Next.js).
 * Server-only secrets are exposed through getters so that accidentally
 * importing this file into a client component surfaces the secret at
 * build time rather than silently bundling it.
 */

function readPublic(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  appUrl: readPublic("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000",

  supabaseUrl: readPublic("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: readPublic("NEXT_PUBLIC_SUPABASE_ANON_KEY"),

  serviceRoleKey: () => readPublic("SUPABASE_SERVICE_ROLE_KEY"),

  gatewayUrl: () => readPublic("AEVIBRON_GATEWAY_URL"),
  gatewayApiKey: () => readPublic("AEVIBRON_API_KEY"),
  gatewayChatPath: () => readPublic("AEVIBRON_CHAT_PATH") ?? "/api/v1/chat",
  gatewayStatusPath: () => readPublic("AEVIBRON_STATUS_PATH") ?? "/api/v1/status",
  gatewayTimeoutMs: () => Number(readPublic("AEVIBRON_TIMEOUT_MS") ?? 45_000),

  cronSecret: () => readPublic("CRON_SECRET"),

  // ---- Operations console (single administrator, env-only) ----
  // The console lives at /{ADMIN_ROUTE_PATH}/… — no /admin route
  // exists anywhere in the app. Credentials live ONLY in these
  // variables (Vercel → Environment Variables); there is no
  // administrator account in the database and no fallback.
  adminRoutePath: () => readPublic("ADMIN_ROUTE_PATH"),
  adminEmail: () => readPublic("ADMIN_EMAIL"),
  adminPassword: () => readPublic("ADMIN_PASSWORD"),
  adminSessionSecret: () => readPublic("ADMIN_SESSION_SECRET"),

  // ---- Support ----
  // Optional webhook (Discord/Slack/custom) pinged when a new
  // support ticket arrives so the team can react instantly.
  supportWebhookUrl: () => readPublic("SUPPORT_WEBHOOK_URL"),

  vapidPublicKey: readPublic("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
  vapidPrivateKey: () => readPublic("VAPID_PRIVATE_KEY"),
  vapidSubject: () => readPublic("VAPID_SUBJECT") ?? "mailto:admin@example.com",

  digestSendHourUtc: () => Number(readPublic("DIGEST_SEND_HOUR_UTC") ?? 18),
} as const;

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function isGatewayConfigured(): boolean {
  return Boolean(env.gatewayUrl() && env.gatewayApiKey());
}

export function isPushConfigured(): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey());
}
