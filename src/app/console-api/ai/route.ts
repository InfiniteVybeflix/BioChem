import { requireAdminApi } from "@/lib/admin/session";
import { gatewayConfigured } from "@/lib/ai/gateway";
import { runAssistant, assistantRequestSchema } from "@/lib/ai/assistant";

/**
 * Console AI helper — the same writing assistant the lecturers get,
 * reachable from the operations console (announcement drafting and
 * note drafting for the platform).
 */
export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  if (!gatewayConfigured()) {
    return Response.json({ error: "The AI assistant is not configured" }, { status: 503 });
  }

  const parsed = assistantRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 422 });

  try {
    const result = await runAssistant(parsed.data);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The assistant failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
