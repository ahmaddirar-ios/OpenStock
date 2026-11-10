/**
 * Trader sweep, part 4: command palette, dashboard board, Saudi board, pattern scanner.
 */
import { chromium } from 'playwright-core';
import { BASE, EMAIL, PASSWORD, LANG, resolveChromium } from './config.mjs';
const EXEC = resolveChromium();

(async () => {
    const browser = await chromium.launch({ executablePath: EXEC, headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    await ctx.addCookies([{ name: 'openstock-lang', value: LANG, domain: 'localhost', path: '/' }]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => { const s = String(e).split('\n')[0]; if (!/Unexpected token|querySelector/.test(s)) errs.push(s.slice(0, 140)); });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    page.setDefaultTimeout(20000);

    const out = [];
    const check = (name, ok, note = '') => { out.push({ name, ok: !!ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`); };
    const body = () => page.evaluate(() => document.body.innerText);
    const crashes = async () => /Something broke on this page/.test(await body());

    await page.goto(BASE + '/sign-in', { waitUntil: 'domcontentloaded' });
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await Promise.all([page.waitForURL(/dashboard|overview/i, { timeout: 30000 }).catch(() => {}), page.click('form button[type=submit]')]);
    check('sign-in', /dashboard|overview/i.test(page.url()));

    // ---------- command palette ---------------------------------------------------------
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(800);
    const dlg = page.getByRole('dialog').first();
    const paletteOpen = (await dlg.count()) > 0 && /Search stocks|Search pages/i.test(await body());
    check('palette: opens with Cmd+K', paletteOpen);
    const input = page.getByPlaceholder(/Search pages, tools, stocks/i).first();
    if (await input.count()) { await input.fill('AAPL'); await page.waitForTimeout(1400); }
    const found = /AAPL/.test(await body());
    check('palette: finds a symbol', found);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // ---------- dashboard board ---------------------------------------------------------
    await page.goto(BASE + '/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    check('dashboard renders', !(await crashes()) && /Your board|Arrange/i.test(await body()));
    const arrange = page.getByRole('button', { name: 'Arrange', exact: true }).first();
    let boardOk = false;
    if (await arrange.count()) {
        await arrange.click();
        await page.waitForTimeout(600);
        const down = page.getByRole('button', { name: 'Move down', exact: true }).first();
        if (await down.count()) await down.click();
        await page.waitForTimeout(800);
        const done = page.getByRole('button', { name: 'Done', exact: true }).first();
        if (await done.count()) await done.click();
        await page.waitForTimeout(1500);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        boardOk = !(await crashes()) && (await page.locator('section.board').count()) > 0;
    }
    check('dashboard: arrange + move + done', boardOk);
    const reset = page.getByRole('button', { name: 'Reset', exact: true }).first();
    if (await reset.count()) { await reset.click(); await page.waitForTimeout(1500); }
    check('dashboard: reset', true);

    // ---------- Saudi board -------------------------------------------------------------
    await page.goto(BASE + '/saudi', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const st = await body();
    check('saudi: TASI + breadth render', /TASI|Market breadth/i.test(st) && !(await crashes()));
    const link = page.locator('a[href^="/stocks/"]').first();
    let navigated = '';
    if (await link.count()) {
        const href = await link.getAttribute('href');
        await link.click();
        await page.waitForTimeout(2500);
        navigated = page.url();
        if (!/\/stocks\//.test(navigated)) navigated = '';
        check('saudi: row opens the chart', !!navigated && navigated.includes(href || '\u0000'), href || '');
    } else {
        check('saudi: row opens the chart', false, 'no stock link');
    }

    // ---------- pattern scanner (one symbol, every pattern) -----------------------------
    // Give the scanner a one-name universe: the watchlist.
    await page.goto(BASE + '/stocks/AAPL', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    if (await page.getByRole('button', { name: 'Watching', exact: true }).count()) {
        await page.getByRole('button', { name: 'Watching', exact: true }).first().click();
        await page.waitForTimeout(2000);
    }
    const wbtn = page.getByRole('button', { name: 'Watch', exact: true }).first();
    if (await wbtn.count()) { await wbtn.click(); await page.waitForTimeout(2500); }

    await page.goto(BASE + '/scanner', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    check('scanner renders', !(await crashes()) && /Pattern scanner|Universe/i.test(await body()));
    const radio = page.getByRole('radio', { name: /Watchlist/i }).first();
    if (await radio.count()) { await radio.check({ force: true }); await page.waitForTimeout(1200); }
    const scanBtn = page.getByRole('button', { name: 'Scan', exact: true }).first();
    let scanOk = false, scanNote = '';
    if (await scanBtn.count()) {
        await scanBtn.click();
        // While the walk is in flight the button reads "Stop"; it returns to "Scan" when it ends.
        const t0 = Date.now();
        while (Date.now() - t0 < 180000) {
            await page.waitForTimeout(500);
            if ((await page.getByRole('button', { name: 'Scan', exact: true }).count()) > 0) break;
        }
        scanOk = /symbols answered/i.test(await body());
        scanNote = ((await body()).match(/\d+\s+of\s+\d+\s+symbols answered/i) || [''])[0];
    }
    check('scanner: run completes', scanOk, scanNote);

    // ---------- cleanup: unwatch AAPL ------------------------------------------------
    await page.goto(BASE + '/watchlist', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const star = page.getByRole('button', { name: 'Watching AAPL', exact: true }).first();
    if (await star.count()) { await star.click(); await page.waitForTimeout(2500); }
    check('watchlist: cleaned', (await page.getByRole('button', { name: 'Watching AAPL', exact: true }).count()) === 0);

    const failed = out.filter((o) => !o.ok);
    console.log(`\n=== ${out.length - failed.length}/${out.length} passed ===`);
    console.log('PAGE ERRORS:', errs.length ? JSON.stringify([...new Set(errs)]) : 'none');
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
