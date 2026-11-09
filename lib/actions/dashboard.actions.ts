'use server';

import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/database/mongoose';
import { DashboardLayout } from '@/database/models/dashboard.model';
import { requireUserId } from '@/lib/better-auth/auth';
import { DEFAULT_LAYOUT, normalizeLayout, type DashboardLayout as Layout } from '@/lib/dashboard';

/** The signed-in user's board, repaired against the current catalogue. */
export async function getDashboardLayout(): Promise<Layout> {
    const userId = await requireUserId();
    await connectToDatabase();
    const row = await DashboardLayout.findOne({ userId }).lean();
    return row ? normalizeLayout({ order: row.order, hidden: row.hidden }) : { ...DEFAULT_LAYOUT, order: [...DEFAULT_LAYOUT.order], hidden: [] };
}

/** Save the board. The input is untrusted, so it goes through the same repair as a stored row. */
export async function saveDashboardLayout(input: unknown): Promise<Layout> {
    const userId = await requireUserId();
    const layout = normalizeLayout(input);
    await connectToDatabase();
    await DashboardLayout.updateOne(
        { userId },
        { $set: { order: layout.order, hidden: layout.hidden } },
        { upsert: true },
    );
    revalidatePath('/dashboard');
    return layout;
}
