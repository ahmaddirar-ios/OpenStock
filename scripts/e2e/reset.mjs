/**
 * Clears everything the trader sweep leaves behind on the review account, so the suites start from
 * a known-empty state and a failed run does not poison the next one. Reads MONGODB_URI from .env.
 *
 * It deletes only the E2E_EMAIL account's own rows (plus the shared rate-limit buckets, which are
 * per-IP and would otherwise block the next sign-in). Never run it against a database that matters.
 */
import 'dotenv/config';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
const email = process.env.E2E_EMAIL;
if (!uri || !email) {
    console.error('Set MONGODB_URI (in .env) and E2E_EMAIL before running the reset.');
    process.exit(2);
}

const OWNED = ['positions', 'transactions', 'portfoliocashes', 'alerts', 'watchlists', 'watchlistlists', 'customstrategies', 'chartsetups', 'dashboardlayouts', 'formulas', 'apikeys', 'api_keys', 'pushsubscriptions'];

const client = new MongoClient(uri);
try {
    await client.connect();
    const db = client.db();
    const user = await db.collection('user').findOne({ email });
    if (!user) {
        console.error(`No account for ${email} — seed the review account first.`);
        process.exit(2);
    }
    const userId = String(user._id);
    for (const name of OWNED) {
        const result = await db.collection(name).deleteMany({ userId });
        if (result.deletedCount) console.log(`${name}: removed ${result.deletedCount}`);
    }
    await db.collection('rate_limits').deleteMany({});
    console.log(`reset ${email} (${userId}); rate limits cleared`);
} finally {
    await client.close();
}
