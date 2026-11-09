'use client';

import { useEffect, useState } from "react";
import { isQuoteLive, quoteTtlSeconds } from "@/lib/market/data";

export type LiveQuote = { c?: number; d?: number; dp?: number; h?: number; l?: number; o?: number; pc?: number; t?: number };

// Polls the shared /api/quotes cache while a session is running and the tab is visible.
// When the market is shut (and the symbol isn't crypto) prices come from the server render instead.
export function useLiveQuotes(symbols: string[], intervalMs?: number) {
    const [quotes, setQuotes] = useState<Record<string, LiveQuote | null>>({});
    const key = symbols.join(",");

    useEffect(() => {
        const list = key ? key.split(",") : [];
        if (!list.length || !isQuoteLive(list)) return;
        let cancelled = false;
        // Ask exactly as often as the server is willing to refresh, so a poll never returns the same number.
        const every = intervalMs ?? quoteTtlSeconds(list) * 1000;

        const load = async () => {
            if (document.visibilityState !== "visible") return;
            try {
                const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(key)}`);
                if (res.ok && !cancelled) setQuotes(await res.json());
            } catch { /* keep the last good prices */ }
        };
        const onVisibility = () => { if (document.visibilityState === "visible") load(); };

        load();
        const interval = setInterval(load, every);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            cancelled = true;
            clearInterval(interval);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [key, intervalMs]);

    return quotes;
}
