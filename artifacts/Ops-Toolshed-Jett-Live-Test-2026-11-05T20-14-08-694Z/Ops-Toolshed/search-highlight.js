(function(root) {
    'use strict';
    function getSearchTokens(query) {
        let normalized = String(query || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
        if (typeof normalized.normalize === 'function') normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return normalized.split(' ').filter(Boolean);
    }
    // Extracted from Campaign History: literal, case-insensitive matches rendered
    // as DOM text/mark nodes, never as interpolated HTML.
    function appendHighlightedText(parent, value, query) {
        const text = String(value || '');
        if (!text) return;
        const document = parent.ownerDocument;
        const tokens = getSearchTokens(query).sort((left, right) => right.length - left.length)
            .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (!tokens.length) { parent.appendChild(document.createTextNode(text)); return; }
        const matcher = new RegExp(tokens.join('|'), 'gi');
        let cursor = 0, match;
        while ((match = matcher.exec(text))) {
            if (match.index > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, match.index)));
            const highlight = document.createElement('mark');
            highlight.className = 'toolshed-campaign-history-match';
            highlight.textContent = match[0];
            parent.appendChild(highlight);
            cursor = matcher.lastIndex;
        }
        if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
    }
    root.OpsToolshedSearchHighlight = { getSearchTokens, appendHighlightedText };
})(typeof window !== 'undefined' ? window : globalThis);
