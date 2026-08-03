(function() {
    'use strict';

    const PRISMA_HOME = 'https://groupmuk-prisma.mediaocean.com/campaign-management/#osAppId=prsm-cm-spa&osPspId=cm-dashboard&route=campaigns';
    const defaults = { helpGuidesEnabled: true, bannerUsernameEnabled: true, quickCampaignActionsEnabled: true, campaignNameQuickCopyEnabled: true, campaignHeaderQuickCopyEnabled: true, campaignDateShortcutEnabled: true, budgetWidgetOptimisedEnabled: true, ordersShortcutEnabled: true, actualiseShortcutEnabled: true, actualiseNavbarEnabled: true, approverWidgetPlacementEnabled: true, gmiChatShortcutEnabled: true, addCampaignShortcutEnabled: true };
    const elements = { count: document.getElementById('tour-count'), title: document.getElementById('tour-title'), description: document.getElementById('tour-description'), features: document.getElementById('tour-features'), status: document.getElementById('tour-status'), progress: document.getElementById('tour-progress-fill'), content: document.querySelector('.tour-content'), back: document.getElementById('tour-back'), next: document.getElementById('tour-next'), skip: document.getElementById('skip-tour') };
    let settings = { ...defaults };
    let chapters = [];
    let activeChapter = 0;
    let retryTimer = null;
    let renderToken = 0;

    function storageGet(area, values) { return new Promise(resolve => { try { const result = area?.get?.(values, value => resolve({ ...values, ...(value || {}) })); result?.then?.(value => resolve({ ...values, ...(value || {}) }), () => resolve({ ...values })); } catch { resolve({ ...values }); } }); }
    function storageSet(values) { try { chrome.storage?.local?.set?.(values); } catch { /* The tour remains usable without persistence. */ } }
    function isEnabled(key) { return settings[key] !== false; }
    function isPrismaUrl(url = '') { return url.includes('mediaocean.com/campaign-management/'); }
    function isCampaignUrl(url = '') { return url.includes('mediaocean.com/campaign-management/') && /(?:#|&)campaign-id=[^&]+/i.test(url); }
    function getActiveTab() { return chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => tabs?.[0] || null); }
    async function sendToTab(tabId, message) { if (!tabId) return { found: false }; try { return await chrome.tabs.sendMessage(tabId, message); } catch { return { found: false }; } }
    function enabledFeatures(items) { return items.filter(([key]) => isEnabled(key)).map(([, label]) => label); }

    function buildChapters() {
        const startingTarget = isEnabled('helpGuidesEnabled') ? 'helpGuides' : 'account';
        const workspaceFeatures = enabledFeatures([
            ['quickCampaignActionsEnabled', 'Campaign actions beside the campaign name'], ['campaignNameQuickCopyEnabled', 'One-click campaign-name copy'], ['campaignHeaderQuickCopyEnabled', 'One-click identifier copy'], ['campaignDateShortcutEnabled', 'Direct campaign-date access'], ['budgetWidgetOptimisedEnabled', 'A compact budget summary'], ['ordersShortcutEnabled', 'Direct Orders access'], ['actualiseShortcutEnabled', 'Direct Actualise access'], ['actualiseNavbarEnabled', 'Campaign navigation retained in Actualise']
        ]);
        workspaceFeatures.unshift('A clearer campaign navigation');
        const supportFeatures = enabledFeatures([
            ['approverWidgetPlacementEnabled', 'Approver controls beside your campaign'], ['gmiChatShortcutEnabled', 'A campaign-aware GMI support shortcut'], ['addCampaignShortcutEnabled', 'A faster Add Campaign route']
        ]);
        return [
            { id: 'orientation', title: 'Your starting point is ready.', description: isEnabled('helpGuidesEnabled') ? 'The Help Guides launcher keeps searchable support close to the work. It is highlighted on the live page.' : 'Your account context is highlighted so you can see where Ops Toolshed adds useful detail.', features: isEnabled('helpGuidesEnabled') ? ['Searchable guides without leaving Prisma'] : ['Your Prisma account context'], target: startingTarget, blockInteraction: isEnabled('helpGuidesEnabled'), missingStatus: 'Waiting for this part of Prisma to finish loading…' },
            { id: 'open-campaign', title: 'Open any campaign when you are ready.', description: 'Choose a campaign from the home screen. This tour will move on automatically once its workspace is open.', features: ['Nothing in the campaign will be changed by this walkthrough'], target: 'campaignList', mode: 'waitForCampaign' },
            { id: 'workspace', title: 'The campaign workspace keeps repeat work close.', description: 'This chapter brings the most useful navigation and header shortcuts together instead of walking you through each control one by one.', features: workspaceFeatures, target: 'campaignNavigation', fallbackTarget: 'campaignHeader', missingStatus: 'Waiting for the campaign workspace to finish loading…' },
            { id: 'support', title: 'Approvals and support stay in context.', description: 'Campaign-aware tools are kept near the work so you can move from a question to an action without losing your place.', features: supportFeatures, target: isEnabled('approverWidgetPlacementEnabled') || isEnabled('gmiChatShortcutEnabled') ? 'approverWidget' : 'campaignWorkspace', fallbackTarget: 'campaignWorkspace', missingStatus: 'Waiting for the support tools to finish loading…' },
            { id: 'complete', title: 'You are ready to work in Prisma.', description: 'You can revisit Settings whenever your workflow changes. Finishing this tour returns you to the Prisma home screen.', features: [] }
        ];
    }

    function updateStatus(message, state = '') { elements.status.className = `tour-status${state ? ` is-${state}` : ''}`; elements.status.textContent = message || ''; }
    function clearHighlight() { return getActiveTab().then(tab => sendToTab(tab?.id, { action: 'hideOnboardingHighlight' })); }
    function scheduleRetry(token) { clearTimeout(retryTimer); retryTimer = setTimeout(() => { if (token === renderToken) void updateLiveChapter(token); }, 900); }
    async function updateLiveChapter(token) {
        const chapter = chapters[activeChapter];
        const tab = await getActiveTab();
        if (token !== renderToken || !chapter) return;
        if (!isPrismaUrl(tab?.url)) {
            await clearHighlight();
            updateStatus('Opening Prisma for the tour…', 'waiting');
            scheduleRetry(token);
            return;
        }
        if (chapter.mode === 'waitForCampaign') {
            if (isCampaignUrl(tab?.url)) { renderChapter(activeChapter + 1); return; }
            const found = await sendToTab(tab?.id, { action: 'showOnboardingHighlight', target: chapter.target, blockInteraction: false });
            updateStatus(found?.found ? 'Choose a highlighted campaign to continue.' : 'Waiting for the campaign list to load…', found?.found ? 'found' : 'waiting');
            scheduleRetry(token);
            return;
        }
        if (!chapter.target) { await clearHighlight(); updateStatus(''); return; }
        const found = await sendToTab(tab?.id, { action: 'showOnboardingHighlight', target: chapter.target, blockInteraction: chapter.blockInteraction === true });
        if (!found?.found && chapter.fallbackTarget) {
            const fallback = await sendToTab(tab?.id, { action: 'showOnboardingHighlight', target: chapter.fallbackTarget, blockInteraction: false });
            updateStatus(fallback?.found ? 'Highlighted on the Prisma page' : chapter.missingStatus, fallback?.found ? 'found' : 'waiting');
            if (!fallback?.found) scheduleRetry(token);
            return;
        }
        updateStatus(found?.found ? 'Highlighted on the Prisma page' : chapter.missingStatus, found?.found ? 'found' : 'waiting');
        if (!found?.found) scheduleRetry(token);
    }

    function renderChapter(index) {
        clearTimeout(retryTimer);
        activeChapter = Math.max(0, Math.min(chapters.length - 1, index));
        renderToken += 1;
        const token = renderToken;
        const chapter = chapters[activeChapter];
        elements.content.classList.remove('is-changing'); void elements.content.offsetWidth; elements.content.classList.add('is-changing');
        elements.count.textContent = `Chapter ${activeChapter + 1} of ${chapters.length}`;
        elements.title.textContent = chapter.title;
        elements.description.textContent = chapter.description;
        elements.features.replaceChildren(...chapter.features.map(feature => { const item = document.createElement('li'); item.textContent = feature; return item; }));
        elements.progress.style.width = `${((activeChapter + 1) / chapters.length) * 100}%`;
        elements.back.hidden = activeChapter === 0;
        elements.next.disabled = chapter.mode === 'waitForCampaign';
        elements.next.textContent = activeChapter === chapters.length - 1 ? 'Finish tour' : chapter.mode === 'waitForCampaign' ? 'Waiting for campaign…' : 'Next chapter';
        storageSet({ onboardingTourActive: true, onboardingTourVersion: 'v2', onboardingTourChapter: activeChapter, onboardingTourChapterId: chapter.id });
        void updateLiveChapter(token);
    }

    async function finishTour(skipped = false) { clearTimeout(retryTimer); const tab = await getActiveTab(); await sendToTab(tab?.id, { action: 'hideOnboardingHighlight' }); storageSet({ onboardingTourActive: false, onboardingTourCompleted: !skipped, onboardingTourSkipped: skipped, onboardingTourVersion: 'v2', onboardingTourCompletedAt: Date.now() }); if (!skipped && tab?.id && !/route=campaigns(?:&|$)/.test(tab.url || '')) { try { await chrome.tabs.update(tab.id, { url: PRISMA_HOME }); } catch { /* Completion still takes priority. */ } } try { await chrome.sidePanel?.close?.({ tabId: tab?.id }); } catch { /* State is already saved. */ } }

    elements.back.addEventListener('click', () => renderChapter(activeChapter - 1));
    elements.next.addEventListener('click', () => { if (activeChapter === chapters.length - 1) void finishTour(false); else renderChapter(activeChapter + 1); });
    elements.skip.addEventListener('click', () => void finishTour(true));
    window.addEventListener('pagehide', () => { clearTimeout(retryTimer); void clearHighlight(); }, { once: true });
    storageGet(chrome.storage?.sync, defaults).then(value => { settings = value; chapters = buildChapters(); renderChapter(0); });
    window.onboardingTourPanelV2 = { buildChapters, finishTour, isCampaignUrl, isPrismaUrl };
})();
