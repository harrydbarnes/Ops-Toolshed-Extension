const { generateUrlFromData, isValidDNumber, isValidCampaignId } = require('../popup');

describe('generateUrlFromData', () => {
    const campaignId = 'TEST_CAMPAIGN';

    beforeAll(() => {
        // Set a fixed date for consistent testing, e.g., '2024-07-26'
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-07-26T10:00:00'));
    });

    afterAll(() => {
        jest.useRealTimers();
    });

    test('should return null if campaignId is not provided', () => {
        expect(generateUrlFromData('', 'July 25')).toBeNull();
        expect(generateUrlFromData(null, 'July 25')).toBeNull();
    });

    test('should generate a URL with the current month if date string is empty', () => {
        const expectedUrl = `https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-buy&campaign-id=${campaignId}&route=actualize&mos=2024-07-01`;
        expect(generateUrlFromData(campaignId, '')).toBe(expectedUrl);
    });

    test('should return null for an completely invalid date string', () => {
        expect(generateUrlFromData(campaignId, 'invalid-date')).toBeNull();
    });

    // Test various valid date formats
    const testCases = [
        { input: 'July 25', expected: '2025-07-01' },
        { input: '07/25', expected: '2025-07-01' },
        { input: 'July 2025', expected: '2025-07-01' },
        { input: '07/2025', expected: '2025-07-01' },
        { input: '2025-07', expected: '2025-07-01' },
        { input: '2025-07-15', expected: '2025-07-01' },
        { input: 'Aug 24', expected: '2024-08-01' },
    ];

    testCases.forEach(({ input, expected }) => {
        test(`should correctly parse date format "${input}"`, () => {
            const expectedUrl = `https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-buy&campaign-id=${campaignId}&route=actualize&mos=${expected}`;
            expect(generateUrlFromData(campaignId, input)).toBe(expectedUrl);
        });
    });

    test('should handle different campaign IDs correctly', () => {
        const newCampaignId = 'ANOTHER-ID-123';
        const expectedUrl = `https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-buy&campaign-id=${encodeURIComponent(newCampaignId)}&route=actualize&mos=2024-07-01`;
        expect(generateUrlFromData(newCampaignId, '')).toBe(expectedUrl);
    });
});

describe('isValidDNumber', () => {
    test('should validate correct D-Numbers', () => {
        expect(isValidDNumber('D12345678')).toBe(true);
        expect(isValidDNumber('D00000000')).toBe(true);
    });

    test('should validate correct O-Numbers', () => {
        expect(isValidDNumber('O-ABC12')).toBe(true);
        expect(isValidDNumber('O-12345')).toBe(true);
    });

    test('should reject invalid formats', () => {
        expect(isValidDNumber('D123')).toBe(false); // Too short
        expect(isValidDNumber('D123456789')).toBe(false); // Too long
        expect(isValidDNumber('X12345678')).toBe(false); // Wrong prefix
        expect(isValidDNumber('O-ABC')).toBe(false); // O-number too short
        expect(isValidDNumber('')).toBe(false); // Empty
        expect(isValidDNumber(null)).toBe(false); // Null
    });
});

describe('isValidCampaignId', () => {
    test('should validate correct Campaign IDs', () => {
        expect(isValidCampaignId('CP383ML')).toBe(true);
        expect(isValidCampaignId('c123456')).toBe(true);
        expect(isValidCampaignId('Caaaaaa')).toBe(true);
    });

    test('should reject invalid formats', () => {
        expect(isValidCampaignId('CP383M')).toBe(false); // Too short
        expect(isValidCampaignId('CP383MLX')).toBe(false); // Too long
        expect(isValidCampaignId('XP383ML')).toBe(false); // Wrong prefix
        expect(isValidCampaignId('')).toBe(false); // Empty
        expect(isValidCampaignId(null)).toBe(false); // Null
    });
});
