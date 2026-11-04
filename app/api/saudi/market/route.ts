import { NextResponse } from "next/server";
import { getSession } from "@/lib/better-auth/auth";
import { loadSaudiBoard } from "@/lib/saudi-board";
import { clientIp, isRateLimited } from "@/lib/rate-limit";

// The Saudi board polls this while the Riyadh session runs. Two scanner calls per minute behind a
// shared cache, so the limit is about stopping a script, not about the quota.
export async function GET() {
    const session = await getSession();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (await isRateLimited(`saudi-board:ip:${await clientIp()}`, 120, 60)) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    return NextResponse.json(await loadSaudiBoard(), { headers: { "Cache-Control": "private, max-age=30" } });
}
