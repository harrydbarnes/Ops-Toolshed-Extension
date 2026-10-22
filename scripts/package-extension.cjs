const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const excluded = new Set(['babel.config.js', 'jest.config.js', 'update-build-info.js', 'package.json', 'package-lock.json']);
function runtimeFiles(base = root) {
    const files = fs.readdirSync(base, { withFileTypes: true })
        .filter(entry => entry.isFile() && !excluded.has(entry.name) && /\.(?:html|js|css|json|png|mp3)$/.test(entry.name))
        .map(entry => entry.name);
    function walk(relative) {
        for (const entry of fs.readdirSync(path.join(base, relative), { withFileTypes: true })) {
            const file = path.join(relative, entry.name);
            if (entry.isSymbolicLink()) throw new Error('Package cannot include symlink: ' + file);
            if (entry.isDirectory()) walk(file);
            else if (entry.isFile()) files.push(file);
        }
    }
    for (const folder of ['assets', 'background', 'features', 'vendor']) walk(folder);
    return files.sort();
}
if (require.main === module) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(root, 'artifacts', 'extension-' + stamp);
    fs.mkdirSync(destination, { recursive: false });
    const files = runtimeFiles();
    let bytes = 0;
    for (const file of files) {
        const output = path.join(destination, file);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.copyFileSync(path.join(root, file), output);
        bytes += fs.statSync(output).size;
    }
    const archive = destination + '.zip';
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        'Compress-Archive -Path $env:TOOLSHED_PACKAGE_INPUT -DestinationPath $env:TOOLSHED_PACKAGE_OUTPUT -CompressionLevel Optimal'], { encoding: 'utf8', env: { ...process.env, TOOLSHED_PACKAGE_INPUT: path.join(destination, '*'), TOOLSHED_PACKAGE_OUTPUT: archive } });
    if (result.status !== 0) throw new Error(result.stderr || 'Archive creation failed');
    console.log(JSON.stringify({ directory: destination, archive, files: files.length, uncompressedBytes: bytes, zipBytes: fs.statSync(archive).size }, null, 2));
}
module.exports = { runtimeFiles };
