import { handleRoute, jsonError, jsonOk, verifyCronAuth } from "@/lib/api";
import { processQueue } from "@/lib/ai/queue-processor";
import type { NextResponse } from "next/server";

/**
 * /api/ai/queue/process — drains due AI queue items.
 * Access: the external cron bearer token (CRON_SECRET) only.
 * Returns { processed, done, retried }.
 */

async function runQueue(req: Request): Promise<NextResponse> {
  if (!verifyCronAuth(req)) {
    return jsonError("Unauthorized", 401);
  }
  return handleRoute(async () => jsonOk(await processQueue()));
}

export async function GET(req: Request): Promise<NextResponse> {
  return runQueue(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return runQueue(req);
}
