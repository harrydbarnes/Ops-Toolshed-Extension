/* Pure calculations shared by the Timesheet Helper. Hours are rounded to hundredths. */
(function (root) {
    'use strict';

    function toHundredths(value) {
        const number = Number(value);
        if (!Number.isFinite(number) || number < 0) throw new RangeError('Hours must be a non-negative number');
        return Math.round(number * 100);
    }

    function allocateHours(target, fixed, activity) {
        const targetUnits = toHundredths(target);
        const fixedUnits = Object.values(fixed).reduce((sum, value) => sum + toHundredths(value), 0);
        const remaining = Math.max(0, targetUnits - fixedUnits);
        const entries = Object.entries(activity).map(([key, value]) => [key, Number(value)]);
        if (entries.some(([, value]) => !Number.isFinite(value) || value < 0)) {
            throw new RangeError('Activity must be non-negative');
        }
        const total = entries.reduce((sum, [, value]) => sum + value, 0);
        if (!total || !remaining) return { allocations: {}, unallocated: remaining / 100, overTarget: Math.max(0, fixedUnits - targetUnits) / 100 };
        const shares = entries.filter(([, value]) => value > 0).map(([key, value]) => {
            const exact = remaining * value / total;
            return { key, units: Math.floor(exact), fraction: exact - Math.floor(exact) };
        });
        let left = remaining - shares.reduce((sum, share) => sum + share.units, 0);
        shares.sort((a, b) => b.fraction - a.fraction || a.key.localeCompare(b.key));
        for (let index = 0; index < left; index++) shares[index].units++;
        return { allocations: Object.fromEntries(shares.map(share => [share.key, share.units / 100])), unallocated: 0, overTarget: 0 };
    }

    function closureHours(date, summerStart, summerEnd) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RangeError('Use an ISO date');
        const parsed = new Date(`${date}T12:00:00Z`);
        if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) throw new RangeError('Invalid date');
        if (parsed.getUTCDay() !== 5) return 0;
        return summerStart && summerEnd && date >= summerStart && date <= summerEnd ? 2.5 : 1.5;
    }

    const api = { allocateHours, closureHours };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.timesheetAllocation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
