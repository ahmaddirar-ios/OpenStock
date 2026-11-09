import { Schema, model, models, type Document, type Model } from 'mongoose';

// One row per user: the order of the overview board and the widgets they put away. The row is a
// preference, not a record — a missing row means the default layout, and the action repairs
// anything stale before it reaches the page.
export interface DashboardLayoutRow extends Document {
    userId: string;
    order: string[];
    hidden: string[];
    updatedAt: Date;
}

const DashboardLayoutSchema = new Schema<DashboardLayoutRow>(
    {
        userId: { type: String, required: true, unique: true, index: true },
        order: { type: [String], default: [] },
        hidden: { type: [String], default: [] },
    },
    { timestamps: true },
);

export const DashboardLayout: Model<DashboardLayoutRow> =
    (models?.DashboardLayout as Model<DashboardLayoutRow>) ||
    model<DashboardLayoutRow>('DashboardLayout', DashboardLayoutSchema);
