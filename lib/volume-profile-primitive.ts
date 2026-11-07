// The volume profile as a study: volume by price over whatever the trader is looking at, drawn as
// horizontal bars against one edge of the pane. There is no series for this — a profile is not a
// value per bar — so it is a pane primitive that reads the visible range and repaints with it.

import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
    IPrimitivePaneRenderer,
    IPrimitivePaneView,
    ISeriesPrimitive,
    SeriesAttachedParameter,
    SeriesType,
    Time,
} from 'lightweight-charts';
import { volumeProfile } from '@/lib/chart-drawings';
import type { Candle } from '@/lib/yahoo-candles';

type Profile = ReturnType<typeof volumeProfile>;

export class VolumeProfilePrimitive implements ISeriesPrimitive<Time> {
    private chart: SeriesAttachedParameter<Time, SeriesType>['chart'] | null = null;
    private series: SeriesAttachedParameter<Time, SeriesType>['series'] | null = null;
    private readonly view: IPrimitivePaneView;
    private readonly renderer: IPrimitivePaneRenderer;
    // The visible range changes on every pan and zoom, but the profile only has to be recomputed
    // when it lands somewhere new. One frame of a 5,000-bar chart is otherwise 120k bucket updates.
    private cache: { key: string; profile: Profile } | null = null;

    constructor(
        private readonly candles: readonly Candle[],
        private readonly rows: number,
        private readonly valueAreaPercent: number,
        private readonly side: 'left' | 'right',
        private readonly color: string,
    ) {
        this.renderer = { draw: (target) => this.draw(target) };
        this.view = {
            zOrder: () => 'bottom',
            renderer: () => this.renderer,
        };
    }

    attached({ chart, series }: SeriesAttachedParameter<Time, SeriesType>): void {
        this.chart = chart;
        this.series = series;
    }

    detached(): void {
        this.chart = null;
        this.series = null;
        this.cache = null;
    }

    paneViews(): readonly IPrimitivePaneView[] {
        return [this.view];
    }

    /** The profile over the bars on screen now, or null when there is nothing to count. */
    private visibleProfile(): Profile | null {
        const chart = this.chart;
        if (!chart) return null;
        const range = chart.timeScale().getVisibleRange();
        if (!range || typeof range.from !== 'number' || typeof range.to !== 'number') return null;
        const key = `${range.from}:${range.to}:${this.rows}:${this.valueAreaPercent}`;
        if (this.cache?.key !== key) {
            this.cache = {
                key,
                profile: volumeProfile(this.candles, range.from, range.to, this.rows, this.valueAreaPercent / 100),
            };
        }
        return this.cache.profile;
    }

    private draw(target: CanvasRenderingTarget2D): void {
        const series = this.series;
        const profile = this.visibleProfile();
        if (!series || !profile || profile.rows.length === 0 || profile.max <= 0) return;
        const area = profile.valueArea;

        target.useBitmapCoordinateSpace(({ context, bitmapSize, horizontalPixelRatio: hx, verticalPixelRatio: vy }) => {
            // Never more than a quarter of the pane: a profile is a reading aid, not the chart.
            const width = Math.min(bitmapSize.width * 0.22, 130 * hx);
            const right = bitmapSize.width;
            context.fillStyle = this.color;

            for (const row of profile.rows) {
                const top = series.priceToCoordinate(row.price + profile.step / 2);
                const bottom = series.priceToCoordinate(row.price - profile.step / 2);
                if (top == null || bottom == null) continue;
                const length = (row.volume / profile.max) * width;
                if (length < 1) continue;
                // The value area is the band the market agreed on; it reads brighter than the tails.
                const inside = area != null && row.price >= area.low && row.price <= area.high;
                context.globalAlpha = inside ? 0.3 : 0.11;
                const x = this.side === 'right' ? right - length : 0;
                context.fillRect(x, Math.min(top, bottom) * vy, length, Math.max(1, Math.abs(bottom - top) * vy));
            }

            // The point of control: the one price the range traded most.
            if (profile.poc != null) {
                const y = series.priceToCoordinate(profile.poc);
                if (y != null) {
                    context.globalAlpha = 0.8;
                    context.fillRect(this.side === 'right' ? right - width : 0, y * vy, width, Math.max(1, hx));
                }
            }
            context.globalAlpha = 1;
        });
    }
}
