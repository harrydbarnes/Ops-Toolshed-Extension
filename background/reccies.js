import '../reccie-core.js';
import { testReccieGoogleConnection } from './reccie-connection-probe.js';
import {autoMarkVerified,assigned,RECCIE_ALARM,clearAutoReceipt} from './reccie-automation.js';
import { manualTrackerWrite } from './reccie-writes.js';
import { buildReccieQuery } from './reccie-query.js';
import { isFeatureModeActive } from './feature-mode.js';

const core = globalThis.reccieCore;
let checking = false;
let writes = Promise.resolve();
function queueWrite(work) {
    const pending = writes.then(work);
    writes = pending.catch(() => {});
    return pending;
}
const ownPage = sender => sender?.id === chrome.runtime.id &&
    ['reccies.html', 'popup.html'].some(path => sender.url?.split(/[?#]/)[0] === chrome.runtime.getURL(path));
function assertActive() {
    if (!isFeatureModeActive()) throw new Error('Enable Prisma features to use Reccies.');
}
async function assertPrismaProfile() {
    assertActive();
    const settings = await chrome.storage.sync.get({ allFeaturesDisabled: false, onboardingAudience: 'prisma' });
    if (settings.allFeaturesDisabled || settings.onboardingAudience === 'non-prisma') throw new Error('Choose the Prisma profile and enable features to check Reccies.');
}
async function prisma(path, body, requests, attempt, deadline, method) {
    await assertPrismaProfile();
    const started = performance.now();
    const timeoutMs = Math.min(method.requestTimeoutMs, Math.ceil(deadline - started));
    if (timeoutMs <= 0) throw new Error('Verification time limit reached. Verify these rows again.');
    const timing = { phase: body ? 'grid' : 'lookup', attempt, startedMs: Math.round(started - (deadline - method.runBudgetMs)),
        timeoutMs, httpStatus: null, headersMs: null, totalMs: 0, ok: false };
    requests.push(timing);
    try {
        const response = await fetch(`https://go.mediaocean.com/campaign-service/secure/campaign/${path}`, {
            method: body ? 'PUT' : 'GET', credentials: 'include', redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs),
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {})
        });
        timing.headersMs = Math.round(performance.now() - started);
        timing.httpStatus = response.status ?? null;
        if (!response.ok) {
            const error = new Error(`Prisma HTTP ${response.status}. Check your signed-in session and campaign access.`);
            error.retryable = [500, 502, 503, 504].includes(response.status);
            throw error;
        }
        assertActive();
        const data = await response.json();
        timing.ok = true;
        return data;
    } catch (error) {
        timing.errorName = error.name;
        timing.timedOut = ['TimeoutError', 'AbortError'].includes(error.name);
        const failure = timing.timedOut ? new Error(`Prisma request timed out after ${(timeoutMs / 1000).toFixed(1)} seconds. Verify these rows again if the retry also fails.`) : error;
        if (timing.timedOut) failure.name = error.name;
        if (timing.timedOut || error instanceof TypeError) failure.retryable = true;
        throw failure;
    } finally { timing.totalMs = Math.round(performance.now() - started); }
}
function getRecciesPanelTarget(request, sender) {
    if (!isFeatureModeActive()) {
        const error = new Error('Enable Ops Toolshed features to open Reccies.');
        error.code = 'FEATURES_DISABLED';
        throw error;
    }
    let prismaSender = false;
    try {
        const url = new URL(sender?.url);
        prismaSender = sender.id === chrome.runtime.id && sender.tab?.id &&
            (sender.frameId == null || sender.frameId === 0) && url.origin === 'https://go.mediaocean.com' && url.pathname.startsWith('/campaign-management/');
    } catch (_) { /* Only extension pages or the signed-in Prisma top frame may open this panel. */ }
    if (!ownPage(sender) && !prismaSender) throw new Error('Open Reccies from Ops Toolshed or Prisma.');
    const windowId = sender.tab?.windowId ?? request.windowId;
    if (!Number.isInteger(windowId)) throw new Error('Could not identify the active Chrome window.');
    const tabId = sender.tab?.id ?? request.tabId;
    return { windowId, tabId };
}

export async function prepareReccies(request, sender, sendResponse) {
    try {
        getRecciesPanelTarget(request, sender);
        // Enable the existing global panel without changing its current path or
        // opening it. Preparation must not replace an open Help Guides panel.
        await chrome.sidePanel.setOptions({ enabled: true });
        if (!isFeatureModeActive()) {
            await chrome.sidePanel.setOptions({ enabled: false });
            throw Object.assign(new Error('Enable Ops Toolshed features to open Reccies.'), { code: 'FEATURES_DISABLED' });
        }
        sendResponse({ status: 'success' });
    } catch (error) { sendResponse({ status: 'error', message: error.message, ...(error.code ? { code: error.code } : {}) }); }
}

export async function openReccies(request, sender, sendResponse) {
    try {
        const { windowId, tabId } = getRecciesPanelTarget(request, sender);
        // Preserve the original click gesture, as with the Help Guides launcher.
        const opening = chrome.sidePanel.open({ windowId });
        const options = [chrome.sidePanel.setOptions({ path: 'reccies.html', enabled: true })];
        // Replace a Help Guides tab override too; keep the global panel available
        // when a placement opens in a different tab in this window.
        if (Number.isInteger(tabId)) options.push(chrome.sidePanel.setOptions({ tabId, path: 'reccies.html', enabled: true }));
        await Promise.all([opening, ...options]);
        sendResponse({ status: 'success' });
    } catch (error) { sendResponse({ status: 'error', message: error.message, ...(error.code ? { code: error.code } : {}) }); }
}
async function storeTracker(request, rows, source, checks = {}, expectedRevision, timing) {
    const key = core.trackerKey(request.mode, request.month);
    const tracker = {rows,month:request.month,mode:request.mode || 'main',source,checks,importedAt:new Date().toISOString(),revision:crypto.randomUUID(),...(timing ? {lastCheckTiming:timing} : {})};
    assertActive();
    await queueWrite(async()=>{
        const previous=(await chrome.storage.local.get(key))[key];
        if (expectedRevision !== undefined && (previous?.revision || '') !== expectedRevision) throw new Error('Report changed during discovery. Results discarded.');
        const values = {[key]:tracker};
        if (!request.mode || request.mode === 'main') {
            if (previous?.month) values[`${key}:${previous.month}`]=previous;
            values[`${key}:${request.month}`]=tracker;
        }
        await chrome.storage.local.set(values);
    });
    return tracker;
}
async function importTracker(request, text, source) {
    if (request.mode === 'early') {
        const report = core.earlyRows(text, request.month);
        if (!report.rows.length) return discoverTracker(request, report.reason, source);
        return storeTracker(request,report.rows,{...source,tab:'Early Reccie report',excludedRows:report.excludedRows,ambiguousRows:report.ambiguousRows});
    }
    return storeTracker(request,core.importCsv(text,request.month),source);
}
async function runGroups(groups, method, options, started = performance.now()) {
        const timing = { method, rows: options.rows, campaigns: groups.size, concurrency: method.concurrency,
            runBudgetMs: method.runBudgetMs, skippedRows: options.skippedRows || 0, cacheHits: 0, retries: 0, campaignsDetail: [] };
        const deadline = started + method.runBudgetMs;
        const queue = [...groups.values()].map(group => ({ group, attempt: 1, campaign: null }));
        const worker = async () => {
            while (queue.length) {
                const task = queue.shift(), {group} = task, first = group[0];
                if (!task.timing) {
                    task.timing = { campaign: first.campaignId, month: first.month, rows: options.discovery ? 0 : group.length,
                        queueMs: Math.round(performance.now() - started), requests: [], outcome: 'error', attempts: 0, totalMs: 0 };
                    timing.campaignsDetail.push(task.timing);
                }
                const campaignTiming = task.timing;
                // Failed requests go behind untouched campaigns; avoid an immediate retry on small runs too.
                if (task.readyAt) await new Promise(resolve => setTimeout(resolve, Math.max(0, Math.min(task.readyAt, deadline) - performance.now())));
                const campaignStarted = performance.now();
                try {
                    if (campaignStarted >= deadline) throw new Error('Verification time limit reached. Verify these rows again.');
                    campaignTiming.attempts++;
                    if (task.attempt > 1) {
                        timing.retries++;
                        campaignTiming.retryQueueMs = Math.round(campaignStarted - started);
                    }
                    const campaign = task.campaign || await prisma(`publicforui/${first.campaignId}`, undefined, campaignTiming.requests, task.attempt, deadline, method);
                    if (campaign.publicId !== first.campaignId || !/^\d+$/.test(String(campaign.id))) throw new Error('Prisma returned a different campaign.');
                    task.campaign = campaign;
                    const data = await prisma(`${campaign.id}/queryservice/mediaplan/hybrid/actualize`, buildReccieQuery(first.month), campaignTiming.requests, task.attempt, deadline, method);
                    const records = core.extractResults(data);
                    const checkedAt = new Date().toISOString();
                    const count = options.onRecords(group, records, checkedAt);
                    if (Number.isInteger(count)) campaignTiming.rows = count;
                    campaignTiming.outcome = 'success';
                    delete campaignTiming.errorName;
                    delete campaignTiming.message;
                } catch (error) {
                    campaignTiming.errorName = error.name;
                    campaignTiming.message = error.message;
                    if (task.attempt <= method.retryLimit && error.retryable && performance.now() + 1000 < deadline) {
                        task.attempt++;
                        task.readyAt = performance.now() + 1000;
                        queue.push(task);
                        continue;
                    }
                    const checkedAt = new Date().toISOString();
                    options.onError(group, error, checkedAt);
                } finally { campaignTiming.totalMs += Math.round(performance.now() - campaignStarted); }
            }
        };
        await Promise.all(Array.from({length: method.concurrency}, () => worker()));
        return timing;
}
async function checkRows(request) {
    if (checking) throw new Error('A Reccies check is already running.');
    checking = true;
    const started = performance.now();
    try {
        const method = core.verificationMethod(request.method);
        const placementIds=request.placementIds?new Set(request.placementIds):null;
        const key = core.trackerKey(request.mode, request.month);
        const tracker = (await chrome.storage.local.get(key))[key];
        if (!tracker || tracker.revision !== request.revision) throw new Error('The report changed. Reload Reccies and check again.');
        if (!Array.isArray(request.rowIds) || !request.rowIds.length || request.rowIds.length > method.maxRows) throw new Error(`Choose up to ${method.maxRows} rows per check.`);
        const ids = new Set(request.rowIds);
        const rows = tracker.rows.filter(row => ids.has(row.sourceRow));
        if (rows.length !== ids.size) throw new Error('Some selected rows are no longer in this report.');
        const groups = new Map(), results = {};
        for (const row of rows) {
            if (row.issue) { results[row.sourceRow] = { state: 'review', message: row.issue }; continue; }
            const key = `${row.campaignId}/${row.month}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        }
        if (groups.size > method.maxCampaigns) throw new Error(`Check up to ${method.maxCampaigns} campaigns per batch.`);
        const timing = await runGroups(groups, method, {
            rows: rows.length, skippedRows: Object.keys(results).length,
            onRecords: (group, records, checkedAt) => { group.forEach(row => { if(placementIds&&!records.some(record=>record.buySerialNumber===row.dNumber&&record.month===row.month&&placementIds.has(record.placementNumber)))return; results[row.sourceRow] = { ...core.evaluateRow(row, records), checkedAt }; }); },
            onError: (group, error, checkedAt) => { group.forEach(row => { results[row.sourceRow] = {state:'error',message:error.message,checkedAt}; }); }
        }, started);
        assertActive();
        const updated = await queueWrite(async () => {
            const current = (await chrome.storage.local.get(key))[key];
            if (current?.revision !== tracker.revision) throw new Error('Report refreshed during the check. Results were discarded.');
            current.checks = { ...current.checks, ...results };
            delete current.lastAutoUpdate;
            timing.totalMs = Math.round(performance.now() - started);
            current.lastCheckTiming = timing;
            await chrome.storage.local.set({ [key]: current, ...(!request.mode || request.mode==='main' ? {[`${key}:${current.month}`]:current} : {}) });
            return current;
        });
        return await autoMarkVerified(updated,{...request,rowIds:Object.keys(results).map(Number)},{queueWrite,assertActive});
    } finally { checking = false; }
}
async function discoverTracker(request, fallbackReason = '', sheetSource = {}) {
    if (!['early','automatic'].includes(request.mode)) throw new Error('Choose Early Recs or Automatic for visited campaigns.');
    if (request.month !== core.currentMonth()) throw new Error('Visited campaign discovery uses the current month.');
    if (checking) throw new Error('A Reccies check is already running.');
    checking=true;
    const started=performance.now(), startedAt=new Date().toISOString();
    try {
        const key=core.trackerKey(request.mode,request.month);
        const stored=await chrome.storage.local.get(['campaignHistoryEntries',key]);
        const previous=stored[key];
        const history = Array.isArray(stored.campaignHistoryEntries) ? stored.campaignHistoryEntries : [];
        const eligible = new Map();
        history.slice().sort((a,b)=>(b.lastVisitedAt||0)-(a.lastVisitedAt||0)).forEach(entry=>{
            const date=new Date(entry.lastVisitedAt);
            const parts=Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/London',year:'numeric',month:'2-digit'}).formatToParts(date) : [];
            const month=`${parts.find(part=>part.type==='year')?.value}-${parts.find(part=>part.type==='month')?.value}`;
            if (month===request.month && /^CP[A-Z0-9]{3,20}$/.test(entry.campaignId) && !eligible.has(entry.campaignId)) eligible.set(entry.campaignId,entry);
        });
        const method=core.verificationMethod(request.method), seeds=[...eligible.values()].slice(0,method.maxCampaigns);
        const groups=new Map(seeds.map((entry,index)=>[entry.campaignId,[{...entry,sourceRow:index+1,month:request.month}]]));
        const rows=[],checks={},issues=[];
        const addRow=(row,result)=>{row.sourceRow=rows.length+2;rows.push(row);checks[row.sourceRow]=result;};
        const timing=await runGroups(groups,method,{rows:0,discovery:true,onRecords:(group,records,checkedAt)=>{
            const first=group[0],unique=[...new Set(records.filter(record=>record.month===request.month && /^D\d{5,15}$/.test(record.buySerialNumber)).map(record=>record.buySerialNumber))];
            if (rows.length+unique.length>10000) throw new Error('Discovery exceeded 10,000 placements.');
            unique.forEach(dNumber=>{
                const record=records.find(record=>record.buySerialNumber===dNumber && record.month===request.month);
                const row={dNumber,campaignId:first.campaignId,month:request.month,campaignName:first.campaignName || first.campaignId,client:first.clientName || '',supplier:String(record.supplier || first.supplier || ''),order:'',gross:'',comments:'',buyer:'',ops:'',group:'',reccied:'',issue:'',origin:'visited-campaign'};
                addRow(row,{...core.evaluateRow(row,records),checkedAt});
            });
            return unique.length;
        },onError:(group,error,checkedAt)=>{
            const campaignId=group[0].campaignId;issues.push({campaignId,message:error.message});
            (previous?.rows || []).filter(row=>row.campaignId===campaignId).forEach(row=>addRow({...row},{state:'error',message:error.message,checkedAt}));
        }});
        const source={type:'automatic',url:sheetSource.url || previous?.source?.url || '',fallback:request.mode==='early',fallbackReason,
            eligibleCampaigns:eligible.size,attemptedCampaigns:seeds.length,successfulCampaigns:seeds.length-issues.length,limited:eligible.size>seeds.length,issues,
            coverage:'Current-month placements from campaigns visited this month in this Chrome profile. Not proof of who booked them.'};
        timing.totalMs = Math.round(performance.now()-started);
        timing.startedAt=startedAt; timing.mode=request.mode; timing.methodConfirmed=true;
        const tracker=await storeTracker(request,rows,source,checks,previous?.revision || '',{...timing,type:'discovery',rows:rows.length});
        return tracker;
    } finally {checking=false;}
}
export async function handleReccies(request, sender, sendResponse) {
    try {
        if (!ownPage(sender)) throw new Error('Tracker data is available only in Ops Toolshed.');
        await assertPrismaProfile();
        if (['previewTrackerWrite','commitTrackerWrite','trackerWriteStatus'].includes(request.operation)) {
            const result = await manualTrackerWrite(request,{queueWrite,assertActive});
            sendResponse({status:'success',...result});
            return;
        }
        if (request.operation === 'testGoogleConnection') {
            sendResponse({status:'success', connection:await testReccieGoogleConnection()});
            return;
        }
        let tracker;
        core.trackerKey(request.mode,request.month);
        if (request.mode === 'automatic' && ['refresh','import'].includes(request.operation)) throw new Error('Automatic uses visited campaigns, not a sheet import.');
        if (request.operation === 'import') tracker = await importTracker(request, request.csv, { type: 'csv', name: String(request.name || 'CSV import').slice(0, 150) });
        else if (request.operation === 'refresh') {
            const source = core.sheetSource(request.url);
            if (!await chrome.permissions.contains({ origins: ['https://docs.google.com/*'] })) throw new Error('Allow Google Sheets read access first.');
            const csvUrl=request.mode==='early' ? `https://docs.google.com/spreadsheets/d/${source.spreadsheetId}/gviz/tq?tqx=out:csv&sheet=Early%20Reccie%20report` : source.csvUrl;
            const response = await fetch(csvUrl, { method: 'GET', credentials: 'include', redirect: 'error', signal: AbortSignal.timeout(30000), cache: 'no-store' });
            if (!response.ok || !(response.headers.get('content-type') || '').includes('text/csv')) throw new Error('Google did not return CSV. Sign into the Google account with tracker access, or import a CSV.');
            tracker = await importTracker(request, await response.text(), { type: 'google', url: source.url });
        } else if (request.operation === 'discover') tracker=await discoverTracker(request,request.mode==='early' ? 'Visited campaigns explicitly selected as Early Recs fallback.' : '');
        else if (request.operation === 'load') {
            const key=core.trackerKey(request.mode,request.month);
            const stored=await chrome.storage.local.get([key,`${key}:${request.month}`]);
            tracker=stored[`${key}:${request.month}`] || stored[key];
            if (tracker?.month !== request.month) tracker=null;
        } else if (request.operation === 'check') tracker = await checkRows(request);
        else if (request.operation === 'clear') {
            const key=core.trackerKey(request.mode,request.month);
            await queueWrite(async()=>{
                const previous=(await chrome.storage.local.get(key))[key];
                await chrome.storage.local.remove([key,`${key}:${request.month || previous?.month}`, request.mode && request.mode!=='main' ? `${key}:preferences` : 'recciePreferences', request.mode && request.mode!=='main' ? `${key}:timing` : 'reccieLastRunTiming']);
            });
        }
        else throw new Error('Unknown Reccies action.');
        sendResponse({ status: 'success', tracker });
    } catch (error) { sendResponse({ status: 'error', message: error.message }); }
}

// The content event is a scheduling hint, never evidence that a placement is ready.
export async function scheduleFinancialVerification(request,sender,sendResponse){
    try{
        await assertPrismaProfile();const url=new URL(sender?.url),params=new URLSearchParams(url.hash.slice(1));
        const campaignId=params.get('campaign-id');
        if(sender.id!==chrome.runtime.id||!sender.tab?.id||(sender.frameId!=null&&sender.frameId!==0)||url.origin!=='https://go.mediaocean.com'||!url.pathname.startsWith('/campaign-management/')||!/^CP[A-Z0-9]{3,20}$/.test(campaignId||'')||params.get('ptb-ctx')!=='actualize')throw Error('Use the Actualise financial update menu.');
        const settings=(await chrome.storage.local.get('reccieAutomation')).reccieAutomation;
        if(!settings?.afterFinancial){sendResponse({status:'success',scheduled:false});return;}
        if(!Array.isArray(request.changes)||!request.changes.length||request.changes.length>24)throw Error('No confirmed reconciliation changes were supplied.');
        const updates=request.changes.map(change=>{
            if(!core.validMonth(change.month)||!Array.isArray(change.placementIds)||!change.placementIds.length||change.placementIds.length>1000||change.placementIds.some(id=>!/^P[A-Z0-9]{3,20}$/.test(id)))throw Error('Invalid reconciliation change selection.');
            return {month:change.month,placementIds:[...new Set(change.placementIds)]};
        });
        const due=Date.now()+180000;
        await queueWrite(async()=>{const jobs=(await chrome.storage.local.get('reccieFinancialJobs')).reccieFinancialJobs||{};
            for(const update of updates){const id=campaignId+':'+update.month;if(Object.keys(jobs).length>=50&&!jobs[id])throw Error('Too many pending financial checks.');const placementIds=[...new Set([...(jobs[id]?.placementIds||[]),...update.placementIds])];if(placementIds.length>1000)throw Error('Too many pending placement changes for this campaign/month.');jobs[id]={campaignId,month:update.month,placementIds,due};}
            await chrome.storage.local.set({reccieFinancialJobs:jobs});
        });
        for(const update of updates)await chrome.alarms.create(RECCIE_ALARM+campaignId+':'+update.month,{when:due});
        sendResponse({status:'success',scheduled:true,due});
    }catch(error){sendResponse({status:'error',message:error.message});}
}
export async function restoreReccieAlarms(){
    const jobs=(await chrome.storage.local.get('reccieFinancialJobs')).reccieFinancialJobs||{};
    for(const [id,job]of Object.entries(jobs))await chrome.alarms.create(RECCIE_ALARM+id,{when:Math.max(Date.now()+1000,job.due)});
    const all=await chrome.storage.local.get(null);for(const [key,job]of Object.entries(all))if(key.startsWith('reccieAutoReceipt:')&&job?.requestId&&job.attempts<3)await chrome.alarms.create(RECCIE_ALARM+'receipt:'+job.requestId,{when:Math.max(Date.now()+1000,job.due)});
}
export async function runReccieAlarm(alarm){
    if(!alarm.name.startsWith(RECCIE_ALARM))return;
    await assertPrismaProfile();
    if(alarm.name.startsWith(RECCIE_ALARM+'receipt:')){
        const requestId=alarm.name.slice((RECCIE_ALARM+'receipt:').length),key='reccieAutoReceipt:'+requestId;
        const saved=(await chrome.storage.local.get(key))[key];
        if(saved){
            try{
                const result=await manualTrackerWrite({operation:'trackerWriteStatus',mode:saved.mode,month:saved.month,requestId},{queueWrite,assertActive});
                await chrome.storage.local.set({reccieAutomationLastRun:{at:new Date().toISOString(),kind:'receipt',state:result.write.state}});
                if(result.write.state==='complete'||result.write.state==='not_started'){await clearAutoReceipt(requestId);return;}
            }catch(error){await chrome.storage.local.set({reccieAutomationLastRun:{at:new Date().toISOString(),kind:'receipt',state:'error',message:error.message}});}
            saved.attempts++;saved.due=Date.now()+60000;
            await chrome.storage.local.set({[key]:saved});
            if(saved.attempts<3)await chrome.alarms.create(alarm.name,{when:saved.due});
        }
        return;
    }
    const id=alarm.name.slice(RECCIE_ALARM.length),stored=await chrome.storage.local.get(['reccieFinancialJobs','reccieAutomation']);
    const job=stored.reccieFinancialJobs?.[id];if(!job)return;
    if(!Array.isArray(job.placementIds)||!job.placementIds.length){await removeJob(id,job.due);return;}
    if(Date.now()<job.due){await chrome.alarms.create(alarm.name,{when:job.due});return;}
    if(!stored.reccieAutomation?.afterFinancial){await removeJob(id,job.due);return;}
    if(checking){await chrome.alarms.create(alarm.name,{when:Date.now()+30000});return;}
    try{
        for(const mode of ['main','early']){
            const key=core.trackerKey(mode,mode==='early'?job.month:undefined),prefKey=mode==='main'?'recciePreferences':`${key}:preferences`;
            const data=await chrome.storage.local.get([key,prefKey]),tracker=data[key];
            if(!tracker||tracker.source?.type!=='google')continue;
            const rows=tracker.rows.filter(row=>row.campaignId===job.campaignId&&(!job.month||row.month===job.month)&&assigned(row,data[prefKey]));
            let expectedRevision=tracker.revision;
            for(let offset=0;offset<rows.length;offset+=500){
                if(!(await chrome.storage.local.get('reccieAutomation')).reccieAutomation?.afterFinancial)break;
                const current=(await chrome.storage.local.get(key))[key];
                if(current?.revision!==expectedRevision)throw Error('Report changed before the scheduled check.');
                const updated=await checkRows({placementIds:job.placementIds,financial:true,mode,month:tracker.month,revision:current.revision,rowIds:rows.slice(offset,offset+500).map(row=>row.sourceRow)});
                expectedRevision=updated.revision;
            }
        }
        await chrome.storage.local.set({reccieAutomationLastRun:{at:new Date().toISOString(),kind:'financial',campaignId:job.campaignId,state:'complete'}});
    }catch(error){await chrome.storage.local.set({reccieAutomationLastRun:{at:new Date().toISOString(),kind:'financial',campaignId:job.campaignId,state:'error',message:error.message}});}
    finally{await removeJob(id,job.due);}
}
async function removeJob(id,due){await queueWrite(async()=>{const jobs=(await chrome.storage.local.get('reccieFinancialJobs')).reccieFinancialJobs||{};if(jobs[id]?.due===due){delete jobs[id];await chrome.storage.local.set({reccieFinancialJobs:jobs});}});}
