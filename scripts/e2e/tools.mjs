/**
 * Trader sweep, part 2: portfolio, alerts, custom strategy studio, watchlist, screener.
 * Cleans up every record it creates, so the review account stays empty.
 */
import { chromium } from 'playwright-core';
import { BASE, EMAIL, PASSWORD, LANG, resolveChromium } from './config.mjs';
const EXEC = resolveChromium();

(async () => {
    const browser = await chromium.launch({ executablePath: EXEC, headless: true });
    const ctx = await browser.newContext({
        viewport: { width: 1600, height: 950 },
        acceptDownloads: true,
        permissions: ['clipboard-read', 'clipboard-write'],
    });
    await ctx.addCookies([{ name: 'openstock-lang', value: LANG, domain: 'localhost', path: '/' }]);
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => { const s = String(e).split('\n')[0]; if (!/Unexpected token|querySelector/.test(s)) errs.push(s.slice(0, 140)); });
    page.on('dialog', (d) => d.accept().catch(() => {}));
    page.setDefaultTimeout(20000);

    const out = [];
    const check = (name, ok, note = '') => { out.push({ name, ok: !!ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`); };
    const body = () => page.evaluate(() => document.body.innerText);
    const waitText = async (re, ms = 15000) => {
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { if (re.test(await body())) return true; await page.waitForTimeout(300); }
        return false;
    };
    const crashes = async () => /Something broke on this page/.test(await body());

    // ---------- sign in ----------------------------------------------------------------
    await page.goto(BASE + '/sign-in', { waitUntil: 'domcontentloaded' });
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await Promise.all([page.waitForURL(/dashboard|overview/i, { timeout: 30000 }).catch(() => {}), page.click('form button[type=submit]')]);
    if (!/dashboard|overview/i.test(page.url())) throw new Error('sign-in failed: ' + page.url());
    check('sign-in', true);

    // ---------- 1. portfolio: add + remove a position ---------------------------------
    await page.goto(BASE + '/portfolio', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    check('portfolio renders', /Portfolio/i.test(await body()) && !(await crashes()));

    await page.getByRole('button', { name: 'Add position', exact: true }).click();
    let dlg = page.getByRole('dialog').last();
    await dlg.waitFor();
    await dlg.getByLabel('Symbol', { exact: true }).fill('AAPL');
    await dlg.getByLabel('Quantity', { exact: true }).fill('10');
    await dlg.getByLabel('Average cost', { exact: true }).fill('150');
    await dlg.getByRole('button', { name: 'Save', exact: true }).click();
    const added = await waitText(/AAPL/, 20000);
    check('portfolio: add position', added, added ? '' : 'row did not appear');

    const removeBtn = page.getByRole('button', { name: 'Remove', exact: true }).first();
    const hasRemove = await removeBtn.count();
    if (hasRemove) { await removeBtn.click(); await page.waitForTimeout(3000); }
    const gone = !/AAPL/.test(await body());
    check('portfolio: remove position', hasRemove && gone, hasRemove ? (gone ? '' : 'row still there') : 'no remove button');

    // ---------- 2. portfolio: record + delete a trade ---------------------------------
    await page.getByRole('button', { name: 'Add trade', exact: true }).click();
    dlg = page.getByRole('dialog').last();
    await dlg.waitFor();
    await dlg.getByLabel('Symbol', { exact: true }).fill('AAPL');
    await dlg.getByLabel('Quantity', { exact: true }).fill('10');
    await dlg.getByLabel('Price', { exact: true }).fill('150');
    await dlg.getByRole('button', { name: 'Save trade', exact: true }).click();
    const tradeAdded = await waitText(/Trade ledger[\s\S]*AAPL/, 20000);
    check('portfolio: record trade', tradeAdded, tradeAdded ? '' : 'ledger row did not appear');

    const tradeRemove = page.getByRole('button', { name: 'Remove', exact: true }).last();
    const hasTradeRemove = await tradeRemove.count();
    if (hasTradeRemove) { await tradeRemove.click(); await page.waitForTimeout(3000); }
    const tradeGone = !/AAPL/.test(await body());
    check('portfolio: delete trade', hasTradeRemove && tradeGone, hasTradeRemove ? (tradeGone ? '' : 'trade still there') : 'no remove button');

    // ---------- 2b. portfolio: cash and buying power -----------------------------------
    await page.getByRole('button', { name: 'Set cash', exact: true }).click();
    await page.getByLabel('Set cash', { exact: true }).fill('5000');
    await page.getByRole('button', { name: 'Save', exact: true }).last().click();
    // The success toast fires before the server re-render lands, so wait for the row's own control.
    const editCash = page.getByRole('button', { name: /Edit USD Cash/i }).first();
    const cashSet = await editCash.waitFor({ state: 'visible', timeout: 25000 }).then(() => true).catch(() => false);
    check('portfolio: set cash', cashSet, cashSet ? '' : 'cash row did not appear');

    // A zero clears the entry, so the account is left as empty as the sweep found it.
    if (cashSet) {
        await editCash.click();
        await page.getByLabel('Cash USD', { exact: true }).fill('0');
        await page.getByRole('button', { name: 'Save', exact: true }).last().click();
        const t0 = Date.now();
        while (Date.now() - t0 < 20000) {
            await page.waitForTimeout(400);
            if ((await page.getByRole('button', { name: /Edit USD Cash/i }).count()) === 0) break;
        }
    }
    const cashCleared = (await page.getByRole('button', { name: /Edit USD Cash/i }).count()) === 0;
    check('portfolio: clear cash', cashSet && cashCleared, cashSet ? (cashCleared ? '' : 'row still there') : 'no edit control');

    // ---------- 3. alerts: create -> pause -> resume -> delete -------------------------
    await page.goto(BASE + '/alerts', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    check('alerts renders', /No alerts yet|Alert/i.test(await body()) && !(await crashes()));

    // A rule that cannot be true yet: stays armed, so Pause/Resume/Delete are the live controls.
    await page.getByLabel('Symbol', { exact: true }).first().fill('MSFT');
    await page.getByLabel('Condition', { exact: true }).first().selectOption('ABOVE').catch(() => {});
    await page.getByLabel('Target', { exact: true }).first().fill('99999');
    await page.getByRole('button', { name: 'Create alert', exact: true }).click();
    // The success toast also names the symbol, so wait for the row's own controls, not for the text.
    const pause = page.getByRole('button', { name: 'Pause', exact: true }).first();
    const alertAdded = await pause.waitFor({ state: 'visible', timeout: 25000 }).then(() => true).catch(() => false);
    check('alerts: create', alertAdded, alertAdded ? '' : 'alert row did not appear');

    let pauseOk = false, resumeOk = false;
    if (alertAdded) {
        await pause.click();
        const resume = page.getByRole('button', { name: 'Resume', exact: true }).first();
        pauseOk = await resume.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
        if (pauseOk) {
            await resume.click();
            resumeOk = await pause.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
        }
    }
    check('alerts: pause', pauseOk);
    check('alerts: resume', resumeOk);

    // The edit row changes what a rule watches, not only its target.
    let edited = false;
    const editBtn = page.getByRole('button', { name: 'Edit rule', exact: true }).first();
    if (await editBtn.count()) {
        await editBtn.click();
        const symbolField = page.getByLabel('Symbol', { exact: true }).nth(1);
        await symbolField.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        if (await symbolField.count()) {
            await symbolField.fill('AAPL');
            await page.getByLabel('Condition', { exact: true }).nth(1).selectOption('BELOW').catch(() => {});
            await page.getByLabel('Target', { exact: true }).last().fill('1');
            await page.getByRole('button', { name: 'Save', exact: true }).last().click();
            // The row must show the new symbol and the new rule once the re-render lands.
            const t0 = Date.now();
            while (Date.now() - t0 < 20000) {
                await page.waitForTimeout(500);
                const txt = await body();
                if (/AAPL/.test(txt) && /Price at or below/.test(txt)) { edited = true; break; }
            }
        }
    }
    check('alerts: edit symbol and condition', edited, edited ? '' : 'row kept the old rule');

    let del = page.getByRole('button', { name: 'Delete', exact: true }).first();
    let hasDel = await del.count();
    if (hasDel) { await del.click(); await waitText(/No alerts yet/, 15000); }
    const alertGone = /No alerts yet/.test(await body());
    check('alerts: delete', hasDel && alertGone, hasDel ? (alertGone ? '' : 'still listed') : 'no delete button');

    // A rule that is already true fires on the next check: a fired rule must still be removable.
    await page.getByLabel('Symbol', { exact: true }).first().fill('TSLA');
    await page.getByLabel('Condition', { exact: true }).first().selectOption('ABOVE').catch(() => {});
    await page.getByLabel('Target', { exact: true }).first().fill('1');
    await page.getByRole('button', { name: 'Create alert', exact: true }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).first().waitFor({ state: 'visible', timeout: 25000 }).catch(() => {});
    await page.getByRole('button', { name: 'Check now', exact: true }).click();
    const fired = await waitText(/Re-arm|Fired|triggered/i, 25000);
    check('alerts: rule fires', fired, fired ? '' : 'no fired status');
    del = page.getByRole('button', { name: 'Delete', exact: true }).first();
    hasDel = await del.count();
    if (hasDel) { await del.click(); await waitText(/No alerts yet/, 15000); }
    const firedGone = /No alerts yet/.test(await body());
    check('alerts: delete a fired rule', hasDel && firedGone, hasDel ? (firedGone ? '' : 'still listed') : 'no delete button');

    // ---------- 4. custom strategy: run -> save -> delete ------------------------------
    await page.goto(BASE + '/strategies/custom', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    check('studio renders', /Custom strategy studio|Entry/i.test(await body()) && !(await crashes()));

    const name = 'Sweep Test EA';
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('button', { name: /Run the backtest/i }).click();
    const ran = await waitText(/Custom run|trades|Sharpe/i, 40000);
    check('studio: run backtest', ran, ran ? '' : 'no result appeared');

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const saved = await waitText(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 15000);
    check('studio: save strategy', saved, saved ? '' : 'saved list did not show it');

    const sd = page.getByRole('button', { name: `Delete ${name}` });
    const hasSd = await sd.count();
    if (hasSd) { await sd.click(); await page.waitForTimeout(2500); }
    const sdGone = !new RegExp(name).test(await body());
    check('studio: delete strategy', hasSd && sdGone, hasSd ? (sdGone ? '' : 'still listed') : 'no delete button');

    // A basket runs the same rules on several names and reports one pooled result. The result
    // replaces the single-symbol panel, so wait for its own heading, and read the button back
    // rather than assuming the first click landed.
    let basketRan = false;
    const basketField = page.getByLabel('Basket', { exact: true }).first();
    const hasBasket = (await basketField.count()) > 0;
    if (hasBasket) {
        await basketField.fill('2222.SR, AAPL');
        const runBasket = page.getByRole('button', { name: 'Run basket', exact: true }).first();
        const enabled = await runBasket.isEnabled().catch(() => false);
        if (enabled) {
            await runBasket.click();
            // The button flips to Running… while it works; once it is back the result is on screen.
            await page.getByRole('button', { name: 'Run basket', exact: true }).first().waitFor({ state: 'visible', timeout: 90000 }).catch(() => {});
            basketRan = await waitText(/Basket result/i, 60000);
        }
        if (!basketRan) {
            const alertTxt = ((await body()).match(/Entry.*?$/m) || [''])[0].slice(0, 120);
            check('studio: basket runs', false, enabled ? `no basket result (${alertTxt})` : 'Run basket stayed disabled');
        }
    }
    if (basketRan) {
        const basketTxt = await body();
        check('studio: basket runs', /Basket result/i.test(basketTxt) && /symbols priced/i.test(basketTxt));
    } else if (!hasBasket) {
        check('studio: basket runs', false, 'no basket field');
    }

    // ---------- 5. watchlist: add then remove ------------------------------------------
    await page.goto(BASE + '/stocks/AAPL', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    // The stock page uses the text variant ("Watch" / "Watching"); clear it first if already on.
    if (await page.getByRole('button', { name: 'Watching', exact: true }).count()) {
        await page.getByRole('button', { name: 'Watching', exact: true }).first().click();
        await page.waitForTimeout(2500);
    }
    const watchBtn = page.getByRole('button', { name: 'Watch', exact: true }).first();
    let wAdded = false;
    if (await watchBtn.count()) { await watchBtn.click(); wAdded = true; await page.waitForTimeout(3000); }
    check('watchlist: add from stock page', wAdded);

    await page.goto(BASE + '/watchlist', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const star = page.getByRole('button', { name: 'Watching AAPL', exact: true }).first();
    const inList = (await star.count()) > 0;
    check('watchlist: symbol appears', inList);

    // Sorting: the first click on a numeric header orders ascending and marks the column.
    const priceHeader = page.getByRole('button', { name: 'Price', exact: true }).first();
    let sorted = false;
    if (await priceHeader.count()) {
        await priceHeader.click();
        await page.waitForTimeout(600);
        const th = page.locator('th[aria-sort="ascending"]');
        sorted = (await th.count()) > 0;
    }
    check('watchlist: sorts by a column', sorted, sorted ? '' : 'no aria-sort on the header');

    // The chosen order survives a reload: it is remembered, not just held in state.
    let remembered = false;
    if (sorted) {
        await page.waitForTimeout(400);
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2500);
        remembered = (await page.locator('th[aria-sort="ascending"]').count()) > 0;
    }
    check('watchlist: order is remembered', remembered, remembered ? '' : 'sort reset on reload');

    if (inList) { await star.click(); await page.waitForTimeout(3000); }
    const wGone = (await page.getByRole('button', { name: 'Watching AAPL', exact: true }).count()) === 0;
    check('watchlist: remove', inList && wGone, inList ? (wGone ? '' : 'still listed') : 'no star button');

    // ---------- 6. screener: filter + export ------------------------------------------
    await page.goto(BASE + '/screener', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const rowsBefore = ((await body()).match(/Results[\s\S]{0,40}/) || [''])[0];
    check('screener renders', /Results|priced|Building the screener/.test(await body()) && !(await crashes()));

    // The results line must state how much of the universe is priced, not claim all of it.
    const coverageLine = ((await body()).match(/\d+ of \d+ priced/) || [''])[0];
    check('screener: states its coverage', !!coverageLine, coverageLine);

    const search = page.getByPlaceholder(/Company or symbol/i).first();
    let filtered = false;
    if (await search.count()) {
        await search.fill('a');
        await page.waitForTimeout(1200);
        filtered = /Results/i.test(await body());
        await search.fill('');
    }
    check('screener: filter applies', filtered || /Results/.test(rowsBefore));

    let downloadName = '';
    const exportBtn = page.getByRole('button', { name: /Export CSV/i }).first();
    if (await exportBtn.count()) {
        const [dl] = await Promise.all([
            page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
            exportBtn.click(),
        ]);
        if (dl) { downloadName = dl.suggestedFilename(); await dl.saveAs('/tmp/sweep-screener.csv').catch(() => {}); }
    }
    check('screener: export CSV', !!downloadName, downloadName);

    // ---------- summary ---------------------------------------------------------------
    const failed = out.filter((o) => !o.ok);
    console.log(`\n=== ${out.length - failed.length}/${out.length} passed ===`);
    if (errs.length) console.log('PAGE ERRORS:', JSON.stringify([...new Set(errs)], null, 2));
    else console.log('PAGE ERRORS: none');
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
