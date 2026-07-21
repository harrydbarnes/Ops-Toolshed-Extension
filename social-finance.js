(function () {
    const engine = window.socialFinanceEngine;
    const metaApi = window.metaReportApi;
    const state = { metaText: '', uploadedMetaText: '', metaTextSource: '', prismaText: '', report: null, metaAccounts: [], metaReference: null };
    const elements = {};
    const ACCOUNT_SCOPE_STORAGE_KEY = 'socialBookingMetaAccountScope';
    const META_API_STORAGE_KEY = 'socialBookingMetaApiCredentials';
    const META_REFERENCE_STORAGE_KEY = 'socialBookingMetaReference';

    function byId(id) { return document.getElementById(id); }
    function currency(value) {
        return value === null || value === undefined || value === '' ? 'Not available' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value);
    }
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }
    function evidenceClass(value) { return `evidence-${String(value).toLowerCase().replace(/[^a-z]+/g, '-')}`; }

    function localExtensionStorage() {
        return window.chrome && window.chrome.storage && window.chrome.storage.local;
    }

    function readLocalStorage(key) {
        const storage = localExtensionStorage();
        if (!storage) return Promise.resolve({});
        return new Promise((resolve, reject) => storage.get(key, result => {
            const error = window.chrome.runtime && window.chrome.runtime.lastError;
            if (error) reject(new Error(error.message)); else resolve(result || {});
        }));
    }

    function writeLocalStorage(value) {
        const storage = localExtensionStorage();
        if (!storage) return Promise.reject(new Error('Local extension storage is unavailable.'));
        return new Promise((resolve, reject) => storage.set(value, () => {
            const error = window.chrome.runtime && window.chrome.runtime.lastError;
            if (error) reject(new Error(error.message)); else resolve();
        }));
    }

    function removeLocalStorage(key) {
        const storage = localExtensionStorage();
        if (!storage) return Promise.reject(new Error('Local extension storage is unavailable.'));
        return new Promise((resolve, reject) => storage.remove(key, () => {
            const error = window.chrome.runtime && window.chrome.runtime.lastError;
            if (error) reject(new Error(error.message)); else resolve();
        }));
    }

    async function savedMetaCredentials() {
        const stored = await readLocalStorage(META_API_STORAGE_KEY);
        const credentials = stored[META_API_STORAGE_KEY] || {};
        if (Object.prototype.hasOwnProperty.call(credentials, 'businessId')) {
            const migrated = credentials.accessToken ? { accessToken: credentials.accessToken } : {};
            await writeLocalStorage({ [META_API_STORAGE_KEY]: migrated });
            return migrated;
        }
        return credentials;
    }

    function setStatus(element, message, kind = '') {
        element.textContent = message;
        element.classList.toggle('is-ready', kind === 'ready');
        element.classList.toggle('is-error', kind === 'error');
    }

    async function renderCredentialStatus() {
        try {
            const credentials = await savedMetaCredentials();
            const hasToken = Boolean(credentials.accessToken);
            elements.removeMetaToken.classList.toggle('hidden', !hasToken);
            setStatus(elements.metaCredentialStatus, hasToken ? 'Access token saved locally. The saved value is hidden.' : 'No Meta access token saved.', hasToken ? 'ready' : '');
        } catch (error) {
            setStatus(elements.metaCredentialStatus, error.message, 'error');
        }
    }

    async function saveMetaCredentials() {
        const accessToken = elements.metaAccessToken.value.trim();
        if (!accessToken) {
            setStatus(elements.metaCredentialStatus, 'Enter an access token to save.', 'error');
            return;
        }
        try {
            await writeLocalStorage({ [META_API_STORAGE_KEY]: { accessToken } });
            elements.metaAccessToken.value = '';
            await renderCredentialStatus();
        } catch (error) {
            setStatus(elements.metaCredentialStatus, error.message, 'error');
        }
    }

    async function removeMetaCredential() {
        try {
            await removeLocalStorage(META_API_STORAGE_KEY);
            if (state.metaTextSource === 'api') {
                state.metaText = state.uploadedMetaText;
                state.metaTextSource = state.uploadedMetaText ? 'csv' : '';
            }
            await renderCredentialStatus();
            resetReport();
        } catch (error) {
            setStatus(elements.metaCredentialStatus, error.message, 'error');
        }
    }

    function rememberedAccountIds() {
        try {
            const value = JSON.parse(localStorage.getItem(ACCOUNT_SCOPE_STORAGE_KEY) || '[]');
            return Array.isArray(value) ? value.map(String) : [];
        } catch (_) {
            return [];
        }
    }

    function saveAccountScope() {
        try { localStorage.setItem(ACCOUNT_SCOPE_STORAGE_KEY, JSON.stringify(selectedAccountIds())); } catch (_) { /* Storage may be unavailable. */ }
    }

    function resetReport() {
        state.report = null;
        elements.results.classList.add('hidden');
    }

    async function loadFile(file, key, labelId, dropZone, removeButton) {
        if (!file) return;
        const isCsv = file.type === 'text/csv' || /\.csv$/i.test(file.name || '');
        if (!isCsv) {
            renderMessages([`Choose a CSV file for the ${key === 'metaText' ? 'Meta Ads Report' : 'Prisma booking report'}.`]);
            return;
        }
        state[key] = await file.text();
        if (key === 'metaText') {
            state.uploadedMetaText = state[key];
            state.metaTextSource = 'csv';
        }
        byId(labelId).textContent = `${file.name}, ${(file.size / 1024).toFixed(1)} KB`;
        dropZone.classList.add('has-file');
        removeButton.classList.remove('hidden');
        resetReport();
        renderMessages([]);
        if (key === 'metaText') await importMetaReference();
    }

    function setupFileUpload(inputId, dropZoneId, removeButtonId, key, labelId) {
        const input = byId(inputId);
        const dropZone = byId(dropZoneId);
        const removeButton = byId(removeButtonId);
        const load = file => loadFile(file, key, labelId, dropZone, removeButton).catch(error => renderMessages([error.message]));

        input.addEventListener('change', event => load(event.target.files?.[0]));
        dropZone.addEventListener('click', event => {
            if (event.target === removeButton || removeButton.contains(event.target)) return;
            input.click();
        });
        ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, event => {
            event.preventDefault();
            event.stopPropagation();
            if (Array.from(event.dataTransfer?.types || []).includes('Files')) dropZone.classList.add('is-dragging');
        }));
        dropZone.addEventListener('dragleave', event => {
            event.preventDefault();
            if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove('is-dragging');
        });
        dropZone.addEventListener('drop', event => {
            event.preventDefault();
            event.stopPropagation();
            dropZone.classList.remove('is-dragging');
            load(event.dataTransfer?.files?.[0]);
        });
        dropZone.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            if (event.target === removeButton) return;
            event.preventDefault();
            input.click();
        });
        removeButton.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            if (key === 'metaText') {
                state.uploadedMetaText = '';
                if (state.metaTextSource === 'csv') {
                    state.metaText = '';
                    state.metaTextSource = '';
                }
            } else state[key] = '';
            input.value = '';
            byId(labelId).textContent = 'No file selected';
            dropZone.classList.remove('has-file', 'is-dragging');
            removeButton.classList.add('hidden');
            if (key === 'metaText') {
                if (state.metaReference && state.metaReference.accounts.length) renderAccountOptions(state.metaReference.accounts);
                else {
                    elements.accountOptions.innerHTML = '';
                    elements.accountScopePanel.classList.add('hidden');
                }
            }
            resetReport();
            renderMessages([]);
        });
    }

    function renderAccountOptions(accounts) {
        const remembered = new Set(rememberedAccountIds());
        elements.accountScopePanel.classList.toggle('hidden', !accounts.length);
        elements.accountOptions.innerHTML = accounts.map((account, index) => {
            const checked = remembered.has(account.id) || (accounts.length === 1 && index === 0);
            return `<label class="account-option"><input type="checkbox" value="${escapeHtml(account.id)}" ${checked ? 'checked' : ''}><span>${escapeHtml(account.name)}<small>Account ID ${escapeHtml(account.id)}</small></span></label>`;
        }).join('');
        if (accounts.length === 1 && !remembered.has(accounts[0].id)) saveAccountScope();
    }

    function renderReferenceStatus() {
        const reference = state.metaReference;
        const hasReference = Boolean(reference && reference.accounts && reference.accounts.length);
        elements.removeMetaReference.classList.toggle('hidden', !hasReference);
        elements.apiAccountActions.classList.toggle('hidden', !hasReference);
        if (!hasReference) {
            setStatus(elements.metaReferenceStatus, 'Upload a Meta Ads Report to establish the account list.');
            return;
        }
        const synced = reference.accounts.filter(account => account.lastSynced).length;
        setStatus(elements.metaReferenceStatus, `${reference.accounts.length} account${reference.accounts.length === 1 ? '' : 's'}, ${reference.campaigns.length} campaign${reference.campaigns.length === 1 ? '' : 's'}, and ${reference.adSets.length} ad set${reference.adSets.length === 1 ? '' : 's'} remembered locally${synced ? `; ${synced} account${synced === 1 ? '' : 's'} synced` : ''}.`, 'ready');
    }

    async function importMetaReference() {
        const extracted = engine.extractMetaReferenceData(engine.parseCsv(state.uploadedMetaText));
        if (extracted.errors.length) {
            renderMessages(extracted.errors);
            return;
        }
        state.metaReference = { ...extracted, importedAt: new Date().toISOString() };
        state.metaAccounts = extracted.accounts.sort((left, right) => left.name.localeCompare(right.name));
        await writeLocalStorage({ [META_REFERENCE_STORAGE_KEY]: state.metaReference });
        renderAccountOptions(state.metaAccounts);
        renderReferenceStatus();
    }

    async function restoreMetaReference() {
        try {
            const stored = await readLocalStorage(META_REFERENCE_STORAGE_KEY);
            const reference = stored[META_REFERENCE_STORAGE_KEY];
            if (reference && Array.isArray(reference.accounts)) {
                state.metaReference = reference;
                state.metaAccounts = reference.accounts.sort((left, right) => left.name.localeCompare(right.name));
                renderAccountOptions(state.metaAccounts);
            }
            renderReferenceStatus();
        } catch (error) {
            setStatus(elements.metaReferenceStatus, error.message, 'error');
        }
    }

    async function removeMetaReference() {
        await removeLocalStorage(META_REFERENCE_STORAGE_KEY);
        state.metaReference = null;
        state.metaAccounts = [];
        if (state.metaTextSource === 'api') {
            state.metaText = state.uploadedMetaText;
            state.metaTextSource = state.uploadedMetaText ? 'csv' : '';
        }
        elements.accountOptions.innerHTML = '';
        elements.accountScopePanel.classList.add('hidden');
        renderReferenceStatus();
        resetReport();
    }

    function applyDatePreset() {
        const custom = elements.metaApiDatePreset.value === 'custom';
        elements.metaApiStartDate.disabled = !custom;
        elements.metaApiEndDate.disabled = !custom;
        if (!custom) {
            const range = metaApi.resolveDateRange(elements.metaApiDatePreset.value);
            elements.metaApiStartDate.value = range.since;
            elements.metaApiEndDate.value = range.until;
        }
    }

    async function createMetaClient() {
        if (!metaApi) throw new Error('The Meta API helper could not be loaded.');
        const credentials = await savedMetaCredentials();
        return metaApi.createClient({ accessToken: credentials.accessToken });
    }

    async function pullMetaData() {
        const accountIds = selectedAccountIds();
        const startDate = elements.metaApiStartDate.value;
        const endDate = elements.metaApiEndDate.value;
        if (!accountIds.length) {
            setStatus(elements.metaApiStatus, 'Select at least one Meta ad account.', 'error');
            return;
        }
        if (!startDate || !endDate || startDate > endDate) {
            setStatus(elements.metaApiStatus, 'Choose a valid reporting start and end date.', 'error');
            return;
        }

        elements.pullMetaData.disabled = true;
        setStatus(elements.metaApiStatus, 'Pulling campaign metadata, ad sets, and monthly spend…');
        try {
            const client = await createMetaClient();
            const records = [];
            for (let index = 0; index < accountIds.length; index++) {
                const account = state.metaAccounts.find(item => item.id === accountIds[index]) || { id: accountIds[index], name: accountIds[index] };
                setStatus(elements.metaApiStatus, `Pulling ${account.name} (${index + 1} of ${accountIds.length})…`);
                const sync = await client.syncAccount(account, startDate, endDate);
                records.push(...sync.records);
                state.metaReference = metaApi.mergeReferenceData(state.metaReference, account, sync);
            }
            await writeLocalStorage({ [META_REFERENCE_STORAGE_KEY]: state.metaReference });
            state.metaAccounts = state.metaReference.accounts.sort((left, right) => left.name.localeCompare(right.name));
            state.metaText = metaApi.reportToMetaCsv(records);
            state.metaTextSource = 'api';
            saveAccountScope();
            resetReport();
            elements.clearMetaApiData.classList.remove('hidden');
            setStatus(elements.metaApiStatus, `${records.length} campaign-month row${records.length === 1 ? '' : 's'} ready to compare.`, 'ready');
            renderReferenceStatus();
            renderMessages([]);
        } catch (error) {
            setStatus(elements.metaApiStatus, error.message, 'error');
        } finally {
            elements.pullMetaData.disabled = false;
        }
    }

    function clearMetaApiData() {
        if (state.metaTextSource === 'api') {
            state.metaText = state.uploadedMetaText;
            state.metaTextSource = state.uploadedMetaText ? 'csv' : '';
        }
        elements.clearMetaApiData.classList.add('hidden');
        setStatus(elements.metaApiStatus, 'Pulled Meta data cleared. Saved API details remain available.', 'ready');
        resetReport();
    }

    function selectedAccountIds() {
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
            ['Monitor', summary.monitor],
            ['Investigate', summary.investigate],
            ['Outside report scope', summary.outsideScope],
            ['Unmatched Meta spend', currency(summary.unmatchedSpend), 'alert']
        ];
        elements.summaryCards.innerHTML = cards.map(([label, value, className = '']) => `<article class="summary-card ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
    }

    function monthFilteredRows() {
        if (!state.report) return [];
        const from = elements.monthFromFilter.value;
        const to = elements.monthToFilter.value;
        return state.report.rows.filter(row => (!from || row.month >= from) && (!to || row.month <= to));
    }

    function filteredRows() {
        const filter = elements.evidenceFilter.value;
        const query = elements.reportSearch.value.trim().toLowerCase();
        return monthFilteredRows().filter(row => {
            const evidenceMatch = filter === 'all' || (filter === 'actionable' ? !['Matched', 'Outside scope'].includes(row.evidence) : row.evidence === filter);
            const queryMatch = !query || [row.accountId, row.campaignId, row.campaignName, row.account, row.classification].some(value => String(value || '').toLowerCase().includes(query));
            return evidenceMatch && queryMatch;
        });
    }

    function populateMonthFilters(rows) {
        const months = [...new Set(rows.map(row => row.month).filter(Boolean))].sort();
        const options = months.map(month => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`).join('');
        elements.monthFromFilter.innerHTML = options;
        elements.monthToFilter.innerHTML = options;
        elements.monthFromFilter.value = months[0] || '';
        elements.monthToFilter.value = months[months.length - 1] || '';
    }

    function renderReport() {
        renderSummary(engine.summarizeRows(monthFilteredRows()));
        renderRows();
    }

    function renderRows() {
        const rows = filteredRows();
        elements.visibleCount.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'} shown`;
        elements.reportBody.innerHTML = rows.map(row => `
            <tr>
                <td><span class="evidence-pill ${evidenceClass(row.evidence)}">${escapeHtml(row.evidence)}</span></td>
                <td><span class="campaign-id">${escapeHtml(row.campaignId)}</span><span class="minor">${escapeHtml(row.month)}</span></td>
                <td>${escapeHtml(row.account)}<span class="minor">ID ${escapeHtml(row.accountId)}</span></td>
                <td>${escapeHtml(row.campaignName || 'Name not supplied')}</td>
                <td class="number">${escapeHtml(currency(row.metaSpend))}</td>
                <td class="number">${escapeHtml(currency(row.prismaPlanned))}</td>
                <td class="number">${escapeHtml(currency(row.variance))}</td>
                <td><strong>${escapeHtml(row.classification)}</strong><span class="minor">${escapeHtml(row.owner || 'Owner not supplied')}</span></td>
                <td>${row.issues.map(issue => escapeHtml(issue)).join('<br>') || 'No secondary issues'}</td>
            </tr>`).join('');
    }

    function runComparison() {
        const errors = [];
        if (!state.metaText) errors.push('Upload a Meta Ads Report or sync the imported accounts through Meta.');
        if (!state.prismaText) errors.push('Choose the Prisma booking CSV.');
        if (state.metaText && elements.accountOptions.querySelectorAll('input').length > 1 && !selectedAccountIds().length) errors.push('Select at least one Meta account covered by the Prisma export.');
        if (errors.length) { renderMessages(errors); return; }

        const report = engine.compare(engine.parseCsv(state.metaText), engine.parseCsv(state.prismaText), {
            asOfDate: elements.asOfDate.value,
            tolerance: Number(elements.tolerance.value),
            closedWorkingDay: Number(elements.closedWorkingDay.value),
            populationConfirmed: elements.populationConfirmed.checked,
            accountIdScope: selectedAccountIds()
        });
        if (report.validationErrors.length) { renderMessages(report.validationErrors); elements.results.classList.add('hidden'); return; }
        state.report = report;
        renderMessages([]);
        populateMonthFilters(report.rows);
        elements.coverageWarnings.innerHTML = report.warnings.map(warning => `<span class="coverage-warning">${escapeHtml(warning)}</span>`).join('');
        elements.results.classList.remove('hidden');
        renderReport();
    }

    function downloadReport() {
        if (!state.report) return;
        const csv = engine.reportToCsv(filteredRows());
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `social_booking_checker_${elements.asOfDate.value || 'report'}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    }

    document.addEventListener('DOMContentLoaded', () => {
        ['validationMessages', 'results', 'summaryCards', 'coverageWarnings', 'evidenceFilter', 'reportSearch', 'monthFromFilter', 'monthToFilter', 'visibleCount', 'reportBody', 'asOfDate', 'tolerance', 'closedWorkingDay', 'populationConfirmed', 'accountScopePanel', 'accountOptions', 'metaApiPanel', 'metaAccessToken', 'metaCredentialStatus', 'removeMetaToken', 'metaApiDatePreset', 'metaApiStartDate', 'metaApiEndDate', 'metaApiStatus', 'apiAccountActions', 'pullMetaData', 'clearMetaApiData', 'metaReferenceStatus', 'removeMetaReference'].forEach(id => { elements[id] = byId(id); });
        elements.asOfDate.value = new Date().toISOString().slice(0, 10);
        applyDatePreset();
        setupFileUpload('metaFile', 'metaDropZone', 'removeMetaFile', 'metaText', 'metaFileName');
        setupFileUpload('prismaFile', 'prismaDropZone', 'removePrismaFile', 'prismaText', 'prismaFileName');
        byId('saveMetaCredentials').addEventListener('click', saveMetaCredentials);
        elements.removeMetaToken.addEventListener('click', removeMetaCredential);
        elements.removeMetaReference.addEventListener('click', () => removeMetaReference().catch(error => setStatus(elements.metaReferenceStatus, error.message, 'error')));
        elements.metaApiDatePreset.addEventListener('change', applyDatePreset);
        elements.pullMetaData.addEventListener('click', pullMetaData);
        elements.clearMetaApiData.addEventListener('click', clearMetaApiData);
        byId('runComparison').addEventListener('click', runComparison);
        byId('downloadReport').addEventListener('click', downloadReport);
        byId('selectAllAccounts').addEventListener('click', () => { elements.accountOptions.querySelectorAll('input').forEach(input => { input.checked = true; }); saveAccountScope(); });
        byId('clearAccounts').addEventListener('click', () => { elements.accountOptions.querySelectorAll('input').forEach(input => { input.checked = false; }); saveAccountScope(); });
        elements.accountOptions.addEventListener('change', saveAccountScope);
        elements.monthFromFilter.addEventListener('change', () => {
            if (elements.monthFromFilter.value > elements.monthToFilter.value) elements.monthToFilter.value = elements.monthFromFilter.value;
            renderReport();
        });
        elements.monthToFilter.addEventListener('change', () => {
            if (elements.monthToFilter.value < elements.monthFromFilter.value) elements.monthFromFilter.value = elements.monthToFilter.value;
            renderReport();
        });
        elements.evidenceFilter.addEventListener('change', renderRows);
        elements.reportSearch.addEventListener('input', renderRows);
        renderCredentialStatus();
        restoreMetaReference();
    });
})();
