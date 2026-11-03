import React from "react";
import { Stagger, StaggerItem } from "@/components/motion";

// Top of every public page: kicker, one headline, one supporting line, optional actions.
// The parts stagger in on mount, so every marketing page opens the same way.
export default function PageHero({ kicker, title, sub, children }: { kicker: string; title: React.ReactNode; sub?: string; children?: React.ReactNode }) {
    return (
        <section className="mx-auto max-w-[1200px] px-5 pt-14 md:pt-20">
            <Stagger>
                <StaggerItem delay={0.02}><p className="kicker text-brand-ink">{kicker}</p></StaggerItem>
                <StaggerItem delay={0.06}><h1 className="mt-3 max-w-3xl text-[40px] font-bold leading-[1.04] tracking-[-0.05em] md:text-[60px]">{title}</h1></StaggerItem>
                {sub && <StaggerItem delay={0.12}><p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-muted-foreground">{sub}</p></StaggerItem>}
                {children && <StaggerItem delay={0.18}><div className="mt-8 flex flex-wrap gap-2">{children}</div></StaggerItem>}
            </Stagger>
        </section>
    );
}
