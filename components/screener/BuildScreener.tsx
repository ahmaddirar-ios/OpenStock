"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Database } from "lucide-react";
import Panel from "@/components/Panel";
import { tx, arDigits, type Lang } from "@/lib/i18n";
import { runRefresh, type RefreshState } from "./runRefresh";

// Shown while the snapshot is empty: it walks the universe once, then reloads the screen.
export default function BuildScreener({ lang }: { lang: Lang }) {
    const router = useRouter();
    const [state, setState] = useState<RefreshState>({ done: 0, total: 0, priced: 0, running: true });
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        started.current = true;
        let cancelled = false;
        runRefresh(setState, () => cancelled)
            .then(() => { if (!cancelled) router.refresh(); })
            .catch((error) => { console.error(error); setState((s) => ({ ...s, running: false })); });
        return () => { cancelled = true; };
    }, [router]);

    const percent = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0;

    return (
        <Panel title={tx(lang, 'scr.buildTitle')} sub={tx(lang, 'scr.buildSub')} className="self-start">
            <div className="flex flex-col gap-4 p-4">
                <p className="flex items-center gap-2 text-[13.5px] text-muted-foreground">
                    <Database className="size-4" />
                    {state.running ? tx(lang, 'scr.building') : tx(lang, 'scr.built')}
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-hover">
                    <span className="block h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${Math.max(2, percent)}%` }} />
                </div>
                <p className="num text-[12.5px] text-faint">
                    {arDigits(state.done, lang)} / {arDigits(state.total, lang)} · {arDigits(percent, lang)}%
                </p>
            </div>
        </Panel>
    );
}
