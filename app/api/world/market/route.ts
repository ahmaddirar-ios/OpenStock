import { NextResponse } from "next/server";
import { getSession } from "@/lib/better-auth/auth";
import { loadWorldBoard } from "@/lib/world-board";
import { clientIp, isRateLimited } from "@/lib/rate-limit";

// The sections board polls this. One scanner call per minute behind a shared cache, so the limit is
// about stopping a script, not about the quota.
export async function GET() {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (await isRateLimited(`world-board:ip:${await clientIp()}`, 120, 60)) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    return NextResponse.json(await loadWorldBoard(), { headers: { "Cache-Control": "private, max-age=30" } });
}
