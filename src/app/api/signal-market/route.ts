import { NextResponse } from "next/server";

const SIGNAL_AGENT_URL = process.env.SIGNAL_AGENT_URL ?? "http://localhost:3001";

export async function GET() {
  try {
    const res = await fetch(`${SIGNAL_AGENT_URL}/v1/status`, {
      signal: AbortSignal.timeout(3_000),
      cache:  "no-store",
    });
    if (!res.ok) throw new Error("offline");
    const data = await res.json();
    return NextResponse.json({ online: true, ...data }, {
      headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" },
    });
  } catch (err: any) {
    return NextResponse.json({ online: false, debug: String(err?.message ?? err), url: SIGNAL_AGENT_URL }, {
      headers: { "Cache-Control": "public, s-maxage=10" },
    });
  }
}
