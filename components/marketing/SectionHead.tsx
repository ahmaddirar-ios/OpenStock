import { Reveal } from "@/components/motion";

export default function SectionHead({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
    return (
        <Reveal className="mb-8 max-w-2xl">
            <p className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
                <span className="inline-block h-px w-7 bg-brand/70" aria-hidden />
                {kicker}
            </p>
            <h2 className="mt-3 text-[32px] font-bold leading-[1.08] tracking-[-0.04em] md:text-[42px]">{title}</h2>
            {sub && <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">{sub}</p>}
        </Reveal>
    );
}
