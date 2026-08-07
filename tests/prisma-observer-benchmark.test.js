const { benchmarkReconciliationScheduling } = require('../benchmarks/prisma-observer-benchmark');

describe('Prisma observer benchmark', () => {
    test('coalesces 80 mutation batches into one fast and one deferred pass', () => {
        const result = benchmarkReconciliationScheduling();

        expect(result.mutationBatches).toBe(80);
        expect(result.calls).toEqual({
            fastReconciliation: 1,
            deferredReconciliation: 1
        });
    });
});
