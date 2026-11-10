import { Schema, model, models, type Document, type Model } from 'mongoose';

// One customer API key. Only the hash is stored: the full key leaves the server once, in the
// response that creates it. `prefix` and `last4` exist so the profile can show which key is which
// without ever holding the secret again. See docs/superpowers/specs/2026-11-09-user-rest-api-design.md.
export interface ApiKeyRow extends Document {
    userId: string;
    /** What the customer called it ("Trading bot", "Sheets script"). */
    name: string;
    /** The visible start, e.g. `rvx_9f2a`. */
    prefix: string;
    /** The last four characters, for recognition. */
    last4: string;
    /** SHA-256 of the full key, hex. The only copy that can authenticate. */
    hash: string;
    /** Incremented by the guard; `lastUsedAt` is throttled. */
    usageCount: number;
    lastUsedAt?: Date;
    revokedAt?: Date;
    /** Optional hard stop. Absent means the key lives until revoked. */
    expiresAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ApiKeySchema = new Schema<ApiKeyRow>(
    {
        userId: { type: String, required: true, index: true, trim: true },
        name: { type: String, required: true, trim: true, maxlength: 60 },
        prefix: { type: String, required: true, index: true, trim: true },
        last4: { type: String, required: true, trim: true },
        hash: { type: String, required: true, unique: true, index: true },
        usageCount: { type: Number, default: 0 },
        lastUsedAt: { type: Date },
        revokedAt: { type: Date },
        expiresAt: { type: Date },
    },
    { timestamps: true, collection: 'api_keys' },
);

export const ApiKey: Model<ApiKeyRow> =
    (models?.ApiKey as Model<ApiKeyRow>) ||
    model<ApiKeyRow>('ApiKey', ApiKeySchema);
