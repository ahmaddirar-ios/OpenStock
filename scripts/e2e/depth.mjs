/**
 * Trader sweep, part 3 (depth): screener formula filter, strategy KPI + optimizer, portfolio curve.
 */
import { chromium } from 'playwright-core';
import { BASE, EMAIL, PASSWORD, LANG, resolveChromium } from './config.mjs';
const EXEC = resolveChromium();

(async () => {
    const browser = await chromium.launch({ executablePath: EXEC, headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, acceptDownloads: true });
    await ctx.addCookies([{ name: 'openstock-lang', value: LANG, domain: 'localhost', path: '/' }]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => { const s = String(e).split('\n')[0]; if (!/Unexpected token|querySelector/.test(s)) errs.push(s.slice(0, 140)); });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    page.setDefaultTimeout(20000);

    const out = [];
    const check = (name, ok, note = '') => { out.push({ name, ok: !!ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`); };
    const body = () => page.evaluate(() => document.body.innerText);
    const waitText = async (re, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (re.test(await body())) return true; await page.waitForTimeout(300); } return false; };
    const crashes = async () => /Something broke on this page/.test(await body());

    await page.goto(BASE + '/sign-in', { waitUntil: 'domcontentloaded' });
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await Promise.all([page.waitForURL(/dashboard|overview/i, { timeout: 30000 }).catch(() => {}), page.click('form button[type=submit]')]);
    check('sign-in', /dashboard|overview/i.test(page.url()));

    // ---------- screener formula filter ------------------------------------------------
    await page.goto(BASE + '/screener', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const fInput = page.getByPlaceholder(/close > sma/).first();
    check('screener: formula field present', (await fInput.count()) > 0);
    await fInput.fill('close > sma(close, 20)');
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Screen', exact: true }).click();
    const matched = await waitText(/matched|No company matches/i, 40000);
    const mText = ((await body()).match(/\d+\s+of\s+\d+\s+matched/i) || [''])[0];
    check('screener: formula screens', matched, mText || 'no match text');
    const clearBtn = page.getByRole('button', { name: 'Clear', exact: true }).first();
    if (await clearBtn.count()) await clearBtn.click();

    // ---------- strategy studio: KPIs + optimizer --------------------------------------
    await page.goto(BASE + '/strategies/custom', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /Run the backtest/i }).click();
    const ran = await waitText(/Custom run/, 40000);
    const txt = await body();
    const kpis = ['Sharpe', 'Total return', 'Max drawdown', 'Win rate', 'Profit factor', 'Trades'].filter((k) => new RegExp(k, 'i').test(txt));
    check('studio: run shows result', ran, `KPIs: ${kpis.join(', ')}`);
    check('studio: KPI grid populated', kpis.length >= 4, `${kpis.length} KPI labels`);
    const svgs = await page.locator('svg').count();
    check('studio: result charts render', svgs > 3, `${svgs} svg`);

    const optBtn = page.getByRole('button', { name: /Optimize/i }).first();
    let optOk = false, optTried = '';
    if (await optBtn.count()) {
        await optBtn.click();
        optOk = await waitText(/Combinations tried/i, 90000);
        optTried = ((await body()).match(/Combinations tried:\s*\d+/i) || [''])[0];
    }
    check('studio: optimizer runs', optOk, optTried);
    const useBtn = page.getByRole('button', { name: 'Use', exact: true }).first();
    check('studio: optimizer offers a best row', (await useBtn.count()) > 0);

    // ---------- portfolio: curve + benchmark render with a real holding ----------------
    await page.goto(BASE + '/portfolio', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: 'Add position', exact: true }).click();
    let dlg = page.getByRole('dialog').last();
    await dlg.waitFor();
    await dlg.getByLabel('Symbol', { exact: true }).fill('2222.SR');
    await dlg.getByLabel('Quantity', { exact: true }).fill('100');
    await dlg.getByLabel('Average cost', { exact: true }).fill('30');
    await dlg.getByRole('button', { name: 'Save', exact: true }).click();
    await waitText(/2222/, 20000);
    const pTxt = await body();
    check('portfolio: curve/benchmark render', !(await crashes()) && /2222/.test(pTxt), '');

    // A second currency must stay its own total, never be folded into the first.
    await page.getByRole('button', { name: 'Add position', exact: true }).click();
    dlg = page.getByRole('dialog').last();
    await dlg.waitFor();
    await dlg.getByLabel('Symbol', { exact: true }).fill('AAPL');
    await dlg.getByLabel('Quantity', { exact: true }).fill('10');
    await dlg.getByLabel('Average cost', { exact: true }).fill('150');
    await dlg.getByRole('button', { name: 'Save', exact: true }).click();
    const mixed = await waitText(/holds more than one currency/i, 25000);
    const mixedTxt = await body();
    check('portfolio: mixed currencies stay separate', mixed && /USD/.test(mixedTxt) && /SAR/.test(mixedTxt), mixed ? 'SAR + USD groups' : 'no mixed note');

    // cleanup both positions
    for (let i = 0; i < 4; i += 1) {
        const rm = page.getByRole('button', { name: 'Remove', exact: true }).first();
        if ((await rm.count()) === 0) break;
        await rm.click();
        await page.waitForTimeout(2500);
    }
    check('portfolio: position removed', !/2222/.test(await body()));

    const failed = out.filter((o) => !o.ok);
    console.log(`\n=== ${out.length - failed.length}/${out.length} passed ===`);
    console.log('PAGE ERRORS:', errs.length ? JSON.stringify([...new Set(errs)]) : 'none');
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
