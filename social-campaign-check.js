(async function() {
    'use strict';
    const byId = id => document.getElementById(id);
    const state = await chrome.storage.sync.get({ allFeaturesDisabled: false, onboardingAudience: 'prisma' });
    if (state.allFeaturesDisabled || state.onboardingAudience !== 'prisma') { document.querySelector('main').replaceChildren(document.createTextNode('Enable Prisma features in Settings to use live campaign checks.')); return; }
    let records = {}, history = [], busy = false, selected = '', page = 0;
    const pageSize = 10;
    const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; };
    const money = (value, currency) => value == null ? 'Not comparable' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: /^[A-Z]{3}$/.test(currency) ? currency : 'GBP' }).format(value);
    async function send(operation, extra) {
        const result = await chrome.runtime.sendMessage({ action: 'socialCampaignCheck', operation, ...extra });
        if (result?.status !== 'success') throw new Error(result?.message || 'Campaign check unavailable.');
        return result;
    }
    function show(record) {
        const root = byId('result'); root.replaceChildren();
        if (!record) return;
        root.append(text('h2', `${selected} · ${record.campaignName || 'Campaign check'}`));
        if (record.error) {
            root.append(text('p', `${record.error.replace(/Choose Meta access/g, "Choose 'Meta access'")}${record.checkedAt ? ' Any results below are from the last successful check.' : ''}`, 'error'));
            if (/Meta access|token.*(?:expired|invalid)|save a.*token/i.test(record.error)) {
                const help=text('p', "Use 'Meta access' below, or the link at the bottom of this page, to update your token. ", 'note');
                const link=text('a','Meta access');link.href='meta-access.html';help.append(link);root.append(help);
            }
        }
        if (record.error && record.latestPrisma) {
            const preview = text('div','','card');
            preview.append(text('h2','Prisma bookings retrieved · Meta comparison incomplete'));
            record.latestPrisma.bookings.forEach(item=>preview.append(text('p',`${item.placementNumber} · Meta campaign ${item.campaignId} · ${item.start} to ${item.end} · Placement net cost ${money(item.budget,item.currency)}`)));
            if (record.latestPrisma.unmatched.length) preview.append(text('p',`${record.latestPrisma.unmatched.length} additional Meta booking(s) have incomplete links or financial data.`,'warning'));
            root.append(preview);
        }
        if (!record.checkedAt) return;
        root.append(text('p', `Last successful check: ${new Date(record.checkedAt).toLocaleString('en-GB')}`));
        const actions = text('div','', 'actions');
        const monitor = text('button',record.monitor ? 'Stop monitoring' : 'Monitor this campaign','secondary');
        monitor.type = 'button';
        monitor.disabled = busy;
        monitor.addEventListener('click',async () => {
            monitor.disabled = true;
            try { await send('monitor', {campaignId:selected,monitor:!record.monitor}); await load(); show(records[selected]); byId('status').textContent = records[selected]?.monitor ? 'Monitoring enabled. You will be notified when a difference or access problem needs review.' : 'Monitoring stopped.'; } catch(error) { byId('status').textContent = error.message; monitor.disabled = false; }
        });
        actions.append(monitor,text('span',record.monitor ? 'Monitoring every 30 minutes' : 'One-off check · monitoring is off','note')); root.append(actions);
        if (!record.results?.length) root.append(text('p','No linked Meta media bookings were found in this Prisma campaign. This is not a clean bill of health.'));
        if (record.unmatched?.length) root.append(text('p',`${record.unmatched.length} Meta media booking(s) could not be checked: missing ID, account, budget or dates.`, 'finding'));
        (record.results || []).forEach(item => {
            const card = text('article','','card'); card.append(text('h2',item.name || item.campaignId),text('p',`Meta ${item.campaignId} · Account ${item.accountId} · ${item.timezone || 'Account timezone unavailable'}`,'note'));
            if (item.deliveryReview) card.append(text('p','Linked campaign needs review · no recorded delivery','finding'));
            const accountId=String(item.accountId || '').replace(/^act_/,'');
            if (/^\d+$/.test(accountId) && /^\d+$/.test(String(item.campaignId || ''))) {
                const link=text('a','Open in Meta ↗');
                link.href=`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountId}&selected_campaign_ids=${item.campaignId}&treenav=true&filter_set=${encodeURIComponent(`CAMPAIGN_GROUP_SELECTED-STRING_SET\u001eIN\u001e["${item.campaignId}"]`)}`;
                link.target='_blank';link.rel='noopener noreferrer';
                link.setAttribute('aria-label','Open this campaign in Meta Ads Manager (new tab)');
                const prismaId=selected;
                link.addEventListener('click',async event=>{
                    event.preventDefault();
                    try { await send('openMeta',{campaignId:prismaId,metaCampaignId:String(item.campaignId),accountId}); }
                    catch(error){byId('status').textContent=error.message;}
                });
                card.lastElementChild.append(text('span',' · '),link);
            }
            const metrics = text('div','','metrics');
            [['Prisma net media booked',item.budget],['Prisma package soft limit',item.packageBudget],['Meta lifetime budget',item.metaBudget],['Meta spend (available history)',item.totalSpend],['Spend outside booked dates',item.outsideSpend]].forEach(([label,value])=> { const metric = text('div','','metric'); metric.append(text('span',label),text('strong', value == null && label === 'Prisma package soft limit' ? 'Not supplied' : money(value,label.startsWith('Prisma') ? item.prismaCurrency : item.currency))); metrics.append(metric); });
            card.append(metrics);
            if (item.upweightPlan) {
                const section=text('section','','candidate'),table=document.createElement('table');
                section.append(text('h3','Untrafficked Prisma increments'),text('p',`Current expected Meta budget: ${money(item.metaComparisonBudget,item.prismaCurrency)}. Full placement booking: ${money(item.budget,item.prismaCurrency)}.`,'note'));
                const header=document.createElement('tr');['Placement / start','Increment','Meta after traffic','Expected total'].forEach(label=>header.append(text('th',label)));table.append(header);
                item.upweightPlan.pending.forEach(pending=>{const row=text('tr','',pending.risk?'finding':'');[`${pending.placementNumber} · ${pending.start}`,money(pending.amount,item.currency),money(pending.projectedBudget,item.currency),money(pending.expectedBudget,item.currency)].forEach(value=>row.append(text('td',value)));table.append(row);});
                const scroll=text('div','','table-scroll');scroll.append(table);section.append(scroll,text('p','Projection assumes these increments are trafficked in start-date order. Recheck before trafficking.','note'));card.append(section);
            }
            if (item.dailyBudgets?.length) card.append(text('p',`Meta daily budget(s): ${item.dailyBudgets.map(value=>money(value,item.currency)).join(', ')}. Daily budgets are not compared to a total booking.`));
            item.findings.forEach(value=>card.append(text('p',value,'finding')));
            item.warnings.forEach(value=>card.append(text('p',value,'warning')));
            (item.notes || []).forEach(value=>card.append(text('p',value,'note')));
            if (item.lastChange) {
                const change = item.lastChange;
                card.append(text('p',`Last Meta budget/date change detected: ${new Date(change.detectedAt).toLocaleString('en-GB')}. Previous lifetime budget: ${money(change.previousLifetimeBudget,item.currency)}.${change.previousDailyBudgets.length ? ` Previous daily budget(s): ${change.previousDailyBudgets.map(value=>money(value,item.currency)).join(', ')}.` : ''} Previous flight: ${change.previousRanges.map(range=>`${range.start || 'Missing'} to ${range.end || 'Open / missing'}`).join('; ')}.`,'note'));
            }
            if (!item.findings.length && !item.warnings.length) card.append(text('p','No issues found within the verified booking scope.'));
            (item.candidates || []).forEach(candidate => {
                const section=text('section','','candidate');
                section.append(text('h3','Possible delivering campaign'),text('p',candidate.name),text('p',candidate.evidence,'note'),text('p','Unconfirmed match · kept separate from the linked comparison.','warning'));
                const account=String(candidate.accountId || '').replace(/^act_/,''),id=String(candidate.campaignId || '');
                if (/^\d+$/.test(account) && /^\d+$/.test(id)) {
                    const ref=text('p',`Meta ${id} · `,'note'),link=text('a','Open this campaign in Meta ↗');
                    link.href=`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${account}&selected_campaign_ids=${id}&filter_set=${encodeURIComponent(`CAMPAIGN_GROUP_SELECTED-STRING_SET\u001eIN\u001e["${id}"]`)}`;
                    link.target='_blank';link.rel='noopener noreferrer';const prismaId=selected;
                    link.addEventListener('click',async event=>{event.preventDefault();try{await send('openMeta',{campaignId:prismaId,metaCampaignId:id,accountId:account});}catch(error){byId('status').textContent=error.message;}});
                    ref.append(link);section.append(ref);
                }
                const metrics=text('div','','metrics');
                [['Prisma placement net cost',candidate.budget,candidate.prismaCurrency],['Possible Meta lifetime budget',candidate.metaBudget,candidate.currency],['Possible Meta spend',candidate.totalSpend,candidate.currency]].forEach(([label,value,currency])=>{const metric=text('div','','metric');metric.append(text('span',label),text('strong',money(value,currency)));metrics.append(metric);});
                section.append(metrics,text('p',`Possible Meta flight: ${candidate.metaRanges.map(range=>`${range.start || 'Missing'} to ${range.end || 'Open / missing'}`).join('; ')}`,'note'));
                if (candidate.dailyBudgets?.length) section.append(text('p',`Meta daily budget(s): ${candidate.dailyBudgets.map(value=>money(value,candidate.currency)).join(', ')}. Daily budgets are not compared to a total booking.`,'note'));
                candidate.findings.forEach(value=>section.append(text('p',value,'finding')));
                candidate.warnings.forEach(value=>section.append(text('p',value,'warning')));
                card.append(section);
            });
            const detail = document.createElement('details'); detail.append(text('summary','Booking details and data sources'));
            const creation=item.creation;
            detail.append(text('p',creation ? `Meta creation event: ${creation.actor || 'Unknown actor'} · ${creation.application || 'Unknown application'}${creation.at ? ` · ${creation.at}` : ''}.` : 'Meta creation event unavailable in accessible history.','note'));
            if (item.prismaOrigins?.some(source=>source.origin)) item.prismaOrigins.forEach(source=>detail.append(text('p',`Prisma ${source.placementNumber} origin: ${source.origin || 'Unknown'} (booking-details externalEntityOrigin).`,'note')));
            else detail.append(text('p','Prisma link origin: unknown. A Meta creator or creation app alone does not prove pushed versus linked back.','note'));
            const scroll = text('div','','table-scroll'), table = document.createElement('table');
            const header = document.createElement('tr'); ['Source','Reference','Start','End','Amount'].forEach(value=>header.append(text('th',value))); table.append(header);
            const rows = [...item.bookings.map(b=>['Prisma',b.placementNumber,b.start,b.end,money(b.budget,b.currency)]), ...item.metaRanges.map(r=>['Meta flight',item.campaignId,r.start || 'Missing',r.end || 'Open / missing','—']),...item.outsideDays.map(d=>['Outside-date spend',item.campaignId,d.date,d.date,money(d.spend,item.currency)])];
            rows.forEach(values=>{ const row=document.createElement('tr'); values.forEach(value=>row.append(text('td',value))); table.append(row); }); scroll.append(table); detail.append(scroll);
            (item.packageSources || []).forEach(source => detail.append(text('p',`Package limit: Prisma ${source.placementNumber} (${source.field}).`,'note')));
            detail.append(text('p','Spend uses available Meta history in the account timezone. Older unavailable history is not checked.','note'));
            card.append(detail); root.append(card);
        });
    }
    function savedList() {
        const root=byId('saved'); root.replaceChildren();
        const all=new Map(history.filter(item=>/^CP[A-Z0-9]+$/.test(item.campaignId || item.cpNumber || '')).map(item=>[item.campaignId || item.cpNumber,item]));
        Object.entries(records).forEach(([id,record])=>all.set(id,{...all.get(id),...record}));
        const search=byId('search').value.trim().toLowerCase();
        const matches=[...all].filter(([id,item])=>`${id} ${item.campaignName || ''}`.toLowerCase().includes(search)).sort((a,b)=>Number(Boolean(b[1].monitor))-Number(Boolean(a[1].monitor)));
        const pageCount=Math.ceil(matches.length/pageSize);
        page=Math.max(0,Math.min(page,pageCount-1));
        const visible=search ? matches : matches.slice(page*pageSize,(page+1)*pageSize);
        visible.forEach(([id,item])=>{
            const row=text('div','','saved-row'), label=text('div',''); label.append(text('strong',item.campaignName || id),text('small',`${id} · ${item.monitor ? 'Monitoring' : 'Not monitored'}${busy && selected === id ? ' · Checking…' : item.error ? ' · Last check failed' : item.checkedAt ? ` · Checked ${new Date(item.checkedAt).toLocaleString('en-GB')}` : ''}`));
            if (item.error) label.append(text('small',item.error,'error'));
            const button=text('button',busy && selected === id ? 'Checking…' : 'Check now','secondary');button.type='button';button.disabled=busy;button.addEventListener('click',()=>{byId('check-form').scrollIntoView({block:'start',behavior:'smooth'});check(id);});row.append(label,button);root.append(row);
        });
        if (!root.childNodes.length) root.append(text('p','No matching campaigns. Enter a CP number above, or visit a campaign in Prisma first.'));
        const pagination=byId('pagination');pagination.replaceChildren();pagination.hidden=Boolean(search)||pageCount<=1;
        if (!pagination.hidden) {
            const previous=text('button','Previous','secondary'),next=text('button','Next','secondary');
            previous.type=next.type='button';previous.disabled=page===0;next.disabled=page===pageCount-1;
            previous.addEventListener('click',()=>{page--;savedList();});next.addEventListener('click',()=>{page++;savedList();});
            const count=text('span',`Page ${page+1} of ${pageCount} · ${matches.length} campaigns`,'note');count.setAttribute('role','status');
            pagination.append(previous,count,next);
        }
    }
    async function load() { const storage=await chrome.storage.local.get(['socialCampaignChecks','campaignHistoryEntries']);records=storage.socialCampaignChecks || {};history=storage.campaignHistoryEntries || [];savedList(); }
    async function check(id) {
        if (busy) return;
        selected=id.toUpperCase().trim(); byId('campaign').value=selected; busy=true;byId('check').disabled=true;savedList();byId('status').textContent='Reading current Prisma bookings and Meta data…';show(records[selected]);
        try { const response=await send('check',{campaignId:selected});records[selected]=response.record;show(response.record);byId('status').textContent='Check finished. Review any differences below.'; }
        catch(error) { byId('status').textContent=error.message;try { await load(); } catch (_) { /* Preserve the actionable check error. */ } records[selected]={...records[selected],error:error.message};show(records[selected]); }
        finally { busy=false;byId('check').disabled=false;show(records[selected]);savedList(); }
    }
    byId('check-form').addEventListener('submit',event=>{event.preventDefault();check(byId('campaign').value);});byId('search').addEventListener('input',()=>{page=0;savedList();});
    chrome.storage.onChanged.addListener((changes,area)=>{
        if(area==='sync'&&(changes.allFeaturesDisabled?.newValue === true || (changes.onboardingAudience && changes.onboardingAudience.newValue !== 'prisma'))) location.reload();
        if(area==='local' && changes.socialCampaignChecks && !busy) { records=changes.socialCampaignChecks.newValue || {};savedList();if(selected)show(records[selected]); }
    });
    await load(); const campaign=new URLSearchParams(location.search).get('campaign'); if (/^CP[A-Z0-9]{3,20}$/.test(campaign || '')) await check(campaign);
})();
