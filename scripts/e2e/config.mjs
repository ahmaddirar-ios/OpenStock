/**
 * Shared settings for the trader sweep (scripts/e2e/*.mjs).
 *
 * The sweep drives a real browser against a running server and a *disposable* review account:
 * every script creates records (positions, trades, alerts, saved strategies, watchlist rows) and
 * removes them again, so it must never be pointed at an account or database that matters.
 *
 * Environment:
 *   E2E_BASE_URL   where the app is running            (default http://localhost:3000)
 *   E2E_EMAIL      review account e-mail               (required)
 *   E2E_PASSWORD   review account password             (required)
 *   E2E_LANG       UI language, `en` or `ar`           (default en)
 *   E2E_CHROMIUM   path to a Chromium/Chrome binary    (optional; auto-detected otherwise)
 */
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

export const BASE = process.env.E2E_BASE_URL || 'http://localhost:3000';
export const EMAIL = process.env.E2E_EMAIL;
export const PASSWORD = process.env.E2E_PASSWORD;
export const LANG = process.env.E2E_LANG || 'en';

if (!EMAIL || !PASSWORD) {
    console.error('Set E2E_EMAIL and E2E_PASSWORD to a disposable review account before running the sweep.');
    process.exit(2);
}

// playwright-core ships no browser. Use one Playwright already downloaded, or E2E_CHROMIUM.
export function resolveChromium() {
    if (process.env.E2E_CHROMIUM && fs.existsSync(process.env.E2E_CHROMIUM)) return process.env.E2E_CHROMIUM;
    const roots = [
        process.env.PLAYWRIGHT_BROWSERS_PATH,
        path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright'),
        path.join(os.homedir(), '.cache', 'ms-playwright'),
    ].filter(Boolean);
    const layouts = [
        'chrome-headless-shell-mac-arm64/chrome-headless-shell',
        'chrome-headless-shell-mac-x64/chrome-headless-shell',
        'chrome-headless-shell-linux64/chrome-headless-shell',
        'chrome-linux/chrome',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    ];
    for (const root of roots) {
        if (!fs.existsSync(root)) continue;
        const builds = fs.readdirSync(root).filter((name) => name.startsWith('chromium')).sort().reverse();
        for (const build of builds) {
            for (const layout of layouts) {
                const candidate = path.join(root, build, layout);
                if (fs.existsSync(candidate)) return candidate;
            }
        }
    }
    return undefined; // let Playwright try its own resolution
}
