import '../reccie-core.js';
import {manualTrackerWrite} from './reccie-writes.js';
const core=globalThis.reccieCore;
export const RECCIE_ALARM='ops-reccie-financial:';
export function assigned(row,prefs){return !!prefs?.person&&(prefs.assignment==='any'?['ops','buyer','group']:[prefs.assignment]).some(key=>['ops','buyer','group'].includes(key)&&row[key]?.toLowerCase()===prefs.person.toLowerCase());}
export async function autoMarkVerified(tracker,request,context){
    const mode=request.mode||'main',key=core.trackerKey(mode,request.month);
    const stored=await chrome.storage.local.get(['reccieAutomation',mode==='main'?'recciePreferences':`${key}:preferences`]);
    const prefs=stored[mode==='main'?'recciePreferences':`${key}:preferences`];
    if((request.financial&&!stored.reccieAutomation?.afterFinancial)||!stored.reccieAutomation?.autoMark||tracker.source?.type!=='google'||!['main','early'].includes(mode))return tracker;
    const ids=new Set(request.rowIds),now=Date.now();
    // Index every tracker row, including rows outside this request/assignment.
    // Separate Map levels preserve exact field equality without delimiter collisions.
    const duplicateCounts = new Map();
    for (const row of tracker.rows) {
        const { dNumber, campaignId, month } = row;
        // NaN never matched itself in the original strict-equality predicate.
        if ([dNumber, campaignId, month].some(value => value !== value)) continue;
        if (!duplicateCounts.has(dNumber)) duplicateCounts.set(dNumber, new Map());
        const campaigns = duplicateCounts.get(dNumber);
        if (!campaigns.has(campaignId)) campaigns.set(campaignId, new Map());
        const months = campaigns.get(campaignId);
        months.set(month, (months.get(month) || 0) + 1);
    }
    const eligible=tracker.rows.filter(row=>{
        const check=tracker.checks?.[row.sourceRow],age=now-Date.parse(check?.checkedAt);
        return ids.has(row.sourceRow)&&assigned(row,prefs)&&!row.issue&&row.reccied.trim().toLowerCase()!=='yes'&&check?.state==='ready'&&check.reconciled==='1'&&check.buyStatus==='SUCCESSFUL'&&age>=0&&age<300000&&duplicateCounts.get(row.dNumber)?.get(row.campaignId)?.get(row.month)===1;
    });
    const assertOptIn=async()=>{context.assertActive();const settings=(await chrome.storage.local.get('reccieAutomation')).reccieAutomation;if(!settings?.autoMark||(request.financial&&!settings.afterFinancial))throw Error('Automatic tracker updates were switched off.');};
    let current=tracker,saved=0,pending=0,error='';
    for(let offset=0;offset<eligible.length;offset+=100){
        const rows=eligible.slice(offset,offset+100);let requestId;
        try{
            await assertOptIn();
            const preview=await manualTrackerWrite({operation:'previewTrackerWrite',mode,month:request.month,revision:current.revision,rowIds:rows.map(r=>r.sourceRow)}, {...context,automatic:true});
            requestId=preview.write.requestId;await assertOptIn();
            const latest=(await chrome.storage.local.get([key,mode==='main'?'recciePreferences':`${key}:preferences`]));
            const latestPrefs=latest[mode==='main'?'recciePreferences':`${key}:preferences`];
            if(rows.some(row=>!assigned(row,latestPrefs)||Date.now()-Date.parse(latest[key]?.checks?.[row.sourceRow]?.checkedAt)>=300000))throw Error('Assignment or verification freshness changed before saving. Verify again.');
            await saveAutoReceipt(requestId,mode,request.month,{financial:!!request.financial,remaining:eligible.slice(offset+100).map(({dNumber,campaignId,month})=>({dNumber,campaignId,month}))});
            await chrome.storage.local.set({reccieAutomationLastRun:{at:new Date().toISOString(),state:'saving',message:`Saving ${rows.length} D numbers; ${eligible.length-offset-rows.length} remaining.`}});
            let result;
            try{result=await manualTrackerWrite({operation:'commitTrackerWrite',mode,month:request.month,revision:current.revision,requestId},{...context,automatic:true});}
            catch(failure){
                if(!/timed? ?out|timeout|fetch|network|connection/i.test(failure.message))throw failure;
                result=await manualTrackerWrite({operation:'trackerWriteStatus',mode,month:request.month,requestId},context);
            }
            if(result.tracker)current=result.tracker;
            if(result.write.state!=='complete'){pending++;break;}
            await clearAutoReceipt(requestId);
            saved+=result.write.results.filter(r=>r.confirmed&&r.state==='updated').length;
        }catch(failure){error=failure.message;if(requestId){pending++;}break;}
    }
    current.lastAutoUpdate={at:new Date().toISOString(),saved,pending,error,eligible:eligible.length};
    await context.queueWrite(async()=>{const latest=(await chrome.storage.local.get(key))[key];if(latest?.revision===current.revision){latest.lastAutoUpdate=current.lastAutoUpdate;await chrome.storage.local.set({[key]:latest,[`${key}:${request.month}`]:latest});}});
    return current;
}

// One record per request prevents another manual save replacing recovery state.
export async function saveAutoReceipt(requestId,mode,month,continuation={}){
    const key='reccieAutoReceipt:'+requestId;
    await chrome.storage.local.set({[key]:{requestId,mode,month,attempts:0,due:Date.now()+60000,...continuation}});
    await chrome.alarms.create(RECCIE_ALARM+'receipt:'+requestId,{when:Date.now()+60000});
}
export async function clearAutoReceipt(requestId){await chrome.storage.local.remove('reccieAutoReceipt:'+requestId);await chrome.alarms.clear(RECCIE_ALARM+'receipt:'+requestId);}
