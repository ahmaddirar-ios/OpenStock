// The Line Break boxes as a lightweight-charts custom series: one vertical bar per box, from the
// previous level to the new one, green upwards and red downwards.

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
import type { LineBreakPoint } from '@/lib/chart-linebreak';

export type LineBreakDatum = LineBreakPoint & CustomData<Time>;

class LineBreakRenderer implements ICustomSeriesPaneRenderer {
    private data: PaneRendererCustomData<Time, LineBreakDatum> | null = null;

    update(data: PaneRendererCustomData<Time, LineBreakDatum>): void {
        this.data = data;
    }

    draw(target: CanvasRenderingTarget2D, priceToY: PriceToCoordinateConverter): void {
        const data = this.data;
        if (!data || data.bars.length < 2) return;
        const bars = data.bars;

        target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio: hx, verticalPixelRatio: vy }) => {
            context.lineCap = 'butt';
            context.lineWidth = 2 * hx;
            for (let i = 1; i < bars.length; i += 1) {
                const previous = bars[i - 1];
                const current = bars[i];
                const from = priceToY(previous.originalData.price);
                const to = priceToY(current.originalData.price);
                if (from == null || to == null) continue;
                context.strokeStyle = current.originalData.up ? '#26A69A' : '#EF5350';
                context.beginPath();
                context.moveTo(current.x * hx, from * vy);
                context.lineTo(current.x * hx, to * vy);
                context.stroke();
            }
        });
    }
}

export class LineBreakPaneView implements ICustomSeriesPaneView<Time, LineBreakDatum, CustomSeriesOptions> {
    private readonly rendererInstance = new LineBreakRenderer();

    renderer(): ICustomSeriesPaneRenderer {
        return this.rendererInstance;
    }

    update(data: PaneRendererCustomData<Time, LineBreakDatum>): void {
        this.rendererInstance.update(data);
    }

    priceValueBuilder(row: LineBreakDatum): CustomSeriesPricePlotValues {
        return [row.price, row.price, row.price];
    }

    isWhitespace(data: LineBreakDatum | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
        return typeof (data as LineBreakDatum).price !== 'number';
    }

    defaultOptions(): CustomSeriesOptions {
        return { color: '#26A69A', priceLineVisible: false, lastValueVisible: false } as CustomSeriesOptions;
    }
}
