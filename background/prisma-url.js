export const PRISMA_ORIGIN = 'https://go.mediaocean.com';
export const PRISMA_DASHBOARD_URL = `${PRISMA_ORIGIN}/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns`;

export function getLegacyPrismaRedirect(rawUrl) {
    let url;
    try {
        url = new URL(rawUrl);
    } catch {
        return null;
    }

    if (url.protocol !== 'https:' || url.hostname !== 'groupmuk-prisma.mediaocean.com' ||
        url.pathname.replace(/\/+$/, '') !== '/campaign-management') return null;

    // Prisma supplies its own _ctx after navigation. Preserve only the SPA route;
    // copying a context value from another session would break the destination.
    return `${PRISMA_ORIGIN}/campaign-management/${url.hash}`;
}
