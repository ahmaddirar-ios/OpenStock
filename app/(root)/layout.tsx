import { getSession } from "@/lib/better-auth/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/shell/AppShell";
import { searchStocks } from "@/lib/actions/finnhub.actions";
import { getUserWatchlist } from "@/lib/actions/watchlist.actions";
import { getLang } from "@/lib/i18n-server";
import { roleOf } from "@/lib/authz";
import { getActiveNotice } from "@/lib/notice-server";

const Layout = async ({ children }: { children: React.ReactNode }) => {
    const session = await getSession();

    if (!session?.user) redirect('/sign-in');

    const user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
    }
    const role = roleOf(session.user as { role?: string | null });

    const [initialStocks, watchlist, notice] = await Promise.all([
        searchStocks(),
        getUserWatchlist(),
        getActiveNotice(),
    ]);
    const lang = await getLang();

    return (
        <>
            <AppShell
                user={user}
                watchlist={watchlist.map(({ symbol, company }: { symbol: string; company: string }) => ({ symbol, company }))}
                initialStocks={initialStocks}
                lang={lang}
                role={role}
                notice={notice}
            >
                {children}
            </AppShell>
        </>
    )
}
export default Layout
