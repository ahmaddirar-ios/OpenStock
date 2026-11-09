// The Kagi line as a lightweight-charts custom series. A custom series is the only honest way to
// draw it: the shape is a staircase whose segment thickness carries meaning, which no built-in
// line/candle series can express.

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
import type { KagiPoint } from '@/lib/chart/kagi';

/** Kagi data as the library sees it: the price is the level, `yin` decides the stroke. */
export type KagiDatum = KagiPoint & CustomData<Time>;

class KagiRenderer implements ICustomSeriesPaneRenderer {
    private data: PaneRendererCustomData<Time, KagiDatum> | null = null;

    update(data: PaneRendererCustomData<Time, KagiDatum>): void {
        this.data = data;
    }

    draw(target: CanvasRenderingTarget2D, priceToY: PriceToCoordinateConverter): void {
        const data = this.data;
        if (!data || data.bars.length < 2) return;
        const bars = data.bars;

        target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio: hx, verticalPixelRatio: vy }) => {
            context.lineJoin = 'round';
            context.lineCap = 'butt';
            for (let i = 1; i < bars.length; i += 1) {
                const previous = bars[i - 1];
                const current = bars[i];
                const y1 = priceToY(previous.originalData.price);
                const y2 = priceToY(current.originalData.price);
                if (y1 == null || y2 == null) continue;

                // Yin is the thin red line, yang the heavy green one, as on a Kagi chart.
                context.strokeStyle = current.originalData.yin ? '#EF5350' : '#26A69A';
                context.lineWidth = (current.originalData.yin ? 1 : 3) * hx;
                context.beginPath();
                context.moveTo(previous.x * hx, y1 * vy);
                context.lineTo(current.x * hx, y1 * vy);
                context.lineTo(current.x * hx, y2 * vy);
                context.stroke();
            }
        });
    }
}

export class KagiPaneView implements ICustomSeriesPaneView<Time, KagiDatum, CustomSeriesOptions> {
    private readonly rendererInstance = new KagiRenderer();

    renderer(): ICustomSeriesPaneRenderer {
        return this.rendererInstance;
    }

    update(data: PaneRendererCustomData<Time, KagiDatum>): void {
        this.rendererInstance.update(data);
    }

    priceValueBuilder(row: KagiDatum): CustomSeriesPricePlotValues {
        return [row.price, row.price, row.price];
    }

    isWhitespace(data: KagiDatum | CustomSeriesWhitespaceData<Time>): data is CustomSeriesWhitespaceData<Time> {
        return typeof (data as KagiDatum).price !== 'number';
    }

    defaultOptions(): CustomSeriesOptions {
        // Only the two fields the renderer relies on are spelled out; the rest come from the chart.
        return { color: '#26A69A', priceLineVisible: false, lastValueVisible: false } as CustomSeriesOptions;
    }
}
