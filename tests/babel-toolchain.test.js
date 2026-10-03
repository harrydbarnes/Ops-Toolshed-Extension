const { value: hoistedValue } = require('toolshed-hoist-fixture');
const babel = require('@babel/core');
const { createRequire } = require('node:module');
const snapshotBabel = createRequire(require.resolve('jest-snapshot'))('@babel/core');
const syntaxPreset = require.resolve('babel-preset-current-node-syntax');

// This intentionally comes after require: Jest must hoist it during transformation.
jest.mock('toolshed-hoist-fixture', () => ({ value: 'hoisted' }), { virtual: true });

describe('Babel toolchain compatibility', () => {
    test.each([
        ['test transformer', babel],
        ['Jest snapshot parser', snapshotBabel]
    ])('%s accepts current Node syntax with the compatibility preset', (_name, compiler) => {
        const source = `
            import data from './data.json' with { type: 'json' };
            class Feature {
                #value = data?.value ?? 1_000n;
                static { this.ready = true; }
                async *updates() { yield this.#value; }
                contains(other) { return #value in other; }
            }
            let value; value ??= await Promise.resolve(1);
            try { throw new Error(); } catch {}
            const { value: first, ...rest } = { value, ...data };
            const meta = import.meta;
        `;
        expect(compiler.parseSync(source, {
            babelrc: false,
            configFile: false,
            sourceType: 'module',
            presets: [syntaxPreset]
        }).type).toBe('File');
    });

    test('retains Jest mock hoisting', () => {
        expect(hoistedValue).toBe('hoisted');
    });

    test('retains inline snapshot support', () => {
        expect({ value: 42 }).toMatchInlineSnapshot(`
{
  "value": 42,
}
`);
    });
});
