import { Schema, model, models, type Document, type Model } from 'mongoose';

// One row per person waiting for Rovex Cloud. The email is the identity: asking twice is a no-op,
// not a second row, so the form can be re-submitted without punishing the visitor.
export interface WaitlistEntry extends Document {
    email: string;
    plan: string;
    note?: string;
    createdAt: Date;
}

const WaitlistSchema = new Schema<WaitlistEntry>(
    {
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        plan: { type: String, default: 'cloud', trim: true },
        note: { type: String, trim: true, maxlength: 500 },
        createdAt: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

export const Waitlist: Model<WaitlistEntry> =
    (models?.Waitlist as Model<WaitlistEntry>) || model<WaitlistEntry>('Waitlist', WaitlistSchema);
