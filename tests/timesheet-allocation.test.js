const { allocateHours, closureHours } = require('../timesheet-allocation');

test('preserves fixed entries and allocates the remaining day in activity proportion', () => {
    expect(allocateHours(7, { NCBAU: 2 }, { A: 3, B: 2 })).toEqual({
        allocations: { A: 3, B: 2 }, unallocated: 0, overTarget: 0
    });
});

test('rounding retains the exact target, with stable tie breaking', () => {
    expect(allocateHours(1, {}, { B: 1, A: 1, C: 1 }).allocations).toEqual({ A: 0.34, B: 0.33, C: 0.33 });
});

test('leaves time unallocated when there is no activity and reports over-target entries', () => {
    expect(allocateHours(7, { HOL: 2 }, {})).toEqual({ allocations: {}, unallocated: 5, overTarget: 0 });
    expect(allocateHours(7, { HOL: 8 }, { A: 1 })).toEqual({ allocations: {}, unallocated: 0, overTarget: 1 });
});

test('rejects invalid values and handles the supplied 2026 summer boundary', () => {
    expect(() => allocateHours(7, { HOL: -1 }, {})).toThrow();
    expect(() => allocateHours(7, {}, { A: NaN })).toThrow();
    expect(closureHours('2026-08-28', '2026-06-01', '2026-08-28')).toBe(2.5);
    expect(closureHours('2026-09-04', '2026-06-01', '2026-08-28')).toBe(1.5);
    expect(closureHours('2026-08-27', '2026-06-01', '2026-08-28')).toBe(0);
});
