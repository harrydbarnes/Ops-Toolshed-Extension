const { getLegacyPrismaRedirect } = require('../background/prisma-url');

describe('legacy Prisma URL migration', () => {
    test('preserves the campaign route without copying session context', () => {
        const oldUrl = 'https://groupmuk-prisma.mediaocean.com/campaign-management/?_ctx=old#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3JFCF&ptb-mod=buy&ptb-ctx=digital&route=online';
        expect(getLegacyPrismaRedirect(oldUrl)).toBe('https://go.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=CP3JFCF&ptb-mod=buy&ptb-ctx=digital&route=online');
    });

    test.each([
        'https://go.mediaocean.com/campaign-management/#campaign-id=CP3JFCF',
        'https://groupmuk-prisma.mediaocean.com/viewport-home/#route=reports',
        'https://groupmuk-prisma.mediaocean.com.evil.test/campaign-management/#campaign-id=CP3JFCF',
        'http://groupmuk-prisma.mediaocean.com/campaign-management/#campaign-id=CP3JFCF',
        'not a URL'
    ])('does not redirect other URLs: %s', url => {
        expect(getLegacyPrismaRedirect(url)).toBeNull();
    });
});
