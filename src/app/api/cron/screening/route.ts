import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { runScreeningBatch } from "@/lib/screening/pipeline";
import { isScreeningConfigured } from "@/lib/screening/trigger";

/** Backstop for screening jobs that didn't run on submit. Call with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!secret || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isScreeningConfigured()) return NextResponse.json({ error: "screening not configured" }, { status: 503 });
  const result = await runScreeningBatch(3);
  return NextResponse.json(result);
}
