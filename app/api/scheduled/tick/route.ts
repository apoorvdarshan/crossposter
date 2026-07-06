import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/request-origin";
import { ensureSchedulerStarted, runScheduledTick } from "@/lib/scheduler";

export const runtime = "nodejs";
export const maxDuration = 900;

async function tick(request: Request) {
  const tickUrl = new URL("/api/scheduled/tick", requestOrigin(request)).toString();

  ensureSchedulerStarted(tickUrl);

  return NextResponse.json({
    ok: true,
    ...(await runScheduledTick(tickUrl))
  });
}

export function GET(request: Request) {
  return tick(request);
}

export function POST(request: Request) {
  return tick(request);
}
