import '../reccie-writer-mode.js';
import '../reccie-core.js';
const core=globalThis.reccieCore;
const ownerEndpoint='https://script.google.com/a/macros/wppmedia.com/s/AKfycbyqGzdZ98RDsGm3ONfkhB4VL9cINGAqkxIhZ9KepPYdc7DdQPiEAw2g9Y4wu4k2xiqE/exec';
const writerMode=globalThis.opsReccieWriterMode;
const endpoint=writerMode.perUser?writerMode.endpoint:ownerEndpoint;
const trackerId='1QxX7yZvfh75ENyvPG7xD_5ldLuoLwUsTZ6z0edkpORU';
const origins=['https://script.google.com/*','https://script.googleusercontent.com/*'];
const previewPrefix='reccieWritePreview:';
const receiptKey=(mode,month)=>`reccieManualSave:${mode}:${month}`;
async function api(operation,body,beforeSend){
    if(!endpoint||!endpoint.startsWith('https://script.google.com/'))throw Error('The per-user writer service is not configured.');
    if(!await chrome.permissions.contains({origins}))throw Error('Allow Google script access to update the tracker.');
    if(beforeSend)await beforeSend();
    let expectedEmail;
    if(writerMode.perUser&&operation!=='connection'){expectedEmail=(await chrome.storage.session.get('recciePerUserWriterIdentity')).recciePerUserWriterIdentity;if(!expectedEmail)throw Error('Check access using your Google account before continuing.');}
    let response;
    try {
        response=await fetch(endpoint,{method:'POST',credentials:'include',redirect:'follow',cache:'no-store',signal:AbortSignal.timeout(25000),headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({operation,...body,...(writerMode.perUser?{requirePerUser:true,...(expectedEmail?{expectedEmail}:{})}:{})})});
    } catch (cause) {
        const error = new Error('Could not confirm the tracker request. Check the save receipt before retrying.', { cause });
        error.code = 'TRANSPORT_UNCERTAIN';
        throw error;
    }
    if(!response.ok||!['https://script.google.com','https://script.googleusercontent.com'].includes(new URL(response.url).origin)||!(response.headers.get('content-type')||'').includes('application/json'))throw Error('Google returned a sign-in or access page. Open the tracker in your work Google account and try again.');
    const data=await response.json();
    if(data.service!=='ops-toolshed-reccies-writer'||data.protocol!==1)throw Error('The tracker update service is not ready. No confirmed update is available.');
    if(!data.ok){
        const messages={ACCOUNT_CHANGED:'Google is now using a different account. Choose Check access again before saving.',PER_USER_REQUIRED:'Your account now requires the per-user writer. Update Ops Toolshed and reconnect using your own Google account.',PER_USER_SETUP_REQUIRED:'Connect your Google account and enable per-user updates before saving.',PER_USER_ACCESS_REQUIRED:'Check your account and access to both spreadsheets before enabling per-user updates.',BUSY_TRY_AGAIN:'Another tracker save is running. Wait a moment, then try again.',NOTES_TOO_LARGE_NARROW_SELECTION:'These notes are too large for one save. Narrow your filters and update fewer D numbers.',ACCESS_DENIED:'Your Google account is not enabled for tracker updates.',MANUAL_WRITES_DISABLED:'Manual tracker updates are disabled by the owner.',PREVIEW_EXPIRED_OR_WRONG_USER:'The preview expired. Refresh the preview before saving.'};
        const error=Error(messages[data.error]||data.error||'Tracker update failed.');
        error.code=data.error;
        throw error;
    }
    if(writerMode.perUser&&data.effectiveEmail&&data.effectiveEmail!==data.email)throw Error('The writer is not executing as the connected user.');
    if(writerMode.perUser&&operation==='connection'&&data.perUser===true&&typeof data.email==='string')await chrome.storage.session.set({recciePerUserWriterIdentity:data.email});
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
            if(matches.length===1&&matches[0].confirmed===true&&['Yes','No'].includes(matches[0].after)&&['updated','already_yes','unchanged'].includes(matches[0].state)){
                if(row.reccied!==matches[0].after){row.reccied=matches[0].after;changed=true;}
                if(typeof matches[0].commentsAfter==='string'&&row.comments!==matches[0].commentsAfter){row.comments=matches[0].commentsAfter;changed=true;}
            }
        }
        if(changed){tracker.revision=crypto.randomUUID();tracker.lastManualSave={requestId:result.requestId,at:new Date().toISOString()};const values={[`${key}:${month}`]:tracker};if(active?.month===month)values[key]=tracker;await chrome.storage.local.set(values);}
    });
    return tracker;
}
export async function dispatchTrackerWrite(request,{queueWrite,assertActive,automatic=false,beforeCommit}){
    if(['trackerWriteConnection','activatePerUserWriter'].includes(request.operation)){
        if(!writerMode.perUser||automatic)throw Error('Per-user setup is available only in the live-test build.');
        return {connection:await api(request.operation==='trackerWriteConnection'?'connection':'activatePerUser',{mode:request.mode||'main'})};
    }
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
    if(['previewTrackerWrite','previewTrackerEdit'].includes(request.operation)){
        const editing=request.operation==='previewTrackerEdit';
        if(editing&&(automatic||!Array.isArray(request.edits)||request.edits.length!==request.rowIds?.length))throw Error('Invalid manual note update.');
        if(!Array.isArray(request.rowIds)||!request.rowIds.length||request.rowIds.length>100||new Set(request.rowIds).size!==request.rowIds.length)throw Error('Select between 1 and 100 D numbers for one update.');
        const rows=request.rowIds.map(id=>{
            const matches=tracker.rows.filter(row=>row.sourceRow===id);
            if(matches.length!==1||matches[0].issue||matches[0].month!==month)throw Error('Selection contains a missing, duplicate or invalid placement.');
            const row=matches[0];
            if(!editing)return {dNumber:row.dNumber,campaignId:row.campaignId};
            const changes=request.edits.filter(edit=>edit.sourceRow===id);
            if(changes.length!==1||!['Yes','No'].includes(changes[0].reccied)||typeof changes[0].comments!=='string'||changes[0].comments.length>2000||/^\s*=/.test(changes[0].comments))throw Error('Use Yes or No and a note of up to 2,000 characters, without a leading equals sign.');
            return {dNumber:row.dNumber,campaignId:row.campaignId,after:changes[0].reccied,commentsAfter:changes[0].comments,before:row.reccied,commentsBefore:row.comments||''};
        });
        const clearComments=!editing&&request.clearComments===true;
        const payload={mode,month,rows,cause:automatic?'verified':'manual',...(clearComments?{clearComments:true}:{})};
        let result;
        try{result=await api(editing?'previewEdit':'preview',payload);}catch(error){if(editing&&error.message==='INVALID_REQUEST')throw Error('The tracker service needs the notes update. No save was started.');throw error;}
        // Google can redirect the first authenticated POST to the service's GET
        // connection response. Only retry this known read-only response shape.
        if(typeof result.manualEnabled==='boolean'&&typeof result.email==='string'&&!result.requestId&&!result.results){
            result=await api(editing?'previewEdit':'preview',payload);
        }
        if(typeof result.requestId!=='string'||!/^[a-zA-Z0-9-]{20,80}$/.test(result.requestId)||typeof result.token!=='string'||!Array.isArray(result.results))throw Error('Google returned an incomplete tracker preview. No save was started. Close and try the preview again.');
        if(result.mode!==mode||result.month!==month||result.results.length!==rows.length||result.results.some(item=>item.month!==month)||rows.some(row=>rows.filter(other=>row.dNumber===other.dNumber&&row.campaignId===other.campaignId).length!==1||result.results.filter(item=>row.dNumber===item.dNumber&&row.campaignId===item.campaignId).length!==1))throw Error('Tracker preview does not match the selected placements.');
        if(editing&&(result.kind!=='edit'||result.results.some(item=>!rows.some(row=>row.dNumber===item.dNumber&&row.campaignId===item.campaignId&&row.after===item.after&&row.commentsAfter===item.commentsAfter))))throw Error('The tracker service needs the notes update. No save was started.');
        if(clearComments&&(result.clearComments!==true||result.kind!=='edit'||result.results.some(item=>item.state==='eligible'&&(item.after!=='Yes'||item.commentsAfter!==''))))throw Error('The tracker service needs the comment-removal update. No save was started.');
        const current=(await chrome.storage.local.get(key))[key];
        if(current?.revision!==request.revision)throw Error('The report changed while loading the preview. Preview again.');
        const previews=Object.entries(await chrome.storage.session.get(null)).filter(([key])=>key.startsWith(previewPrefix));
        const expired=previews.filter(([,item])=>item.expires<Date.now()).map(([key])=>key);
        if(expired.length)await chrome.storage.session.remove(expired);
        if(previews.length-expired.length>=20)throw Error('Too many open previews. Wait for older previews to expire, then try again.');
        await chrome.storage.session.set({[previewPrefix+result.requestId]:{token:result.token,revision:request.revision,mode,month,expires:Date.now()+Math.max(1,Math.min(Number(result.expiresInSeconds)||120,600)-10)*1000}});
        delete result.token;return {write:result};
    }
    if(request.operation!=='commitTrackerWrite')throw Error('Unknown tracker update action.');
    if(automatic&&typeof beforeCommit!=='function')throw Error('Automatic tracker updates need a current opt-in check.');
    const previewKey=previewPrefix+request.requestId;
    const prepared=(await chrome.storage.session.get(previewKey))[previewKey];
    if(!prepared||prepared.expires<Date.now()||prepared.revision!==request.revision||prepared.mode!==mode||prepared.month!==month)throw Error('The preview expired. Preview again before saving.');
    await chrome.storage.session.remove(previewKey);
    await chrome.storage.local.set({[receiptKey(mode,month)]:{requestId:request.requestId,mode,month}});
    const result=await api('commit',{requestId:request.requestId,token:prepared.token},automatic?beforeCommit:undefined);
    if(result.requestId!==request.requestId)throw Error('Unexpected save receipt. Use Check save result before retrying.');
    return {write:result,tracker:await applyReceipt(result,key,mode,month,queueWrite)};
}
