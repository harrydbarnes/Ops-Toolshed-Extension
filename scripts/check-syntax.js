const fs = require('fs');
const path = require('path');
const { parse } = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['.git', 'coverage', 'node_modules', 'vendor']);

function collectJavaScriptFiles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const filePath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            return ignoredDirectories.has(entry.name) ? [] : collectJavaScriptFiles(filePath);
        }
        return entry.isFile() && entry.name.endsWith('.js') ? [filePath] : [];
    });
}

const files = collectJavaScriptFiles(root);

files.forEach(file => {
    const source = fs.readFileSync(file, 'utf8');
    parse(source, {
        filename: file,
        sourceType: 'unambiguous',
        plugins: ['jsx']
    });
});

process.stdout.write(`Syntax check passed for ${files.length} JavaScript files.\n`);
