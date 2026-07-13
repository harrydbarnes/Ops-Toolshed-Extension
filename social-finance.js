(function () {
    const engine = window.socialFinanceEngine;
    const state = { metaText: '', prismaText: '', report: null };
    const elements = {};

    function byId(id) { return document.getElementById(id); }
    function currency(value) {
        return value === null || value === undefined || value === '' ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
    }
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }
    function evidenceClass(value) { return `evidence-${String(value).toLowerCase().replace(/[^a-z]+/g, '-')}`; }

    async function loadFile(input, key, labelId) {
        const file = input.files?.[0];
        if (!file) return;
        state[key] = await file.text();
        byId(labelId).textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
        if (key === 'metaText') renderAccountScope();
    }

    function renderAccountScope() {
        const parsed = engine.parseCsv(state.metaText);
        const aggregated = engine.aggregateMeta(parsed);
        const accounts = [...new Set(aggregated.records.map(record => record.account).filter(Boolean))].sort();
        elements.accountScopePanel.classList.toggle('hidden', !accounts.length);
        elements.accountOptions.innerHTML = accounts.map((account, index) => `<label class="account-option"><input type="checkbox" value="${escapeHtml(account)}" ${accounts.length === 1 && index === 0 ? 'checked' : ''}><span>${escapeHtml(account)}</span></label>`).join('');
    }

    function selectedAccounts() {
        return Array.from(elements.accountOptions.querySelectorAll('input:checked')).map(input => input.value);
    }

    function renderMessages(errors) {
        elements.validationMessages.innerHTML = errors.map(error => `<div class="message">${escapeHtml(error)}</div>`).join('');
    }

    function renderSummary(summary) {
        const cards = [
            ['Campaign-month rows', summary.total],
            ['Missing / unlinked', summary.missingOrUnlinked, 'alert'],
            ['Need an update', summary.needsUpdate, 'update'],
            ['Investigate', summary.investigate],
            ['Unmatched Meta spend', currency(summary.unmatchedSpend), 'alert']
        ];
        elements.summaryCards.innerHTML = cards.map(([label, value, className = '']) => `<article class="summary-card ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
    }

    function filteredRows() {
        if (!state.report) return [];
        const filter = elements.evidenceFilter.value;
        const query = elements.reportSearch.value.trim().toLowerCase();
        return state.report.rows.filter(row => {
            const evidenceMatch = filter === 'all' || (filter === 'actionable' ? row.evidence !== 'Matched' : row.evidence === filter);
            const queryMatch = !query || [row.campaignId, row.campaignName, row.account, row.classification].some(value => String(value || '').toLowerCase().includes(query));
            return evidenceMatch && queryMatch;
        });
    }

    function renderRows() {
        const rows = filteredRows();
        elements.visibleCount.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'} shown`;
        elements.reportBody.innerHTML = rows.map(row => `
            <tr>
                <td><span class="evidence-pill ${evidenceClass(row.evidence)}">${escapeHtml(row.evidence)}</span></td>
                <td><span class="campaign-id">${escapeHtml(row.campaignId)}</span><span class="minor">${escapeHtml(row.month)}</span></td>
                <td>${escapeHtml(row.account)}<span class="minor">${escapeHtml(row.campaignName)}</span></td>
                <td class="number">${escapeHtml(currency(row.metaSpend))}</td>
                <td class="number">${escapeHtml(currency(row.prismaPlanned))}</td>
                <td class="number">${escapeHtml(currency(row.variance))}</td>
                <td><strong>${escapeHtml(row.classification)}</strong><span class="minor">${escapeHtml(row.owner || 'Owner not supplied')}</span></td>
                <td>${row.issues.map(issue => escapeHtml(issue)).join('<br>') || 'No secondary issues'}</td>
            </tr>`).join('');
    }

    function runComparison() {
        const errors = [];
        if (!state.metaText) errors.push('Choose the Meta campaign CSV.');
        if (!state.prismaText) errors.push('Choose the Prisma PlacementDetailTable CSV.');
        if (state.metaText && elements.accountOptions.querySelectorAll('input').length > 1 && !selectedAccounts().length) errors.push('Select at least one Meta account covered by the Prisma export.');
        if (errors.length) { renderMessages(errors); return; }

        const report = engine.compare(engine.parseCsv(state.metaText), engine.parseCsv(state.prismaText), {
            asOfDate: elements.asOfDate.value,
            tolerance: Number(elements.tolerance.value),
            closedWorkingDay: Number(elements.closedWorkingDay.value),
            populationConfirmed: elements.populationConfirmed.checked,
            accountScope: selectedAccounts()
        });
        if (report.validationErrors.length) { renderMessages(report.validationErrors); elements.results.classList.add('hidden'); return; }
        state.report = report;
        renderMessages([]);
        renderSummary(report.summary);
        elements.coverageWarnings.innerHTML = report.warnings.map(warning => `<span class="coverage-warning">${escapeHtml(warning)}</span>`).join('');
        elements.results.classList.remove('hidden');
        renderRows();
    }

    function downloadReport() {
        if (!state.report) return;
        const csv = engine.reportToCsv(filteredRows());
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `social_booking_exceptions_${elements.asOfDate.value || 'report'}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    document.addEventListener('DOMContentLoaded', () => {
        ['validationMessages', 'results', 'summaryCards', 'coverageWarnings', 'evidenceFilter', 'reportSearch', 'visibleCount', 'reportBody', 'asOfDate', 'tolerance', 'closedWorkingDay', 'populationConfirmed', 'accountScopePanel', 'accountOptions'].forEach(id => { elements[id] = byId(id); });
        elements.asOfDate.value = new Date().toISOString().slice(0, 10);
        byId('metaFile').addEventListener('change', event => loadFile(event.target, 'metaText', 'metaFileName'));
        byId('prismaFile').addEventListener('change', event => loadFile(event.target, 'prismaText', 'prismaFileName'));
        byId('runComparison').addEventListener('click', runComparison);
        byId('downloadReport').addEventListener('click', downloadReport);
        byId('selectAllAccounts').addEventListener('click', () => elements.accountOptions.querySelectorAll('input').forEach(input => { input.checked = true; }));
        byId('clearAccounts').addEventListener('click', () => elements.accountOptions.querySelectorAll('input').forEach(input => { input.checked = false; }));
        elements.evidenceFilter.addEventListener('change', renderRows);
        elements.reportSearch.addEventListener('input', renderRows);
    });
})();
