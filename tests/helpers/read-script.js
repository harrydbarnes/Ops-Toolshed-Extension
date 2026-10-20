const fs = require('fs');
const { createInstrumenter } = require('istanbul-lib-instrument');

// Scripts loaded as text bypass babel-jest. Instrument them only for coverage
// runs and share the coverage object with manually created jsdom windows.
function readScript(filename) {
    const source = fs.readFileSync(filename, 'utf8');
    if (!globalThis.__collectScriptCoverage) return source;
    return createInstrumenter().instrumentSync(source, filename);
}

module.exports = { readScript };
