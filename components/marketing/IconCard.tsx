import React from "react";
import type { LucideIcon } from "lucide-react";

// A glass tile holding one card: icon well, title, short body, optional footer (a link or a pill).
export default function IconCard({ icon: Icon, title, children, footer }: { icon: LucideIcon; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
    return (
        <div className="mk-glass flex h-full flex-col gap-3 rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-0.5">
            <span className="bento-ico size-9 bg-brand-soft text-brand-ink"><Icon className="size-[18px]" /></span>
            <h3 className="text-[16px] font-bold tracking-[-0.02em]">{title}</h3>
            <div className="text-[14px] leading-relaxed text-muted-foreground">{children}</div>
            {footer && <div className="mt-auto pt-1">{footer}</div>}
        </div>
    );
}
