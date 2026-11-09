import { cache } from 'react';
import { connectToDatabase } from '@/database/mongoose';
import { SiteNotice as SiteNoticeModel } from '@/database/models/site-notice.model';
import { noticeIsLive, normalizeNotice, type SiteNotice } from '@/lib/notice';

/**
 * The notice the shell should render right now, or null. Cached per request, so the layout, the
 * admin page and the notice bar share one read. A failed read is the shell's own default line.
 */
export const getActiveNotice = cache(async (): Promise<SiteNotice | null> => {
    try {
        await connectToDatabase();
        const row = await SiteNoticeModel.findOne({ key: 'site' }).lean();
        if (!row) return null;
        const notice = normalizeNotice({
            messageEn: row.messageEn,
            messageAr: row.messageAr,
            level: row.level,
            href: row.href,
            linkLabelEn: row.linkLabelEn,
            linkLabelAr: row.linkLabelAr,
            active: row.active,
            expiresAt: row.expiresAt ? new Date(row.expiresAt).toISOString() : null,
        });
        return noticeIsLive(notice) ? notice : null;
    } catch {
        return null;
    }
});

/** The stored notice as configured, live or not — what the admin form edits. */
export const getStoredNotice = cache(async (): Promise<SiteNotice | null> => {
    try {
        await connectToDatabase();
        const row = await SiteNoticeModel.findOne({ key: 'site' }).lean();
        if (!row) return null;
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
    } catch {
        return null;
    }
});
