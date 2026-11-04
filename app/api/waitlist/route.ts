import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/database/mongoose";
import { Waitlist } from "@/database/models/waitlist.model";
import { clientIp, isRateLimited } from "@/lib/rate-limit";
import { isWaitlistEmail, normalizeWaitlistEmail } from "@/lib/waitlist";

export async function POST(req: NextRequest) {
    // Five sign-ups an hour per address is far more than a person needs and far less than a script wants.
    if (await isRateLimited(`waitlist:ip:${await clientIp()}`, 5, 3600)) {
        return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
    }

    let body: { email?: unknown; plan?: unknown; note?: unknown };
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    if (!isWaitlistEmail(body.email)) {
        return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
    }
    const email = normalizeWaitlistEmail(body.email);

    const plan = typeof body.plan === "string" && body.plan.trim() ? body.plan.trim().slice(0, 40) : "cloud";
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : undefined;

    try {
        await connectToDatabase();
        // Idempotent: a second attempt updates nothing, so the visitor always sees the same answer.
        await Waitlist.updateOne(
            { email },
            { $setOnInsert: { email, plan, ...(note ? { note } : {}), createdAt: new Date() } },
            { upsert: true },
        );
    } catch (e) {
        console.error('waitlist signup failed', e);
        return NextResponse.json({ error: "Could not save your address. Try again in a minute." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
}
