'use server';

// What the site publishes: the notice bar and the waitlist. Reading asks for `content:view`;
// writing asks for `content:manage`. Both read the role from the session, never from the client.

import { revalidatePath } from 'next/cache';
import { connectToDatabase } from '@/database/mongoose';
import { SiteNotice as SiteNoticeModel } from '@/database/models/site-notice.model';
import { Waitlist } from '@/database/models/waitlist.model';
import { requireCapability } from '@/lib/authz-server';
import { EMPTY_NOTICE, normalizeNotice, type SiteNotice } from '@/lib/notice';

export type WaitlistRow = {
    email: string;
    plan: string;
    note: string;
    createdAt: string;
};

export type WaitlistPage = { rows: WaitlistRow[]; total: number; limit: number; offset: number };

/** The notice as stored, whether or not it is live — this is the form's starting point. */
export async function readSiteNotice(): Promise<SiteNotice> {
    await requireCapability('content:view');
    await connectToDatabase();
    const row = await SiteNoticeModel.findOne({ key: 'site' }).lean();
    if (!row) return { ...EMPTY_NOTICE };
    return normalizeNotice({
        messageEn: row.messageEn,
        messageAr: row.messageAr,
        level: row.level,
        href: row.href,
        linkLabelEn: row.linkLabelEn,
        linkLabelAr: row.linkLabelAr,
        active: row.active,
        expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
    });
}

/** Store the notice. The payload is repaired by the same function the renderer uses. */
export async function saveSiteNotice(input: unknown): Promise<SiteNotice> {
    await requireCapability('content:manage');
    const notice = normalizeNotice(input);
    await connectToDatabase();
    await SiteNoticeModel.updateOne(
        { key: 'site' },
        {
            $set: {
                messageEn: notice.messageEn,
                messageAr: notice.messageAr,
                level: notice.level,
                href: notice.href,
                linkLabelEn: notice.linkLabelEn,
                linkLabelAr: notice.linkLabelAr,
                active: notice.active,
                expiresAt: notice.expiresAt ? new Date(notice.expiresAt) : null,
            },
        },
        { upsert: true },
    );
    // The bar lives in the root layout, so the whole shell has to re-render, not just this page.
    revalidatePath('/', 'layout');
    return notice;
}

/** One page of the waitlist, newest first, with an email search. */
export async function listWaitlist(input: { search?: string; offset?: number; limit?: number } = {}): Promise<WaitlistPage> {
    await requireCapability('content:view');
    await connectToDatabase();
    const limit = Math.min(100, Math.max(1, Math.floor(input.limit ?? 25)));
    const offset = Math.max(0, Math.floor(input.offset ?? 0));
    const search = typeof input.search === 'string' ? input.search.trim().slice(0, 120) : '';
    const filter = search ? { email: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};

    const [rows, total] = await Promise.all([
        Waitlist.find(filter, { email: 1, plan: 1, note: 1, createdAt: 1 }).sort({ createdAt: -1 }).skip(offset).limit(limit).lean(),
        Waitlist.countDocuments(filter),
    ]);

    return {
        rows: rows.map((row) => ({
            email: row.email,
            plan: row.plan ?? 'cloud',
            note: row.note ?? '',
            createdAt: new Date(row.createdAt).toISOString(),
        })),
        total,
        limit,
        offset,
    };
}
