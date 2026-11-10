import { getSession } from "@/lib/better-auth/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import AppShell from "@/components/shell/AppShell";
import { searchStocks } from "@/lib/actions/finnhub.actions";
import { getUserWatchlist } from "@/lib/actions/watchlist.actions";
import { getLang } from "@/lib/i18n-server";
import { roleOf } from "@/lib/authz";
import { getActiveNotice } from "@/lib/notice-server";
import { accessFor } from "@/lib/entitlements-server";
import { PAGE_FEATURE } from "@/lib/plans";

const Layout = async ({ children }: { children: React.ReactNode }) => {
    const session = await getSession();

    if (!session?.user) redirect('/sign-in');

    const user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
    }
    const role = roleOf(session.user as { role?: string | null });

    const [initialStocks, watchlist, notice, access, requestHeaders] = await Promise.all([
        searchStocks(),
        getUserWatchlist(),
        getActiveNotice(),
        accessFor(session.user.id),
        headers(),
    ]);
    const lang = await getLang();

    // The page guard belongs here, above the route's `loading.tsx` boundary, so a locked page answers
    // with a real 307 before any HTML is streamed. Doing it in the page instead makes Next emit a
    // client meta redirect after streaming, which races the shell's Server Actions and crashes the
    // router (React error #310). The proxy puts the pathname on the request for exactly this check.
    const gated = PAGE_FEATURE[requestHeaders.get('x-pathname') ?? ''];
    if (gated && !access.features.includes(gated)) redirect('/tools?locked=' + encodeURIComponent(gated));

    return (
        <>
            <AppShell
                user={user}
                watchlist={watchlist.map(({ symbol, company }: { symbol: string; company: string }) => ({ symbol, company }))}
                initialStocks={initialStocks}
                lang={lang}
                role={role}
                features={access.features}
                notice={notice}
            >
                {children}
            </AppShell>
        </>
    )
}
export default Layout
