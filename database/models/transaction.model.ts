import { Schema, model, models, type Document, type Model } from 'mongoose';

export interface ITransaction extends Document {
    userId: string;
    symbol: string;
    company: string;
    side: 'buy' | 'sell';
    quantity: number;
    /** Price per share, in the quote's own currency. */
    price: number;
    /** Commission for the whole trade, not per share. */
    fee: number;
    tradedAt: Date;
    note: string;
    createdAt: Date;
    updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
    {
        userId: { type: String, required: true, index: true },
        symbol: { type: String, required: true, uppercase: true, trim: true },
        company: { type: String, required: true, trim: true, default: '' },
        side: { type: String, required: true, enum: ['buy', 'sell'] },
        quantity: { type: Number, required: true, min: 0 },
        price: { type: Number, required: true, min: 0 },
        fee: { type: Number, required: true, min: 0, default: 0 },
        tradedAt: { type: Date, required: true, default: Date.now },
        note: { type: String, trim: true, default: '', maxlength: 200 },
    },
    { timestamps: true }
);

// The ledger is always read for one user, oldest-first, and often filtered to one symbol.
TransactionSchema.index({ userId: 1, tradedAt: 1 });
TransactionSchema.index({ userId: 1, symbol: 1, tradedAt: 1 });

export const Transaction: Model<ITransaction> =
    (models?.Transaction as Model<ITransaction>) || model<ITransaction>('Transaction', TransactionSchema);
