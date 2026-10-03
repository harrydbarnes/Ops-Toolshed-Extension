(function() {
    'use strict';
    if (window !== window.top || window.opsSocialCampaignCheckInstalled) return;
    window.opsSocialCampaignCheckInstalled = true;
    let interval, tooltip, panelHost, panelBody, panelStatus, panelCheck, panelActions, openCampaign = '', checking = false;
    let records = {}, selectedMeta = null, selectionCampaign = '';
    let monitorButton, monitorHost;
    const monitorBusy = new Set();
    const dateLabel = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? new Intl.DateTimeFormat('en-GB', {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T00:00:00Z')) : 'Unknown date';
    let panelCloseTimer, panelEntranceTimer, tooltipDismissTimer;
    const currentCampaign = () => location.hash.match(/(?:^#|[&?])campaign-id=(CP[A-Z0-9]+)/)?.[1] || '';
    const element = (tag, value, className) => {
        const node = document.createElement(tag);
        if (value) node.textContent = value;
        if (className) node.className = className;
        return node;
    };
    const money = (amount, currency) => amount == null ? 'Not comparable' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: /^[A-Z]{3}$/.test(currency || '') ? currency : 'GBP' }).format(amount);
    function possibleCampaign(candidate, prismaId) {
        const section = element('section', '', 'candidate');
        section.append(element('h3', 'Possible delivering campaign'), element('p', candidate.name), element('p', candidate.evidence, 'note'), element('p', 'Unconfirmed match · kept separate from the linked comparison.', 'warning'));
        const account = String(candidate.accountId || '').replace(/^act_/, ''), id = String(candidate.campaignId || '');
        if (/^\d+$/.test(account) && /^\d+$/.test(id)) {
            const reference = element('p', `Meta ${id} · `, 'note'), link = element('a', 'Open this campaign in Meta ↗', 'meta-campaign-link');
            link.href = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${account}&selected_campaign_ids=${id}&filter_set=${encodeURIComponent(`CAMPAIGN_GROUP_SELECTED-STRING_SET\u001eIN\u001e["${id}"]`)}`;
            link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.addEventListener('click', async event => {
                event.preventDefault();
                try {
                    const response = await chrome.runtime.sendMessage({action:'socialCampaignCheck',operation:'openMeta',campaignId:prismaId,metaCampaignId:id,accountId:account});
                    if (response?.status !== 'success') throw new Error(response?.message || 'Meta campaign could not be opened.');
                } catch (error) { if (openCampaign === prismaId) panelStatus.textContent = error.message; }
            });
            reference.append(link); section.append(reference);
        }
        const table = comparison(candidate); table.querySelector('caption').textContent = 'Prisma vs possible Meta campaign'; section.append(table);
        if (candidate.dailyBudgets?.length) section.append(element('p', `Meta daily budget(s): ${candidate.dailyBudgets.map(value => money(value, candidate.currency)).join(', ')}. Daily budgets are not compared to a total booking.`, 'note'));
        (candidate.findings || []).filter(message => !/^Flight dates differ:|^Meta lifetime budget is (higher|lower) than booked net media\.$|^Meta spend exceeds the selected Prisma net media budget\.$/.test(message)).forEach(message => section.append(element('p', message, 'finding')));
        (candidate.warnings || []).forEach(message => section.append(element('p', message, 'warning')));
        return section;
    }
    function comparison(result) {
        const table = element('table', '', 'comparison');
        table.append(element('caption', 'Prisma vs Meta'));
        const head = element('thead'), headings = element('tr');
        ['Compare', 'Prisma', 'Meta', 'Difference'].forEach(label => {
            const cell = element('th', label); cell.scope = 'col'; headings.append(cell);
        });
        head.append(headings); table.append(head);
        const body = element('tbody');
        const row = (label, prisma, meta, difference, differs, prismaLabel, metaLabel) => {
            const line = element('tr', '', differs ? 'differs' : '');
            if (label === 'Budget') line.classList.add('placement-budget-row');
            const title = element('th', label); title.scope = 'row'; line.append(title);
            [[prisma, 'Prisma', prismaLabel], [meta, 'Meta', metaLabel], [difference, 'Difference']].forEach(([value, source, hint], index) => {
                const cell = element('td', '', ['prisma-value', 'meta-value', 'difference-value'][index]);
                cell.append(element('span', source + ': ', 'source-label'), element('strong', value));
                if (hint) cell.append(element('span', hint, 'value-hint'));
                line.append(cell);
            });
            body.append(line);
        };
        const dates = (items, key) => items.map(item => item[key]).filter(Boolean).sort();
        const formatDate = value => value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Missing / open';
        const flight = [];
        ['start', 'end'].forEach(key => {
            const prismaDates = dates(result.bookings || [], key), metaDates = dates(result.metaRanges || [], key);
            const prisma = key === 'start' ? prismaDates[0] : prismaDates.at(-1);
            const complete = metaDates.length === (result.metaRanges || []).length;
            const meta = complete ? (key === 'start' ? metaDates[0] : metaDates.at(-1)) : null;
            const days = prisma && meta ? Math.round((Date.parse(`${meta}T00:00:00Z`) - Date.parse(`${prisma}T00:00:00Z`)) / 86400000) : null;
            const verb = key === 'start' ? 'Starts' : 'Ends';
            const difference = days === null ? 'Cannot verify' : days === 0 ? 'Same day' : `${verb} ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ${days > 0 ? 'later' : 'earlier'}`;
            const needsReview = days === null || (key === 'start' ? days < 0 : days > 0);
            flight.push({prisma:formatDate(prisma),meta:formatDate(meta),difference,needsReview,informational:days !== null && days !== 0 && !needsReview});
        });
        row('Flight',flight.map(item => item.prisma).join(' – '),flight.map(item => item.meta).join(' – '),'',flight.some(item => item.needsReview));
        const flightLine = body.lastElementChild;
        if (!flight.some(item => item.needsReview)) flightLine.classList.add('informational-date');
        const differenceCell = flightLine.querySelector('.difference-value'); differenceCell.lastElementChild.remove();
        flight.forEach(item => differenceCell.append(element('span',item.difference,item.needsReview ? 'date-review' : 'date-note')));
        if ((result.bookings || []).length > 1) flightLine.querySelector('.prisma-value').append(element('span','Earliest booking to latest booking','value-hint'));
        if ((result.metaRanges || []).length > 1) flightLine.querySelector('.meta-value').append(element('span','Earliest ad set to latest ad set','value-hint'));
        const comparable = result.budget != null && result.currency === result.prismaCurrency && ['GBP','USD','EUR','AUD','CAD','NZD'].includes(result.currency);
        const comparisonBudget = result.metaComparisonBudget ?? result.budget;
        const budgetDelta = comparable && result.metaBudget != null ? result.metaBudget - comparisonBudget : null;
        row('Budget', money(comparisonBudget, result.prismaCurrency), money(result.metaBudget, result.currency),
            budgetDelta === null ? 'Not comparable' : Math.abs(budgetDelta) <= 0.01 ? 'Matches' : `${money(Math.abs(budgetDelta), result.currency)} ${budgetDelta > 0 ? 'higher' : 'lower'}`,
            budgetDelta !== null && Math.abs(budgetDelta) > 0.01, result.upweightPlan ? 'Trafficked placement net cost' : 'Placement net cost', 'Lifetime budget');
        const spendDelta = comparable && result.totalSpend != null ? result.totalSpend - result.budget : null;
        row('Spend vs booking', money(result.budget, result.prismaCurrency), money(result.totalSpend, result.currency),
            spendDelta === null ? 'Not comparable' : spendDelta > 0.01 ? `${money(spendDelta, result.currency)} over budget` : Math.abs(spendDelta) <= 0.01 ? 'At booked budget' : `${money(-spendDelta, result.currency)} within budget`,
            spendDelta !== null && spendDelta > 0.01, 'Placement net cost', 'Actual spend');
        table.append(body);
        return table;
    }
    function upweightPreview(result) {
        const plan = result.upweightPlan, review = result.upweightReview, pending = (plan || review).pending;
        const risk = pending.some(item => item.risk);
        const section = element('section', '', 'candidate upweight' + (risk ? ' risk' : ''));
        section.append(element('h3', risk ? 'Possible duplicate upweight' : plan ? 'Budget is booked, but not yet trafficked' : 'Pending upweight · verification incomplete'));
        if (review) section.append(element('p',review.reasons.join(' '),'note'));
        if (risk) section.append(element('p', 'Meta is already above the verified trafficked budget. Check whether the increase is already in Meta before trafficking; the cause is not proven.', 'note'));
        const values = element('div', '', 'upweight-values');
        [['Full booking',result.budget],[plan ? 'Already trafficked' : 'Verified trafficked placements only',plan ? plan.appliedBudget : review.verifiedTraffickedBudget]].forEach(([label,value]) => {
            const cell = element('div'); cell.append(element('span',label,'note'),element('strong',money(value,result.prismaCurrency))); values.append(cell);
        });
        pending.forEach(item => {
            const cell = element('div'); cell.append(element('span',`${item.placementNumber} · pending ${dateLabel(item.start)}`,'note'),element('strong','+' + money(item.amount,result.prismaCurrency))); values.append(cell);
        });
        section.append(values);
        if (plan) pending.forEach(item => section.append(element('p', `Meta after ${item.placementNumber} increment: ${money(item.projectedBudget,result.currency)} · ${item.risk ? money(item.projectedBudget-item.expectedBudget,result.currency)+' above' : Math.abs(item.projectedBudget-item.expectedBudget)<=0.01 ? 'matches' : money(item.expectedBudget-item.projectedBudget,result.currency)+' below'} expected ${money(item.expectedBudget,result.prismaCurrency)}.`, 'projection')));
        if (!plan) section.append(element('p','Projection unavailable. Verify the starting budget before trafficking.','note'));
        return section;
    }
    function campaignLabel(result) {
        const name = result.name || result.campaignId;
        const match = name.match(/(?:^|-)(Consideration|Conversions?|Awareness|Traffic)-(Landing Page Views|Video Views|N\/A)$/i);
        return match ? match[1] + (match[2].toUpperCase() === 'N/A' ? '' : ' · '+match[2]) : name;
    }
    function resultStatus(result) {
        if (result.upweightPlan?.pending.some(item => item.risk)) return 'Possible duplicate upweight';
        if (result.upweightReview) return 'Verify upweight';
        if (result.findings?.length || result.warnings?.length) return 'Needs review';
        if (result.upweightPlan?.pending.length) return 'Upweight pending';
        return 'No issues found';
    }
    function closePanel(options) {
        const host = panelHost;
        if (!host) return;
        const panel = host.shadowRoot.querySelector('.panel');
        const immediate = Boolean(options?.immediate);
        if (panel.classList.contains('is-closing') && !immediate) return;
        clearTimeout(panelEntranceTimer);
        clearTimeout(panelCloseTimer);
        const remove = () => {
            host.remove();
            if (panelHost === host) {
                panelHost = null;
                clearTimeout(panelCloseTimer);
                panelCloseTimer = null;
            }
            panel.removeEventListener('transitionend', onTransitionEnd);
        };
        const onTransitionEnd = event => {
            if (event.target === panel && event.propertyName === 'opacity') remove();
        };
        openCampaign = '';
        document.getElementById('ops-social-campaign-check')?.setAttribute('aria-expanded', 'false');
        if (immediate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) remove();
        else {
            host.style.pointerEvents = 'none';
            host.inert = true;
            panel.classList.add('is-closing');
            panel.classList.remove('is-open');
            panel.addEventListener('transitionend', onTransitionEnd);
            panelCloseTimer = setTimeout(remove, 240);
        }
        if (!immediate) document.getElementById('ops-social-campaign-check')?.focus();
    }
    function renderPanel() {
        if (!panelHost || !openCampaign) return;
        panelBody.replaceChildren();
        const record = records[openCampaign];
        panelCheck.disabled = checking;
        panelCheck.textContent = checking ? 'Checking…' : 'Check again';
        panelActions.replaceChildren(panelCheck);
        panelStatus.textContent = checking ? 'Reading current Prisma bookings and Meta data…' : record?.error || (record?.checkedAt ? `${record.linkFailures?.length ? 'Partial check' : 'Last successful check'}: ${new Date(record.checkedAt).toLocaleString('en-GB')}` : 'Ready to check this campaign.');
        const context = panelHost.shadowRoot.querySelector('.footer-context');
        if (context) context.textContent = record?.monitor ? 'Monitoring every 30 minutes · requires Chrome and access.' : 'One-off check · nothing is monitored automatically.';
        if (!record) return;
        if (selectionCampaign !== openCampaign) { selectionCampaign = openCampaign; selectedMeta = null; }
        if (record.error && record.latestPrisma) {
            const preview = element('details'); preview.append(element('summary','Prisma bookings retrieved · Meta comparison incomplete'));
            record.latestPrisma.bookings.forEach(booking => preview.append(element('p', `${booking.placementNumber} · Meta ${booking.campaignId} · ${money(booking.budget, booking.currency)} · ${booking.start} to ${booking.end}`, 'note')));
            panelBody.append(preview);
        }
        if (record.error && record.checkedAt) panelBody.append(element('p', 'Results below are from the last successful check.', 'warning'));
        if (record.checkedAt) {
            const monitor = element('button', record.monitor ? 'Stop monitoring' : 'Monitor this campaign', 'secondary');
            monitor.type = 'button';
            monitor.disabled = checking;
            const status = element('button', record.monitor ? 'Monitoring · every 30 minutes' : 'One-off · monitoring off', 'note monitor-status');
            status.type = 'button'; status.disabled = checking;
            status.setAttribute('aria-label',record.monitor ? 'Turn off monitoring for this campaign' : 'Turn on monitoring for this campaign');
            status.addEventListener('click', () => monitor.click());
            monitor.addEventListener('click', async () => {
                const id = openCampaign;
                monitor.disabled = status.disabled = true;
                try {
                    const response = await chrome.runtime.sendMessage({ action: 'socialCampaignCheck', operation: 'monitor', campaignId: id, monitor: !record.monitor });
                    if (response?.status !== 'success') throw new Error(response?.message || 'Monitoring could not be updated.');
                    records[id] = { ...records[id], monitor: !record.monitor };
                    if (openCampaign === id) renderPanel();
                } catch (error) { if (openCampaign === id) panelStatus.textContent = error.message; monitor.disabled = status.disabled = false; }
            });
            panelActions.append(monitor);
            panelActions.append(status);
        }
        if (record.unmatched?.length) panelBody.append(element('p', `${record.unmatched.length} Meta booking(s) have incomplete IDs, accounts, budgets or dates.`, 'warning'));
        if (record.checkedAt && !record.results?.length && !record.linkFailures?.length) panelBody.append(element('p', 'No linked Meta media bookings were found. This is not a complete Meta comparison.', 'warning'));
        const results = record.results || [], failures = record.linkFailures || [];
        if (results.length || failures.length) {
            const overview = element('div', '', 'overview');
            overview.append(element('strong', `${results.length} ${record.error ? 'saved results' : 'checked'}${failures.length ? ' · '+failures.length+' unavailable' : ''}${results.some(item => item.upweightPlan || item.upweightReview) ? ' · '+results.filter(item => item.upweightPlan || item.upweightReview).length+' pending upweight(s)' : ''}`));
            panelBody.append(overview);
            if (selectedMeta === null || !results.some(item => item.campaignId === selectedMeta) && selectedMeta !== '') selectedMeta = results[0]?.campaignId || '';
            results.forEach(result => {
                const row = element('button', '', 'campaign-row' + (selectedMeta === result.campaignId ? ' selected' : ''));
                row.type = 'button'; row.setAttribute('aria-expanded', String(selectedMeta === result.campaignId));
                row.setAttribute('aria-controls','ops-meta-selected-detail');
                row.setAttribute('aria-label',`${result.name || result.campaignId} · ${resultStatus(result)}`);
                row.append(element('span',campaignLabel(result),'campaign-name'),element('span',resultStatus(result),'campaign-state'));
                row.addEventListener('click', () => { selectedMeta = selectedMeta === result.campaignId ? '' : result.campaignId; renderPanel(); [...panelBody.querySelectorAll('.campaign-row')].find(item => item.dataset.campaignId === result.campaignId)?.focus(); });
                row.dataset.campaignId = result.campaignId;
                panelBody.append(row);
            });
            failures.forEach(failure => {
                const card = element('section','','link-failure');
                card.append(element('strong',`Meta ${failure.campaignId} · unavailable`),element('p',failure.message,'warning'),element('p',failure.checkedAt ? `Last successful check: ${new Date(failure.checkedAt).toLocaleString('en-GB')}. No current comparison for this link.` : 'No current comparison for this link.','note'));
                panelBody.append(card);
            });
        }
        results.filter(result => result.campaignId === selectedMeta).forEach(result => {
            const card = element('article', '', 'card'); card.id = 'ops-meta-selected-detail';
            card.append(element('h3', campaignLabel(result)), element('p', `Meta ${result.campaignId} · ${result.timezone || 'Account timezone unavailable'}`, 'note'));
            const accountId = String(result.accountId || '').replace(/^act_/, '');
            if (/^\d+$/.test(accountId) && /^\d+$/.test(String(result.campaignId || ''))) {
                const link = element('a', 'Open in Meta ↗', 'meta-campaign-link');
                link.href = `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${accountId}&selected_campaign_ids=${result.campaignId}&treenav=true&filter_set=${encodeURIComponent(`CAMPAIGN_GROUP_SELECTED-STRING_SET\u001eIN\u001e["${result.campaignId}"]`)}`;
                link.target = '_blank'; link.rel = 'noopener noreferrer';
                link.setAttribute('aria-label', 'Open this campaign in Meta Ads Manager (new tab)');
                const prismaId = openCampaign;
                link.addEventListener('click', async event => {
                    event.preventDefault();
                    try {
                        const response = await chrome.runtime.sendMessage({ action: 'socialCampaignCheck', operation: 'openMeta', campaignId: prismaId, metaCampaignId: String(result.campaignId), accountId });
                        if (response?.status !== 'success') throw new Error(response?.message || 'Meta campaign could not be opened.');
                    } catch (error) { if (openCampaign === prismaId) panelStatus.textContent = error.message; }
                });
                card.lastElementChild.append(element('span', ' · '), link);
            }

            if (result.deliveryReview) card.append(element('p', 'Linked campaign needs review · no recorded delivery', 'finding'));
            card.append(comparison(result));
            if (result.upweightPlan || result.upweightReview) card.append(upweightPreview(result));
            const metrics = element('div', '', 'metrics');
            [
                ['Prisma package soft limit', result.packageBudget, result.prismaCurrency],
                ['Spend outside booking dates', result.outsideSpend, result.currency]
            ].forEach(([label, amount, currency]) => {
                const metric = element('div', '', 'metric');
                metric.append(element('span', label), element('strong', label === 'Prisma package soft limit' && amount == null ? 'Not supplied' : money(amount, currency)));
                metrics.append(metric);
            });
            const delivery = result.delivery;
            if (delivery) card.append(element('p', `Meta: ${delivery.status || 'Unknown status'} · ${delivery.lastSpendDate ? 'last recorded spend '+dateLabel(delivery.lastSpendDate) : 'no spend recorded in available history'} · spend outside booking dates: ${money(result.outsideSpend,result.currency)}`, 'delivery note'));
            else card.append(element('p',`Spend outside booking dates: ${money(result.outsideSpend,result.currency)}`,'delivery note'));
            if (result.dailyBudgets?.length) card.append(element('p', `Meta daily budget(s): ${result.dailyBudgets.map(value => money(value, result.currency)).join(', ')}. Daily budgets are not compared to a total booking.`, 'note'));
            // These findings are now expressed by the values and deltas in the comparison.
            result.findings.filter(message => !/^Possible duplicate upweight:|^Flight dates differ:|^Meta lifetime budget is (higher|lower) than booked net media\.$|^Meta spend exceeds the selected Prisma net media budget\.$/.test(message)).forEach(message => card.append(element('p', message, 'finding')));
            result.warnings.filter(message => !result.upweightReview || !message.startsWith('Upweight preflight unavailable:')).forEach(message => card.append(element('p', message, 'warning')));
            (result.notes || []).filter(message => !/^(Flight dates differ:|Checks cover this Prisma|Package budget is a soft)/.test(message)).forEach(message => card.append(element('p', message, 'note')));
            if (!result.findings.length && !result.warnings.length && !result.upweightPlan && !result.upweightReview) card.append(element('p', 'No issues found within the verified booking scope.'));
            (result.candidates || []).forEach(candidate => card.append(possibleCampaign(candidate, openCampaign)));
            if (result.lastChange) card.append(element('p', `Last Meta budget/date change detected: ${new Date(result.lastChange.detectedAt).toLocaleString('en-GB')}. Previous lifetime budget: ${money(result.lastChange.previousLifetimeBudget, result.currency)}.`, 'note'));
            const details = element('details');
            details.append(element('summary', 'Booking details and data sources'));
            details.append(element('p',result.name || result.campaignId,'note'));
            if (result.upweightPlan) details.append(element('p','Projection assumes start-date order. Recheck before trafficking.','note'));
            if (result.checkedAt) details.append(element('p', `Link refreshed ${new Date(result.checkedAt).toLocaleString('en-GB')}`, 'note'));
            details.append(metrics,element('p','Package budget is a soft limit. Checks use placement net cost.','note'));
            const creation = result.creation;
            details.append(element('p', creation ? `Meta creation event: ${creation.actor || 'Unknown actor'} · ${creation.application || 'Unknown application'}${creation.at ? ` · ${creation.at}` : ''}.` : 'Meta creation event unavailable in accessible history.', 'note'));
            if (result.prismaOrigins?.some(item => item.origin)) result.prismaOrigins.forEach(item => details.append(element('p', `Prisma ${item.placementNumber} origin: ${item.origin || 'Unknown'} (booking-details externalEntityOrigin).`, 'note')));
            else details.append(element('p', 'Prisma link origin: unknown. A Meta creator or creation app alone does not prove pushed versus linked back.', 'note'));
            result.bookings.forEach(booking => details.append(element('p', `Prisma ${booking.placementNumber}: ${booking.start} to ${booking.end} · ${money(booking.budget, booking.currency)} · ${booking.integration ? (booking.integration.trafficked ? 'Trafficked' : 'Not trafficked')+' · '+(booking.integration.control === 'increment_budget' ? 'Increment budget' : 'Replace budget') : 'Traffic and budget action unverified'}`, 'note')));
            result.metaRanges.forEach(range => details.append(element('p', `Meta flight: ${range.start || 'Missing'} to ${range.end || 'Open / missing'}`, 'note')));
            result.outsideDays.forEach(day => details.append(element('p', `${day.date}: ${money(day.spend, result.currency)} outside the selected booking dates`, 'note')));
            (result.packageSources || []).forEach(source => details.append(element('p', `Package limit: Prisma ${source.placementNumber} (${source.field}).`, 'note')));
            details.append(element('p', 'Spend uses available Meta history in the account timezone. Older unavailable history is not checked.', 'note'));
            details.append(element('p', 'Monitoring requires Chrome, a Prisma session and valid Meta access.', 'note'));
            card.append(details);
            panelBody.append(card);
        });
        if (results.length) panelBody.append(element('p','Scope: this Prisma campaign. Other linked campaigns must be checked before confirming a discrepancy.','scope note'));
    }
    async function runCheck(id) {
        if (checking) return;
        checking = true;
        renderPanel();
        try {
            const response = await chrome.runtime.sendMessage({ action: 'socialCampaignCheck', operation: 'check', campaignId: id });
            if (response?.status !== 'success' || !response.record) throw new Error(response?.message || 'Check unavailable. Reload Prisma and try again.');
            records[id] = response.record;
        } catch (error) {
            try { records = (await chrome.storage.local.get('socialCampaignChecks'))?.socialCampaignChecks || records; } catch (_) { /* Keep the error visible. */ }
            records[id] = { ...records[id], error: error.message };
        } finally {
            checking = false;
            if (openCampaign === id) renderPanel();
            else if (openCampaign) runCheck(openCampaign);
            reconcile();
        }
    }
    function openPanel(button) {
        const id = currentCampaign();
        if (panelHost && openCampaign === id) { closePanel(); return; }
        closePanel({ immediate: true });
        hideTooltip();
        openCampaign = id;
        button.setAttribute('aria-expanded', 'true');
        panelHost = element('div');
        panelHost.id = 'ops-social-campaign-panel';
        const rect = button.getBoundingClientRect();
        const width = Math.min(820, Math.max(280, window.innerWidth - 24));
        const top = Math.min(rect.bottom + 8, Math.max(12, window.innerHeight - 240));
        panelHost.style.cssText = `position:fixed;z-index:2147483646;top:${top}px;left:${Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))}px;width:${width}px;pointer-events:auto`;
        const shadow = panelHost.attachShadow({ mode: 'open' });
        const style = element('style');
        style.textContent = `:host{font:14px/1.5 system-ui,sans-serif;color:#183440}.panel{background:#fff;border:1px solid #bbccd6;border-radius:12px;box-shadow:0 8px 36px #18344033;max-height:calc(100vh - ${top + 16}px);overflow:auto;padding:18px;box-sizing:border-box}header,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}h2{font-size:18px;margin:0}h3{font-size:16px;margin:0 0 8px}p{margin:10px 0}button{font:inherit;white-space:nowrap;flex-shrink:0;padding:7px 12px;border:1px solid #165c72;border-radius:5px;background:#165c72;color:white;cursor:pointer}button:disabled{opacity:.55;cursor:wait}.secondary{background:white;color:#165c72}.note{font-size:12px;color:#536875}.card{border-top:1px solid #dde5e9;margin-top:16px;padding-top:16px}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}.metric{background:#f2f6f7;border-radius:5px;padding:10px}.metric span,.metric strong{display:block}.metric span{font-size:12px;color:#536875}.metric strong{font-size:18px}.finding{padding:8px 10px;background:#fff3e3;border-left:3px solid #d7872a;color:#7c3e0c}.warning{color:#7c3e0c}.status{padding:10px 0;font-weight:500;overflow-wrap:anywhere}details{margin-top:12px}summary{cursor:pointer}footer{border-top:1px solid #dde5e9;margin-top:16px;padding-top:12px}button:focus-visible,summary:focus-visible{outline:3px solid #e5a641;outline-offset:2px}`;
        style.textContent += `.panel{opacity:0;transform:translateY(-8px) scale(0.985);transform-origin:top right;transition:opacity 180ms ease-out,transform 200ms cubic-bezier(0.22,1,0.36,1);will-change:opacity,transform}.panel.is-open{opacity:1;transform:translateY(0) scale(1)}.panel.is-closing{pointer-events:none}@media(prefers-reduced-motion:reduce){.panel{transition:none}}`;
        style.textContent += `:host{container-type:inline-size}h3{overflow-wrap:anywhere}.comparison{width:100%;table-layout:fixed;border-collapse:separate;border-spacing:0;margin:16px 0;font-size:13px;line-height:1.45}.comparison caption{text-align:left;font-weight:650;font-size:15px;margin-bottom:10px}.comparison th,.comparison td{padding:12px 10px;text-align:left;vertical-align:top;border-bottom:1px solid #dde5e9;overflow-wrap:anywhere}.comparison thead th{font-size:12px;color:#536875;padding-top:8px;padding-bottom:8px}.comparison thead th:first-child{width:19%}.comparison thead th:last-child{width:27%}.comparison tbody th{font-weight:600}.comparison .prisma-value{background:#f0f6fa}.comparison .meta-value{background:#f5f2fa}.comparison .difference-value{color:#536875}.comparison td strong{display:block;font-weight:600;font-variant-numeric:tabular-nums}.comparison .value-hint{display:block;font-size:11px;color:#536875;margin-top:4px}.comparison .differs .difference-value{background:#fff2df;color:#793d08}.comparison .differs .meta-value strong{color:#793d08;text-decoration:underline;text-decoration-color:#d7872a;text-underline-offset:4px}.comparison .source-label{display:none}.metrics{margin-top:14px}.metric strong{font-variant-numeric:tabular-nums}@container(max-width:560px){.comparison thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.comparison,.comparison tbody,.comparison caption{display:block}.comparison tr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-bottom:12px;border:1px solid #dde5e9;border-radius:6px;overflow:hidden}.comparison tbody th{grid-column:1/-1;background:#fafbfc;padding:9px 12px}.comparison td{padding:10px 12px}.comparison .difference-value{grid-column:1/-1;border-bottom:0}.comparison .source-label{display:block;font-size:11px;color:#536875;margin-bottom:4px}.comparison .difference-value .source-label{display:inline;margin:0 8px 0 0}.comparison .difference-value strong{display:inline}.panel{padding:14px}}`;
        style.textContent += '.comparison .placement-budget-row.differs .difference-value{background:#fff0f0;color:#982a31}.comparison .placement-budget-row.differs .meta-value strong{color:#982a31;text-decoration-color:#ba4b51}';
        style.textContent += '.comparison .informational-date td strong{font-weight:400}';
        style.textContent += '.candidate{margin:16px 0;padding:12px;border:1px solid #d7e2e8;border-radius:8px;background:#fafcfd}.candidate>h3{font-size:14px}.candidate .comparison{margin-bottom:0}';
        style.textContent += '.meta-campaign-link{color:#165c72;text-decoration:underline;text-underline-offset:2px}.meta-campaign-link:focus-visible{outline:3px solid #e5a641;outline-offset:2px}';
        style.textContent += `.panel-heading{flex:1;min-width:180px}.status{margin:4px 0 0;padding:0;font-size:12px;font-weight:400}.primary-actions{margin-top:12px;gap:10px}.monitor-status{white-space:nowrap}.card{margin-top:12px;padding-top:12px}h3{margin-bottom:4px}p{margin:8px 0}.card>p.note{margin:6px 0}.comparison{margin:12px 0}.comparison caption{margin-bottom:6px}.comparison tbody th,.comparison tbody td{padding-top:10px;padding-bottom:10px}.metrics{margin-top:10px}.metric{padding:8px 10px}footer{margin-top:10px;padding-top:8px}@container(min-width:561px){.panel{padding:16px}.comparison tbody th,.comparison tbody td{padding-top:8px;padding-bottom:8px}}`;
        style.textContent += `.panel{display:flex;flex-direction:column;overflow:hidden;padding:0}.panel>header{padding:12px 20px 0;flex-shrink:0}.panel>.primary-actions{padding:0 20px 10px;margin-top:8px;flex-shrink:0}.panel-body{min-height:0;overflow:auto;padding:0 20px 7px;border-top:1px solid #dde5e9;overscroll-behavior:contain}.panel>footer{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0;padding:12px 20px;flex-shrink:0}.panel>footer .actions{gap:8px}.overview{padding:8px 0;font-size:12px}.campaign-row{width:100%;display:flex;justify-content:space-between;gap:12px;align-items:center;border:0;border-bottom:1px solid #dde5e9;border-radius:0;background:#fff;color:#183440;padding:7px 8px;text-align:left;font-size:12px;white-space:normal;min-height:38px}.campaign-row.selected{background:#f0f6f8;border-left:3px solid #165c72;padding-left:5px}.campaign-name{font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.campaign-state{flex-shrink:0;color:#795b25;font-weight:400}.card{margin-top:0;padding-top:12px;border-top:0}.card>h3{font-size:14px}.comparison{margin:10px 0;font-size:12px}.comparison caption{font-size:13px;margin-bottom:4px}.comparison th,.comparison td{padding:6px 10px!important}.comparison .value-hint{margin-top:2px}.comparison .difference-value strong{font-weight:400}.date-note,.date-review{display:block}.date-note{color:#536875;font-weight:400}.date-review{color:#793d08;font-weight:600}.upweight{background:#fffbf3;border-color:#e6d8bc;border-left:2px solid #d7872a;margin:10px 0;padding:10px 12px}.upweight.risk{background:#fff5f5;border-color:#ba4b51}.upweight>h3{font-size:13px;color:#795b25}.upweight.risk>h3{color:#982a31}.upweight-values{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:8px 0}.upweight-values span,.upweight-values strong{display:block}.upweight-values strong{font-size:14px;font-variant-numeric:tabular-nums}.projection{border-top:1px solid #eee5d6;padding-top:6px;font-size:12px}.upweight>p.note{font-size:11px;margin:4px 0}.delivery{font-size:11px}details{border-top:1px solid #dde5e9;padding-top:8px;margin-top:8px;font-size:12px}.scope{font-size:11px;margin:8px 0 0}.link-failure{padding:10px;border-left:3px solid #d7872a;background:#fff8ef;margin-top:8px;font-size:12px}@container(max-width:560px){.campaign-row{align-items:flex-start;flex-direction:column;gap:2px}.campaign-name{white-space:normal}.panel>header{padding:12px 14px 0}.panel>.primary-actions{padding:0 14px 10px}.panel-body{padding:0 14px 7px}.panel>footer{padding:10px 14px}.comparison tr{margin-bottom:6px}}`;
        style.textContent += `@media(min-width:700px) and (max-height:900px){.panel-body{padding-bottom:0}.panel>header{padding-top:10px}.panel>.primary-actions{margin-top:6px;padding-bottom:8px}.panel>footer{padding-top:8px;padding-bottom:8px}.overview{padding:6px 0}.campaign-row{min-height:30px;padding-top:5px;padding-bottom:5px}.card{padding-top:8px}.card>p.note{margin:4px 0}.card>.comparison{margin:6px 0}.card>.comparison caption{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.card>.comparison tbody tr:first-child .value-hint{display:none}.card>.comparison th,.card>.comparison td{padding-top:5px!important;padding-bottom:5px!important}.upweight{padding:8px 10px;margin:8px 0}.upweight-values{margin:6px 0}.upweight>p.note{margin:3px 0}.delivery{margin:6px 0}details{margin-top:6px;padding-top:6px}.scope{margin-top:6px}}`;
        style.textContent += `.primary-actions .monitor-status{background:transparent;border:0;border-radius:3px;color:#536875;padding:3px 0;text-decoration:underline;text-underline-offset:3px;font-size:12px;white-space:nowrap}.primary-actions .monitor-status:hover{color:#165c72}`;
        const panel = element('section', '', 'panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', `Meta campaign check ${id}`);
        const header = element('header');
        const close = element('button', 'Close', 'secondary');
        close.type = 'button';
        close.addEventListener('click', closePanel);
        panelStatus = element('p', '', 'status');
        panelStatus.setAttribute('role', 'status');
        panelStatus.setAttribute('aria-live', 'polite');
        const heading = element('div', '', 'panel-heading');
        heading.append(element('h2', `Meta check · ${id}`), panelStatus);
        header.append(heading, close);
        panelCheck = element('button', 'Check again');
        panelCheck.type = 'button';
        panelCheck.addEventListener('click', () => runCheck(id));
        panelActions = element('div', '', 'actions primary-actions');
        panelActions.style.justifyContent = 'flex-start';
        panelBody = element('div', '', 'panel-body');
        const footer = element('footer');
        const manage = element('button', 'All campaigns', 'secondary');
        manage.type = 'button';
        manage.addEventListener('click', async () => {
            try {
                const response = await chrome.runtime.sendMessage({ action: 'socialCampaignCheck', operation: 'open', listOnly: true });
                if (response?.status !== 'success') throw new Error(response?.message || 'The campaign list could not be opened.');
            } catch (error) { if (openCampaign === id) panelStatus.textContent = error.message; }
        });
        const access = element('button', 'Meta access', 'secondary');
        access.type = 'button';
        access.addEventListener('click', async () => {
            try {
                const response = await chrome.runtime.sendMessage({ action: 'socialCampaignCheck', operation: 'access', campaignId: id });
                if (response?.status !== 'success') throw new Error(response?.message || 'Meta access settings could not be opened.');
            } catch (error) { if (openCampaign === id) panelStatus.textContent = error.message; }
        });
        const links = element('div', '', 'actions');
        links.append(manage, access);
        footer.append(element('span','One-off check · nothing is monitored automatically.','note footer-context'),links);
        panel.append(header, panelActions, panelBody, footer);
        shadow.append(style, panel);
        document.body.append(panelHost);
        const host = panelHost;
        panelEntranceTimer = setTimeout(() => {
            if (panelHost === host && openCampaign === id) panel.classList.add('is-open');
        }, 0);
        renderPanel();
        close.focus();
        runCheck(id);
    }
    function hideTooltip() { clearTimeout(tooltipDismissTimer); tooltip?.remove(); tooltip = null; }
    function delayHideTooltip() { clearTimeout(tooltipDismissTimer); tooltipDismissTimer = setTimeout(hideTooltip, 1000); }
    function showTooltip(button) {
        hideTooltip();
        document.dispatchEvent(new CustomEvent('ops-toolshed-header-tooltip-open', { detail: 'meta' }));
        tooltip = document.createElement('div');
        tooltip.id = 'ops-social-campaign-check-tooltip';
        tooltip.setAttribute('role', 'tooltip');
        tooltip.textContent = button.dataset.help;
        tooltip.style.cssText = 'position:fixed;z-index:2147483647;max-width:300px;padding:9px 12px;border-radius:6px;background:#1f2937;color:#fff;box-shadow:0 3px 12px #0003;font:13px/1.4 system-ui,sans-serif;pointer-events:none';
        document.body.appendChild(tooltip);
        const rect = button.getBoundingClientRect();
        tooltip.style.top = `${rect.bottom + 8}px`;
        const tooltipWidth = tooltip.getBoundingClientRect().width;
        const centredLeft = rect.left + (rect.width - tooltipWidth) / 2;
        tooltip.style.left = `${Math.max(8, Math.min(centredLeft, window.innerWidth - tooltipWidth - 8))}px`;
    }
    function reconcile() {
        reconcileMonitoring();
        const active = window.opsToolshedExtensionState?.isActive();
        const campaign = location.hash.match(/(?:^#|[&?])campaign-id=(CP[A-Z0-9]+)/);
        const container = document.querySelector('.workflow-widget-wrapper');
        const existing = document.getElementById('ops-social-campaign-check');
        if (!active || !campaign || !container || location.hostname !== 'go.mediaocean.com' || !window.dstAssuranceFeature?.hasFacebookBooking()) { existing?.remove(); hideTooltip(); closePanel({ immediate: true }); return; }
        if (panelHost && panelHost.shadowRoot.querySelector('[role="dialog"]').getAttribute('aria-label') !== `Meta campaign check ${campaign[1]}`) closePanel({ immediate: true });
        if (existing?.parentElement === container) {
            const record = records[campaign[1]];
            existing.textContent = record?.monitor && (record.error || record.linkFailures?.length || record.results?.some(result => result.findings.length || result.warnings.length)) ? 'Check Meta •' : 'Check Meta';
            return;
        }
        existing?.remove();
        hideTooltip();
        const button = document.createElement('button');
        button.id = 'ops-social-campaign-check';
        button.type = 'button';
        button.textContent = 'Check Meta';
        button.dataset.help = 'Check this campaign against live Meta budgets, dates and spend';
        button.setAttribute('aria-describedby', 'ops-social-campaign-check-tooltip');
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-expanded', 'false');
        button.addEventListener('mouseenter', () => showTooltip(button));
        button.addEventListener('focus', () => showTooltip(button));
        button.addEventListener('mouseleave', delayHideTooltip);
        button.addEventListener('blur', hideTooltip);
        button.style.cssText = 'padding:3px 9px;border:1px solid #a8bac5;border-radius:4px;background:#fff;color:#17455b;cursor:pointer;font:inherit;white-space:nowrap;pointer-events:auto';
        button.addEventListener('click', () => openPanel(button));
        container.appendChild(button);
    }
    function monitoringEntries() {
        return Object.entries(records).filter(([id, record]) => /^CP[A-Z0-9]+$/.test(id) && record.monitor);
    }
    function monitorIssues(record) {
        if (record.error) return [record.error];
        return [...new Set([...(record.linkFailures || []).map(link => link.message),
            ...(record.results || []).flatMap(result => [...(result.findings || []), ...(result.warnings || [])])])];
    }
    function closeMonitoring(immediate = false) {
        const host = monitorHost;
        monitorHost = null;
        monitorButton?.setAttribute('aria-expanded', 'false');
        if (!host) return;
        if (immediate) host.remove();
        else {
            host.shadowRoot.querySelector('.panel').classList.remove('is-open');
            host.style.pointerEvents = 'none';
            setTimeout(() => host.remove(), 200);
        }
    }
    async function monitorAction(id, operation) {
        if (monitorBusy.has(id)) return;
        if (monitorHost) monitorHost.shadowRoot.querySelector('.status').textContent = '';
        monitorBusy.add(id); renderMonitoring();
        try {
            const response = await chrome.runtime.sendMessage({action:'socialCampaignCheck',operation,campaignId:id,fromMonitorOverview:true,...(operation === 'monitor' ? {monitor:false} : {})});
            if (response?.status !== 'success') throw new Error(response?.message || 'Monitoring action failed.');
            if (operation === 'monitor') records[id] = {...records[id],monitor:false};
            else if (response.record) records[id] = response.record;
        } catch (error) {
            // Keep failed actions visible without replacing the saved check health.
            if (monitorHost) monitorHost.shadowRoot.querySelector('.status').textContent = error.message;
        } finally {
            monitorBusy.delete(id); reconcileMonitoring(); renderMonitoring();
        }
    }
    function renderMonitoring() {
        if (!monitorHost) return;
        const root = monitorHost.shadowRoot, body = root.querySelector('.body');
        body.replaceChildren();
        const entries = monitoringEntries(), needsReview = entries.filter(([,record]) => monitorIssues(record).length).length;
        root.querySelector('.summary').textContent = `${entries.length} monitored · ${needsReview} need review`;
        if (!entries.length) body.append(element('p','No campaigns are monitored. Use Check Meta on a campaign to enable monitoring.','note'));
        entries.sort((a,b) => Number(Boolean(monitorIssues(b[1]).length)) - Number(Boolean(monitorIssues(a[1]).length))).forEach(([id,record]) => {
            const row = element('section','','monitor-row'), issues = monitorIssues(record);
            row.append(element('h3',record.campaignName || id),element('p',`${id} · ${issues.length ? 'Needs review' : 'No issues flagged'}`,issues.length ? 'review' : 'note'));
            row.append(element('p',record.checkedAt ? `Last successful check: ${new Date(record.checkedAt).toLocaleString('en-GB')}` : 'No successful check yet','note'));
            if (record.error && record.checkedAt) row.append(element('p','Check failed; saved results are from the last successful check.','note'));
            if (issues.length) {
                const details = element('details'), summary = element('summary',`${issues.length} issue${issues.length === 1 ? '' : 's'} to review`);
                details.append(summary);
                [...new Set(issues)].forEach(message => details.append(element('p',message,'issue')));
                row.append(details);
            }
            const actions = element('div','','actions'), link = element('a','Open campaign');
            const url = new URL(location.href);
            url.hash = `osAppId=prsm-cm-spa&osPspId=prsm-cm-plan-to-buy&campaign-id=${id}&ptb-mod=buy&ptb-ctx=digital&route=online`;
            link.href = url.href;
            link.addEventListener('click',() => closeMonitoring(true));
            const check = element('button',monitorBusy.has(id) ? 'Working…' : 'Check now'), stop = element('button','Stop monitoring','secondary');
            check.type = stop.type = 'button'; check.disabled = stop.disabled = monitorBusy.has(id);
            check.addEventListener('click',() => monitorAction(id,'check'));
            stop.addEventListener('click',() => monitorAction(id,'monitor'));
            actions.append(link,check,stop); row.append(actions); body.append(row);
        });
    }
    function openMonitoring() {
        if (monitorHost) { closeMonitoring(); return; }
        closePanel({immediate:true}); hideTooltip();
        const rect = monitorButton.getBoundingClientRect(), width = Math.min(600,window.innerWidth-24);
        monitorHost = element('div'); monitorHost.id = 'ops-meta-monitoring-panel';
        monitorHost.style.cssText = `position:fixed;z-index:2147483646;top:${Math.max(12,rect.bottom+8)}px;left:${Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12))}px;width:${width}px;pointer-events:auto`;
        const root = monitorHost.attachShadow({mode:'open'}), style = element('style');
        style.textContent = ':host{font:13px/1.45 system-ui,sans-serif;color:#183440}.panel{background:white;border:1px solid #bbccd6;border-radius:12px;box-shadow:0 8px 36px #18344033;max-height:calc(100vh - 100px);display:flex;flex-direction:column;opacity:0;transform:translateY(-8px) scale(.985);transform-origin:top right;transition:opacity 180ms ease-out,transform 200ms cubic-bezier(.22,1,.36,1)}.panel.is-open{opacity:1;transform:none}header,footer{padding:14px 18px;flex-shrink:0}header,.actions{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}h2{font-size:18px;margin:0}h3{font-size:14px;margin:0;overflow-wrap:anywhere}p{margin:6px 0}.note,.summary{font-size:12px;color:#536875}.summary{margin:4px 0 0}.body{overflow:auto;min-height:0;padding:0 18px}.monitor-row{padding:14px 0;border-top:1px solid #dde5e9}.review{color:#793d08}.issue{font-size:12px;overflow-wrap:anywhere}.actions{justify-content:flex-start;margin-top:10px}button,a{font:inherit;white-space:nowrap}button{padding:7px 10px;border:1px solid #165c72;border-radius:5px;background:#165c72;color:#fff;cursor:pointer}.secondary{background:white;color:#165c72}button:disabled{opacity:.55;cursor:wait}a{color:#165c72}summary{cursor:pointer}footer{border-top:1px solid #dde5e9}button:focus-visible,a:focus-visible,summary:focus-visible{outline:3px solid #e5a641;outline-offset:2px}@media(prefers-reduced-motion:reduce){.panel{transition:none}}';
        const panel = element('section','','panel'); panel.setAttribute('role','dialog'); panel.setAttribute('aria-label','Meta Monitoring');
        const header = element('header'), title = element('div'), close = element('button','Close','secondary');
        close.type = 'button'; close.addEventListener('click',() => {closeMonitoring();monitorButton?.focus();});
        title.append(element('h2','Meta Monitoring'),element('p','','summary')); header.append(title,close);
        const status = element('p','','status'); status.setAttribute('role','status');
        const footer = element('footer'); footer.append(element('p','Checks every 30 minutes while Chrome is running, with a signed-in Prisma session and valid Meta access.','note'),status);
        panel.append(header,element('div','','body'),footer); root.append(style,panel);document.body.append(monitorHost);
        monitorButton.setAttribute('aria-expanded','true');renderMonitoring();
        setTimeout(() => {if(panel.isConnected)panel.classList.add('is-open');},0);close.focus();
    }
    function reconcileMonitoring() {
        const enabled = window.opsToolshedExtensionState?.isActive() && location.hostname === 'go.mediaocean.com';
        const entries = monitoringEntries();
        if (!enabled || !entries.length) {
            monitorButton?.remove(); monitorButton=null;
            if (!enabled) closeMonitoring(true);
            return;
        }
        const roots = [document]; let approval, userMenu;
        for (let index=0;index<roots.length;index++) {
            const root=roots[index];
            approval ||= root.querySelector('.toolshed-approval-banner-button');
            userMenu ||= root.querySelector('mo-banner-user-menu');
            root.querySelectorAll('mo-banner,mo-banner-user-menu,mo-banner-user-menu-content').forEach(host=>{if(host.shadowRoot)roots.push(host.shadowRoot);});
        }
        const anchor = approval || userMenu;
        if (!anchor?.parentElement) {monitorButton?.remove();monitorButton=null;closeMonitoring(true);return;}
        if (!monitorButton?.isConnected || monitorButton.parentElement !== anchor.parentElement) {
            closeMonitoring(true);
            monitorButton?.remove();monitorButton=element('button');monitorButton.id='ops-meta-monitoring';monitorButton.type='button';
            monitorButton.style.cssText='display:inline-flex;align-items:center;gap:6px;padding:4px 8px;margin:0 8px;border:0;border-radius:4px;background:transparent;color:inherit;font:inherit;font-size:12px;transform:translateY(1px);white-space:nowrap;cursor:pointer;pointer-events:auto';
            monitorButton.setAttribute('aria-haspopup','dialog');monitorButton.setAttribute('aria-expanded',String(Boolean(monitorHost)));
            monitorButton.addEventListener('click',event=>{event.stopPropagation();openMonitoring();});anchor.parentElement.insertBefore(monitorButton,anchor);
        }
        const review = entries.filter(([,record])=>monitorIssues(record).length).length;
        monitorButton.textContent=`Meta Monitoring${review ? ` · ${review} to review` : ''}`;
        monitorButton.setAttribute('aria-label',monitorButton.textContent);
    }
    window.opsToolshedExtensionState?.subscribe(active => {
        clearInterval(interval);
        reconcile();
        if (active) interval = setInterval(reconcile, 1500);
    });
    window.addEventListener('resize', () => { hideTooltip(); closePanel(); closeMonitoring(true); });
    window.addEventListener('scroll', hideTooltip, true);
    document.addEventListener('ops-toolshed-header-tooltip-open', event => { if (event.detail !== 'meta') hideTooltip(); });
    document.addEventListener('mouseenter', event => {
        if (event.target instanceof Element && event.target.closest('.toolshed-dst-assurance')) hideTooltip();
    }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { hideTooltip(); closePanel(); closeMonitoring(); } });
    document.addEventListener('click', event => {
        if (monitorHost && !event.composedPath().includes(monitorHost) && !event.composedPath().includes(monitorButton)) closeMonitoring();
        if (panelHost && !event.composedPath().includes(panelHost) && !event.composedPath().includes(document.getElementById('ops-social-campaign-check'))) closePanel();
    });
    chrome.storage.local.get('socialCampaignChecks').then(data => { records = data?.socialCampaignChecks || {}; reconcile(); }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.socialCampaignChecks) return;
        records = changes.socialCampaignChecks.newValue || {};
        reconcile();
        if (!checking) renderPanel();
        renderMonitoring();
    });
})();
