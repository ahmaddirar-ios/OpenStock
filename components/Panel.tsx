import React from "react";
import { cn } from "@/lib/utils";

type PanelProps = {
    title?: string;
    sub?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
    bodyClassName?: string;
    /**
     * Terminal density: a 30px header, 11px title, no hatch texture, no subtitle. For screens that
     * are read all day — the overview — where a 44px header on every panel is furniture, not
     * information. Pages that are read once keep the roomy shell.
     */
    dense?: boolean;
    children: React.ReactNode;
};

// Concentric hatch shell: a recessed hatched frame holding one raised card.
const Panel = ({ title, sub, action, className, bodyClassName, dense = false, children }: PanelProps) => (
    <section className={cn('hatch', dense && 'is-dense', className)}>
        {title && (
            <div className="section-head">
                <div className="min-w-0">
                    <h2 className="section-title">{title}</h2>
                    {sub && <p className="section-sub">{sub}</p>}
                </div>
                {action}
            </div>
        )}
        <div className={cn('card', bodyClassName)}>{children}</div>
    </section>
);

export default Panel;
