import { handleRoute, jsonOk, jsonError, verifyCronAuth } from "@/lib/api";
import { processQueue } from "@/lib/ai/queue-processor";
import type { NextResponse } from "next/server";

/**
 * /api/cron/queue-process — drains the durable AI queue (retryable gateway
 * failures). Short runtime: one batch per invocation.
 */

async function run(req: Request): Promise<NextResponse> {
  if (!verifyCronAuth(req)) return jsonError("Unauthorized", 401);
  return handleRoute(async () => jsonOk(await processQueue()));
}

export async function GET(req: Request): Promise<NextResponse> {
  return run(req);
}

export async function POST(req: Request): Promise<NextResponse> {
  return run(req);
}
