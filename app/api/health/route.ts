import { NextResponse } from "next/server";
import { ensureSchedulerStarted } from "@/lib/scheduler";

export function GET(request: Request) {
  ensureSchedulerStarted(new URL("/api/scheduled/tick", request.url).toString());

  return NextResponse.json({
    ok: true,
    app: "crossposter"
  });
}
