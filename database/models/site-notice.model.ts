import { Schema, model, models, type Document, type Model } from 'mongoose';

// The one line the shell shows above the menu. A single row keyed `site` — there is one site, so
// there is one notice; the row being absent or inactive means the shell shows its own default.
export interface SiteNoticeRow extends Document {
    key: string;
    messageEn: string;
    messageAr: string;
    level: 'info' | 'warning' | 'danger';
    href: string;
    linkLabelEn: string;
    linkLabelAr: string;
    active: boolean;
    expiresAt: Date | null;
    updatedAt: Date;
}

export const NOTICE_LEVELS = ['info', 'warning', 'danger'] as const;

const SiteNoticeSchema = new Schema<SiteNoticeRow>(
    {
        key: { type: String, required: true, unique: true, default: 'site' },
        messageEn: { type: String, default: '', maxlength: 240 },
        messageAr: { type: String, default: '', maxlength: 240 },
        level: { type: String, enum: NOTICE_LEVELS, default: 'info' },
        href: { type: String, default: '', maxlength: 300 },
        linkLabelEn: { type: String, default: '', maxlength: 60 },
        linkLabelAr: { type: String, default: '', maxlength: 60 },
        active: { type: Boolean, default: false },
        expiresAt: { type: Date, default: null },
    },
    { timestamps: true },
);

export const SiteNotice: Model<SiteNoticeRow> =
    (models?.SiteNotice as Model<SiteNoticeRow>) || model<SiteNoticeRow>('SiteNotice', SiteNoticeSchema);
