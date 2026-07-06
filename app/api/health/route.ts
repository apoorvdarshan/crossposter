import { NextResponse } from "next/server";
import { requestOrigin } from "@/lib/request-origin";
import { ensureSchedulerStarted } from "@/lib/scheduler";

export function GET(request: Request) {
  ensureSchedulerStarted(new URL("/api/scheduled/tick", requestOrigin(request)).toString());

  return NextResponse.json({
    ok: true,
    app: "crossposter"
  });
}
