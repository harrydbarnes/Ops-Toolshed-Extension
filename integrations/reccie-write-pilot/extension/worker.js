'use strict';
importScripts('config.js');
let pendingToken = null;
async function pilotCall(operation, token) {
    if (!WRITE_PILOT_URL) throw Error('This pilot backend is not deployed yet.');
    const url=new URL(WRITE_PILOT_URL),nonce=crypto.randomUUID();
    if(url.origin!=='https://script.google.com') throw Error('Invalid pilot configuration.');
    const options={credentials:'include',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(90000)};
    if(operation==='access') {url.searchParams.set('nonce',nonce);options.method='GET';}
    else {options.method='POST';options.headers={'Content-Type':'text/plain;charset=UTF-8'};options.body=JSON.stringify({operation, ...(token?{token}: {})});}
    const response=await fetch(url.href,options);
    if(!response.ok || !['https://script.google.com','https://script.googleusercontent.com'].includes(new URL(response.url).origin) || !(response.headers.get('content-type')||'').includes('application/json')) throw Error('Google returned a sign-in/access page or HTTP error. Check your work Google session.');
    const data=await response.json();
    if(data.service!=='ops-toolshed-write-pilot'||data.protocol!==1)throw Error('Wrong service version.');
    if(operation==='access'&&data.ok&&data.nonce!==nonce)throw Error('Response nonce mismatch.');
    return data;
}
chrome.runtime.onMessage.addListener((request,sender,respond)=>{
    if(sender.id!==chrome.runtime.id||sender.url!==chrome.runtime.getURL('popup.html')||request.action!=='writePilot')return false;
    (async()=>{
        if(!['access','prepare','roundTrip'].includes(request.operation))throw Error('Unsupported operation.');
        if(request.operation==='prepare') {
            pendingToken=null;
            const result=await pilotCall('prepare');
            if(result.ok&&typeof result.token==='string'){pendingToken={value:result.token,expires:Date.now()+110000};delete result.token;}
            return result;
        }
        if(request.operation==='roundTrip') {
            if(!pendingToken||Date.now()>pendingToken.expires)throw Error('Prepare the test again; the short-lived token expired.');
            const token=pendingToken.value;pendingToken=null;
            return pilotCall('roundTrip',token);
        }
        return pilotCall('access');
    })().then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));
    return true;
});
