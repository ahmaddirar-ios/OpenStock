/**
 * Trader sweep: every destination, then the chart tools a professional actually reaches for.
 * Run with the review account on the `pro` plan and with its chart setups cleared.
 */
import { chromium } from 'playwright-core';
import { BASE, EMAIL, PASSWORD, resolveChromium } from './config.mjs';
const EXEC = resolveChromium();

(async () => {
    const browser = await chromium.launch({ executablePath: EXEC, headless: true });
    const ctx = await browser.newContext({
        viewport: { width: 1600, height: 950 },
        acceptDownloads: true,
        permissions: ['clipboard-read', 'clipboard-write'],
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => { const s = String(e).split('\n')[0]; if (!/Unexpected token|querySelector/.test(s)) errs.push(s.slice(0, 130)); });

    const out = [];
    const check = (name, ok, note = '') => { out.push({ name, ok: !!ok, note }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`); };
    const crashed = () => page.evaluate(() => /Something broke on this page/.test(document.body.innerText));

    await page.goto(BASE + '/sign-in', { waitUntil: 'domcontentloaded' });
    await page.fill('#email', EMAIL);
    await page.fill('#password', PASSWORD);
    await Promise.all([page.waitForURL(/dashboard|overview/i, { timeout: 30000 }).catch(() => {}), page.click('form button[type=submit]')]);
    if (!/dashboard|overview/i.test(page.url())) throw new Error('sign-in did not reach /dashboard: ' + page.url());

    // ---------- every destination ------------------------------------------------------------
    const routes = [
        ['/dashboard', /overview|watchlist|market/i], ['/watchlist', /watchlist/i], ['/portfolio', /portfolio|position|cash/i],
        ['/alerts', /alert/i], ['/screener', /screener|filter|screen/i], ['/scanner', /scan|pattern/i],
        ['/saudi', /saudi|tadawul|tasi/i], ['/world', /market|index/i], ['/charts', /chart|symbol/i],
        ['/strategies', /strateg|library/i], ['/strategies/custom', /strateg|rule|build/i],
        ['/tools', /tool|destination/i], ['/profile', /profile|account|plan/i], ['/help', /help|shortcut|key/i],
        ['/api-docs', /api|endpoint|key/i],
    ];
    for (const [route, want] of routes) {
        const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded' }).catch(() => null);
        await page.waitForTimeout(2600);
        const text = await page.evaluate(() => document.body.innerText);
        check(`destination ${route}`, (resp ? resp.status() : 0) < 400 && want.test(text) && !/Something broke/.test(text),
            `${resp ? resp.status() : 0}, ${text.length} chars`);
    }

    // ---------- chart tools ------------------------------------------------------------------
    await page.goto(BASE + '/stocks/2222.SR', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('canvas', { timeout: 30000 });
    await page.waitForTimeout(6500);

    // the chart is the largest canvas on the page
    const canvases = page.locator('canvas');
    const count = await canvases.count();
    let box = null;
    for (let i = 0; i < count; i++) {
        const b = await canvases.nth(i).boundingBox();
        if (b && (!box || b.width * b.height > box.width * box.height)) box = b;
    }
    if (!box) throw new Error('no chart canvas');
    const at = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy });

    // Close a dropdown or rail flyout without ever clicking the chart (a tool may be armed).
    const dismiss = async () => {
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
        for (let i = 0; i < 5; i++) {
            const scrim = page.locator('div.fixed.inset-0.z-20').first();
            if (!(await scrim.count())) break;
            await scrim.click({ force: true, timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(150);
        }
        await page.waitForTimeout(200);
    };
    const painted = () => page.evaluate(() => document.querySelectorAll('svg line[stroke], svg path[stroke]').length);
    const drawingsCount = () => page.evaluate(() => {
        const m = document.body.innerText.match(/Drawings · (\d+)/); return m ? +m[1] : null;
    });
    const openRail = async (group) => { await page.getByRole('button', { name: group, exact: true }).click(); await page.waitForTimeout(400); };
    const pickTool = async (name) => { await page.locator('button', { hasText: new RegExp('^' + name) }).first().click(); await page.waitForTimeout(250); };
    const lineMid = () => page.evaluate(() => {
        const svg = [...document.querySelectorAll('svg')].find((s) => s.getBoundingClientRect().width > 600);
        if (!svg) return null;
        const r = svg.getBoundingClientRect();
        const lines = [...svg.querySelectorAll('line[stroke]')].filter((l) => Math.abs(+l.getAttribute('x2') - +l.getAttribute('x1')) > 100);
        const l = lines[lines.length - 1];
        return l ? { x: r.x + (+l.getAttribute('x1') + +l.getAttribute('x2')) / 2, y: r.y + (+l.getAttribute('y1') + +l.getAttribute('y2')) / 2 } : null;
    });
    const openMenu = async () => {
        await dismiss();
        const mid = await lineMid();
        if (!mid) return null;
        await page.mouse.click(mid.x, mid.y, { button: 'right' });
        await page.waitForTimeout(700);
        return page.evaluate(() => {
            const m = document.querySelector('[data-object-menu]');
            return m ? (m.innerText || '').replace(/\s+/g, ' ').trim() : null;
        });
    };
    const menuItem = (re) => page.locator('[data-object-menu] [role=menuitem]', { hasText: re }).first();

    // a study
    await page.getByRole('button', { name: /^Indicators/ }).first().click();
    await page.waitForTimeout(600);
    const sma = page.locator('[role=dialog] button', { hasText: /^SMA$/ }).first();
    if (await sma.count()) { await sma.click(); await page.waitForTimeout(1600); }
    check('add a study (SMA)', await page.evaluate(() => /SMA/.test(document.body.innerText)));
    await dismiss();

    // a chart type
    await page.getByRole('button', { name: /^Chart type/ }).first().click();
    await page.waitForTimeout(600);
    const ha = page.locator('[role=menuitem],[role=menuitemradio],button', { hasText: /Heikin/i }).first();
    const haCount = await ha.count();
    if (haCount) { await ha.click(); await page.waitForTimeout(1600); }
    check('switch chart type (Heikin Ashi)', haCount > 0);
    await dismiss();

    // draw a trend line: two clicks, not a drag
    const beforeDraw = (await drawingsCount()) ?? 0;
    await openRail('Lines');
    await pickTool('Trend line');
    const p1 = at(0.30, 0.70), p2 = at(0.62, 0.45);
    await page.mouse.click(p1.x, p1.y);
    await page.waitForTimeout(300);
    await page.mouse.move(p2.x, p2.y, { steps: 8 });
    await page.mouse.click(p2.x, p2.y);
    await page.waitForTimeout(900);
    const afterDraw = await drawingsCount();
    check('draw a trend line (two clicks)', afterDraw === beforeDraw + 1, `${beforeDraw} -> ${afterDraw}`);
    await page.screenshot({ path: '/tmp/sw-1-drawn.png' });

    // right-click while idle: object menu + selection
    const menu = await openMenu();
    check('right-click a drawing with no tool armed', !!menu && /Duplicate/.test(menu), (menu || '').slice(0, 70));
    check('the menu offers an alert on the drawing', !!menu && /Alert/i.test(menu));
    check('the menu offers lock / hide / layers', !!menu && /Lock/.test(menu) && /Hide/.test(menu) && /front/.test(menu));

    // duplicate through the menu
    const before = await drawingsCount();
    if (await menuItem(/Duplicate/).count()) { await menuItem(/Duplicate/).click(); await page.waitForTimeout(600); }
    check('duplicate from the object menu', (await drawingsCount()) === before + 1, `${before} -> ${await drawingsCount()}`);
    await dismiss();

    // select, then the edit toolbar: lock all / unlock all
    const m2 = await openMenu();
    if (!m2) check('select a drawing for the toolbar', false, 'no object menu');
    const lockBtn = page.getByRole('button', { name: /^Lock all$/ }).first();
    let lockOk = false;
    if (await lockBtn.count()) {
        await lockBtn.click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(700);
        lockOk = (await page.getByRole('button', { name: /^Unlock all$/ }).count()) > 0;
        const unlock = page.getByRole('button', { name: /^Unlock all$/ }).first();
        if (await unlock.count()) { await unlock.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(500); }
    }
    check('lock all toggles with a drawing selected', lockOk);
    await dismiss();

    // hide one drawing, then show it again from the toolbar
    const paintedBefore = await painted();
    const m3 = await openMenu();
    let hid = false;
    if (m3 && await menuItem(/^Hide$/).count()) {
        await menuItem(/^Hide$/).click(); await page.waitForTimeout(700);
        hid = (await painted()) < paintedBefore;
    }
    check('hide a drawing from its menu', hid, `${paintedBefore} -> ${await painted()}`);
    await dismiss();

    // copy + paste a drawing (in-memory clipboard: the toolbar Paste button, key chord as fallback)
    const m4 = await openMenu();
    let copyPaste = false;
    if (m4 && await menuItem(/^Copy drawing$/).count()) {
        await menuItem(/^Copy drawing$/).click();
        await page.waitForTimeout(400);
        const n = await drawingsCount();
        const pasteBtn = page.locator('button[aria-label="Paste drawing"]').first();
        if (await pasteBtn.count()) { await pasteBtn.click({ force: true, timeout: 5000 }).catch(() => {}); await page.waitForTimeout(800); }
        if ((await drawingsCount()) === n) { await page.keyboard.press('Meta+v'); await page.waitForTimeout(800); }
        copyPaste = (await drawingsCount()) === n + 1;
    }
    check('copy + paste a drawing', copyPaste);
    await dismiss();

    // templates
    const tpl = page.getByRole('button', { name: /^Chart templates/ }).first();
    let tplOk = false;
    if (await tpl.count()) { await tpl.click(); await page.waitForTimeout(700); tplOk = await page.evaluate(() => /template/i.test(document.body.innerText)); await dismiss(); }
    check('templates menu', tplOk);

    // export the bars as CSV (inside the Chart settings menu)
    let csv = false, csvName = '';
    page.once('download', (d) => { csv = true; csvName = d.suggestedFilename(); });
    const settings = page.getByRole('button', { name: /^Chart settings/ }).first();
    if (await settings.count()) {
        await settings.click(); await page.waitForTimeout(600);
        const item = page.locator('button', { hasText: /Export chart data/ }).first();
        if (await item.count()) { await item.click().catch(() => {}); await page.waitForTimeout(2500); }
    }
    check('export chart data as CSV', csv, csvName);
    await dismiss();
    await page.screenshot({ path: '/tmp/sw-2-tools.png' });

    // the four-pane grid
    await page.goto(BASE + '/charts?l=4&s=2222.SR%2C1120.SR%2CAAPL%2CMSFT&i=1d', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(9000);
    const panes = await page.evaluate(() => document.querySelectorAll('canvas').length);
    check('four-pane chart grid', panes >= 8, `${panes} canvases`);
    await page.screenshot({ path: '/tmp/sw-3-grid.png' });

    // screener returns rows
    await page.goto(BASE + '/screener', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    const rows = await page.evaluate(() => document.querySelectorAll('a[href^="/stocks/"]').length);
    check('screener lists symbols', rows > 5, `${rows} symbol links`);
    await page.screenshot({ path: '/tmp/sw-4-screener.png' });

    // scanner
    await page.goto(BASE + '/scanner', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const scan = await page.evaluate(() => document.body.innerText);
    check('scanner renders its controls', /UNIVERSE/i.test(scan) && /PATTERNS/i.test(scan) && /INTERVAL/i.test(scan) && /SENSITIVITY/i.test(scan) && /Wolfe|Gartley/.test(scan));

    // strategies index
    await page.goto(BASE + '/strategies', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    const strat = await page.evaluate(() => document.body.innerText);
    check('strategy library renders', /Build your own strategy/.test(strat) && /SMA 50\/200 cross/.test(strat) && /EMA 9\/21 cross/.test(strat));

    // alerts
    await page.goto(BASE + '/alerts', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4500);
    const alerts = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '));
    check('alerts centre renders', /alert/i.test(alerts), alerts.slice(0, 70));

    // command bar
    await page.keyboard.press('Meta+k');
    await page.waitForTimeout(900);
    check('command bar opens', await page.evaluate(() => !!document.querySelector('[role=dialog],[cmdk-root]')));
    await page.screenshot({ path: '/tmp/sw-5-cmd.png' });
    await page.keyboard.press('Escape');

    check('never crashed', !(await crashed()));
    const failed = out.filter((r) => !r.ok);
    console.log(`\n=== ${out.length - failed.length}/${out.length} passed ===`);
    console.log('PAGE ERRORS:', errs.length ? JSON.stringify([...new Set(errs)]) : 'none');
    await browser.close();
    process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
