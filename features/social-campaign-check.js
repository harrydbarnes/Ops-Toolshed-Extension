(function() {
    'use strict';
    if (window !== window.top || window.opsSocialCampaignCheckInstalled) return;
    window.opsSocialCampaignCheckInstalled = true;
    let interval, tooltip, panelHost, panelBody, panelStatus, panelCheck, panelActions, openCampaign = '', checking = false;
    let records = {};
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
        ['start', 'end'].forEach(key => {
            const prismaDates = dates(result.bookings || [], key), metaDates = dates(result.metaRanges || [], key);
            const prisma = key === 'start' ? prismaDates[0] : prismaDates.at(-1);
            const complete = metaDates.length === (result.metaRanges || []).length;
            const meta = complete ? (key === 'start' ? metaDates[0] : metaDates.at(-1)) : null;
            const days = prisma && meta ? Math.round((Date.parse(`${meta}T00:00:00Z`) - Date.parse(`${prisma}T00:00:00Z`)) / 86400000) : null;
            const verb = key === 'start' ? 'Starts' : 'Ends';
            const difference = days === null ? 'Cannot verify' : days === 0 ? 'Same day' : `${verb} ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ${days > 0 ? 'later' : 'earlier'}`;
            const needsReview = days === null || (key === 'start' ? days < 0 : days > 0);
            row(key === 'start' ? 'Flight start' : 'Flight end', formatDate(prisma), formatDate(meta), difference, needsReview,
                (result.bookings?.length > 1 ? (key === 'start' ? 'Earliest booking' : 'Latest booking') : ''),
                (result.metaRanges?.length > 1 ? (key === 'start' ? 'Earliest ad set' : 'Latest ad set') : ''));
            if (days !== null && days !== 0 && !needsReview) body.lastElementChild.classList.add('informational-date');
        });
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
        const section = element('section', '', 'candidate'), table = element('table', '', 'comparison');
        table.append(element('caption', 'Untrafficked Prisma increments'));
        const head = element('thead'), headings = element('tr');
        ['Placement / start', 'Increment', 'Meta after traffic', 'Expected total'].forEach(label => { const cell = element('th',label); cell.scope = 'col'; headings.append(cell); });
        head.append(headings); table.append(head);
        const body = element('tbody');
        result.upweightPlan.pending.forEach(item => {
            const row = element('tr', '', item.risk ? 'differs' : '');
            const reference = element('th', `${item.placementNumber} · ${item.start}`); reference.scope = 'row'; row.append(reference);
            [item.amount,item.projectedBudget,item.expectedBudget].forEach((value,index) => { const cell = element('td','',['prisma-value','meta-value','difference-value'][index]); cell.append(element('span',['Increment: ','Meta after traffic: ','Expected total: '][index],'source-label'),element('strong',money(value,result.currency))); row.append(cell); });
            body.append(row);
        });
        table.append(body); section.append(table,element('p',`Full placement booking: ${money(result.budget,result.prismaCurrency)}. Projection assumes these increments are trafficked in start-date order. Recheck before trafficking.`, 'note'));
        return section;
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
        panelStatus.textContent = checking ? 'Reading current Prisma bookings and Meta data…' : record?.error || (record?.checkedAt ? `Last successful check: ${new Date(record.checkedAt).toLocaleString('en-GB')}` : 'Ready to check this campaign.');
        if (!record) return;
        if (record.error && record.latestPrisma) {
            panelBody.append(element('p', 'Prisma bookings retrieved · Meta comparison incomplete', 'warning'));
            record.latestPrisma.bookings.forEach(booking => panelBody.append(element('p', `${booking.placementNumber} · Meta ${booking.campaignId} · ${money(booking.budget, booking.currency)} · ${booking.start} to ${booking.end}`, 'note')));
        }
        if (record.error && record.checkedAt) panelBody.append(element('p', 'Results below are from the last successful check.', 'warning'));
        if (record.checkedAt) {
            const monitor = element('button', record.monitor ? 'Stop monitoring' : 'Monitor this campaign', 'secondary');
            monitor.type = 'button';
            monitor.disabled = checking;
            monitor.addEventListener('click', async () => {
                const id = openCampaign;
                monitor.disabled = true;
                try {
                    const response = await chrome.runtime.sendMessage({ action: 'socialCampaignCheck', operation: 'monitor', campaignId: id, monitor: !record.monitor });
                    if (response?.status !== 'success') throw new Error(response?.message || 'Monitoring could not be updated.');
                    records[id] = { ...records[id], monitor: !record.monitor };
                    if (openCampaign === id) renderPanel();
                } catch (error) { panelStatus.textContent = error.message; monitor.disabled = false; }
            });
            panelActions.append(monitor);
            panelActions.append(element('span', record.monitor ? 'Monitoring · every 30 minutes' : 'One-off · monitoring off', 'note monitor-status'));
        }
        if (record.unmatched?.length) panelBody.append(element('p', `${record.unmatched.length} Meta booking(s) have incomplete IDs, accounts, budgets or dates.`, 'warning'));
        if (record.checkedAt && !record.results?.length) panelBody.append(element('p', 'No linked Meta media bookings were found. This is not a complete Meta comparison.', 'warning'));
        (record.results || []).forEach(result => {
            const card = element('article', '', 'card');
            card.append(element('h3', result.name || result.campaignId), element('p', `Meta ${result.campaignId} · ${result.timezone || 'Account timezone unavailable'}`, 'note'));
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
            if (result.upweightPlan) card.append(upweightPreview(result));
            const metrics = element('div', '', 'metrics');
            [
                ['Prisma package soft limit', result.packageBudget, result.prismaCurrency],
                ['Spend outside booking dates', result.outsideSpend, result.currency]
            ].forEach(([label, amount, currency]) => {
                const metric = element('div', '', 'metric');
                metric.append(element('span', label), element('strong', label === 'Prisma package soft limit' && amount == null ? 'Not supplied' : money(amount, currency)));
                metrics.append(metric);
            });
            card.append(metrics);
            if (result.dailyBudgets?.length) card.append(element('p', `Meta daily budget(s): ${result.dailyBudgets.map(value => money(value, result.currency)).join(', ')}. Daily budgets are not compared to a total booking.`, 'note'));
            // These findings are now expressed by the values and deltas in the comparison.
            result.findings.filter(message => !/^Flight dates differ:|^Meta lifetime budget is (higher|lower) than booked net media\.$|^Meta spend exceeds the selected Prisma net media budget\.$/.test(message)).forEach(message => card.append(element('p', message, 'finding')));
            result.warnings.forEach(message => card.append(element('p', message, 'warning')));
            (result.notes || []).filter(message => !message.startsWith('Flight dates differ:')).forEach(message => card.append(element('p', message, 'note')));
            if (!result.findings.length && !result.warnings.length) card.append(element('p', 'No issues found within the verified booking scope.'));
            (result.candidates || []).forEach(candidate => card.append(possibleCampaign(candidate, openCampaign)));
            if (result.lastChange) card.append(element('p', `Last Meta budget/date change detected: ${new Date(result.lastChange.detectedAt).toLocaleString('en-GB')}. Previous lifetime budget: ${money(result.lastChange.previousLifetimeBudget, result.currency)}.`, 'note'));
            const details = element('details');
            details.append(element('summary', 'Booking details and data sources'));
            const creation = result.creation;
            details.append(element('p', creation ? `Meta creation event: ${creation.actor || 'Unknown actor'} · ${creation.application || 'Unknown application'}${creation.at ? ` · ${creation.at}` : ''}.` : 'Meta creation event unavailable in accessible history.', 'note'));
            if (result.prismaOrigins?.some(item => item.origin)) result.prismaOrigins.forEach(item => details.append(element('p', `Prisma ${item.placementNumber} origin: ${item.origin || 'Unknown'} (booking-details externalEntityOrigin).`, 'note')));
            else details.append(element('p', 'Prisma link origin: unknown. A Meta creator or creation app alone does not prove pushed versus linked back.', 'note'));
            result.bookings.forEach(booking => details.append(element('p', `Prisma ${booking.placementNumber}: ${booking.start} to ${booking.end} · ${money(booking.budget, booking.currency)}`, 'note')));
            result.metaRanges.forEach(range => details.append(element('p', `Meta flight: ${range.start || 'Missing'} to ${range.end || 'Open / missing'}`, 'note')));
            result.outsideDays.forEach(day => details.append(element('p', `${day.date}: ${money(day.spend, result.currency)} outside the selected booking dates`, 'note')));
            (result.packageSources || []).forEach(source => details.append(element('p', `Package limit: Prisma ${source.placementNumber} (${source.field}).`, 'note')));
            details.append(element('p', 'Spend uses available Meta history in the account timezone. Older unavailable history is not checked.', 'note'));
            details.append(element('p', 'Monitoring requires Chrome, a Prisma session and valid Meta access.', 'note'));
            card.append(details);
            panelBody.append(card);
        });
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
        const width = Math.min(720, Math.max(280, window.innerWidth - 24));
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
        panelBody = element('div');
        const footer = element('footer');
        const manage = element('button', 'All campaigns', 'secondary');
        manage.type = 'button';
        manage.addEventListener('click', async () => {
            const response = await chrome.runtime.sendMessage({ action: 'socialCampaignCheck', operation: 'open', listOnly: true });
            if (response?.status !== 'success') panelStatus.textContent = response?.message || 'The campaign list could not be opened.';
        });
        const access = element('button', 'Meta access', 'secondary');
        access.type = 'button';
        access.addEventListener('click', async () => {
            const response = await chrome.runtime.sendMessage({ action: 'socialCampaignCheck', operation: 'access', campaignId: id });
            if (response?.status !== 'success') panelStatus.textContent = response?.message || 'Meta access settings could not be opened.';
        });
        const links = element('div', '', 'actions');
        links.append(manage, access);
        footer.append(links);
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
        const active = window.opsToolshedExtensionState?.isActive();
        const campaign = location.hash.match(/(?:^#|[&?])campaign-id=(CP[A-Z0-9]+)/);
        const container = document.querySelector('.workflow-widget-wrapper');
        const existing = document.getElementById('ops-social-campaign-check');
        if (!active || !campaign || !container || location.hostname !== 'go.mediaocean.com' || !window.dstAssuranceFeature?.hasFacebookBooking()) { existing?.remove(); hideTooltip(); closePanel({ immediate: true }); return; }
        if (panelHost && panelHost.shadowRoot.querySelector('[role="dialog"]').getAttribute('aria-label') !== `Meta campaign check ${campaign[1]}`) closePanel({ immediate: true });
        if (existing?.parentElement === container) {
            const record = records[campaign[1]];
            existing.textContent = record?.monitor && (record.error || record.results?.some(result => result.findings.length || result.warnings.length)) ? 'Check Meta •' : 'Check Meta';
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
    window.opsToolshedExtensionState?.subscribe(active => {
        clearInterval(interval);
        reconcile();
        if (active) interval = setInterval(reconcile, 1500);
    });
    window.addEventListener('resize', () => { hideTooltip(); closePanel(); });
    window.addEventListener('scroll', hideTooltip, true);
    document.addEventListener('ops-toolshed-header-tooltip-open', event => { if (event.detail !== 'meta') hideTooltip(); });
    document.addEventListener('mouseenter', event => {
        if (event.target instanceof Element && event.target.closest('.toolshed-dst-assurance')) hideTooltip();
    }, true);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { hideTooltip(); closePanel(); } });
    document.addEventListener('click', event => {
        if (panelHost && !event.composedPath().includes(panelHost) && !event.composedPath().includes(document.getElementById('ops-social-campaign-check'))) closePanel();
    });
    chrome.storage.local.get('socialCampaignChecks').then(data => { records = data?.socialCampaignChecks || {}; reconcile(); }).catch(() => {});
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.socialCampaignChecks) return;
        records = changes.socialCampaignChecks.newValue || {};
        reconcile();
        if (!checking) renderPanel();
    });
})();
