// The site notice: one line the shell can show above the menu, written from the admin panel.
//
// Client-safe shape and pure validation here; the read lives in `getActiveNotice`, which is called
// only from the server layout. A notice that is off, expired or empty resolves to null, so the shell
// falls back to its own default line.

export const NOTICE_LEVELS = ['info', 'warning', 'danger'] as const;
export type NoticeLevel = (typeof NOTICE_LEVELS)[number];

export type SiteNotice = {
    messageEn: string;
    messageAr: string;
    level: NoticeLevel;
    href: string;
    linkLabelEn: string;
    linkLabelAr: string;
    active: boolean;
    /** ISO string, or null for "does not expire". */
    expiresAt: string | null;
};

export const EMPTY_NOTICE: SiteNotice = {
    messageEn: '',
    messageAr: '',
    level: 'info',
    href: '',
    linkLabelEn: '',
    linkLabelAr: '',
    active: false,
    expiresAt: null,
};

export const isNoticeLevel = (value: unknown): value is NoticeLevel =>
    typeof value === 'string' && (NOTICE_LEVELS as readonly string[]).includes(value);

/** Only an http(s) address, so the notice's link can never be a `javascript:` URL. */
export const safeNoticeHref = (value: unknown): string => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (!raw) return '';
    try {
        const url = new URL(raw, 'https://rovexjo.com');
        return url.protocol === 'http:' || url.protocol === 'https:' ? raw.slice(0, 300) : '';
    } catch {
        return '';
    }
};

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Repair an untrusted notice before it is stored or rendered. */
export function normalizeNotice(input: unknown): SiteNotice {
    const record = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const expires = typeof record.expiresAt === 'string' && record.expiresAt ? new Date(record.expiresAt) : null;
    return {
        messageEn: text(record.messageEn, 240),
        messageAr: text(record.messageAr, 240),
        level: isNoticeLevel(record.level) ? record.level : 'info',
        href: safeNoticeHref(record.href),
        linkLabelEn: text(record.linkLabelEn, 60),
        linkLabelAr: text(record.linkLabelAr, 60),
        active: record.active === true,
        expiresAt: expires && !Number.isNaN(expires.getTime()) ? expires.toISOString() : null,
    };
}

/** Whether a stored notice should be shown at `now`: on, not empty, and not expired. */
export const noticeIsLive = (notice: SiteNotice, now: Date = new Date()): boolean => {
    if (!notice.active) return false;
    if (!notice.messageEn && !notice.messageAr) return false;
    if (notice.expiresAt) {
        const expires = new Date(notice.expiresAt);
        if (!Number.isNaN(expires.getTime()) && expires.getTime() <= now.getTime()) return false;
    }
    return true;
};
