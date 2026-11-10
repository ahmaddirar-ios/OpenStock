import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

// FIX: Set Google DNS and force IPv4 to avoid querySrv ECONNREFUSED
import dns from 'dns';
try {
    // This is often more effective than setServers for Node 17+
    if (dns.setDefaultResultOrder) {
        dns.setDefaultResultOrder('ipv4first');
    }
    dns.setServers(['8.8.8.8']);
    console.log('MongoDB: Custom DNS settings applied');
} catch (e) {
    console.error('Failed to set custom DNS:', e);
}

declare global {
    var mongooseCache: {
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
    }
}

let cached = global.mongooseCache;

if (!cached) {
    cached = global.mongooseCache = { conn: null, promise: null };
}

export const connectToDatabase = async () => {
    if (!MONGODB_URI) {
        throw new Error("MongoDB URI is missing");
    }

    if (cached.conn) return cached.conn;

    if (!cached.promise) {
        // A serverless deployment runs many short-lived instances, and each one keeps its own pool.
        // Mongoose's default pool is 100 connections, so a handful of warm instances can exhaust a
        // free Atlas cluster's 500-connection limit and lock the app out. Five per instance is
        // plenty for this workload, and idle sockets are released instead of held open.
        cached.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
            family: 4,
            maxPoolSize: 5,
            minPoolSize: 0,
            maxIdleTimeMS: 30_000,
            serverSelectionTimeoutMS: 10_000,
        });
    }

    try {
        cached.conn = await cached.promise;
    }
    catch (err) {
        cached.promise = null;
        throw err;
    }

    console.log(`MongoDB Connected ${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')} in ${process.env.NODE_ENV}`);
    return cached.conn;
}