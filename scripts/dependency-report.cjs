const { spawnSync } = require('node:child_process');

// Run on demand locally: no scheduled Actions, PRs, reviews or Codex calls.
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run this report with npm run dependencies:report.');
for (const args of [['outdated'], ['audit', '--audit-level=high']]) {
    const result = spawnSync(process.execPath, [npmCli, ...args], { stdio: 'inherit' });
    if (result.error) throw result.error;
    // npm outdated exits 1 when updates exist; audit failures must propagate.
    if ((args[0] === 'audit' && result.status !== 0) || result.status > 1) {
        process.exitCode = result.status || 1;
    }
}
