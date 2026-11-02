import { Schema, model, models, type Document, type Model } from 'mongoose';

/**
 * One device that agreed to receive alert notifications. A person may have several (a laptop
 * and a phone), which is why this is a row per subscription rather than a field on the user.
 */
export interface IPushSubscription extends Document {
    userId: string;
    /** The push service's URL for this device; unique, so re-subscribing updates the row. */
    endpoint: string;
    keys: { p256dh: string; auth: string };
    /** The language the notification should be written in. */
    lang: string;
    createdAt: Date;
    updatedAt: Date;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
    {
        userId: { type: String, required: true, index: true },
        endpoint: { type: String, required: true },
        keys: {
            p256dh: { type: String, required: true },
            auth: { type: String, required: true },
        },
        lang: { type: String, default: 'en' },
    },
    { timestamps: true },
);

// One row per device, whoever subscribes it: a browser that re-subscribes updates in place.
PushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });

export const PushSubscription: Model<IPushSubscription> =
    (models?.PushSubscription as Model<IPushSubscription>) || model<IPushSubscription>('PushSubscription', PushSubscriptionSchema);
