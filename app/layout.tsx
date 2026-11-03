import type { Metadata } from "next";
import { Inter, IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import {Toaster} from "@/components/ui/sonner";
import { getLang } from "@/lib/i18n-server";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const arabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Rovex — the market, unfiltered",
    template: "%s · Rovex",
  },
  description:
    "Rovex is a trading terminal for the exchanges the big platforms leave out: professional charts, studies, alerts and a paper-trading desk, in Arabic and English.",
  applicationName: "Rovex",
  openGraph: {
    title: "Rovex — the market, unfiltered",
    description: "Professional charts, studies and alerts for every market, in Arabic and English.",
    siteName: "Rovex",
    type: "website",
  },
};

export default async function RootLayout({
                                       children,
                                   }: Readonly<{
    children: React.ReactNode;
}>) {
    const lang = await getLang();
    return (
        <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} className="dark" suppressHydrationWarning>
            <body
                className={`${inter.variable} ${arabic.variable} ${plexMono.variable} font-sans antialiased`}
            >
                {children}
                <Toaster/>
                <Analytics />
            </body>
        </html>
    );
}
