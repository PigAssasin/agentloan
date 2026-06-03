import { NextResponse } from "next/server";

const SIGNAL_AGENT_URL = process.env.SIGNAL_AGENT_URL ?? "http://localhost:3001";

export async function GET() {
  try {
    const res = await fetch(`${SIGNAL_AGENT_URL}/v1/coordinator`, {
      signal: AbortSignal.timeout(4_000),
      cache:  "no-store",
    });
    if (!res.ok) throw new Error("offline");
    const data = await res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
    });
  } catch {
    return NextResponse.json({ active: false }, {
      headers: { "Cache-Control": "public, s-maxage=15" },
    });
  }
}
