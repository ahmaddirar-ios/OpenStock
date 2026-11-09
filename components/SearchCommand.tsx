"use client"

import { useEffect, useMemo, useState } from "react"
import { CommandDialog, CommandInput, CommandList } from "@/components/ui/command"
import { ArrowUpRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { searchStocks } from "@/lib/actions/finnhub.actions";
import { useDebounce } from "@/hooks/useDebounce";
import { tx, type Lang, type StringKey } from "@/lib/i18n";
import { saudiSymbolNameAr } from "@/lib/market/saudi-symbols";
import { typeLabel } from "@/lib/i18n";
import { commandPages, commandTools, toolHref, DEFAULT_SYMBOL, LAST_SYMBOL_KEY } from "@/lib/shell/command";
import type { Role } from "@/lib/authz";
import type { Feature } from "@/lib/plans";
import type { ToolEntry } from "@/lib/tools/catalog";
import { toolIcon } from "@/lib/tools/icons";

const OPEN_SEARCH_EVENT = 'open-search';

// Any button can open the one palette mounted in the app shell.
export const openSearch = () => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));

export const SearchButton = ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <button type="button" onClick={openSearch} className={className}>{children}</button>
);

export default function SearchCommand({ initialStocks, lang, role, features, defaultSymbol }: { initialStocks: StockWithWatchlistStatus[]; lang: Lang; role: Role; features: readonly Feature[]; defaultSymbol?: string }) {
    const router = useRouter();
    const [open, setOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState("")
    const [loading, setLoading] = useState(false)
    const [stocks, setStocks] = useState<StockWithWatchlistStatus[]>(initialStocks);
    // The palette starts closed, so render it only after hydration (avoids Radix id mismatches)
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const isSearchMode = !!searchTerm.trim();
    const displayStocks = isSearchMode ? stocks : stocks?.slice(0, 6);
    // Pages answer an empty query (a map of the terminal); tools need something typed.
    const pages = useMemo(() => commandPages(searchTerm, role, features), [searchTerm, role, features]);
    const tools = useMemo(() => commandTools(searchTerm, 12, features), [searchTerm, features]);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                e.preventDefault()
                setOpen(v => !v)
            }
        }
        const onOpen = () => setOpen(true)
        window.addEventListener("keydown", onKeyDown)
        window.addEventListener(OPEN_SEARCH_EVENT, onOpen)
        return () => {
            window.removeEventListener("keydown", onKeyDown)
            window.removeEventListener(OPEN_SEARCH_EVENT, onOpen)
        }
    }, [])

    const handleSearch = async () => {
        if(!isSearchMode) return setStocks(initialStocks);

        setLoading(true)
        try {
            const results = await searchStocks(searchTerm.trim());
            setStocks(results);
        } catch {
            setStocks([])
        } finally {
            setLoading(false)
        }
    }

    const debouncedSearch = useDebounce(handleSearch, 300);

    useEffect(() => {
        debouncedSearch();
    }, [debouncedSearch, searchTerm]);

    const handleSelectStock = () => {
        setOpen(false);
        setSearchTerm("");
        setStocks(initialStocks);
    }

    const chartSymbol = () => {
        try {
            return localStorage.getItem(LAST_SYMBOL_KEY) || defaultSymbol || DEFAULT_SYMBOL;
        } catch {
            return defaultSymbol || DEFAULT_SYMBOL;
        }
    };

    // A tool is an address, not an action: navigate, and the chart applies it on mount.
    const openTool = (entry: ToolEntry) => {
        setOpen(false);
        setSearchTerm("");
        router.push(toolHref(entry, chartSymbol()));
    };

    const openPage = (href: string) => {
        setOpen(false);
        setSearchTerm("");
        router.push(href);
    };

    // Enter takes the first thing that answers, in the palette's own order.
    const onEnter = () => {
        if (tools.length > 0) return openTool(tools[0]);
        if (isSearchMode && pages.length > 0) return openPage(pages[0].href);
    };

    const nothing = !tools.length && !pages.length && !loading && displayStocks?.length === 0;

    if (!mounted) return null;

    return (
        <CommandDialog
            open={open}
            onOpenChange={setOpen}
            className="search-dialog"
            title={tx(lang, 'search.dialogTitle')}
            description={tx(lang, 'search.dialogDesc')}
            closeLabel={tx(lang, 'dialog.close')}
        >
            <div className="search-field">
                <CommandInput
                    value={searchTerm}
                    onValueChange={setSearchTerm}
                    onKeyDown={(event) => { if (event.key === 'Enter') onEnter(); }}
                    placeholder={tx(lang, 'cmd.placeholder')}
                    className="search-input"
                />
                {loading && <Loader2 className="search-loader" />}
            </div>
            <CommandList className="search-list">
                {nothing ? (
                    <div className="search-list-indicator">
                        {tx(lang, 'cmd.empty').replace('{q}', searchTerm.trim())}
                    </div>
                ) : (
                    <ul>
                        {pages.length > 0 && (
                            <>
                                <li className="search-count">{tx(lang, 'cmd.pages')}<span className="num"> · {pages.length}</span></li>
                                {pages.slice(0, isSearchMode ? 4 : 6).map((page) => (
                                    <li key={page.href} className="search-item">
                                        <Link href={page.href} onClick={() => openPage(page.href)} className="search-item-link group">
                                            <page.icon className="size-4 shrink-0 text-faint" />
                                            <span className="flex-1 text-[13px] font-semibold text-brand-ink">{tx(lang, page.labelKey)}</span>
                                            <span dir="ltr" className="mono hidden text-xs text-faint sm:block">{page.href}</span>
                                            <ArrowUpRight className="size-4 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                                        </Link>
                                    </li>
                                ))}
                            </>
                        )}

                        {tools.length > 0 && (
                            <>
                                <li className="search-count">{tx(lang, 'cmd.tools')}<span className="num"> · {tools.length}</span></li>
                                {tools.map((tool) => {
                                    const Icon = toolIcon(tool);
                                    return (
                                    <li key={tool.id} className="search-item">
                                        <button type="button" onClick={() => openTool(tool)} className="search-item-link group w-full text-start">
                                            <Icon className="size-4 shrink-0 text-faint" />
                                            <span dir="auto" className="flex-1 text-[13px] font-semibold text-brand-ink">{tx(lang, tool.nameKey)}</span>
                                            <span className="hidden text-xs text-faint sm:block">
                                                {tx(lang, `tools.family.${tool.family}` as StringKey)}
                                            </span>
                                            <ArrowUpRight className="size-4 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                                        </button>
                                    </li>
                                    );
                                })}
                            </>
                        )}

                        {displayStocks && displayStocks.length > 0 && (
                            <>
                                <li className="search-count">
                                    {tx(lang, 'cmd.stocks')}{isSearchMode ? '' : ` · ${tx(lang, 'search.popular')}`}
                                    <span className="num"> · {displayStocks.length || 0}</span>
                                </li>
                                {displayStocks.map((stock) => (
                                    <li key={stock.symbol} className="search-item">
                                        <Link
                                            href={`/stocks/${stock.symbol}`}
                                            onClick={handleSelectStock}
                                            className="search-item-link group"
                                        >
                                            <span dir="ltr" className="mono w-20 shrink-0 text-[13px] font-semibold text-brand-ink truncate">{stock.symbol}</span>
                                            <span dir="auto" className="search-item-name flex-1">{(lang === 'ar' ? saudiSymbolNameAr(stock.symbol) : null) ?? stock.name}</span>
                                            <span className="hidden sm:block text-xs text-faint truncate max-w-40">{[stock.exchange, typeLabel(lang, stock.type)].filter(Boolean).join(' · ')}</span>
                                            <ArrowUpRight className="size-4 text-faint opacity-0 group-hover:opacity-100 transition-opacity" />
                                        </Link>
                                    </li>
                                ))}
                            </>
                        )}
                    </ul>
                )}
            </CommandList>
        </CommandDialog>
    )
}
