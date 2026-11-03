import { ImageResponse } from 'next/og';

export const alt = 'Rovex — a trading terminal for the markets the big platforms skip';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The share card every marketing page and the app inherit. Graphite ground, one lime accent, the
// same three-part shape as the identity: mark, statement, a lime rule with the licence.
export default function OpengraphImage() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    padding: '72px 80px',
                    background: '#0A0D0D',
                    color: '#F2F4F3',
                    fontFamily: 'sans-serif',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <div
                        style={{
                            width: 56, height: 56, borderRadius: 16,
                            border: '3px solid #C9F36A', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                            color: '#C9F36A', fontSize: 38, fontWeight: 800,
                        }}
                    >
                        R
                    </div>
                    <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em' }}>rovex</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <div style={{ fontSize: 78, fontWeight: 800, letterSpacing: '-0.045em', lineHeight: 1.02, maxWidth: 920 }}>
                        The market, unfiltered.
                    </div>
                    <div style={{ fontSize: 30, color: '#9AA3A0', maxWidth: 840, lineHeight: 1.35 }}>
                        Charts, studies, alerts and a paper desk — in Arabic and English, on the markets the big platforms skip.
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 64, height: 6, borderRadius: 3, background: '#C9F36A' }} />
                    <div style={{ fontSize: 24, color: '#6B7370' }}>Arabic-first · bilingual · AGPL-3.0</div>
                </div>
            </div>
        ),
        { ...size }
    );
}
