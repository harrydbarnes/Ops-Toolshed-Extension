const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runtimeFiles } = require('./package-extension.cjs');
const root = path.resolve(__dirname, '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const bundle = path.join(root, 'artifacts', 'Ops-Toolshed-Jett-Live-Test-' + stamp);
const extension = path.join(bundle, 'Ops-Toolshed');
const endpoint = 'https://script.google.com/a/macros/wppmedia.com/s/AKfycbygksrATahv4EdcHgA4_X0Tiwjhc9arrefwYZeoU2vz2IOghkxFo1J4WnMNPBktKVnn/exec';
for (const file of runtimeFiles()) {
    const target = path.join(extension, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
}
fs.writeFileSync(path.join(extension, 'reccie-writer-mode.js'),
    `(function(root){'use strict';root.opsReccieWriterMode=Object.freeze(${JSON.stringify({ perUser: true, endpoint })});})(globalThis);\n`);
for (const name of ['UPDATE-AND-TEST-INSTRUCTIONS.md', 'MESSAGE-TO-JETT.txt', 'WINDOWS-SECURITY-IT.md', 'defender-storage-blocks.csv']) {
    fs.copyFileSync(path.join(root, 'artifacts', 'jett-per-user-writer-handoff', name), path.join(bundle, name));
}
fs.copyFileSync(path.join(__dirname, 'collect-defender-storage-blocks.ps1'), path.join(bundle, 'collect-defender-storage-blocks.ps1'));
// Verify every runtime file except the one deliberately configured for this pilot.
for (const file of runtimeFiles()) {
    if (file === 'reccie-writer-mode.js') continue;
    if (!fs.readFileSync(path.join(root, file)).equals(fs.readFileSync(path.join(extension, file)))) throw new Error('Package mismatch: ' + file);
}
const vm = require('node:vm');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(extension, 'reccie-writer-mode.js'), 'utf8'), context);
if (context.opsReccieWriterMode?.perUser !== true || context.opsReccieWriterMode.endpoint !== endpoint) throw new Error('Pilot config mismatch');
const archive = bundle + '.zip';
const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Compress-Archive -Path $env:TOOLSHED_PACKAGE_INPUT -DestinationPath $env:TOOLSHED_PACKAGE_OUTPUT -CompressionLevel Optimal'],
{ encoding: 'utf8', env: { ...process.env, TOOLSHED_PACKAGE_INPUT: path.join(bundle, '*'), TOOLSHED_PACKAGE_OUTPUT: archive } });
if (result.status !== 0) throw new Error(result.stderr || 'Archive creation failed');
console.log(JSON.stringify({ archive, runtimeFiles: runtimeFiles().length, bytes: fs.statSync(archive).size, verified: true }, null, 2));
