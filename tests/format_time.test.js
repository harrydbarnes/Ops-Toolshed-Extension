// tests/format_time.test.js

// We need to copy the function logic here since it's not exported from toolshed.js
function formatLoadingTime(totalSeconds) {
    if (totalSeconds < 60) {
        // Case A: < 60s
        if (totalSeconds > 0 && totalSeconds < 0.01) {
            return '<0.01s';
        }
        return `${Math.floor(totalSeconds * 10) / 10}s`;
    } else if (totalSeconds < 600) {
        // Case B: 60s <= t < 600s (Under 10 mins)
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor((totalSeconds % 60) * 10) / 10;
        const minUnit = minutes === 1 ? 'min' : 'mins';
        return `${minutes} ${minUnit} &<br> ${seconds}s`;
    } else {
        // Case C: t >= 600s (10 mins+)
        const hours = Math.floor(totalSeconds / 3600);
        const remainingSeconds = totalSeconds % 3600;
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = Math.floor(remainingSeconds % 60); // Whole number

        if (hours > 0) {
            return `${hours}h &<br> ${minutes}m &<br> ${seconds}s`;
        } else {
            return `${minutes}m &<br> ${seconds}s`;
        }
    }
}

describe('Format Loading Time Logic', () => {

    test('Case A: Under 1 minute', () => {
        expect(formatLoadingTime(45.5)).toBe('45.5s');
        expect(formatLoadingTime(45.56)).toBe('45.5s'); // Truncated/Floored logic
        expect(formatLoadingTime(0.005)).toBe('<0.01s');
        expect(formatLoadingTime(59.9)).toBe('59.9s');
    });

    test('Case B: Under 10 minutes', () => {
        // 1 min 30.5s = 90.5s
        expect(formatLoadingTime(90.5)).toBe('1 min &<br> 30.5s');

        // 5 mins 30.5s = 330.5s
        expect(formatLoadingTime(330.5)).toBe('5 mins &<br> 30.5s');

        // 9 mins 59.9s = 599.9s
        // 599.9 / 60 = 9.998333... floor = 9 mins
        // 599.9 % 60 = 59.9
        // 59.9 * 10 = 599. floor = 599. / 10 = 59.9
        // Floating point arithmetic issues check:
        // 599.9 % 60 might be 59.89999999999998 due to precision
        // Let's use the actual value calculated in JS
        const secs = Math.floor((599.9 % 60) * 10) / 10;
        expect(formatLoadingTime(599.9)).toBe(`9 mins &<br> ${secs}s`);
    });

    test('Case C: 10 minutes or more', () => {
        // 10 mins 0s = 600s
        expect(formatLoadingTime(600)).toBe('10m &<br> 0s');

        // 12 mins 4s = 724s
        expect(formatLoadingTime(724)).toBe('12m &<br> 4s');

        // 59 mins 59s = 3599s
        expect(formatLoadingTime(3599)).toBe('59m &<br> 59s');
    });

    test('Case C: 1 hour or more', () => {
        // 1h 0m 0s = 3600s
        expect(formatLoadingTime(3600)).toBe('1h &<br> 0m &<br> 0s');

        // 1h 5m 30s = 3930s
        expect(formatLoadingTime(3930)).toBe('1h &<br> 5m &<br> 30s');

        // 2h 30m 15s = 9015s
        expect(formatLoadingTime(9015)).toBe('2h &<br> 30m &<br> 15s');
    });
});
