import {
    Activity,
    AreaChart,
    Asterisk,
    BarChart3,
    Bell,
    Box,
    Brush,
    CandlestickChart,
    Circle,
    Clock,
    Crosshair,
    Divide,
    Equal,
    FunctionSquare,
    Gauge,
    GitBranch,
    GitCompare,
    Grid2x2,
    Hash,
    Landmark,
    LineChart,
    Minus,
    MousePointer2,
    MoveUpRight,
    PenLine,
    Percent,
    Ruler,
    Shapes,
    Sigma,
    Sparkles,
    Square,
    Target,
    TrendingUp,
    Type,
    Waves,
    type LucideIcon,
} from 'lucide-react';
import type { ToolEntry, ToolSectionId } from '@/lib/tools/catalog';

/**
 * One glyph per section, and overrides only where the section's glyph would lie about the tool.
 *
 * Not one hand-picked icon for 127 entries: that is a week of taste for a row that already has its
 * name under the cursor. The section is what a trader recognises at a glance, and an override is
 * for the handful that carry a section's promise alone — the trend line, the fib, the formula.
 */
const SECTION_ICON: Record<ToolSectionId, LucideIcon> = {
    cursor: MousePointer2,
    lines: PenLine,
    fib: Waves,
    gann: Grid2x2,
    patterns: Shapes,
    elliott: TrendingUp,
    forecast: Target,
    shapes: Square,
    annotation: Type,
    brush: Brush,
    'study.overlay': LineChart,
    'study.oscillator': BarChart3,
    'chart.type': CandlestickChart,
    'formula.average': Sigma,
    'formula.stat': Activity,
    'formula.cross': GitCompare,
    'formula.math': Equal,
    'formula.logic': GitBranch,
};

const TOOL_ICON: Record<string, LucideIcon> = {
    // cursor
    select: MousePointer2,
    measure: Ruler,
    // lines
    trend: TrendingUp,
    horizontal: Minus,
    vline: Clock,
    cross: Crosshair,
    ray: MoveUpRight,
    arrow: MoveUpRight,
    info: Hash,
    // fibonacci
    fib: Percent,
    fibext: MoveUpRight,
    fibfan: Waves,
    // gann
    gann: Grid2x2,
    gannfan: Waves,
    gannbox: Box,
    gannsquare: Grid2x2,
    // patterns, elliott and forecast keep their section glyph
    pitchfork: Waves,
    // studies worth their own shape
    volume: BarChart3,
    sma: LineChart,
    ema: LineChart,
    vwap: LineChart,
    rsi: Gauge,
    macd: Activity,
    bb: AreaChart,
    atr: Gauge,
    adx: Gauge,
    obv: BarChart3,
    // chart types
    candles: CandlestickChart,
    line: LineChart,
    area: AreaChart,
    bars: BarChart3,
    heikin: CandlestickChart,
    // formula functions
    smaFn: Sigma,
    abs: Asterisk,
    sqrt: FunctionSquare,
    pow: Sparkles,
    max: MoveUpRight,
    min: MoveUpRight,
    div: Divide,
    mul: Asterisk,
    // pages use Landmark and Bell elsewhere
    saudi: Landmark,
    alerts: Bell,
    circle: Circle,
};

/** The glyph a palette row or a rail row paints for this tool. */
export const toolIcon = (entry: ToolEntry): LucideIcon => TOOL_ICON[entry.key] ?? SECTION_ICON[entry.section];
