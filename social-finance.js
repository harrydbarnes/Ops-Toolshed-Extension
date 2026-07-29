(function () {
    const engine = window.socialFinanceEngine;
    const metaApi = window.metaReportApi;
    const state = { metaText: '', uploadedMetaText: '', metaTextSource: '', prismaText: '', report: null, metaAccounts: [], metaReference: null, prismaReference: null, accountMappings: {}, manualMatches: {}, candidateRejections: {}, wrikeReferences: {}, campaignColumnWidths: {}, manualMatchTrigger: null, showMatchedScopeAccounts: false, shownMappingCampaignsAccountId: '', apiSync: null, uploadValidity: { metaText: false, prismaText: false }, workflowStage: 'upload', sort: { key: '', direction: 'descending' }, socialActionSort: { key: '', direction: 'ascending' }, clientSort: { key: '', direction: 'ascending' } };
    const elements = {};
    const ACCOUNT_SCOPE_STORAGE_KEY = 'socialBookingMetaAccountScope';
    const META_API_STORAGE_KEY = 'socialBookingMetaApiCredentials';
    const META_REFERENCE_STORAGE_KEY = 'socialBookingMetaReference';
    const ACCOUNT_MAPPING_STORAGE_KEY = 'socialBookingMetaPrismaMappings';
    const MANUAL_MATCH_STORAGE_KEY = 'socialBookingManualCampaignMatches';
    const CANDIDATE_REJECTION_STORAGE_KEY = 'socialBookingRejectedCampaignMatches';
    const WRIKE_REFERENCE_STORAGE_KEY = 'socialBookingWrikeReferences';
    const CAMPAIGN_COLUMN_WIDTH_STORAGE_KEY = 'socialBookingCampaignColumnWidths';
    const SAVED_TOKEN_MASK = '••••••••••••';

    function byId(id) { return document.getElementById(id); }
    function currency(value, currencyCode = '') {
        if (value === null || value === undefined || value === '') return 'Not available';
        const code = String(currencyCode || '').trim().toUpperCase();
        if (/^[A-Z]{3}$/.test(code)) {
            try {
                return new Intl.NumberFormat('en-GB', { style: 'currency', currency: code }).format(value);
            } catch (_) {}
        }
        return new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    }

    function metaCurrencyFor(row) {
        return row?.metaCurrency || row?.currency || '';
    }

    function prismaCurrencyFor(row) {
        return row?.prismaCurrency || row?.currency || '';
    }
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
    }
    function evidenceClass(value) { return `evidence-${String(value).toLowerCase().replace(/[^a-z]+/g, '-')}`; }
    const EVIDENCE_EXPLANATIONS = {
        'Missing/unlinked': 'Meta activity has no confirmed Prisma booking linked by account, campaign and month. When the population is confirmed, this may mean a booking is missing.',
        'Needs update': 'A linked Prisma booking exists, but a material spend or date difference needs updating.',
        'Monitor': 'The difference is currently expected while the month is in flight. Keep an eye on it rather than changing the booking now.',
        'Investigate': 'The evidence needs checking, such as a possible account, ID, date, or likely booking match. It is not yet a definitive update.',
        'Outside scope': 'This reporting month appears in only one source, so it is kept separate and is not treated as a missing booking.'
    };

    function evidenceExplanation(value) {
        if (value === 'Need an update') return EVIDENCE_EXPLANATIONS['Needs update'];
        if (value === 'Outside report scope') return EVIDENCE_EXPLANATIONS['Outside scope'];
        return EVIDENCE_EXPLANATIONS[value] || '';
    }

    function evidenceTooltip(label, className = '', showIcon = false) {
        const explanation = evidenceExplanation(label);
        const content = `<span class="${className}">${escapeHtml(label)}</span>`;
        return explanation
            ? `<span class="evidence-tooltip" tabindex="0" data-tooltip="${escapeHtml(explanation)}" aria-label="${escapeHtml(`${label}. ${explanation}`)}">${content}${showIcon ? '<span class="tooltip-icon" aria-hidden="true">i</span>' : ''}</span>`
            : content;
    }

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
            const businessId = String(credentials.businessId || '').replace(/^act_/, '');
            const migrated = {
                ...(credentials.accessToken ? { accessToken: credentials.accessToken } : {}),
                ...(/^\d+$/.test(businessId) ? { reportingBusinessId: businessId } : {})
            };
            await writeLocalStorage({ [META_API_STORAGE_KEY]: migrated });
            return migrated;
        }
        return credentials;
    }

    async function updateMetaAdsReportingLink() {
        let businessId = String(state.metaReference?.businessId || '').replace(/^act_/, '');
        if (!/^\d+$/.test(businessId)) {
            try {
                const credentials = await savedMetaCredentials();
                businessId = String(credentials.reportingBusinessId || '').replace(/^act_/, '');
            } catch (_) {
                businessId = '';
            }
        }
        elements.metaAdsReportingLink.href = /^\d+$/.test(businessId)
            ? `https://adsmanager.facebook.com/adsmanager/reporting?business_id=${encodeURIComponent(businessId)}&global_scope_id=${encodeURIComponent(businessId)}`
            : 'https://adsmanager.facebook.com/adsmanager/reporting';
    }

    function setStatus(element, message, kind = '') {
        element.textContent = message;
        element.classList.toggle('is-ready', kind === 'ready');
        element.classList.toggle('is-error', kind === 'error');
        element.classList.toggle('is-loading', kind === 'loading');
        element.setAttribute('aria-busy', kind === 'loading' ? 'true' : 'false');
    }

    async function renderCredentialStatus() {
        try {
            const credentials = await savedMetaCredentials();
            const hasToken = Boolean(credentials.accessToken);
            elements.removeMetaToken.classList.toggle('hidden', !hasToken);
            elements.saveMetaCredentials.classList.toggle('hidden', hasToken);
            elements.metaAccessToken.closest('.token-input-shell').classList.toggle('has-saved-token', hasToken);
            if (hasToken && document.activeElement !== elements.metaAccessToken) {
                elements.metaAccessToken.value = SAVED_TOKEN_MASK;
                elements.metaAccessToken.dataset.savedMask = 'true';
            } else if (!hasToken) {
                elements.metaAccessToken.value = '';
                delete elements.metaAccessToken.dataset.savedMask;
            }
            setStatus(elements.metaCredentialStatus, hasToken ? 'Access token saved locally. Select the field to replace it.' : 'No Meta access token saved.', hasToken ? 'ready' : '');
        } catch (error) {
            setStatus(elements.metaCredentialStatus, error.message, 'error');
        }
    }

    function clearSavedTokenMask() {
        if (elements.metaAccessToken.dataset.savedMask !== 'true') return;
        elements.metaAccessToken.value = '';
        delete elements.metaAccessToken.dataset.savedMask;
        elements.metaAccessToken.closest('.token-input-shell').classList.remove('has-saved-token');
        elements.saveMetaCredentials.classList.remove('hidden');
    }

    async function saveMetaCredentials() {
        if (elements.metaAccessToken.dataset.savedMask === 'true') {
            setStatus(elements.metaCredentialStatus, 'Access token saved locally. Enter a new token to replace it.', 'ready');
            return;
        }
        const accessToken = elements.metaAccessToken.value.trim();
        if (!accessToken) {
            setStatus(elements.metaCredentialStatus, 'Enter an access token to save.', 'error');
            return;
        }
        try {
            await writeLocalStorage({ [META_API_STORAGE_KEY]: { accessToken } });
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
            state.apiSync = null;
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
        renderPopulationCoverage();
    }

    function uploadsReady() {
        return state.uploadValidity.metaText && state.uploadValidity.prismaText;
    }

    function updateUploadReadiness() {
        if (!elements.continueToScope) return;
        const ready = uploadsReady();
        elements.continueToScope.disabled = !ready;
        elements.uploadStageStatus.textContent = ready
            ? 'Both reports contain the required columns. Continue to review their shared scope.'
            : 'Upload both CSV reports with their required columns to continue.';
        elements.uploadStageStatus.classList.toggle('is-ready', ready);
    }

    function setWorkflowStage(stage) {
        if (stage !== 'upload' && !uploadsReady()) stage = 'upload';
        state.workflowStage = stage;
        elements.uploadStage.classList.toggle('hidden', stage !== 'upload');
        elements.scopeStage.classList.toggle('hidden', stage !== 'scope');
        if (stage !== 'compare') elements.results.classList.add('hidden');
        document.querySelectorAll('[data-workflow-progress]').forEach((item, index) => {
            const itemStage = item.dataset.workflowProgress;
            const itemIndex = ['upload', 'scope', 'compare'].indexOf(itemStage);
            const currentIndex = ['upload', 'scope', 'compare'].indexOf(stage);
            item.classList.toggle('is-current', itemStage === stage);
            item.classList.toggle('is-complete', itemIndex < currentIndex);
            const button = item.querySelector('.workflow-step-button');
            if (button) button.disabled = itemStage === 'scope' ? !uploadsReady() : itemStage === 'compare' ? !state.report : false;
            if (itemStage === stage) {
                item.setAttribute('aria-current', 'step');
                button?.setAttribute('aria-current', 'step');
            } else {
                item.removeAttribute('aria-current');
                button?.removeAttribute('aria-current');
            }
        });
    }

    function navigateWorkflowStage(stage) {
        const available = stage === 'upload' || stage === 'scope' && uploadsReady() || stage === 'compare' && Boolean(state.report);
        if (!available) return;
        setWorkflowStage(stage);
        const target = stage === 'compare' ? elements.results : stage === 'scope' ? elements.scopeStage : elements.uploadStage;
        if (target && typeof target.scrollIntoView === 'function') {
            target.scrollIntoView({
                behavior: typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                block: 'start'
            });
        }
    }

    function scrollToComparisonResults() {
        if (!elements.results || typeof elements.results.scrollIntoView !== 'function') return;
        elements.results.scrollIntoView({
            behavior: typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            block: 'start'
        });
    }

    function validateUploadColumns(key, text) {
        const parsed = engine.parseCsv(text);
        const aggregate = key === 'metaText' ? engine.aggregateMeta(parsed) : engine.aggregatePrisma(parsed);
        const sourceLabel = key === 'metaText' ? 'Meta export' : 'Prisma export';
        const errors = [...(aggregate.errors || [])];
        if (!parsed.rows.length) errors.push(`${sourceLabel} has no data rows.`);
        return errors;
    }

    function renderColumnCheck(key, errors, hasFile = true) {
        const check = key === 'metaText' ? elements.metaColumnCheck : elements.prismaColumnCheck;
        const card = check.closest('.file-card');
        const ready = hasFile && !errors.length;
        const missingColumns = new Set();
        const markMissing = (column, text) => {
            if (errors.some(error => error.includes(text))) missingColumns.add(column);
        };
        if (key === 'metaText') {
            markMissing('accountId', 'missing Account ID');
            markMissing('campaignId', 'missing Campaign ID');
            markMissing('spend', 'missing Amount spent');
            markMissing('month', 'missing Month or Reporting starts');
        } else {
            markMissing('accountId', 'missing Partner account id');
            markMissing('campaignId', 'missing Partner line id');
            markMissing('month', 'missing Period');
            markMissing('planned', 'missing PLANNED_AMOUNT/Gross Amount');
        }
        card.querySelectorAll('[data-required-column]').forEach(chip => {
            const found = hasFile && !missingColumns.has(chip.dataset.requiredColumn);
            chip.classList.toggle('is-found', found);
            if (found) chip.setAttribute('aria-label', `${chip.textContent.trim()}: found in report`);
            else chip.removeAttribute('aria-label');
        });
        state.uploadValidity[key] = ready;
        check.textContent = !hasFile || ready ? '' : `Needs attention: ${errors.join(' ')}`;
        check.classList.toggle('is-ready', ready);
        check.classList.toggle('is-error', hasFile && !ready);
        card.classList.toggle('has-column-error', hasFile && !ready);
        updateUploadReadiness();
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
            state.apiSync = null;
        }
        byId(labelId).textContent = `${file.name}, ${(file.size / 1024).toFixed(1)} KB`;
        dropZone.classList.add('has-file');
        removeButton.classList.remove('hidden');
        renderColumnCheck(key, validateUploadColumns(key, state[key]));
        resetReport();
        renderMessages([]);
        if (key === 'metaText') await importMetaReference();
        if (key === 'prismaText') importPrismaReference();
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
            } else {
                state[key] = '';
                state.prismaReference = null;
                renderPrismaScope();
            }
            input.value = '';
            byId(labelId).textContent = 'No file selected';
            dropZone.classList.remove('has-file', 'is-dragging');
            removeButton.classList.add('hidden');
            renderColumnCheck(key, [], false);
            if (key === 'metaText') {
                if (state.metaReference && state.metaReference.accounts.length) renderAccountOptions(state.metaReference.accounts);
                else {
                    elements.accountOptions.innerHTML = '';
                    elements.accountScopePanel.classList.add('hidden');
                }
            }
            resetReport();
            renderMessages([]);
            setWorkflowStage('upload');
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
        renderPrismaScope();
    }

    function renderPrismaScope() {
        const reference = state.prismaReference;
        const hasReference = Boolean(reference && reference.accounts && reference.accounts.length);
        elements.prismaScopePanel.classList.toggle('hidden', !hasReference);
        if (!hasReference) {
            elements.prismaScopeComparison.innerHTML = '';
            elements.matchedScopeAccounts.innerHTML = '';
            elements.matchedScopeAccounts.classList.add('hidden');
            elements.accountMappingOptions.innerHTML = '';
            return;
        }
        const reportMonths = new Set((state.report?.coverage?.metaMonths || []).map(month => String(month).slice(0, 7)));
        const prismaAccounts = reportMonths.size
            ? reference.accounts.filter(account => account.months?.some(month => reportMonths.has(String(month).slice(0, 7))))
            : reference.accounts;
        const selectedMetaIds = new Set(selectedAccountIds());
        const prismaIds = new Set(prismaAccounts.map(account => account.id));
        const matched = prismaAccounts.filter(account => selectedMetaIds.has(account.id));
        const metaOnly = state.metaAccounts.filter(account => selectedMetaIds.has(account.id) && !prismaIds.has(account.id));
        const prismaOnly = prismaAccounts.filter(account => !selectedMetaIds.has(account.id));
        const accountLabel = account => {
            const client = account.clients && account.clients.length ? account.clients.join(', ') : 'No client name supplied';
            return `${account.id} (${client})`;
        };
        const periodLabel = reportMonths.size ? ' in the Meta reporting months' : '';
        setStatus(elements.prismaScopeStatus, `${prismaAccounts.length} Prisma account${prismaAccounts.length === 1 ? '' : 's'} found${periodLabel}. ${matched.length} match the selected Meta scope.`, matched.length === prismaAccounts.length && !metaOnly.length ? 'ready' : '');
        elements.prismaScopeComparison.innerHTML = `<div><div class="scope-card-heading"><strong>Matched accounts: ${matched.length}</strong><button type="button" class="scope-show-button" data-show-matched-scope="true">${state.showMatchedScopeAccounts ? 'Hide below' : 'Show below'}</button></div><span>${escapeHtml(matched.length ? `${matched.length} selected Meta account${matched.length === 1 ? '' : 's'} also appear in the Prisma report.` : 'None')}</span></div><div class="${metaOnly.length ? 'scope-mismatch' : ''}"><strong>Selected Meta accounts not in Prisma report: ${metaOnly.length}</strong><span>${escapeHtml(metaOnly.length ? metaOnly.map(account => `${account.id} (${account.name})`).join('; ') : 'None')}</span></div><div class="${prismaOnly.length ? 'scope-mismatch' : ''}"><strong>Prisma accounts not selected in Meta: ${prismaOnly.length}</strong><span>${escapeHtml(prismaOnly.length ? prismaOnly.map(accountLabel).join('; ') : 'None')}</span></div>`;
        elements.matchedScopeAccounts.classList.toggle('hidden', !state.showMatchedScopeAccounts || !matched.length);
        elements.matchedScopeAccounts.innerHTML = state.showMatchedScopeAccounts ? matched.map(prismaAccount => {
            const metaAccount = state.metaAccounts.find(account => account.id === prismaAccount.id);
            const client = prismaAccount.clients && prismaAccount.clients.length ? prismaAccount.clients.join(', ') : 'No client name supplied';
            return `<div class="matched-scope-account"><strong>${escapeHtml(metaAccount?.name || prismaAccount.id)}</strong><small>Meta Account ID ${escapeHtml(prismaAccount.id)} · Prisma client: ${escapeHtml(client)}</small></div>`;
        }).join('') : '';
        renderAccountMappings(state.showMatchedScopeAccounts ? new Set(matched.map(account => account.id)) : new Set());
        if (state.showMatchedScopeAccounts) {
            elements.matchedScopeAccounts.innerHTML = matched.map(prismaAccount => accountMappingMarkup(
                state.metaAccounts.find(account => account.id === prismaAccount.id) || { id: prismaAccount.id, name: prismaAccount.id },
                true
            )).join('');
        }
    }

    function mappingValue(mapping) {
        return `${encodeURIComponent(mapping.client || '')}|${encodeURIComponent(mapping.product || '')}`;
    }

    function mappingFromValue(value) {
        const [client = '', product = ''] = String(value || '').split('|');
        return { client: decodeURIComponent(client), product: decodeURIComponent(product) };
    }

    function mappingLabel(mapping) {
        return `${mapping.client || 'Client name not supplied'} / ${mapping.product || 'Product name not supplied'}`;
    }

    function accountMappingMarkup(account, matched = false) {
        const scopes = state.prismaReference?.clientProducts || [];
        const accountScopes = scopes.filter(scope => scope.accountIds?.includes(account.id));
        const metaCampaignIds = new Set((state.metaReference?.campaigns || [])
            .filter(campaign => campaign.accountId === account.id)
            .map(campaign => campaign.id));
        const hasLinkedCampaign = scope => (scope.campaignIds || []).some(campaignId => metaCampaignIds.has(campaignId));
        const saved = state.accountMappings[account.id];
        const suggested = !saved && accountScopes.length === 1 ? accountScopes[0] : null;
        const selectedMapping = saved || suggested;
        const selectedValue = selectedMapping ? mappingValue(selectedMapping) : '';
        const optionValues = new Set(scopes.map(mappingValue));
        const savedOption = selectedMapping && !optionValues.has(selectedValue)
            ? `<option value="${escapeHtml(selectedValue)}">Saved: ${escapeHtml(mappingLabel(selectedMapping))} (not in this report)</option>`
            : '';
        const orderedScopes = [...scopes].sort((left, right) => {
            const linkedDifference = Number(hasLinkedCampaign(right)) - Number(hasLinkedCampaign(left));
            if (linkedDifference) return linkedDifference;
            const accountDifference = Number(right.accountIds?.includes(account.id)) - Number(left.accountIds?.includes(account.id));
            return accountDifference || mappingLabel(left).localeCompare(mappingLabel(right));
        });
        const scopeOptions = orderedScopes.length
            ? orderedScopes.map(scope => {
                const linkedLabel = hasLinkedCampaign(scope) ? ' — Linked Campaigns Booked Here' : '';
                return `<option value="${escapeHtml(mappingValue(scope))}" ${selectedValue === mappingValue(scope) ? 'selected' : ''}>${escapeHtml(mappingLabel(scope))}${linkedLabel}</option>`;
            }).join('')
            : '<option value="" disabled>No Prisma client/product for this Partner account</option>';
        const showCampaigns = state.shownMappingCampaignsAccountId === account.id;
        const campaigns = (state.metaReference?.campaigns || []).filter(campaign => campaign.accountId === account.id).sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
        const campaignList = showCampaigns
            ? `<div class="mapping-campaigns"><strong>Imported Meta campaigns (${campaigns.length})</strong>${campaigns.length ? `<ul>${campaigns.map(campaign => `<li>${escapeHtml(campaign.name || 'Campaign name not supplied')}<small>Campaign ID ${escapeHtml(campaign.id)}</small></li>`).join('')}</ul>` : '<span>No campaigns were found for this Meta account in the imported report.</span>'}</div>`
            : '';
        return `<div class="account-mapping-wrap${matched ? ' is-matched' : ''}"><label class="account-mapping-row"><span>${escapeHtml(account.name)}<small>Meta Account ID ${escapeHtml(account.id)}</small></span><button type="button" class="mapping-campaign-toggle" data-show-mapping-campaigns="${escapeHtml(account.id)}" aria-expanded="${showCampaigns}">${showCampaigns ? 'Hide campaigns' : 'Show campaigns'}</button><select data-mapping-account-id="${escapeHtml(account.id)}"><option value="">Not mapped</option>${savedOption}${scopeOptions}</select></label>${campaignList}</div>`;
    }

    function renderAccountMappings(excludedAccountIds = new Set()) {
        const scopes = state.prismaReference?.clientProducts || [];
        if (!state.metaAccounts.length) {
            elements.accountMappingOptions.innerHTML = '<span class="minor">Upload a Meta Ads Report to map accounts.</span>';
            return;
        }
        if (!scopes.length) {
            elements.accountMappingOptions.innerHTML = '<span class="minor">Add Client name and Product name to the Prisma report to create mapping choices.</span>';
            return;
        }
        const accounts = state.metaAccounts.filter(account => !excludedAccountIds.has(account.id));
        elements.accountMappingOptions.innerHTML = accounts.length
            ? accounts.map(account => accountMappingMarkup(account)).join('')
            : '<span class="minor">Every selected Meta account is shown above as a matched Prisma account.</span>';
    }

    async function saveAccountMapping(accountId, mapping) {
        if (mapping.client || mapping.product) state.accountMappings[accountId] = mapping;
        else delete state.accountMappings[accountId];
        await writeLocalStorage({ [ACCOUNT_MAPPING_STORAGE_KEY]: state.accountMappings });
        if (state.report) renderReport();
    }

    function applyUniqueAccountMappingSuggestions() {
        const scopes = state.prismaReference?.clientProducts || [];
        let changed = false;
        state.metaAccounts.forEach(account => {
            if (state.accountMappings[account.id]) return;
            const choices = scopes.filter(scope => scope.accountIds?.includes(account.id));
            if (choices.length !== 1) return;
            state.accountMappings[account.id] = { client: choices[0].client || '', product: choices[0].product || '' };
            changed = true;
        });
        if (changed) writeLocalStorage({ [ACCOUNT_MAPPING_STORAGE_KEY]: state.accountMappings }).catch(error => setStatus(elements.prismaScopeStatus, error.message, 'error'));
    }

    async function restoreAccountMappings() {
        try {
            const stored = await readLocalStorage(ACCOUNT_MAPPING_STORAGE_KEY);
            const mappings = stored[ACCOUNT_MAPPING_STORAGE_KEY];
            state.accountMappings = mappings && typeof mappings === 'object' ? mappings : {};
            renderPrismaScope();
        } catch (error) {
            setStatus(elements.prismaScopeStatus, error.message, 'error');
        }
    }

    async function restoreManualMatches() {
        try {
            const stored = await readLocalStorage(MANUAL_MATCH_STORAGE_KEY);
            const matches = stored[MANUAL_MATCH_STORAGE_KEY];
            state.manualMatches = matches && typeof matches === 'object' ? matches : {};
        } catch (_) {
            state.manualMatches = {};
        }
    }

    async function restoreReviewData() {
        try {
            const [rejections, wrikeReferences] = await Promise.all([readLocalStorage(CANDIDATE_REJECTION_STORAGE_KEY), readLocalStorage(WRIKE_REFERENCE_STORAGE_KEY)]);
            state.candidateRejections = rejections[CANDIDATE_REJECTION_STORAGE_KEY] && typeof rejections[CANDIDATE_REJECTION_STORAGE_KEY] === 'object' ? rejections[CANDIDATE_REJECTION_STORAGE_KEY] : {};
            state.wrikeReferences = wrikeReferences[WRIKE_REFERENCE_STORAGE_KEY] && typeof wrikeReferences[WRIKE_REFERENCE_STORAGE_KEY] === 'object' ? wrikeReferences[WRIKE_REFERENCE_STORAGE_KEY] : {};
            if (state.report) renderReport();
        } catch (_) {
            state.candidateRejections = {};
            state.wrikeReferences = {};
        }
    }

    async function restoreCampaignColumnWidths() {
        try {
            const stored = await readLocalStorage(CAMPAIGN_COLUMN_WIDTH_STORAGE_KEY);
            const widths = stored[CAMPAIGN_COLUMN_WIDTH_STORAGE_KEY];
            state.campaignColumnWidths = widths && typeof widths === 'object' ? widths : {};
            if (state.report) renderRows();
        } catch (_) {
            state.campaignColumnWidths = {};
        }
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
        state.metaReference = { ...extracted, businessId: extracted.businessId || state.metaReference?.businessId || '', importedAt: new Date().toISOString() };
        state.metaAccounts = extracted.accounts.sort((left, right) => left.name.localeCompare(right.name));
        await writeLocalStorage({ [META_REFERENCE_STORAGE_KEY]: state.metaReference });
        updateMetaAdsReportingLink();
        renderAccountOptions(state.metaAccounts);
        renderReferenceStatus();
    }

    function importPrismaReference() {
        const extracted = engine.extractPrismaReferenceData(engine.parseCsv(state.prismaText));
        state.prismaReference = extracted;
        if (extracted.errors.length) {
            renderMessages(extracted.errors);
            return;
        }
        applyUniqueAccountMappingSuggestions();
        renderPrismaScope();
    }

    async function restoreMetaReference() {
        try {
            const stored = await readLocalStorage(META_REFERENCE_STORAGE_KEY);
            const reference = stored[META_REFERENCE_STORAGE_KEY];
            if (reference && Array.isArray(reference.accounts)) {
                state.metaReference = reference;
                state.metaAccounts = reference.accounts.sort((left, right) => left.name.localeCompare(right.name));
                renderAccountOptions(state.metaAccounts);
                updateMetaAdsReportingLink();
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
        state.apiSync = null;
        elements.accountOptions.innerHTML = '';
        elements.accountScopePanel.classList.add('hidden');
        renderReferenceStatus();
        updateMetaAdsReportingLink();
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
        elements.pullMetaData.textContent = 'Refreshing Meta accounts…';
        setStatus(elements.metaApiStatus, 'Preparing Meta refresh…', 'loading');
        let activeAccount = null;
        let syncComplete = false;
        try {
            const client = await createMetaClient();
            const records = [];
            const accountSummaries = [];
            for (let index = 0; index < accountIds.length; index++) {
                const account = state.metaAccounts.find(item => item.id === accountIds[index]) || { id: accountIds[index], name: accountIds[index] };
                activeAccount = account;
                setStatus(elements.metaApiStatus, `Getting account settings, ad-set schedules, budgets, delivery and daily spend from ${account.name} (${index + 1} of ${accountIds.length})…`, 'loading');
                const sync = await client.syncAccount(account, startDate, endDate);
                records.push(...sync.records);
                accountSummaries.push({
                    accountId: account.id,
                    accountName: account.name,
                    campaigns: sync.campaigns.length,
                    adSets: sync.adSets.length,
                    campaignMonthRows: sync.records.length,
                    currency: sync.account?.currency || '',
                    timezone: sync.account?.timezone_name || ''
                });
                state.metaReference = metaApi.mergeReferenceData(state.metaReference, account, sync);
            }
            await writeLocalStorage({ [META_REFERENCE_STORAGE_KEY]: state.metaReference });
            state.metaAccounts = state.metaReference.accounts.sort((left, right) => left.name.localeCompare(right.name));
            state.metaText = metaApi.reportToMetaCsv(records);
            state.metaTextSource = 'api';
            state.apiSync = { accountCount: accountIds.length, startDate, endDate, syncedAt: new Date().toISOString(), accountSummaries };
            saveAccountScope();
            resetReport();
            elements.clearMetaApiData.classList.remove('hidden');
            setStatus(elements.metaApiStatus, `${records.length} enriched campaign-month row${records.length === 1 ? '' : 's'} ready to compare.`, 'ready');
            syncComplete = true;
            renderReferenceStatus();
            renderMessages([]);
        } catch (error) {
            const message = String(error && error.message ? error.message : error);
            const accountName = activeAccount ? activeAccount.name : 'the selected ad account';
            const isReadAccessError = /ads_management\s+or\s+ads_read/i.test(message);
            const guidance = isReadAccessError
                ? `Meta denied read access for ${accountName}. This checker only makes read-only requests using ads_read. Ask the account owner to grant the token owner access to this ad account, then create a fresh token with ads_read.`
                : message;
            setStatus(elements.metaApiStatus, guidance, 'error');
        } finally {
            elements.pullMetaData.disabled = false;
            elements.pullMetaData.textContent = syncComplete ? 'Refresh selected Meta accounts' : 'Retry sync';
        }
    }

    function clearMetaApiData() {
        if (state.metaTextSource === 'api') {
            state.metaText = state.uploadedMetaText;
            state.metaTextSource = state.uploadedMetaText ? 'csv' : '';
        }
        state.apiSync = null;
        elements.clearMetaApiData.classList.add('hidden');
        setStatus(elements.metaApiStatus, 'Pulled Meta data cleared. Saved API details remain available.', 'ready');
        resetReport();
    }

    function selectedAccountIds() {
        return Array.from(elements.accountOptions.querySelectorAll('input:checked')).map(input => input.value);
    }

    function diagnosticRecords(text, accountIds, startDate, endDate) {
        if (!text) return [];
        const aggregate = engine.aggregateMeta(engine.parseCsv(text));
        if (aggregate.errors?.length) return [];
        const scope = new Set(accountIds);
        const startMonth = String(startDate || '').slice(0, 7);
        const endMonth = String(endDate || '').slice(0, 7);
        return aggregate.records.filter(record => {
            const month = record.month && !Number.isNaN(record.month.getTime()) ? record.month.toISOString().slice(0, 7) : '';
            return (!scope.size || scope.has(record.accountId)) && (!startMonth || month >= startMonth) && (!endMonth || month <= endMonth);
        });
    }

    function diagnosticPercent(count, total) {
        return total ? `${Math.round((count / total) * 100)}%` : 'Not available';
    }

    function uploadedReportingRange(text, accountIds) {
        const parsed = engine.parseCsv(text);
        const columns = engine.resolveColumns(parsed.headers, {
            accountId: ['account id', 'account_id'],
            start: ['reporting starts', 'report start'],
            end: ['reporting ends', 'report end']
        });
        if (!columns.start || !columns.end) return null;
        const scope = new Set(accountIds);
        const starts = [];
        const ends = [];
        parsed.rows.forEach(row => {
            const accountId = columns.accountId ? String(row[columns.accountId] || '').trim().replace(/\.0$/, '') : '';
            if (scope.size && accountId && !scope.has(accountId)) return;
            const start = engine.parseDate(row[columns.start]);
            const end = engine.parseDate(row[columns.end]);
            if (start) starts.push(start.toISOString().slice(0, 10));
            if (end) ends.push(end.toISOString().slice(0, 10));
        });
        starts.sort();
        ends.sort();
        return starts.length && ends.length ? { startDate: starts[0], endDate: ends[ends.length - 1] } : null;
    }

    function buildDataDiagnostics() {
        if (!state.uploadedMetaText) return { available: false, message: 'Upload a Meta Ads Report first. It supplies the account scope and the baseline needed for this check.' };
        if (state.metaTextSource !== 'api' || !state.apiSync) return { available: false, message: 'The comparison is using the uploaded Meta Ads Report. Refresh the selected Meta accounts, then compare bookings again to check the upload against live API data.' };

        const accountIds = selectedAccountIds();
        const uploaded = diagnosticRecords(state.uploadedMetaText, accountIds, state.apiSync.startDate, state.apiSync.endDate);
        const api = diagnosticRecords(state.metaText, accountIds, state.apiSync.startDate, state.apiSync.endDate);
        const uploadedRange = uploadedReportingRange(state.uploadedMetaText, accountIds);
        const uploadedByKey = new Map(uploaded.map(record => [record.key, record]));
        const apiByKey = new Map(api.map(record => [record.key, record]));
        const keys = new Set([...uploadedByKey.keys(), ...apiByKey.keys()]);
        const differences = [];
        let exactMatches = 0;
        let uploadedOnly = 0;
        let apiOnly = 0;
        let changedSpend = 0;
        keys.forEach(key => {
            const reportRecord = uploadedByKey.get(key);
            const apiRecord = apiByKey.get(key);
            const reportSpend = reportRecord ? reportRecord.spend : null;
            const apiSpend = apiRecord ? apiRecord.spend : null;
            const variance = (apiSpend || 0) - (reportSpend || 0);
            let result = 'Spend differs';
            if (!reportRecord) { apiOnly++; result = 'API only'; }
            else if (!apiRecord) { uploadedOnly++; result = 'Upload only'; }
            else if (Math.abs(variance) <= 0.01) { exactMatches++; result = 'Matches'; }
            else changedSpend++;
            if (result !== 'Matches') {
                const record = apiRecord || reportRecord;
                differences.push({
                    account: record.account || record.accountId,
                    campaignName: record.campaignName || 'Name not supplied',
                    campaignId: record.campaignId,
                    month: record.month.toISOString().slice(0, 7),
                    reportSpend,
                    apiSpend,
                    variance,
                    currency: apiRecord?.currency || reportRecord?.currency || '',
                    result
                });
            }
        });
        differences.sort((left, right) => Math.abs(right.variance) - Math.abs(left.variance));
        const sum = records => records.reduce((total, record) => total + record.spend, 0);
        const currencies = [...new Set([...uploaded, ...api].map(record => record.currency || ''))];
        const currencyTotals = currencies.map(currencyCode => {
            const recordsFor = records => records.filter(record => (record.currency || '') === currencyCode);
            const uploadedTotal = sum(recordsFor(uploaded));
            const apiTotal = sum(recordsFor(api));
            return { currency: currencyCode, uploadedSpend: uploadedTotal, apiSpend: apiTotal, variance: apiTotal - uploadedTotal };
        });
        return {
            available: true,
            uploadedRows: uploaded.length,
            apiRows: api.length,
            uploadedSpend: sum(uploaded),
            apiSpend: sum(api),
            exactMatches,
            uploadedOnly,
            apiOnly,
            changedSpend,
            differences,
            apiRecords: api,
            accountSummaries: state.apiSync.accountSummaries || [],
            accountCount: state.apiSync.accountCount,
            startDate: state.apiSync.startDate,
            endDate: state.apiSync.endDate,
            syncedAt: state.apiSync.syncedAt,
            uploadedRange,
            rangeMatches: Boolean(uploadedRange && uploadedRange.startDate === state.apiSync.startDate && uploadedRange.endDate === state.apiSync.endDate),
            currencyTotals
        };
    }

    function renderDataDiagnostics() {
        const diagnostics = buildDataDiagnostics();
        if (!diagnostics.available) {
            elements.dataDiagnosticsBadge.textContent = 'Upload only';
            elements.dataDiagnosticsBadge.className = 'diagnostics-badge';
            elements.dataDiagnosticsContent.innerHTML = `<div class="diagnostics-empty"><strong>Comparison not available yet</strong><span>${escapeHtml(diagnostics.message)}</span></div>`;
            return;
        }
        const differenceCount = diagnostics.uploadedOnly + diagnostics.apiOnly + diagnostics.changedSpend;
        const totalApiRows = diagnostics.apiRecords.length;
        const startCoverage = diagnostics.apiRecords.filter(record => record.start).length;
        const endCoverage = diagnostics.apiRecords.filter(record => record.end).length;
        const statusCoverage = diagnostics.apiRecords.filter(record => record.status).length;
        const budgetCoverage = diagnostics.apiRecords.filter(record => record.budget !== null).length;
        const adSetDateCoverage = diagnostics.apiRecords.filter(record => /ad set/i.test(record.scheduleSource || '') && record.start && record.end).length;
        const adSetStatusCoverage = diagnostics.apiRecords.filter(record => record.adSetStatus).length;
        const budgetRemainingCoverage = diagnostics.apiRecords.filter(record => record.budgetRemaining !== null).length;
        const updatedCoverage = diagnostics.apiRecords.filter(record => record.updatedTime).length;
        const deliveryCoverage = diagnostics.apiRecords.filter(record => record.impressions !== null && record.impressions !== undefined).length;
        const dailySpendCoverage = diagnostics.apiRecords.filter(record => record.dailySpend?.length).length;
        const accountSettingsCoverage = diagnostics.apiRecords.filter(record => record.currency && record.timezone).length;
        const uploadedRangeLabel = diagnostics.uploadedRange ? `${diagnostics.uploadedRange.startDate} to ${diagnostics.uploadedRange.endDate}` : 'Not available in the uploaded report';
        const scopeWarning = diagnostics.rangeMatches
            ? ''
            : `<div class="diagnostics-scope-warning"><strong>Check the reporting dates</strong><span>The API covers ${escapeHtml(`${diagnostics.startDate} to ${diagnostics.endDate}`)}, while the uploaded report covers ${escapeHtml(uploadedRangeLabel)}. Spend differences are not like-for-like until those dates match.</span></div>`;
        const summaryRows = diagnostics.accountSummaries.map(account => `<tr><td>${escapeHtml(account.accountName)}</td><td class="campaign-id">${escapeHtml(account.accountId)}</td><td>${escapeHtml(account.currency || 'Not supplied')}</td><td>${escapeHtml(account.timezone || 'Not supplied')}</td><td class="number">${account.campaigns}</td><td class="number">${account.adSets}</td><td class="number">${account.campaignMonthRows}</td></tr>`).join('');
        const differenceRows = diagnostics.differences.slice(0, 100).map(row => `<tr><td>${escapeHtml(row.result)}</td><td>${escapeHtml(row.account)}</td><td>${escapeHtml(row.campaignName)}<span class="minor">${escapeHtml(row.campaignId)}</span></td><td>${escapeHtml(row.month)}</td><td class="number">${escapeHtml(currency(row.reportSpend, row.currency))}</td><td class="number">${escapeHtml(currency(row.apiSpend, row.currency))}</td><td class="number">${escapeHtml(currency(row.variance, row.currency))}</td></tr>`).join('');
        const diagnosticTotal = key => diagnostics.currencyTotals.map(total => currency(total[key], total.currency)).join(' · ');
        const needsReview = differenceCount || !diagnostics.rangeMatches;
        elements.dataDiagnosticsBadge.textContent = needsReview ? 'Review source' : 'High confidence';
        elements.dataDiagnosticsBadge.className = `diagnostics-badge ${needsReview ? 'has-differences' : 'is-matched'}`;
        elements.dataDiagnosticsContent.innerHTML = `
            <div class="diagnostics-intro"><div><strong>Compared on Account ID, Campaign ID and month</strong><span>${escapeHtml(`${diagnostics.accountCount} selected account${diagnostics.accountCount === 1 ? '' : 's'}, ${diagnostics.startDate} to ${diagnostics.endDate}. Spend matches allow a 0.01 rounding difference in the account currency.`)}</span></div><button id="downloadDataDiagnostics" class="secondary-action" type="button">Download check CSV</button></div>
            ${scopeWarning}
            <div class="diagnostics-metrics" aria-label="Data source comparison totals">
                <div><span>Uploaded report</span><strong>${diagnostics.uploadedRows} rows</strong><small>${escapeHtml(diagnosticTotal('uploadedSpend'))} spend</small></div>
                <div><span>Meta API</span><strong>${diagnostics.apiRows} rows</strong><small>${escapeHtml(diagnosticTotal('apiSpend'))} spend</small></div>
                <div><span>Exact matches</span><strong>${diagnostics.exactMatches}</strong><small>Campaign-month rows</small></div>
                <div><span>Spend variance</span><strong>${escapeHtml(diagnosticTotal('variance'))}</strong><small>API minus uploaded</small></div>
            </div>
            <div class="diagnostics-grid">
                <section><h3>What the API supplied</h3><p>Account currency and timezone; campaign and ad-set schedules, status, budgets and update times; daily and monthly spend; impressions and reach.</p><dl><div><dt>Ad-set dates</dt><dd>${diagnosticPercent(adSetDateCoverage, totalApiRows)}</dd></div><div><dt>Ad-set status</dt><dd>${diagnosticPercent(adSetStatusCoverage, totalApiRows)}</dd></div><div><dt>Budget remaining</dt><dd>${diagnosticPercent(budgetRemainingCoverage, totalApiRows)}</dd></div><div><dt>Update time</dt><dd>${diagnosticPercent(updatedCoverage, totalApiRows)}</dd></div><div><dt>Daily spend</dt><dd>${diagnosticPercent(dailySpendCoverage, totalApiRows)}</dd></div><div><dt>Delivery indicators</dt><dd>${diagnosticPercent(deliveryCoverage, totalApiRows)}</dd></div><div><dt>Currency and timezone</dt><dd>${diagnosticPercent(accountSettingsCoverage, totalApiRows)}</dd></div><div><dt>Any schedule</dt><dd>${diagnosticPercent(Math.min(startCoverage, endCoverage), totalApiRows)}</dd></div><div><dt>Campaign status</dt><dd>${diagnosticPercent(statusCoverage, totalApiRows)}</dd></div><div><dt>Comparable budget</dt><dd>${diagnosticPercent(budgetCoverage, totalApiRows)}</dd></div></dl></section>
                <section><h3>How each source is used</h3><p><strong>Meta upload:</strong> establishes the allowed account scope and supplies fallback campaign-month spend. <strong>Meta API:</strong> replaces those Meta rows after a successful refresh and supplies live operational context. <strong>Prisma:</strong> supplies Partner account/line IDs, booked values, currency, Buy/Placement references, flight dates, placement details and workflow evidence.</p><p class="diagnostics-note">Spend-to-booked findings compare Meta spend with Prisma planned amount only when their currencies agree. Budgets explain setup and remaining capacity; they are not treated as a monthly booking value.</p></section>
            </div>
            <section class="diagnostics-table-section"><h3>API refresh activity</h3><div class="table-frame"><table><thead><tr><th>Account</th><th>Account ID</th><th>Currency</th><th>Timezone</th><th class="number">Campaigns</th><th class="number">Ad sets</th><th class="number">Campaign-month rows</th></tr></thead><tbody>${summaryRows}</tbody></table></div></section>
            <section class="diagnostics-table-section"><h3>Source differences</h3>${differenceRows ? `<p>Showing up to 100 rows with a missing source or spend difference.</p><div class="table-frame"><table><thead><tr><th>Result</th><th>Account</th><th>Campaign</th><th>Month</th><th class="number">Uploaded spend</th><th class="number">API spend</th><th class="number">Variance</th></tr></thead><tbody>${differenceRows}</tbody></table></div>` : '<div class="diagnostics-success">Every campaign-month row and spend value matches for this scope.</div>'}</section>`;
    }

    function downloadDataDiagnostics() {
        const diagnostics = buildDataDiagnostics();
        if (!diagnostics.available) return;
        const headers = ['Result', 'Account', 'Campaign name', 'Campaign ID', 'Month', 'Account currency', 'Uploaded spend', 'API spend', 'Variance'];
        const rows = diagnostics.differences.map(row => [row.result, row.account, row.campaignName, row.campaignId, row.month, row.currency, row.reportSpend, row.apiSpend, row.variance]);
        const csv = [headers.join(','), ...rows.map(row => row.map(csvEscape).join(','))].join('\r\n');
        downloadCsv(`social_booking_checker_data_source_check_${diagnostics.startDate}_${diagnostics.endDate}.csv`, csv);
    }

    function renderMessages(errors) {
        elements.validationMessages.innerHTML = errors.map(error => `<div class="message">${escapeHtml(error)}</div>`).join('');
    }

    function renderSummary(summary) {
        const varianceClass = summary.variance > 0 ? 'is-positive' : summary.variance < 0 ? 'is-negative' : '';
        const totals = Array.isArray(summary.currencyTotals) && summary.currencyTotals.length
            ? summary.currencyTotals
            : [{ currency: summary.currency || '', metaBudget: summary.metaBudget, metaSpend: summary.metaSpend, prismaPlanned: summary.prismaPlanned, variance: summary.variance }];
        const financialValue = key => totals.map(total => currency(total[key], total.currency)).join(' · ');
        elements.financialHeadline.innerHTML = [
            ['Meta budget', financialValue('metaBudget')],
            ['Meta spend', financialValue('metaSpend')],
            ['Prisma booked', financialValue('prismaPlanned')],
            ['Variance', financialValue('variance'), `variance ${summary.mixedCurrencies ? '' : varianceClass}`]
        ].map(([label, value, className = '']) => `<article class="financial-total ${className}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
        const actionCount = summary.missingOrUnlinked + summary.needsUpdate + summary.investigate;
        const headline = actionCount
            ? `Review ${actionCount} item${actionCount === 1 ? '' : 's'} before sharing`
            : 'No actions need review';
        const supporting = actionCount
            ? 'The action queue prioritises report coverage, missing bookings, booking updates, and items that still need investigation.'
            : 'The selected accounts and months have no missing, update, or investigation actions.';
        const hasUnmatchedSpend = summary.unmatchedSpend > 0 || Object.keys(state.manualMatches).length;
        const actionButton = hasUnmatchedSpend
            ? '<button type="button" data-open-manual-match="true" aria-haspopup="dialog">Match unmatched spend</button>'
            : `<button type="button" data-scroll-actions="true">${actionCount ? 'Open action queue' : 'View action queue'}</button>`;
        elements.summaryCards.innerHTML = `<div class="action-headline-copy"><strong>${escapeHtml(headline)}</strong><span>${escapeHtml(supporting)}</span></div>${actionButton}`;
        const counts = {
            'Missing/unlinked': summary.missingOrUnlinked,
            'Needs update': summary.needsUpdate,
            Monitor: summary.monitor,
            Investigate: summary.investigate,
            'Outside scope': summary.outsideScope,
            Matched: summary.matched ?? Math.max(0, summary.total - summary.missingOrUnlinked - summary.needsUpdate - summary.monitor - summary.investigate - summary.outsideScope)
        };
        document.querySelectorAll('[data-evidence-total]').forEach(element => {
            element.textContent = `(${counts[element.dataset.evidenceTotal] || 0})`;
        });
    }

    function monthFilteredRows() {
        if (!state.report) return [];
        const from = elements.monthFromFilter.value;
        const to = elements.monthToFilter.value;
        return state.report.rows.filter(row => (!from || row.month >= from) && (!to || row.month <= to));
    }

    function selectedFilterValues(container) {
        return new Set(Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(input => input.value));
    }

    function accountFilteredRows() {
        const selectedAccounts = selectedFilterValues(elements.accountFilterOptions);
        return monthFilteredRows().filter(row => selectedAccounts.has(String(row.accountId)));
    }

    function filteredRows() {
        const evidence = selectedFilterValues(elements.evidenceFilterOptions);
        const query = elements.reportSearch.value.trim().toLowerCase();
        const rows = accountFilteredRows().filter(row => {
            const evidenceMatch = evidence.has(row.evidence);
            const queryMatch = !query || [row.accountId, row.campaignId, row.campaignName, row.account, row.classification].some(value => String(value || '').toLowerCase().includes(query));
            return evidenceMatch && queryMatch;
        });
        if (!state.sort.key) return rows;
        return [...rows].sort((left, right) => {
            const leftValue = left[state.sort.key];
            const rightValue = right[state.sort.key];
            const leftMissing = leftValue === null || leftValue === undefined || leftValue === '';
            const rightMissing = rightValue === null || rightValue === undefined || rightValue === '';
            if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
            const difference = Number(leftValue || 0) - Number(rightValue || 0);
            return state.sort.direction === 'ascending' ? difference : -difference;
        });
    }

    function sortTableRows(rows, sort) {
        if (!sort.key) return rows;
        return [...rows].sort((left, right) => {
            const leftValue = left[sort.key];
            const rightValue = right[sort.key];
            const leftMissing = leftValue === null || leftValue === undefined || leftValue === '';
            const rightMissing = rightValue === null || rightValue === undefined || rightValue === '';
            if (leftMissing !== rightMissing) return leftMissing ? 1 : -1;
            const numeric = Number(leftValue);
            const otherNumeric = Number(rightValue);
            const comparison = Number.isFinite(numeric) && Number.isFinite(otherNumeric)
                ? numeric - otherNumeric
                : String(leftValue || '').localeCompare(String(rightValue || ''), 'en', { numeric: true, sensitivity: 'base' });
            return sort.direction === 'ascending' ? comparison : -comparison;
        });
    }

    function updateFilterCounts() {
        const evidenceSelected = elements.evidenceFilterOptions.querySelectorAll('input:checked').length;
        elements.evidenceFilterCount.textContent = `${evidenceSelected} selected`;
        const accountInputs = elements.accountFilterOptions.querySelectorAll('input');
        const accountSelected = elements.accountFilterOptions.querySelectorAll('input:checked').length;
        elements.accountFilterCount.textContent = accountInputs.length && accountSelected === accountInputs.length ? 'All' : `${accountSelected} selected`;
    }

    function populateAccountFilter(rows) {
        const accounts = [...new Map(rows.map(row => [String(row.accountId), { id: String(row.accountId), name: row.account || row.accountId }])).values()]
            .sort((left, right) => left.name.localeCompare(right.name));
        elements.accountFilterOptions.innerHTML = `<div class="filter-actions"><button type="button" data-filter-action="all">Select all</button><button type="button" data-filter-action="none">Clear</button></div>${accounts.map(account => `<label><input type="checkbox" value="${escapeHtml(account.id)}" checked><span>${escapeHtml(account.name)}<small>Account ID ${escapeHtml(account.id)}</small></span></label>`).join('')}`;
        updateFilterCounts();
    }

    function populateMonthFilters(rows) {
        const months = [...new Set(rows.map(row => row.month).filter(Boolean))].sort();
        const options = months.map(month => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`).join('');
        elements.monthFromFilter.innerHTML = options;
        elements.monthToFilter.innerHTML = options;
        const sharedMonths = (state.report?.coverage?.sharedMonths || []).filter(month => months.includes(month));
        elements.monthFromFilter.value = sharedMonths[0] || months[0] || '';
        elements.monthToFilter.value = sharedMonths[sharedMonths.length - 1] || months[months.length - 1] || '';
    }

    function renderPopulationCoverage() {
        if (!elements.populationCoverage) return;
        const coverage = state.report?.coverage;
        if (!coverage) {
            elements.populationCoverage.innerHTML = '<strong>Report coverage will be checked automatically.</strong><span>Missing bookings are only confirmed when Prisma includes every selected Meta account and reporting month.</span>';
            return;
        }
        if (coverage.isComplete) {
            elements.populationCoverage.innerHTML = `<strong>Coverage confirmed.</strong><span>Prisma includes every selected Meta account and reporting month (${escapeHtml(coverage.metaMonths.join(', '))}). Missing campaigns can be treated as missing from Prisma.</span>`;
            return;
        }
        const gapLabel = coverage.gaps.slice(0, 4).map(gap => `${gap.accountId} / ${gap.month}`).join(', ');
        elements.populationCoverage.innerHTML = `<strong>Coverage incomplete.</strong><span>${coverage.gaps.length} selected Meta account-month${coverage.gaps.length === 1 ? '' : 's'} are not represented in Prisma${gapLabel ? `: ${escapeHtml(gapLabel)}${coverage.gaps.length > 4 ? '…' : ''}` : ''}. These rows need report coverage resolved before they are shared as missing bookings.</span>`;
    }

    function linkComparisonMetrics() {
        const rows = accountFilteredRows().filter(row => row.evidence !== 'Outside scope');
        const metaUnlinked = new Set();
        const prismaUnlinked = new Set();
        const differentIds = new Set();

        rows.forEach(row => {
            const metaCampaignKey = row.metaKey ? `${row.accountId}|${row.campaignId}` : '';
            const prismaCampaignId = row.prismaCampaignId || (!row.metaKey ? row.campaignId : '');
            const prismaCampaignKey = row.prismaKey ? `${row.accountId}|${prismaCampaignId || row.prismaKey}` : '';

            if (row.metaKey && !row.prismaKey) metaUnlinked.add(metaCampaignKey);
            if (!row.metaKey && row.prismaKey) prismaUnlinked.add(prismaCampaignKey);
            if (row.metaKey && row.prismaKey && prismaCampaignId && prismaCampaignId !== row.campaignId) {
                differentIds.add(`${metaCampaignKey}|${prismaCampaignKey}`);
            }

            const possibleDifferentId = (row.candidates || []).find(candidate =>
                candidate.prismaKey &&
                candidate.campaignId &&
                candidate.campaignId !== row.campaignId &&
                candidate.level !== 'Low evidence'
            );
            if (possibleDifferentId) {
                differentIds.add(`${metaCampaignKey}|${row.accountId}|${possibleDifferentId.campaignId}`);
            }
        });

        const from = elements.monthFromFilter.value;
        const to = elements.monthToFilter.value;
        const selectedAccounts = selectedFilterValues(elements.accountFilterOptions);
        const unintegratedPrisma = (state.report?.prismaUnintegratedRows || []).filter(row => {
            const month = row.month instanceof Date && !Number.isNaN(row.month.getTime()) ? row.month.toISOString().slice(0, 7) : '';
            const monthInScope = (!from || !month || month >= from) && (!to || !month || month <= to);
            const accountInScope = !row.accountId || selectedAccounts.has(String(row.accountId));
            return monthInScope && accountInScope;
        }).length;
        const prismaCount = prismaUnlinked.size + unintegratedPrisma;
        return {
            meta: metaUnlinked.size,
            prisma: prismaCount,
            total: metaUnlinked.size + prismaCount,
            differentIds: differentIds.size,
            unintegratedPrisma
        };
    }

    function renderLinkComparison() {
        if (!elements.linkComparisonMetrics) return;
        const metrics = linkComparisonMetrics();
        elements.linkComparisonMetrics.innerHTML = `
            <div><span>Unlinked in Meta</span><strong>${metrics.meta}</strong><small>Meta Campaign IDs without an exact same-account, same-month Partner line ID match in Prisma.</small></div>
            <div><span>Unlinked in Prisma</span><strong>${metrics.prisma}</strong><small>Prisma Partner line IDs without an exact Meta match${metrics.unintegratedPrisma ? `, including ${metrics.unintegratedPrisma} row${metrics.unintegratedPrisma === 1 ? '' : 's'} with no usable Meta ID` : ''}.</small></div>
            <div><span>Total unlinked</span><strong>${metrics.total}</strong><small>The Meta and Prisma unlinked counts added together. Different-ID suggestions remain in both until confirmed.</small></div>
            <div class="different-id"><span>Different IDs to review</span><strong>${metrics.differentIds}</strong><small>Likely or saved links where the Meta Campaign ID and Prisma Partner line ID are different.</small></div>`;
    }

    function renderReport() {
        renderSummary(engine.summarizeRows(accountFilteredRows()));
        renderLinkComparison();
        renderSocialActionList();
        renderClientBreakdown();
        renderRows();
    }

    function renderClientBreakdown() {
        const groups = new Map();
        const ensureGroup = (client, product, currencyCode) => {
            const normalizedClient = client || 'Unmapped Meta accounts';
            const normalizedProduct = product || 'Map this account to a Prisma client/product';
            const normalizedCurrency = currencyCode || '';
            const key = `${normalizedClient}\u0000${normalizedProduct}\u0000${normalizedCurrency}`;
            if (!groups.has(key)) groups.set(key, { client: normalizedClient, product: normalizedProduct, currency: normalizedCurrency, accounts: new Set(), metaSpend: 0, prismaPlanned: 0 });
            return groups.get(key);
        };
        accountFilteredRows().forEach(row => {
            const mapping = state.accountMappings[row.accountId] || {};
            if (row.metaSpend !== null && row.metaSpend !== undefined) {
                const group = ensureGroup(mapping.client, mapping.product, row.currency);
                group.accounts.add(row.account || row.accountId);
                group.metaSpend += Number(row.metaSpend) || 0;
            }
            if (row.prismaPlanned !== null && row.prismaPlanned !== undefined) {
                const group = ensureGroup(row.prismaClient || mapping.client, row.prismaProduct || mapping.product, row.currency);
                group.prismaPlanned += Number(row.prismaPlanned) || 0;
            }
        });
        const groupsSorted = [...groups.values()].sort((left, right) => `${left.client}|${left.product}`.localeCompare(`${right.client}|${right.product}`));
        state.clientBreakdownRows = sortTableRows(groupsSorted.map(group => ({ ...group, accounts: [...group.accounts].join(', ') || 'None', variance: group.metaSpend - group.prismaPlanned })), state.clientSort);
        renderSortableHeader(elements.clientBreakdownHeader, [
            { label: 'Client', key: 'client' }, { label: 'Product', key: 'product' }, { label: 'Currency', key: 'currency' }, { label: 'Mapped Meta accounts', key: 'accounts' },
            { label: 'Meta spend', key: 'metaSpend', number: true }, { label: 'Prisma booked', key: 'prismaPlanned', number: true }, { label: 'Variance', key: 'variance', number: true }
        ], state.clientSort, 'client');
        elements.clientBreakdownBody.innerHTML = state.clientBreakdownRows.map(group => `<tr><td>${escapeHtml(group.client)}</td><td>${escapeHtml(group.product)}</td><td>${escapeHtml(group.currency || 'Not supplied')}</td><td>${escapeHtml(group.accounts)}</td><td class="number">${escapeHtml(currency(group.metaSpend, group.currency))}</td><td class="number">${escapeHtml(currency(group.prismaPlanned, group.currency))}</td><td class="number">${escapeHtml(currency(group.variance, group.currency))}</td></tr>`).join('');
    }

    function candidateSummary(row) {
        const candidate = row.candidates?.[0];
        if (!candidate) return 'No credible Prisma candidate';
        const campaign = candidate.campaignName || 'Campaign name not supplied';
        const lineId = candidate.campaignId ? `Partner line ID ${candidate.campaignId}` : 'Partner line ID missing';
        return `${candidate.level}, ${candidate.score}%: ${campaign}; ${lineId}; ${currency(candidate.planned, candidate.currency || prismaCurrencyFor(row))} booked`;
    }

    function supportingEvidence(row) {
        const placementEvidence = (row.prismaPlacementNames || []).map(name => `Prisma placement: ${name}`);
        const placementNumbers = (row.prismaPlacementNumbers || []).map(number => `Prisma Placement number: ${number}`);
        const buyNumbers = (row.prismaBuyNumbers || []).map(number => `Prisma Buy number: ${number}`);
        return [...(row.issues || []), ...placementEvidence, ...placementNumbers, ...buyNumbers];
    }

    function readableDate(value) {
        if (!value) return '';
        const date = new Date(`${value}T00:00:00Z`);
        if (Number.isNaN(date.getTime())) return value;
        return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
    }

    function evidenceGroups(row) {
        const groups = { Checks: [], Dates: [], Delivery: [], Budget: [], Prisma: [] };
        const scheduleIssues = [];
        (row.issues || []).forEach(issue => {
            if (/Daily Meta pace|Meta impressions|Last Meta delivery|No Meta impressions/i.test(issue)) groups.Delivery.push(issue);
            else if (/budget/i.test(issue)) groups.Budget.push(issue);
            else if (/schedule|Meta start|Meta end|booking covers the Meta start|booking covers the Meta end/i.test(issue)) scheduleIssues.push(issue);
            else if (/^Prisma |Manual match/i.test(issue)) groups.Prisma.push(issue);
            else groups.Checks.push(issue);
        });

        if (row.metaStart || row.metaEnd || row.prismaStart || row.prismaEnd) {
            const metaRange = [readableDate(row.metaStart), readableDate(row.metaEnd)].filter(Boolean).join(' to ');
            const prismaRange = [readableDate(row.prismaStart), readableDate(row.prismaEnd)].filter(Boolean).join(' to ');
            if (metaRange) groups.Dates.push(`Meta: ${metaRange}`);
            if (prismaRange) groups.Dates.push(`Prisma: ${prismaRange}`);
        }
        groups.Dates.push(...scheduleIssues);

        if (row.metaImpressions > 0 && !groups.Delivery.some(item => /Meta impressions/i.test(item))) {
            groups.Delivery.push(`${Math.round(row.metaImpressions).toLocaleString('en-GB')} impressions${row.metaReach > 0 ? ` · ${Math.round(row.metaReach).toLocaleString('en-GB')} reach` : ''}`);
        }
        if (row.metaLastDelivery && !groups.Delivery.some(item => /Last Meta delivery/i.test(item))) {
            groups.Delivery.push(`Last delivery: ${readableDate(row.metaLastDelivery)}`);
        }
        if (row.metaBudgetRemaining !== null && row.metaBudgetRemaining !== undefined && !groups.Budget.some(item => /budget remaining/i.test(item))) {
            groups.Budget.push(`${currency(row.metaBudgetRemaining, metaCurrencyFor(row))} remaining${row.metaBudgetSource ? ` · ${row.metaBudgetSource}` : ''}`);
        }

        const placementNumbers = row.prismaPlacementNumbers || [];
        const buyNumbers = row.prismaBuyNumbers || [];
        const references = [
            placementNumbers.length ? `Placement ${placementNumbers.join(', ')}` : '',
            buyNumbers.length ? `Buy ${buyNumbers.join(', ')}` : ''
        ].filter(Boolean).join(' · ');
        if (references) groups.Prisma.push(references);
        (row.prismaPlacementNames || []).forEach(name => groups.Prisma.push(name));

        return Object.entries(groups)
            .map(([label, items]) => ({ label, items: [...new Set(items.filter(Boolean))] }))
            .filter(group => group.items.length);
    }

    function renderSupportingEvidence(row) {
        const groups = evidenceGroups(row);
        if (!groups.length) return '<span class="evidence-empty">No additional evidence</span>';
        return `<div class="supporting-evidence">${groups.map(group => `
            <div class="evidence-group">
                <strong>${escapeHtml(group.label)}</strong>
                <div>${group.items.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>
            </div>`).join('')}</div>`;
    }

    function reportCoverageGap(row) {
        return (state.report?.coverage?.gaps || []).find(gap =>
            String(gap.accountId) === String(row.accountId) && gap.month === row.month
        ) || null;
    }

    function coverageActionReason(row) {
        return `The Prisma report has no rows for Meta account ${row.accountId} in ${row.month}. This can happen when the Prisma export uses a different date range, the client/account was omitted, or Partner account IDs are missing or incorrect. Correct the export scope before treating this campaign as definitely unbooked.`;
    }

    function wrikeRequirementFor(row) {
        if (row.actionKey === 'wrike' || row.actionKey === 'book') return 'Required before creating the Prisma booking';
        if (row.actionKey === 'update') return 'Required before updating the Prisma booking';
        if (row.actionKey === 'coverage') return 'Not needed until report coverage is corrected';
        if (row.actionKey === 'workflow') return 'Not needed to check this Prisma status';
        if (row.actionKey === 'confirm') return 'Add if the review leads to a booking change';
        return 'Add if the investigation leads to a booking change';
    }

    function socialActionRows() {
        return accountFilteredRows().filter(row => row.metaKey && row.metaSpend !== null && !['Matched', 'Monitor', 'Outside scope'].includes(row.evidence)).map(row => {
            const mapping = state.accountMappings[row.accountId] || {};
            const wrike = state.wrikeReferences[row.metaKey] || '';
            let actionKey = 'investigate';
            let action = 'Investigate booking evidence';
            let reason = row.classification;
            if (row.prismaWorkflowIssues?.length) {
                const bookingAlsoNeedsUpdate = row.evidence === 'Needs update';
                actionKey = bookingAlsoNeedsUpdate ? 'update' : 'workflow';
                action = bookingAlsoNeedsUpdate ? 'Resolve Prisma workflow and update booking' : 'Resolve Prisma workflow';
                reason = row.prismaWorkflowIssues.join('; ');
            } else if (row.evidence === 'Missing/unlinked') {
                if (reportCoverageGap(row)) {
                    actionKey = 'coverage';
                    action = 'Resolve report coverage';
                    reason = coverageActionReason(row);
                } else if (wrike) {
                    actionKey = 'book';
                    action = 'Book in Prisma using Wrike';
                    reason = row.monthClosed ? 'No credible Prisma booking was found for this closed month.' : 'No credible Prisma booking is linked in the current open month.';
                } else {
                    actionKey = 'wrike';
                    action = 'Get Wrike reference';
                    reason = row.monthClosed ? 'Get the approved Wrike reference before creating this closed-month booking in Prisma.' : 'Get the approved Wrike reference before creating this current-month booking in Prisma.';
                }
            } else if (row.candidates?.length) {
                actionKey = 'confirm';
                action = 'Confirm possible Prisma booking';
                reason = 'Review the ranked candidate before treating this campaign as missing.';
            } else if (row.evidence === 'Needs update') {
                actionKey = 'update';
                action = 'Update Prisma booking';
            }
            const actionRow = {
                ...row,
                client: mapping.client || row.prismaClient || 'Client not mapped',
                product: mapping.product || row.prismaProduct || 'Product not mapped',
                wrike,
                actionKey,
                action,
                actionReason: reason,
                candidateSummary: candidateSummary(row)
            };
            actionRow.wrikeRequirement = wrikeRequirementFor(actionRow);
            return actionRow;
        });
    }

    function filteredSocialActionRows() {
        const selected = elements.socialActionFilter.value;
        const query = elements.socialActionSearch.value.trim().toLowerCase();
        const rows = socialActionRows().filter(row => {
            const actionMatch = selected === 'all' || row.actionKey === selected;
            const queryMatch = !query || [row.client, row.product, row.account, row.accountId, row.campaignName, row.campaignId, row.month, row.action].some(value => String(value || '').toLowerCase().includes(query));
            return actionMatch && queryMatch;
        });
        return sortTableRows(rows, state.socialActionSort);
    }

    function renderSocialActionList() {
        if (!elements.socialActionBody) return;
        const rows = filteredSocialActionRows();
        elements.socialActionCount.textContent = `${rows.length} action${rows.length === 1 ? '' : 's'}`;
        renderSortableHeader(elements.socialActionHeader, [
            { label: 'Client / product', key: 'client' }, { label: 'Account', key: 'account' }, { label: 'Campaign', key: 'campaignName' }, { label: 'Month', key: 'month' }, { label: 'Meta spend', key: 'metaSpend', number: true },
            { label: 'Wrike reference' }, { label: 'Recommended action', key: 'action' }, { label: 'Possible Prisma match' }
        ], state.socialActionSort, 'social');
        elements.socialActionBody.innerHTML = rows.length ? rows.map(row => {
            const needsWrike = ['wrike', 'book', 'update'].includes(row.actionKey);
            const wrikeCell = needsWrike
                ? `<input class="wrike-input" type="text" value="${escapeHtml(row.wrike)}" data-wrike-meta-key="${escapeHtml(row.metaKey)}" placeholder="Wrike link or reference" aria-label="Wrike reference for ${escapeHtml(row.campaignName || row.campaignId)}">${row.wrike ? '' : `<span class="minor wrike-needed">${escapeHtml(row.wrikeRequirement)}</span>`}`
                : `<span class="wrike-status">${escapeHtml(row.wrike || row.wrikeRequirement)}</span>`;
            return `<tr><td>${escapeHtml(row.client)}<span class="minor">${escapeHtml(row.product)}</span></td><td>${escapeHtml(row.account)}<span class="minor">ID ${escapeHtml(row.accountId)}</span></td><td>${escapeHtml(row.campaignName || 'Name not supplied')}<span class="minor campaign-id">${escapeHtml(row.campaignId)}</span></td><td>${escapeHtml(row.month)}</td><td class="number">${escapeHtml(currency(row.metaSpend, row.currency))}</td><td>${wrikeCell}</td><td><span class="action-label">${escapeHtml(row.action)}</span><span class="action-reason">${escapeHtml(row.actionReason)}</span></td><td>${escapeHtml(row.candidateSummary)}</td></tr>`;
        }).join('') : '<tr><td class="action-empty" colspan="8">No Social actions match the current month, account, and action filters.</td></tr>';
    }

    async function saveWrikeReference(metaKey, value) {
        const normalized = String(value || '').trim();
        if (normalized) state.wrikeReferences[metaKey] = normalized;
        else delete state.wrikeReferences[metaKey];
        await writeLocalStorage({ [WRIKE_REFERENCE_STORAGE_KEY]: state.wrikeReferences });
        renderSocialActionList();
    }

    function socialActionCsv(rows) {
        const headers = ['Client', 'Product', 'Meta account', 'Account ID', 'Campaign name', 'Campaign ID', 'Month', 'Meta currency', 'Prisma currency', 'Meta spend', 'Meta impressions', 'Meta reach', 'Meta last delivery', 'Meta updated time', 'Meta budget remaining', 'Prisma Placement number(s)', 'Prisma Buy number(s)', 'Wrike reference', 'Wrike requirement', 'Recommended action', 'Reason', 'Supporting evidence', 'Possible Prisma match'];
        return [headers.join(','), ...rows.map(row => [
            row.client, row.product, row.account, row.accountId, row.campaignName, row.campaignId, row.month, metaCurrencyFor(row), prismaCurrencyFor(row), row.metaSpend,
            row.metaImpressions, row.metaReach, row.metaLastDelivery, row.metaUpdatedTime, row.metaBudgetRemaining, (row.prismaPlacementNumbers || []).join('; '), (row.prismaBuyNumbers || []).join('; '),
            row.wrike, row.wrikeRequirement, row.action, row.actionReason, supportingEvidence(row).join('; '), row.candidateSummary
        ].map(csvEscape).join(','))].join('\r\n');
    }

    function downloadSocialActions() {
        downloadCsv(`social_booking_checker_social_actions_${elements.asOfDate.value || 'report'}.csv`, socialActionCsv(filteredSocialActionRows()));
    }

    function socialActionShareText(rows) {
        const byCurrency = new Map();
        rows.forEach(row => byCurrency.set(row.currency || '', (byCurrency.get(row.currency || '') || 0) + (Number(row.metaSpend) || 0)));
        const spendLabel = [...byCurrency].map(([code, spend]) => currency(spend, code)).join(' · ');
        const heading = `Social booking actions: ${rows.length} campaign${rows.length === 1 ? '' : 's'}, ${spendLabel} Meta spend`;
        const details = rows.map(row => `- ${row.client} / ${row.product}: ${row.campaignName || row.campaignId} (${row.month}) | ${row.action} | Wrike: ${row.wrike || row.wrikeRequirement}`);
        return [heading, ...details].join('\n');
    }

    async function copySocialActions() {
        const rows = filteredSocialActionRows();
        if (!rows.length) {
            setStatus(elements.socialActionStatus, 'There are no visible actions to copy.');
            return;
        }
        const text = socialActionShareText(rows);
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
        else {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
        }
        setStatus(elements.socialActionStatus, 'Social action list copied.', 'ready');
    }

    function unmatchedMetaRowsForManualMatch() {
        return accountFilteredRows().filter(row => (row.evidence === 'Missing/unlinked' || row.candidates?.length) && Number(row.metaSpend) > 0 && row.metaKey);
    }

    function unmatchedPrismaRowsForManualMatch() {
        return monthFilteredRows().filter(row => row.metaSpend === null && row.prismaPlanned !== null && row.prismaKey && row.evidence !== 'Outside scope');
    }

    function openManualMatch() {
        if (!state.report) return;
        state.manualMatchTrigger = document.activeElement;
        const metaRows = unmatchedMetaRowsForManualMatch();
        const prismaRows = unmatchedPrismaRowsForManualMatch();
        elements.manualMatchBody.innerHTML = metaRows.map((row, rowIndex) => {
            const rejectedKeys = new Set(state.candidateRejections[row.metaKey] || []);
            const fallbackCandidates = prismaRows.filter(candidate => candidate.accountId === row.accountId && candidate.month === row.month && !rejectedKeys.has(candidate.prismaKey)).map(candidate => ({
                key: candidate.prismaKey,
                prismaKey: candidate.prismaKey,
                campaignId: candidate.campaignId,
                campaignName: candidate.campaignName,
                placementNames: candidate.prismaPlacementNames || [],
                placementNumbers: candidate.prismaPlacementNumbers || [],
                buyNumbers: candidate.prismaBuyNumbers || [],
                planned: candidate.prismaPlanned,
                currency: prismaCurrencyFor(candidate),
                score: null,
                level: 'Available campaign',
                reasons: []
            }));
            const candidates = (row.candidatePool?.length ? row.candidatePool : row.candidates?.length ? row.candidates : fallbackCandidates)
                .filter(candidate => candidate.prismaKey && !rejectedKeys.has(candidate.key));
            const choices = candidates.map((candidate, candidateIndex) => {
                const rejected = (state.candidateRejections[row.metaKey] || []).includes(candidate.key);
                const placementNames = candidate.placementNames || [];
                const details = [candidate.campaignId ? `Partner line ID ${candidate.campaignId}` : 'Partner line ID missing', placementNames.length ? `Placement: ${placementNames.join(' | ')}` : '', candidate.placementNumbers?.length ? `Placement number: ${candidate.placementNumbers.join(' | ')}` : '', candidate.buyNumbers?.length ? `Buy number: ${candidate.buyNumbers.join(' | ')}` : '', `${currency(candidate.planned, candidate.currency || prismaCurrencyFor(row))} booked`, ...(candidate.reasons || [])].filter(Boolean).join('; ');
                const searchText = `${candidate.campaignName || ''} ${placementNames.join(' ')} ${candidate.campaignId || ''} ${candidate.client || ''} ${candidate.product || ''} ${candidate.planned || ''}`.toLowerCase();
                return `<div class="candidate-choice" data-candidate-choice data-candidate-default-hidden="${candidateIndex > 2}" data-candidate-search-text="${escapeHtml(searchText)}"${candidateIndex > 2 ? ' hidden' : ''}><input type="radio" name="match-${rowIndex}" value="${escapeHtml(candidate.prismaKey)}" data-manual-meta-key="${escapeHtml(row.metaKey)}" ${candidate.prismaKey ? '' : 'disabled'} aria-label="Confirm ${escapeHtml(candidate.campaignName || 'Prisma candidate')}"><div><strong>${escapeHtml(candidate.campaignName || 'Campaign name not supplied')}</strong><small>${escapeHtml(details)}</small><label class="candidate-reject"><input type="checkbox" data-reject-meta-key="${escapeHtml(row.metaKey)}" data-reject-candidate-key="${escapeHtml(candidate.key)}" ${rejected ? 'checked' : ''}>Not the same campaign</label></div><span class="candidate-score">${candidate.score === null ? escapeHtml(candidate.level) : `${escapeHtml(candidate.score)}%`}</span></div>`;
            }).join('');
            const candidateLabel = `${candidates.length} eligible unlinked Prisma campaign${candidates.length === 1 ? '' : 's'} in this Meta account and month`;
            const noCandidates = '<span class="candidate-none candidate-empty">No eligible unlinked Prisma campaign is available for this Meta account and month. Existing Prisma campaigns are already linked, or this report has no other booking in scope. Client/product mapping only improves ranking; it does not hide candidates.</span>';
            return `<tr><td>${escapeHtml(row.account)}<span class="minor">ID ${escapeHtml(row.accountId)}</span></td><td>${escapeHtml(row.campaignName || 'Name not supplied')}</td><td><span class="campaign-id">${escapeHtml(row.campaignId)}</span>${row.month ? `<span class="minor">${escapeHtml(row.month)}</span>` : ''}</td><td class="number">${escapeHtml(currency(row.metaSpend, row.currency))}</td><td><div class="candidate-stack"><label class="candidate-none"><input type="radio" name="match-${rowIndex}" value="" data-manual-meta-key="${escapeHtml(row.metaKey)}" checked>Leave unmatched</label>${choices ? `<label class="candidate-search">Search eligible Prisma campaigns<input type="search" data-candidate-search placeholder="Campaign name, Partner line ID, client or product" aria-label="Search eligible Prisma campaigns for ${escapeHtml(row.campaignName || row.campaignId)}"><small data-candidate-search-results>${escapeHtml(candidateLabel)}</small></label>${choices}` : noCandidates}</div></td></tr>`;
        }).join('');
        const hasDecisions = Object.keys(state.manualMatches).length > 0 || Object.values(state.candidateRejections).some(values => values?.length);
        elements.clearManualMatches.classList.toggle('hidden', !hasDecisions);
        elements.applyManualMatches.disabled = !metaRows.length;
        setStatus(elements.manualMatchStatus, metaRows.length
            ? `${metaRows.length} Meta campaign${metaRows.length === 1 ? '' : 's'} ready for review. Scores rank evidence; they do not create a match until you confirm one.`
            : hasDecisions ? 'All current unmatched campaigns have local decisions. Clear them to review again.' : 'There are no unmatched Meta campaigns in the current month and account scope.');
        elements.manualMatchModal.classList.remove('hidden');
        elements.closeManualMatch.focus();
    }

    function closeManualMatch() {
        elements.manualMatchModal.classList.add('hidden');
        state.manualMatchTrigger?.focus?.();
    }

    async function applyManualMatches() {
        const selections = Array.from(elements.manualMatchBody.querySelectorAll('input[type="radio"][data-manual-meta-key]:checked'));
        const selectedPrismaKeys = selections.map(select => select.value).filter(Boolean);
        if (new Set(selectedPrismaKeys).size !== selectedPrismaKeys.length) {
            setStatus(elements.manualMatchStatus, 'Choose each Prisma campaign only once.', 'error');
            return;
        }
        const next = { ...state.manualMatches };
        selections.forEach(select => {
            if (select.value) next[select.dataset.manualMetaKey] = select.value;
            else delete next[select.dataset.manualMetaKey];
        });
        const nextRejections = { ...state.candidateRejections };
        new Set(selections.map(input => input.dataset.manualMetaKey)).forEach(metaKey => { delete nextRejections[metaKey]; });
        elements.manualMatchBody.querySelectorAll('input[data-reject-meta-key]:checked').forEach(input => {
            if (!nextRejections[input.dataset.rejectMetaKey]) nextRejections[input.dataset.rejectMetaKey] = [];
            nextRejections[input.dataset.rejectMetaKey].push(input.dataset.rejectCandidateKey);
        });
        selections.filter(input => input.value).forEach(input => {
            nextRejections[input.dataset.manualMetaKey] = (nextRejections[input.dataset.manualMetaKey] || []).filter(key => key !== input.value);
        });
        try {
            await writeLocalStorage({ [MANUAL_MATCH_STORAGE_KEY]: next, [CANDIDATE_REJECTION_STORAGE_KEY]: nextRejections });
            state.manualMatches = next;
            state.candidateRejections = nextRejections;
            closeManualMatch();
            runComparison();
        } catch (error) {
            setStatus(elements.manualMatchStatus, error.message, 'error');
        }
    }

    async function clearManualMatches() {
        try {
            await Promise.all([removeLocalStorage(MANUAL_MATCH_STORAGE_KEY), removeLocalStorage(CANDIDATE_REJECTION_STORAGE_KEY)]);
            state.manualMatches = {};
            state.candidateRejections = {};
            closeManualMatch();
            runComparison();
        } catch (error) {
            setStatus(elements.manualMatchStatus, error.message, 'error');
        }
    }

    function campaignColumns(showMonth) {
        return [
            { key: 'evidence', label: 'Evidence', width: 132 },
            { key: 'account', label: 'Account', width: 172 },
            { key: 'campaignName', label: 'Campaign name', width: 190 },
            { key: 'campaignId', label: 'Campaign ID', width: 164 },
            ...(showMonth ? [{ key: 'month', label: 'Month', width: 100 }] : []),
            { key: 'metaSpend', label: 'Meta spend', width: 112, number: true, sortable: true },
            { key: 'prismaPlanned', label: 'Prisma', width: 112, number: true, sortable: true },
            { key: 'variance', label: 'Variance', width: 112, number: true, sortable: true },
            { key: 'finding', label: 'Finding', width: 286 },
            { key: 'supportingEvidence', label: 'Supporting evidence', width: 420 }
        ];
    }

    function campaignColumnWidth(column) {
        const saved = Number(state.campaignColumnWidths[column.key]);
        return Number.isFinite(saved) ? Math.min(720, Math.max(96, saved)) : column.width;
    }

    function campaignColumnClass(key) {
        return `campaign-column-${String(key || '').replace(/[^a-z0-9_-]/gi, '-')}`;
    }

    function campaignColumnStyleSheet() {
        return Array.from(document.styleSheets).find(sheet => {
            try {
                return Array.from(sheet.cssRules || []).some(rule => rule.selectorText === '#campaignTable col.campaign-column-evidence');
            } catch (_) {
                return false;
            }
        }) || null;
    }

    function applyCampaignColumnWidth(key, width) {
        const sheet = campaignColumnStyleSheet();
        if (!sheet) return;
        const selector = `#campaignTable col.${campaignColumnClass(key)}`;
        try {
            const index = Array.from(sheet.cssRules).findIndex(rule => rule.selectorText === selector);
            if (index < 0) return;
            sheet.deleteRule(index);
            sheet.insertRule(`${selector}{width:${width}px}`, index);
        } catch (_) {
            // The browser keeps the safe stylesheet default if CSSOM updates are unavailable.
        }
    }

    function renderCampaignColumns(columns) {
        elements.campaignColumnGroup.innerHTML = columns.map(column => `<col data-campaign-column="${escapeHtml(column.key)}" class="${campaignColumnClass(column.key)}">`).join('');
        columns.forEach(column => applyCampaignColumnWidth(column.key, campaignColumnWidth(column)));
    }

    function saveCampaignColumnWidths() {
        writeLocalStorage({ [CAMPAIGN_COLUMN_WIDTH_STORAGE_KEY]: state.campaignColumnWidths }).catch(() => {});
    }

    function setCampaignColumnWidth(key, width) {
        state.campaignColumnWidths[key] = Math.min(720, Math.max(96, Math.round(width)));
        applyCampaignColumnWidth(key, state.campaignColumnWidths[key]);
    }

    function bindCampaignColumnResizers(columns) {
        elements.reportHeader.querySelectorAll('[data-column-resize]').forEach(handle => {
            const key = handle.dataset.columnResize;
            const column = elements.campaignColumnGroup.querySelector(`[data-campaign-column="${key}"]`);
            const configuredColumn = columns.find(item => item.key === key) || { key, width: 160 };
            if (!column) return;
            handle.addEventListener('pointerdown', event => {
                event.preventDefault();
                const startX = event.clientX;
                const startWidth = Number(state.campaignColumnWidths[key]) || column.getBoundingClientRect().width || campaignColumnWidth(configuredColumn);
                const move = moveEvent => setCampaignColumnWidth(key, startWidth + moveEvent.clientX - startX);
                const stop = () => {
                    document.removeEventListener('pointermove', move);
                    document.removeEventListener('pointerup', stop);
                    document.body.classList.remove('campaign-column-resizing');
                    saveCampaignColumnWidths();
                };
                document.body.classList.add('campaign-column-resizing');
                document.addEventListener('pointermove', move);
                document.addEventListener('pointerup', stop, { once: true });
            });
            handle.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
                event.preventDefault();
                const direction = event.key === 'ArrowRight' ? 1 : -1;
                const currentWidth = Number(state.campaignColumnWidths[key]) || campaignColumnWidth(configuredColumn);
                setCampaignColumnWidth(key, currentWidth + (direction * 20));
                saveCampaignColumnWidths();
            });
        });
    }

    function renderRows() {
        const rows = filteredRows();
        const showMonth = new Set(accountFilteredRows().map(row => row.month).filter(Boolean)).size > 1;
        const columns = campaignColumns(showMonth);
        elements.visibleCount.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'} shown`;
        renderCampaignColumns(columns);
        elements.reportHeader.innerHTML = `<tr>${columns.map(column => `<th class="${column.number ? 'number' : ''}"${column.sortable ? ` data-sort-key="${column.key}"` : ''}>${column.sortable ? `<button class="sort-button" type="button" data-sort="${column.key}">${escapeHtml(column.label)} <span aria-hidden="true"></span></button>` : escapeHtml(column.label)}<span class="column-resizer" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize ${escapeHtml(column.label)} column" data-column-resize="${escapeHtml(column.key)}"></span></th>`).join('')}</tr>`;
        elements.reportHeader.querySelectorAll('.sort-button[data-sort]').forEach(button => button.addEventListener('click', () => toggleSort(button.dataset.sort)));
        bindCampaignColumnResizers(columns);
        elements.reportBody.innerHTML = rows.map(row => `
            <tr>
                <td>${evidenceTooltip(row.evidence, `evidence-pill ${evidenceClass(row.evidence)}`)}</td>
                <td>${escapeHtml(row.account)}<span class="minor">ID ${escapeHtml(row.accountId)}</span></td>
                <td>${escapeHtml(row.campaignName || 'Name not supplied')}</td>
                <td><span class="campaign-id">${escapeHtml(row.campaignId)}</span></td>
                ${showMonth ? `<td>${escapeHtml(row.month)}</td>` : ''}
                <td class="number">${escapeHtml(currency(row.metaSpend, metaCurrencyFor(row)))}</td>
                <td class="number">${escapeHtml(currency(row.prismaPlanned, prismaCurrencyFor(row)))}</td>
                <td class="number">${row.currencyMismatch ? 'Not comparable' : escapeHtml(currency(row.variance, metaCurrencyFor(row)))}</td>
                <td><strong>${escapeHtml(row.classification)}</strong><span class="minor">${escapeHtml(row.owner || 'Owner not supplied')}</span></td>
                <td>${renderSupportingEvidence(row)}</td>
            </tr>`).join('');
        document.querySelectorAll('th[data-sort-key]').forEach(header => {
            const active = header.dataset.sortKey === state.sort.key;
            header.setAttribute('aria-sort', active ? state.sort.direction : 'none');
            const indicator = header.querySelector('.sort-button span');
            if (indicator) indicator.textContent = active ? (state.sort.direction === 'ascending' ? '▲' : '▼') : '';
        });
    }

    function applyFilterAction(container, action) {
        container.querySelectorAll('input[type="checkbox"]').forEach(input => { input.checked = action === 'all'; });
        updateFilterCounts();
    }

    function renderSortableHeader(container, columns, sort, table) {
        if (!container) return;
        container.innerHTML = `<tr>${columns.map(column => {
            const active = column.key && sort.key === column.key;
            const indicator = active ? (sort.direction === 'ascending' ? 'â–²' : 'â–¼') : '';
            const label = column.key
                ? `<button class="sort-button" type="button" data-table-sort="${table}" data-sort-key="${column.key}" aria-label="Sort by ${escapeHtml(column.label)}">${escapeHtml(column.label)} <span aria-hidden="true">${indicator}</span></button>`
                : escapeHtml(column.label);
            return `<th class="${column.number ? 'number' : ''}"${active ? ` aria-sort="${sort.direction}"` : ''}>${label}</th>`;
        }).join('')}</tr>`;
    }

    function toggleTableSort(table, key) {
        const sort = table === 'social' ? state.socialActionSort : state.clientSort;
        if (sort.key === key) sort.direction = sort.direction === 'ascending' ? 'descending' : 'ascending';
        else {
            sort.key = key;
            sort.direction = ['metaSpend', 'prismaPlanned', 'variance'].includes(key) ? 'descending' : 'ascending';
        }
        if (table === 'social') renderSocialActionList();
        else renderClientBreakdown();
    }

    function toggleSort(key) {
        if (state.sort.key === key) state.sort.direction = state.sort.direction === 'ascending' ? 'descending' : 'ascending';
        else state.sort = { key, direction: 'descending' };
        renderRows();
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
            populationConfirmed: true,
            accountIdScope: selectedAccountIds(),
            manualMatches: state.manualMatches,
            rejectedCandidates: state.candidateRejections,
            accountMappings: state.accountMappings
        });
        if (report.validationErrors.length) { renderMessages(report.validationErrors); elements.results.classList.add('hidden'); return; }
        state.report = report;
        renderPopulationCoverage();
        renderPrismaScope();
        renderMessages([]);
        const usingApi = state.metaTextSource === 'api' && state.apiSync;
        elements.metaDataSource.classList.toggle('is-live', Boolean(usingApi));
        elements.metaDataSource.textContent = usingApi
            ? `Using live Meta API data for ${state.apiSync.accountCount} selected account${state.apiSync.accountCount === 1 ? '' : 's'}, ${state.apiSync.startDate} to ${state.apiSync.endDate}.`
            : 'Using the uploaded Meta Ads Report. Refresh selected Meta accounts to add account currency and timezone, ad-set schedules, statuses and budgets, daily spend, update times, impressions, reach, and current monthly spend.';
        populateMonthFilters(report.rows);
        populateAccountFilter(report.rows);
        elements.coverageWarnings.innerHTML = report.warnings.map(warning => `<span class="coverage-warning">${escapeHtml(warning)}</span>`).join('');
        elements.results.classList.remove('hidden');
        renderReport();
        renderDataDiagnostics();
        setWorkflowStage('compare');
        scrollToComparisonResults();
    }

    function downloadReport() {
        if (!state.report) return;
        const csv = engine.reportToCsv(filteredRows());
        downloadCsv(`social_booking_checker_campaign_breakdown_${elements.asOfDate.value || 'report'}.csv`, csv);
    }

    function csvEscape(value) {
        let text = String(value ?? '');
        if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }

    function downloadCsv(filename, csv) {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    }

    function downloadClientBreakdown() {
        const headers = ['Client', 'Product', 'Currency', 'Mapped Meta accounts', 'Meta spend', 'Prisma booked', 'Variance'];
        const csv = [headers.join(','), ...(state.clientBreakdownRows || []).map(row => [row.client, row.product, row.currency, row.accounts, row.metaSpend, row.prismaPlanned, row.variance].map(csvEscape).join(','))].join('\r\n');
        downloadCsv(`social_booking_checker_client_breakdown_${elements.asOfDate.value || 'report'}.csv`, csv);
    }

    function toggleBreakdownExpansion(type) {
        const target = type === 'client' ? elements.clientBreakdown : elements.campaignBreakdown;
        const isExpanding = !target.classList.contains('is-expanded');
        document.querySelectorAll('.breakdown-section.is-expanded').forEach(section => section.classList.remove('is-expanded'));
        target.classList.toggle('is-expanded', isExpanding);
        document.body.classList.toggle('breakdown-expanded', isExpanding);
        document.querySelectorAll('[data-expand-breakdown]').forEach(button => {
            button.textContent = button.dataset.expandBreakdown === type && isExpanding ? 'Exit expanded view' : 'Expand';
        });
    }

    function standaloneTableHtml(title, headings, rows) {
        return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{margin:0;padding:28px;background:#f5f5f7;color:#20222a;font-family:"Segoe UI",sans-serif}h1{margin:0 0 8px;font-size:25px}p{margin:0 0 22px;color:#646875;font-size:13px}table{width:100%;border-collapse:collapse;background:#fff;font-size:12px}th,td{padding:12px;border-bottom:1px solid #e5e5ea;text-align:left;vertical-align:top}th{position:sticky;top:0;background:#f0f0f3}.number{text-align:right;font-variant-numeric:tabular-nums}</style></head><body><h1>${escapeHtml(title)}</h1><p>Current Social Booking Checker view.</p><table><thead><tr>${headings.map(heading => `<th class="${heading.number ? 'number' : ''}">${escapeHtml(heading.label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map((value, index) => `<td class="${headings[index].number ? 'number' : ''}">${escapeHtml(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`;
    }

    function openBreakdownInNewTab(type) {
        const isClient = type === 'client';
        const clientRows = state.clientBreakdownRows || [];
        const campaignRows = filteredRows();
        const showMonth = new Set(accountFilteredRows().map(row => row.month).filter(Boolean)).size > 1;
        const headings = isClient
            ? [{ label: 'Client' }, { label: 'Product' }, { label: 'Currency' }, { label: 'Mapped Meta accounts' }, { label: 'Meta spend', number: true }, { label: 'Prisma booked', number: true }, { label: 'Variance', number: true }]
            : [{ label: 'Evidence' }, { label: 'Account' }, { label: 'Campaign name' }, { label: 'Campaign ID' }, ...(showMonth ? [{ label: 'Month' }] : []), { label: 'Meta spend', number: true }, { label: 'Prisma booked', number: true }, { label: 'Variance', number: true }, { label: 'Finding' }];
        const rows = isClient
            ? clientRows.map(row => [row.client, row.product, row.currency || 'Not supplied', row.accounts, currency(row.metaSpend, row.currency), currency(row.prismaPlanned, row.currency), currency(row.variance, row.currency)])
            : campaignRows.map(row => [row.evidence, row.account, row.campaignName || 'Name not supplied', row.campaignId, ...(showMonth ? [row.month] : []), currency(row.metaSpend, row.currency), currency(row.prismaPlanned, row.currency), currency(row.variance, row.currency), row.classification]);
        const popup = window.open('', '_blank');
        if (!popup) return;
        popup.document.open();
        popup.document.write(standaloneTableHtml(isClient ? 'Client breakdown' : 'Campaign breakdown', headings, rows));
        popup.document.close();
        popup.opener = null;
    }

    document.addEventListener('DOMContentLoaded', () => {
        ['validationMessages', 'results', 'uploadStage', 'scopeStage', 'continueToScope', 'uploadStageStatus', 'backToUploads', 'backToScope', 'dataConfidenceLink', 'metaDataSource', 'financialHeadline', 'summaryCards', 'coverageWarnings', 'populationCoverage', 'linkComparison', 'linkComparisonMetrics', 'socialActionList', 'socialActionHeader', 'socialActionBody', 'socialActionFilter', 'socialActionSearch', 'socialActionCount', 'socialActionStatus', 'copySocialActions', 'downloadSocialActions', 'clientBreakdown', 'clientBreakdownHeader', 'clientBreakdownBody', 'campaignBreakdown', 'campaignColumnGroup', 'reportSearch', 'monthFromFilter', 'monthToFilter', 'visibleCount', 'reportHeader', 'reportBody', 'asOfDate', 'tolerance', 'closedWorkingDay', 'accountScopePanel', 'accountOptions', 'prismaScopePanel', 'prismaScopeStatus', 'prismaScopeComparison', 'matchedScopeAccounts', 'accountMappingOptions', 'metaApiPanel', 'metaAccessToken', 'saveMetaCredentials', 'metaCredentialStatus', 'removeMetaToken', 'metaApiDatePreset', 'metaApiStartDate', 'metaApiEndDate', 'metaApiStatus', 'apiAccountActions', 'pullMetaData', 'clearMetaApiData', 'metaReferenceStatus', 'removeMetaReference', 'evidenceFilterOptions', 'evidenceFilterCount', 'accountFilterOptions', 'accountFilterCount', 'manualMatchModal', 'manualMatchStatus', 'manualMatchBody', 'closeManualMatch', 'cancelManualMatch', 'applyManualMatches', 'clearManualMatches', 'dataDiagnostics', 'dataDiagnosticsBadge', 'dataDiagnosticsContent', 'metaColumnCheck', 'prismaColumnCheck', 'metaAdsReportingLink'].forEach(id => { elements[id] = byId(id); });
        elements.asOfDate.value = new Date().toISOString().slice(0, 10);
        applyDatePreset();
        setupFileUpload('metaFile', 'metaDropZone', 'removeMetaFile', 'metaText', 'metaFileName');
        setupFileUpload('prismaFile', 'prismaDropZone', 'removePrismaFile', 'prismaText', 'prismaFileName');
        elements.continueToScope.addEventListener('click', () => setWorkflowStage('scope'));
        elements.backToUploads.addEventListener('click', () => setWorkflowStage('upload'));
        elements.backToScope.addEventListener('click', () => setWorkflowStage('scope'));
        document.querySelector('.workflow-progress').addEventListener('click', event => {
            const button = event.target.closest('.workflow-step-button');
            if (!button || button.disabled) return;
            navigateWorkflowStage(button.closest('[data-workflow-progress]').dataset.workflowProgress);
        });
        elements.dataConfidenceLink.addEventListener('click', () => { elements.dataDiagnostics.open = true; });
        elements.saveMetaCredentials.addEventListener('click', saveMetaCredentials);
        elements.removeMetaToken.addEventListener('click', removeMetaCredential);
        elements.metaAccessToken.addEventListener('focus', clearSavedTokenMask);
        elements.removeMetaReference.addEventListener('click', () => removeMetaReference().catch(error => setStatus(elements.metaReferenceStatus, error.message, 'error')));
        elements.metaApiDatePreset.addEventListener('change', applyDatePreset);
        elements.pullMetaData.addEventListener('click', pullMetaData);
        elements.clearMetaApiData.addEventListener('click', clearMetaApiData);
        byId('runComparison').addEventListener('click', runComparison);
        byId('downloadReport').addEventListener('click', downloadReport);
        elements.results.addEventListener('click', event => {
            if (event.target.closest('#downloadDataDiagnostics')) {
                downloadDataDiagnostics();
                return;
            }
            const download = event.target.closest('[data-download-breakdown]');
            const expand = event.target.closest('[data-expand-breakdown]');
            const open = event.target.closest('[data-open-breakdown]');
            if (download) {
                if (download.dataset.downloadBreakdown === 'client') downloadClientBreakdown(); else downloadReport();
            } else if (expand) toggleBreakdownExpansion(expand.dataset.expandBreakdown);
            else if (open) openBreakdownInNewTab(open.dataset.openBreakdown);
        });
        byId('selectAllAccounts').addEventListener('click', () => { elements.accountOptions.querySelectorAll('input').forEach(input => { input.checked = true; }); saveAccountScope(); renderPrismaScope(); });
        byId('clearAccounts').addEventListener('click', () => { elements.accountOptions.querySelectorAll('input').forEach(input => { input.checked = false; }); saveAccountScope(); renderPrismaScope(); });
        elements.accountOptions.addEventListener('change', () => { saveAccountScope(); renderPrismaScope(); });
        const handleMappingChange = event => {
            const select = event.target.closest('select[data-mapping-account-id]');
            if (select) {
                const accountId = select.dataset.mappingAccountId;
                saveAccountMapping(accountId, mappingFromValue(select.value)).catch(error => setStatus(elements.prismaScopeStatus, error.message, 'error'));
            }
        };
        const handleMappingCampaigns = event => {
            const button = event.target.closest('[data-show-mapping-campaigns]');
            if (!button) return;
            const accountId = button.dataset.showMappingCampaigns;
            state.shownMappingCampaignsAccountId = state.shownMappingCampaignsAccountId === accountId ? '' : accountId;
            renderPrismaScope();
        };
        elements.accountMappingOptions.addEventListener('change', handleMappingChange);
        elements.matchedScopeAccounts.addEventListener('change', handleMappingChange);
        elements.accountMappingOptions.addEventListener('click', handleMappingCampaigns);
        elements.matchedScopeAccounts.addEventListener('click', handleMappingCampaigns);
        elements.prismaScopeComparison.addEventListener('click', event => {
            if (!event.target.closest('[data-show-matched-scope]')) return;
            state.showMatchedScopeAccounts = !state.showMatchedScopeAccounts;
            renderPrismaScope();
        });
        elements.summaryCards.addEventListener('click', event => {
            if (event.target.closest('[data-open-manual-match]')) {
                openManualMatch();
                return;
            }
            if (!event.target.closest('[data-scroll-actions]')) return;
            elements.socialActionList.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        });
        elements.manualMatchBody.addEventListener('input', event => {
            const input = event.target.closest('input[data-candidate-search]');
            if (!input) return;
            const search = input.value.trim().toLowerCase();
            const stack = input.closest('.candidate-stack');
            const choices = [...stack.querySelectorAll('[data-candidate-choice]')];
            let visible = 0;
            choices.forEach(choice => {
                const matches = !search || choice.dataset.candidateSearchText.includes(search);
                choice.hidden = !matches || (!search && choice.dataset.candidateDefaultHidden === 'true');
                if (!choice.hidden) visible++;
            });
            stack.querySelector('[data-candidate-search-results]').textContent = search
                ? `${visible} matching eligible Prisma campaign${visible === 1 ? '' : 's'}`
                : `${choices.length} eligible unlinked Prisma campaigns in this Meta account and month`;
        });
        elements.closeManualMatch.addEventListener('click', closeManualMatch);
        elements.cancelManualMatch.addEventListener('click', closeManualMatch);
        elements.applyManualMatches.addEventListener('click', applyManualMatches);
        elements.clearManualMatches.addEventListener('click', clearManualMatches);
        elements.socialActionFilter.addEventListener('change', renderSocialActionList);
        elements.socialActionSearch.addEventListener('input', renderSocialActionList);
        elements.socialActionHeader.addEventListener('click', event => {
            const button = event.target.closest('[data-table-sort="social"]');
            if (button) toggleTableSort('social', button.dataset.sortKey);
        });
        elements.clientBreakdownHeader.addEventListener('click', event => {
            const button = event.target.closest('[data-table-sort="client"]');
            if (button) toggleTableSort('client', button.dataset.sortKey);
        });
        elements.socialActionBody.addEventListener('change', event => {
            const input = event.target.closest('input[data-wrike-meta-key]');
            if (!input) return;
            saveWrikeReference(input.dataset.wrikeMetaKey, input.value).catch(error => setStatus(elements.socialActionStatus, error.message, 'error'));
        });
        elements.copySocialActions.addEventListener('click', () => copySocialActions().catch(error => setStatus(elements.socialActionStatus, error.message, 'error')));
        elements.downloadSocialActions.addEventListener('click', downloadSocialActions);
        elements.manualMatchModal.addEventListener('click', event => { if (event.target.closest('[data-close-manual-match]')) closeManualMatch(); });
        document.addEventListener('keydown', event => { if (event.key === 'Escape' && !elements.manualMatchModal.classList.contains('hidden')) closeManualMatch(); });
        elements.monthFromFilter.addEventListener('change', () => {
            if (elements.monthFromFilter.value > elements.monthToFilter.value) elements.monthToFilter.value = elements.monthFromFilter.value;
            renderReport();
        });
        elements.monthToFilter.addEventListener('change', () => {
            if (elements.monthToFilter.value < elements.monthFromFilter.value) elements.monthFromFilter.value = elements.monthToFilter.value;
            renderReport();
        });
        elements.evidenceFilterOptions.addEventListener('change', () => { updateFilterCounts(); renderRows(); });
        elements.accountFilterOptions.addEventListener('change', () => { updateFilterCounts(); renderReport(); });
        document.querySelectorAll('.filter-popover').forEach(container => container.addEventListener('click', event => {
            const action = event.target.closest('[data-filter-action]')?.dataset.filterAction;
            if (!action) return;
            applyFilterAction(container, action);
            if (container === elements.accountFilterOptions) renderReport(); else renderRows();
        }));
        elements.reportSearch.addEventListener('input', renderRows);
        updateFilterCounts();
        updateUploadReadiness();
        setWorkflowStage('upload');
        updateMetaAdsReportingLink();
        renderCredentialStatus();
        restoreMetaReference();
        restoreAccountMappings();
        restoreManualMatches();
        restoreReviewData();
        restoreCampaignColumnWidths();
    });
})();
