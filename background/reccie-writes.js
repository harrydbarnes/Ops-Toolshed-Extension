import '../reccie-core.js';
const core=globalThis.reccieCore;
const endpoint='https://script.google.com/a/macros/wppmedia.com/s/AKfycbyqGzdZ98RDsGm3ONfkhB4VL9cINGAqkxIhZ9KepPYdc7DdQPiEAw2g9Y4wu4k2xiqE/exec';
const trackerId='1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU';
const origins=['https://script.google.com/*','https://script.googleusercontent.com/*'];
const pending=new Map();
const receiptKey=(mode,month)=>`reccieManualSave:${mode}:${month}`;
async function api(operation,body){
    if(!await chrome.permissions.contains({origins}))throw Error('Allow Google script access to update the tracker.');
    const response=await fetch(endpoint,{method:'POST',credentials:'include',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({operation,...body})});
    if(!response.ok||!['https://script.google.com','https://script.googleusercontent.com'].includes(new URL(response.url).origin)||!(response.headers.get('content-type')||'').includes('application/json'))throw Error('Google returned a sign-in or access page. Open the tracker in your work Google account and try again.');
    const data=await response.json();
    if(data.service!=='ops-toolshed-reccies-writer'||data.protocol!==1)throw Error('The tracker update service is not ready. No confirmed update is available.');
    if(!data.ok)throw Error(({ACCESS_DENIED:'Your Google account is not enabled for tracker updates.',MANUAL_WRITES_DISABLED:'Manual tracker updates are disabled by the owner.',PREVIEW_EXPIRED_OR_WRONG_USER:'The preview expired. Open a new preview before saving.'})[data.error]||data.error||'Tracker update failed.');
    return data;
}
function liveTracker(tracker,month){
    if(!tracker||tracker.month!==month||tracker.source?.type!=='google')return false;
    try{return core.sheetSource(tracker.source.url).spreadsheetId===trackerId;}catch(_){return false;}
}
async function applyReceipt(result,key,mode,month,queueWrite){
    let tracker;
    await queueWrite(async()=>{
        const stored=await chrome.storage.local.get([key,`${key}:${month}`]);
        const active=stored[key];tracker=active?.month===month?active:stored[`${key}:${month}`];
        if(!liveTracker(tracker,month))return;
        if(result.mode!==mode||result.month!==month||result.state!=='complete'||!Array.isArray(result.results))return;
        let changed=false;
        for(const row of tracker.rows){
            if(tracker.rows.filter(other=>other.dNumber===row.dNumber&&other.campaignId===row.campaignId&&other.month===row.month).length!==1)continue;
            const matches=result.results.filter(item=>item.dNumber===row.dNumber&&item.campaignId===row.campaignId&&item.month===row.month);
            if(matches.length===1&&matches[0].confirmed===true&&matches[0].after==='Yes'&&['updated','already_yes'].includes(matches[0].state)&&row.reccied!=='Yes'){
                row.reccied='Yes';changed=true;
            }
        }
        if(changed){tracker.revision=crypto.randomUUID();tracker.lastManualSave={requestId:result.requestId,at:new Date().toISOString()};const values={[`${key}:${month}`]:tracker};if(active?.month===month)values[key]=tracker;await chrome.storage.local.set(values);}
    });
    return tracker;
}
export async function manualTrackerWrite(request,{queueWrite,assertActive}){
    const mode=request.mode||'main',month=request.month,key=core.trackerKey(mode,month);
    if(!['main','early'].includes(mode)||!core.validMonth(month))throw Error('Manual updates need a Main Tracker or Early Recs report month.');
    if(request.operation==='trackerWriteStatus'){
        if(typeof request.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(request.requestId))throw Error('Invalid save request.');
        const result=await api('status',{requestId:request.requestId});
        if(result.requestId!==request.requestId)throw Error('Unexpected save receipt. Refresh the tracker before retrying.');
        const tracker=await applyReceipt(result,key,mode,month,queueWrite);
        return {write:result,tracker};
    }
    const stored=await chrome.storage.local.get(key),tracker=stored[key];
    if(!liveTracker(tracker,month))throw Error('Connect the live Ops Reccie Tracker before updating it. CSV and visited-campaign reports cannot be written.');
    if(tracker.revision!==request.revision)throw Error('The report changed. Open a new write preview.');
    assertActive();
    if(request.operation==='previewTrackerWrite'){
        if(!Array.isArray(request.rowIds)||!request.rowIds.length||request.rowIds.length>100||new Set(request.rowIds).size!==request.rowIds.length)throw Error('Select between 1 and 100 D numbers for one update.');
        const rows=request.rowIds.map(id=>{
            const matches=tracker.rows.filter(row=>row.sourceRow===id);
            if(matches.length!==1||matches[0].issue||matches[0].month!==month)throw Error('Selection contains a missing, duplicate or invalid placement.');
            return {dNumber:matches[0].dNumber,campaignId:matches[0].campaignId};
        });
        let result=await api('preview',{mode,month,rows});
        // Google can redirect the first authenticated POST to the service's GET
        // connection response. Only retry this known read-only response shape.
        if(typeof result.manualEnabled==='boolean'&&typeof result.email==='string'&&!result.requestId&&!result.results){
            result=await api('preview',{mode,month,rows});
        }
        if(typeof result.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(result.requestId)||typeof result.token!=='string'||!Array.isArray(result.results))throw Error('Google returned an incomplete tracker preview. No save was started. Close and try the preview again.');
        if(result.mode!==mode||result.month!==month||result.results.length!==rows.length||result.results.some(item=>item.month!==month||!rows.some(row=>row.dNumber===item.dNumber&&row.campaignId===item.campaignId)))throw Error('Tracker preview does not match the selected placements.');
        const current=(await chrome.storage.local.get(key))[key];
        if(current?.revision!==request.revision)throw Error('The report changed while loading the preview. Preview again.');
        for(const [id,item]of pending)if(item.expires<Date.now())pending.delete(id);
        if(pending.size>=20)throw Error('Too many open previews. Close them and try again in two minutes.');
        pending.set(result.requestId,{token:result.token,revision:request.revision,mode,month,expires:Date.now()+110000});
        delete result.token;return {write:result};
    }
    if(request.operation!=='commitTrackerWrite')throw Error('Unknown tracker update action.');
    const prepared=pending.get(request.requestId);
    if(!prepared||prepared.expires<Date.now()||prepared.revision!==request.revision||prepared.mode!==mode||prepared.month!==month)throw Error('The preview expired. Preview again before saving.');
    pending.delete(request.requestId);
    await chrome.storage.local.set({[receiptKey(mode,month)]:{requestId:request.requestId,mode,month}});
    const result=await api('commit',{requestId:request.requestId,token:prepared.token});
    if(result.requestId!==request.requestId)throw Error('Unexpected save receipt. Use Check save result before retrying.');
    return {write:result,tracker:await applyReceipt(result,key,mode,month,queueWrite)};
}
