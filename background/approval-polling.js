import { recordDiagnosticEvent } from './diagnostics-manager.js';

const PENDING_APPROVAL_KEY = 'pendingApprovalCampaigns';
const APPROVED_CAMPAIGNS_KEY = 'approvedCampaigns';
const ALARM_NAME = 'approvalStatusCheckAlarm';
const ALARM_PERIOD_MINUTES = 5;
const PRISMA_CAMPAIGN_API_BASE = 'https://groupmuk-prisma.mediaocean.com/campaign-service/secure/campaign/publicforui/';

export async function getPendingApprovals() {
    try {
        const data = await chrome.storage.local.get({ [PENDING_APPROVAL_KEY]: {} });
        return data[PENDING_APPROVAL_KEY] || {};
    } catch (error) {
        console.error('[Approval Polling] Error getting pending approvals:', error);
        return {};
    }
}

export async function getApprovedCampaigns() {
    try {
        const data = await chrome.storage.local.get({ [APPROVED_CAMPAIGNS_KEY]: [] });
        return data[APPROVED_CAMPAIGNS_KEY] || [];
    } catch (error) {
        console.error('[Approval Polling] Error getting approved campaigns:', error);
        return [];
    }
}

export async function trackCampaignApproval(campaign) {
    if (!campaign || !campaign.campaignId) return { status: 'error', message: 'Missing campaignId' };

    try {
        const pending = await getPendingApprovals();
        const campaignId = String(campaign.campaignId).trim();
        pending[campaignId] = {
            campaignId,
            campaignName: String(campaign.campaignName || campaignId).trim(),
            url: campaign.url || '',
            submittedAt: Number(campaign.submittedAt) || Date.now(),
            lastChecked: Date.now()
        };
        await chrome.storage.local.set({ [PENDING_APPROVAL_KEY]: pending });
        return { status: 'success', campaign: pending[campaignId] };
    } catch (error) {
        console.error('[Approval Polling] Error tracking campaign approval:', error);
        return { status: 'error', message: error.message };
    }
}

export async function dismissApprovedCampaign(campaignId) {
    if (!campaignId) return { status: 'error', message: 'Missing campaignId' };

    try {
        const approved = await getApprovedCampaigns();
        const filtered = approved.filter(item => String(item.campaignId).trim() !== String(campaignId).trim());
        await chrome.storage.local.set({ [APPROVED_CAMPAIGNS_KEY]: filtered });
        return { status: 'success' };
    } catch (error) {
        console.error('[Approval Polling] Error dismissing approved campaign:', error);
        return { status: 'error', message: error.message };
    }
}

export async function dismissPendingCampaign(campaignId) {
    if (!campaignId) return { status: 'error', message: 'Missing campaignId' };

    try {
        const pending = await getPendingApprovals();
        delete pending[String(campaignId).trim()];
        await chrome.storage.local.set({ [PENDING_APPROVAL_KEY]: pending });
        return { status: 'success' };
    } catch (error) {
        console.error('[Approval Polling] Error dismissing pending campaign:', error);
        return { status: 'error', message: error.message };
    }
}

export async function clearAllApprovedCampaigns() {
    try {
        await chrome.storage.local.set({ [APPROVED_CAMPAIGNS_KEY]: [] });
        return { status: 'success' };
    } catch (error) {
        console.error('[Approval Polling] Error clearing approved campaigns:', error);
        return { status: 'error', message: error.message };
    }
}

async function broadcastApprovalEvent(campaign) {
    try {
        const tabs = await chrome.tabs.query({ url: '*://*.mediaocean.com/*' });
        for (const tab of tabs) {
            try {
                await chrome.tabs.sendMessage(tab.id, {
                    action: 'campaignApproved',
                    campaign
                });
            } catch (_err) {
                // Tab might not be ready or active
            }
        }
    } catch (error) {
        console.warn('[Approval Polling] Could not broadcast approval event to tabs:', error);
    }
}

async function isApprovalPollingEnabled() {
    const settings = await chrome.storage.sync.get({
        approvalTrackingEnabled: true,
        allFeaturesDisabled: false
    });
    return settings.allFeaturesDisabled !== true && settings.approvalTrackingEnabled !== false;
}

export async function pollPendingApprovals() {
    const startedAt = Date.now();
    let checkedCount = 0;
    let failedCount = 0;
    let approvedTransitions = 0;
    try {
        if (!(await isApprovalPollingEnabled())) {
            await recordDiagnosticEvent({
                source: 'approval-tracking',
                operation: 'scheduled-check',
                outcome: 'skipped',
                trigger: 'scheduled',
                reason: 'approval-tracking-disabled',
                durationMs: Date.now() - startedAt
            });
            return;
        }

        const pending = await getPendingApprovals();
        const campaignIds = Object.keys(pending);
        if (campaignIds.length === 0) {
            await recordDiagnosticEvent({
                source: 'approval-tracking',
                operation: 'scheduled-check',
                outcome: 'success',
                trigger: 'scheduled',
                reason: 'no-pending-campaigns',
                durationMs: Date.now() - startedAt,
                details: { pendingCount: 0, checkedCount: 0, failedCount: 0, approvedTransitions: 0 }
            });
            return;
        }

        let pendingChanged = false;
        let approvedChanged = false;
        const approvedList = await getApprovedCampaigns();

        for (const campaignId of campaignIds) {
            const entry = pending[campaignId];
            if (!entry) continue;

            try {
                checkedCount += 1;
                const response = await fetch(PRISMA_CAMPAIGN_API_BASE + encodeURIComponent(campaignId), {
                    credentials: 'include',
                    headers: { 'Accept': 'application/json' }
                });

                if (!response.ok) {
                    failedCount += 1;
                    entry.lastChecked = Date.now();
                    pendingChanged = true;
                    continue;
                }

                const data = await response.json();
                if (!(await isApprovalPollingEnabled())) return;
                if (data && data.budgetApprovalStatus === 'APPROVED') {
                    delete pending[campaignId];
                    pendingChanged = true;

                    const approvedRecord = {
                        campaignId: entry.campaignId,
                        campaignName: entry.campaignName || data.name || entry.campaignId,
                        url: entry.url,
                        submittedAt: entry.submittedAt,
                        approvedAt: Date.now()
                    };

                    const existingIdx = approvedList.findIndex(item => item.campaignId === entry.campaignId);
                    if (existingIdx >= 0) {
                        approvedList.splice(existingIdx, 1);
                    }
                    approvedList.unshift(approvedRecord);
                    approvedChanged = true;
                    approvedTransitions += 1;

                    if (await isApprovalPollingEnabled()) {
                        await broadcastApprovalEvent(approvedRecord);
                    }
                } else {
                    entry.lastChecked = Date.now();
                    pendingChanged = true;
                }
            } catch (err) {
                failedCount += 1;
                console.warn('[Approval Polling] Error checking campaign ' + campaignId + ':', err);
            }
        }

        if (!(await isApprovalPollingEnabled())) return;
        if (pendingChanged) {
            await chrome.storage.local.set({ [PENDING_APPROVAL_KEY]: pending });
        }
        if (approvedChanged) {
            await chrome.storage.local.set({ [APPROVED_CAMPAIGNS_KEY]: approvedList });
        }
        await recordDiagnosticEvent({
            source: 'approval-tracking',
            operation: 'scheduled-check',
            outcome: failedCount > 0 ? 'partial' : 'success',
            trigger: 'scheduled',
            durationMs: Date.now() - startedAt,
            details: {
                pendingCount: campaignIds.length,
                checkedCount,
                failedCount,
                approvedTransitions
            }
        });
    } catch (error) {
        console.error('[Approval Polling] Error during poll cycle:', error);
        await recordDiagnosticEvent({
            source: 'approval-tracking',
            operation: 'scheduled-check',
            outcome: 'error',
            trigger: 'scheduled',
            failureKind: 'unexpected',
            durationMs: Date.now() - startedAt,
            details: { checkedCount, failedCount: failedCount + 1, approvedTransitions }
        });
    }
}

export async function setupApprovalAlarm() {
    try {
        const existing = await chrome.alarms.get(ALARM_NAME);
        if (!existing) {
            await chrome.alarms.create(ALARM_NAME, {
                periodInMinutes: ALARM_PERIOD_MINUTES
            });
        }
    } catch (error) {
        console.error('[Approval Polling] Error setting up alarm:', error);
    }
}

export { ALARM_NAME, PENDING_APPROVAL_KEY, APPROVED_CAMPAIGNS_KEY };
