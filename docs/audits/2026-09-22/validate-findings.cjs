// Current regression gate for the two findings reproduced by the original
// offline audit. Browser verification is still required before rollout.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '../../..');
const approverSource = fs.readFileSync(path.join(root, 'features/approver-pasting.js'), 'utf8');
assert(!approverSource.includes("action: 'copyToClipboard'"), 'Approver paste still uses the unsupported clipboard action');

const result = spawnSync(process.execPath, [
    'node_modules/jest/bin/jest.js', '--runTestsByPath',
    'tests/features/approver-pasting.test.js',
    'tests/features/approval-tracking.test.js',
    '--runInBand', '--coverage=false'
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status || 0;
