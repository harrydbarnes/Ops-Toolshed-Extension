const origins = ['https://script.google.com/*', 'https://script.googleusercontent.com/*'];
const endpoint = 'https://script.google.com/a/macros/wppmedia.com/s/AKfycbzQvgMmKfOf6X8F17GNagsSy0OoqNs9c_3hJPRRqXEIXQS5uYyemdpQqGYq4rFkF0-B/exec';

// Fixed private read-only endpoint; never accept a caller-provided URL or email.
export async function testReccieGoogleConnection() {
    if (!await chrome.permissions.contains({origins})) throw new Error('Allow Google script access using Test Google connection first.');
    const started = performance.now();
    const response = await fetch(endpoint, {method:'GET', credentials:'include', redirect:'follow', cache:'no-store', signal:AbortSignal.timeout(20000)});
    const final = new URL(response.url);
    if (!response.ok || !['https://script.google.com','https://script.googleusercontent.com'].includes(final.origin) ||
        !(response.headers.get('content-type') || '').includes('application/json')) {
        throw new Error('Google did not return the private probe JSON. Open the private test service in your work Google account, then retry.');
    }
    const data = await response.json();
    if (data.service !== 'ops-toolshed-reccies-identity-probe' || data.protocol !== 1 || data.writeEnabled !== false) throw new Error('Unexpected probe version. No tracker data was changed.');
    if (data.ok !== true || data.identityAvailable !== true || typeof data.activeEmail !== 'string' || !data.activeEmail.includes('@')) throw new Error('Google did not identify the caller. This cannot authorise tracker updates.');
    return {readOnly:true, email:data.activeEmail, totalMs:Math.round(performance.now()-started), transport:'extension-service-worker', finalOrigin:final.origin};
}
