import { Schema, model, models, type Document, type Model } from 'mongoose';

// One row per company in the screener universe. Metadata is static (from the directories); only the
// prices are refreshed, so a refresh is an upsert of price/change while the labels stay put.
export interface IScreenerRow extends Document {
    symbol: string;
    name: string;
    nameAr?: string;
    market: 'us' | 'sa';
    sector: string;
    exchange: string;
    indexes: string[];
    price: number;
    changePercent: number;
    currency: string;
    marketCap: number;
    peRatio: number | null;
    valueTraded: number;
    updatedAt: Date;
}

const ScreenerRowSchema = new Schema<IScreenerRow>(
    {
        symbol: { type: String, required: true, unique: true, index: true },
        name: { type: String, required: true },
        nameAr: { type: String },
        market: { type: String, enum: ['us', 'sa'], required: true },
        sector: { type: String, default: '' },
        exchange: { type: String, default: '' },
        indexes: { type: [String], default: [] },
        price: { type: Number, default: 0 },
        changePercent: { type: Number, default: 0 },
        currency: { type: String, default: 'USD' },
        marketCap: { type: Number, default: 0 },
        peRatio: { type: Number, default: null },
        valueTraded: { type: Number, default: 0 },
        updatedAt: { type: Date, default: Date.now },
    },
    { timestamps: false }
);

export const ScreenerRowModel: Model<IScreenerRow> =
    (models?.ScreenerRow as Model<IScreenerRow>) || model<IScreenerRow>('ScreenerRow', ScreenerRowSchema);
