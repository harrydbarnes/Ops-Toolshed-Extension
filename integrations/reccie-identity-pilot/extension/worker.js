'use strict';
importScripts('config.js');
function pilotEndpoint(value) {
    const url = new URL(value);
    if (url.origin !== 'https://script.google.com' || url.username || url.password ||
        !/^\/(?:a\/macros\/[a-z0-9.-]+|macros)\/s\/[a-zA-Z0-9_-]+\/exec$/.test(url.pathname) || url.search || url.hash) {
        throw new Error('Paste the Apps Script web app URL ending /exec, without extra parameters.');
    }
    return url;
}
async function pilotRequest(url, options = {}) {
    const started = performance.now();
    const response = await fetch(url.href, {method:'GET',credentials:'include',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(20000),...options});
    const origin = new URL(response.url).origin;
    if (!response.ok || !['https://script.google.com','https://script.googleusercontent.com'].includes(origin) ||
        !(response.headers.get('content-type') || '').includes('application/json')) {
        throw new Error(`Google returned HTTP ${response.status} or a sign-in/access page. Open the service once in your work Google account, then retry. Final origin: ${origin}`);
    }
    const data = await response.json();
    if (data.service !== 'ops-toolshed-identity-pilot' || data.protocol !== 1 || data.writeEnabled !== false) throw new Error('Wrong script/version. Expected the identity-only pilot.');
    return {data,totalMs:Math.round(performance.now()-started),finalOrigin:origin};
}
async function runIdentityPilot(endpoint) {
    const url = pilotEndpoint(endpoint);
    const report = {version:'0.1.1',startedAt:new Date().toISOString(),transport:'extension-service-worker',writeEnabled:false,tests:[]};
    for (const forged of [false,true]) {
        const nonce = crypto.randomUUID();
        url.search = '';
        url.searchParams.set('nonce',nonce);
        if (forged) url.searchParams.set('email','forged-user@example.invalid');
        const result = await pilotRequest(url);
        if (result.data.nonce !== nonce) throw new Error('Response nonce mismatch. Do not trust this result.');
        report.tests.push({test:forged?'caller-supplied email ignored':'Google session identity',...result});
    }
    url.search = '';
    const post = await pilotRequest(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({operation:'unsupportedIdentityPilotTest'})});
    report.tests.push({test:'POST refused',...post});
    const [normal,forged] = report.tests;
    report.identityConsistent = normal.data.ok === true && normal.data.identityAvailable === true &&
        typeof normal.data.activeEmail === 'string' && normal.data.activeEmail.includes('@') &&
        forged.data.ok === true && forged.data.identityAvailable === true &&
        normal.data.activeEmail === forged.data.activeEmail && normal.data.activeEmail !== 'forged-user@example.invalid';
    report.postRefused = post.data.ok === false && post.data.error === 'READ_ONLY_PROBE';
    report.ok = report.identityConsistent && report.postRefused;
    return report;
}
chrome.runtime.onMessage.addListener((request,sender,respond)=>{
    if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL('popup.html') || request?.action !== 'identityPilot') return false;
    runIdentityPilot(PILOT_SERVICE_URL).then(report=>respond({ok:true,report}),error=>respond({ok:false,error:error.message}));
    return true;
});
