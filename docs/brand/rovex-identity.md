# Rovex — identity

## Core

- **Name:** Rovex (روفكس)
- **Desk line:** "The market, unfiltered." — «السوق كما هو، لا كما يُعرض.»
- **Positioning:** a trading terminal for the exchanges the big platforms leave out,
  Arabic-first but bilingual, with charts, studies, alerts and a paper desk.
- **Voice:** calm, precise, numbers before adjectives. No hype, no promises of profit.

## Colour

Two hues carry everything: graphite (neutral hue 240) and Rovex lime (accent hue 124).
Up/down keep the shared lightness/chroma so neither shouts louder.

| Token | Value | Use |
|---|---|---|
| `--page` | `oklch(0.125 0.005 240)` | behind the floated app |
| `--card` | `oklch(0.23 0.007 240)` | raised surfaces |
| `--line` | `oklch(0.285 0.008 240)` | hairlines |
| `--text` | `oklch(0.96 0.004 240)` | body |
| `--brand` | `oklch(0.89 0.18 124)` | fills, icons, active nav |
| `--brand-ink` | `oklch(0.92 0.16 124)` | the only brand colour allowed as text |
| `--on-brand` | `oklch(0.19 0.05 124)` | text on a lime fill |

Signals stay semantic: `--up` green, `--down` red, `--warn` amber.

## Type

- Latin: **Inter** (`--font-inter`), tight tracking on headings.
- Arabic: **IBM Plex Sans Arabic** (`--font-arabic`), weights 400–700.
- Numerals: IBM Plex Mono for prices and tickers (`.mono`, `.num`).

## Mark

An R cut from a rising line inside a 9%-radius square, drawn in SVG
(`components/brand/RovexLogo.tsx`, `app/icon.svg`) so it follows the theme colour and
stays crisp at any size. The wordmark is text, not an image: lowercase `rovex`,
`روفكس` in Arabic.

## Attribution (AGPL-3.0)

`components/brand/FooterCredit.tsx` renders "Powered by OpenStock · AGPL-3.0" with a
link to the upstream source. It appears in the sidebar and in the marketing footer.
The repository stays public; `NOTICE` records the modification and the upstream
copyright. Upstream names and marks are not used as Rovex branding.
