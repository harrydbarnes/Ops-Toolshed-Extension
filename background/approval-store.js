export const PENDING_APPROVAL_KEY = 'pendingApprovalCampaigns';
export const APPROVED_CAMPAIGNS_KEY = 'approvedCampaigns';

let mutationQueue = Promise.resolve();

// All approval writes share a queue so a poll cannot overwrite a concurrent
// submission, dismissal, or notification acknowledgement.
export function queueApprovalMutation(mutation) {
    const result = mutationQueue.catch(() => undefined).then(mutation);
    mutationQueue = result.catch(() => undefined);
    return result;
}

export function mutatePendingApprovals(mutation) {
    return queueApprovalMutation(async () => {
        const stored = await chrome.storage.local.get({ [PENDING_APPROVAL_KEY]: {} });
        const pending = stored[PENDING_APPROVAL_KEY] || {};
        const result = mutation(pending);
        await chrome.storage.local.set({ [PENDING_APPROVAL_KEY]: pending });
        return result;
    });
}
