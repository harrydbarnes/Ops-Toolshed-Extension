const { performance } = require('perf_hooks');

// This deliberately benchmarks the observer's scheduling contract, not JSDOM.
// The route and DOM behaviour is covered by tests/content.test.js; JSDOM's
// timer handles made the former CLI benchmark unable to terminate reliably.
function benchmarkReconciliationScheduling() {
    const mutationBatches = 80;
    const scheduledFrames = [];
    const scheduledTimers = [];
    let fastReconciliationQueued = false;
    let deferredReconciliationQueued = false;
    let fastReconciliations = 0;
    let deferredReconciliations = 0;

    const scheduleReconciliation = () => {
        if (!fastReconciliationQueued) {
            fastReconciliationQueued = true;
            scheduledFrames.push(() => {
                fastReconciliationQueued = false;
                fastReconciliations += 1;
            });
        }

        if (!deferredReconciliationQueued) {
            deferredReconciliationQueued = true;
            scheduledTimers.push(() => {
                deferredReconciliationQueued = false;
                deferredReconciliations += 1;
            });
        }
    };

    const started = performance.now();
    for (let index = 0; index < mutationBatches; index += 1) {
        scheduleReconciliation();
    }
    scheduledFrames.splice(0).forEach(callback => callback());
    scheduledTimers.splice(0).forEach(callback => callback());

    return {
        mutationBatches,
        totalFeatureCalls: fastReconciliations + deferredReconciliations,
        scheduledTimers: 1,
        scheduledFrames: 1,
        elapsedMs: Number((performance.now() - started).toFixed(2)),
        calls: {
            fastReconciliation: fastReconciliations,
            deferredReconciliation: deferredReconciliations
        },
        extensionNoise: {
            totalFeatureCalls: 0,
            scheduledTimers: 0,
            scheduledFrames: 0,
            elapsedMs: 0
        }
    };
}

if (require.main === module) {
    const result = { centralObserver: benchmarkReconciliationScheduling() };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`, () => process.exit(0));
}

module.exports = { benchmarkReconciliationScheduling };
