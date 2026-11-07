// A band fill is the one thing a lightweight-charts line series cannot draw: it has a stroke, not a
// ribbon. This series primitive paints the polygon between two of a study's own lines with the
// chart's live coordinate conversion, so it follows pan and zoom without a React re-render and
// without a second copy of the data in the DOM.

import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
    IPrimitivePaneRenderer,
    IPrimitivePaneView,
    ISeriesPrimitive,
    SeriesAttachedParameter,
    SeriesType,
    Time,
} from 'lightweight-charts';
import type { BandPoint } from '@/lib/chart-studies';

export class BandFillPrimitive implements ISeriesPrimitive<Time> {
    private chart: SeriesAttachedParameter<Time, SeriesType>['chart'] | null = null;
    private series: SeriesAttachedParameter<Time, SeriesType>['series'] | null = null;
    private readonly view: IPrimitivePaneView;
    private readonly renderer: IPrimitivePaneRenderer;

    constructor(
        private readonly segments: readonly BandPoint[][],
        private readonly color: string,
        private readonly opacity: number,
    ) {
        // One renderer for the life of the primitive: the library caches these by reference.
        this.renderer = { draw: (target) => this.draw(target) };
        this.view = {
            // Behind the candles: a channel is context, not a thing to read through.
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
    }

    paneViews(): readonly IPrimitivePaneView[] {
        return [this.view];
    }

    private draw(target: CanvasRenderingTarget2D): void {
        const chart = this.chart;
        const series = this.series;
        if (!chart || !series || this.segments.length === 0) return;
        const timeScale = chart.timeScale();

        target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio: hx, verticalPixelRatio: vy }) => {
            context.fillStyle = this.color;
            context.globalAlpha = this.opacity;
            for (const segment of this.segments) {
                // Project both edges together: a point that cannot be placed on either axis is left
                // out of the polygon rather than closing it against the wrong bar.
                const top: { x: number; y: number }[] = [];
                const bottom: { x: number; y: number }[] = [];
                for (const point of segment) {
                    const x = timeScale.timeToCoordinate(point.time as Time);
                    const upper = series.priceToCoordinate(point.upper);
                    const lower = series.priceToCoordinate(point.lower);
                    if (x == null || upper == null || lower == null) continue;
                    top.push({ x: x * hx, y: upper * vy });
                    bottom.push({ x: x * hx, y: lower * vy });
                }
                if (top.length < 2) continue;

                context.beginPath();
                context.moveTo(top[0].x, top[0].y);
                for (let i = 1; i < top.length; i += 1) context.lineTo(top[i].x, top[i].y);
                for (let i = bottom.length - 1; i >= 0; i -= 1) context.lineTo(bottom[i].x, bottom[i].y);
                context.closePath();
                context.fill();
            }
            context.globalAlpha = 1;
        });
    }
}
