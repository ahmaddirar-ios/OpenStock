/**
 * Runs the whole trader sweep in order: reset, every suite, reset again. Each suite prints its own
 * PASS/FAIL lines; this runner prints one line per suite and exits non-zero if any check failed.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const SUITES = ['chart-tools.mjs', 'tools.mjs', 'depth.mjs', 'boards.mjs'];

const run = (file) => {
    const result = spawnSync(process.execPath, [path.join(here, file)], { stdio: 'inherit', env: process.env });
    return result.status ?? 1;
};

console.log('──── reset ────');
const resetStatus = run('reset.mjs');
if (resetStatus !== 0) {
    console.error('The reset failed; fix the database connection before trusting any result.');
    process.exit(resetStatus);
}

const failed = [];
for (const suite of SUITES) {
    console.log(`\n──── ${suite} ────`);
    if (run(suite) !== 0) failed.push(suite);
}

console.log('\n──── final reset ────');
run('reset.mjs');

console.log(`\n${SUITES.length - failed.length}/${SUITES.length} suites passed`);
if (failed.length) {
    console.error(`failed: ${failed.join(', ')}`);
    process.exit(1);
}
