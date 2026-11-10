import { Schema, model, models, type Document, type Model } from 'mongoose';

export type CashBalance = {
    currency: string;
    amount: number;
};

export interface IPortfolioCash extends Document {
    userId: string;
    /** One entry per currency. Amounts are never added across currencies. */
    balances: CashBalance[];
    createdAt: Date;
    updatedAt: Date;
}

const CashBalanceSchema = new Schema<CashBalance>(
    {
        currency: { type: String, required: true, uppercase: true, trim: true },
        amount: { type: Number, required: true, min: 0 },
    },
    { _id: false }
);

const PortfolioCashSchema = new Schema<IPortfolioCash>(
    {
        userId: { type: String, required: true, index: true, unique: true },
        balances: { type: [CashBalanceSchema], default: [] },
    },
    { timestamps: true }
);

export const PortfolioCash: Model<IPortfolioCash> =
    (models?.PortfolioCash as Model<IPortfolioCash>) || model<IPortfolioCash>('PortfolioCash', PortfolioCashSchema);
