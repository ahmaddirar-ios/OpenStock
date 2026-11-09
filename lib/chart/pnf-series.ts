// Point & Figure as a lightweight-charts custom series: one column of X's or O's per datum.
//
// The glyphs are drawn in the bitmap coordinate space with the chart's own price scale, so a box is
// exactly one box tall whatever the pane's size — which is the whole promise of the chart type.

import type {
    CustomData,
    CustomSeriesOptions,
    CustomSeriesPricePlotValues,
    CustomSeriesWhitespaceData,
    ICustomSeriesPaneRenderer,
    ICustomSeriesPaneView,
    PaneRendererCustomData,
    PriceToCoordinateConverter,
    Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { PnfColumn } from '@/lib/chart/pnf';

export type PnfDatum = PnfColumn & CustomData<Time>;

class PnfRenderer implements ICustomSeriesPaneRenderer {
    private data: PaneRendererCustomData<Time, PnfDatum> | null = null;

    update(data: PaneRendererCustomData<Time, PnfDatum>): void {
        this.data = data;
    }

    draw(target: CanvasRenderingTarget2D, priceToY: PriceToCoordinateConverter): void {
        const data = this.data;
        if (!data || data.bars.length === 0) return;

        target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio: hx, verticalPixelRatio: vy }) => {
            context.lineWidth = Math.max(1, 1.5 * hx);
            context.lineJoin = 'round';
            context.lineCap = 'round';

            for (const bar of data.bars) {
                const column = bar.originalData;
                if (!column || !Number.isFinite(column.box) || column.box <= 0) continue;
                if (!Number.isFinite(column.from) || !Number.isFinite(column.to)) continue;

                const low = Math.min(column.from, column.to);
                const high = Math.max(column.from, column.to);
                const boxes = Math.max(1, Math.round((high - low) / column.box));

                const bottomY = priceToY(low);
                const boxY = priceToY(low + column.box);
                if (bottomY == null || boxY == null) continue;

                // One box of height on screen, from the price scale itself, so a glyph is never
                // taller than the box it marks. The bar spacing caps the width the same way.
                const boxPixels = Math.abs(bottomY - boxY) * vy;
                const size = Math.max(1.5, boxPixels * 0.34);
                const x = bar.x * hx;
                context.strokeStyle = column.direction === 'X' ? '#26A69A' : '#EF5350';

                for (let i = 0; i < boxes; i += 1) {
                    const y = priceToY(low + column.box * (i + 0.5));
                    if (y == null) continue;
                    const cy = y * vy;
                    if (column.direction === 'X') {
                        context.beginPath();
                        context.moveTo(x - size * hx, cy - size * hx);
                        context.lineTo(x + size * hx, cy + size * hx);
                        context.moveTo(x + size * hx, cy - size * hx);
                        context.lineTo(x - size * hx, cy + size * hx);
                        context.stroke();
                    } else {
                        context.beginPath();
                        context.arc(x, cy, size * hx, 0, Math.PI * 2);
                        context.stroke();
                    }
                }
            }
        });
    }
}

export class PnfPaneView implements ICustomSeriesPaneView<Time, PnfDatum, CustomSeriesOptions> {
    private readonly rendererInstance = new PnfRenderer();

    renderer(): ICustomSeriesPaneRenderer {
        return this.rendererInstance;
    }

    update(data: PaneRendererCustomData<Time, PnfDatum>): void {
        this.rendererInstance.update(data);
    }

    priceValueBuilder(row: PnfDatum): CustomSeriesPricePlotValues {
        return [row.from, row.to, (row.from + row.to) / 2];
    }

    isWhitespace(data: PnfDatum | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
        return typeof (data as PnfDatum).box !== 'number';
    }

    defaultOptions(): CustomSeriesOptions {
        return { color: '#26A69A', priceLineVisible: false, lastValueVisible: false } as CustomSeriesOptions;
    }
}
