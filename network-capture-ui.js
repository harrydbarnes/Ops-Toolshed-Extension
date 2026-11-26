(function(root) {
    'use strict';

    const POLL_INTERVAL_MS = 1000;
    const MAX_MAILTO_BODY_LENGTH = 1600;

    function triggerDownload(filename, content, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function formatElapsed(startedAt) {
        if (!Number.isFinite(startedAt)) return '0s';
        const sec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        const mins = Math.floor(sec / 60);
        const rem = sec % 60;
        return mins > 0 ? `${mins}m ${rem}s` : `${rem}s`;
    }

    function toBase64(text) {
        const bytes = new TextEncoder().encode(String(text ?? ''));
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary).replace(/.{1,76}/g, '$&\r\n').trimEnd();
    }

    function encodeMimeHeader(value) {
        const str = String(value ?? '');
        if (/^[\x20-\x7E]*$/.test(str)) return str;
        const b64 = toBase64(str).replace(/\r\n/g, '');
        return `=?UTF-8?B?${b64}?=`;
    }

    function buildEmlDraft(capture) {
        const boundary = `----=_OpsToolshed_${Date.now().toString(36)}`;
        const subject = encodeMimeHeader(capture.emailSubject || 'Prisma Network Capture');
        const harName = capture.filenames?.har || 'prisma-network.har';
        const logName = capture.filenames?.log || 'prisma-console.log';

        return [
            `Subject: ${subject}`,
            'X-Unsent: 1',
            'MIME-Version: 1.0',
            `Content-Type: multipart/mixed; boundary="${boundary}"`,
            '',
            `--${boundary}`,
            'Content-Type: text/plain; charset="UTF-8"',
            'Content-Transfer-Encoding: base64',
            '',
            toBase64(capture.emailBody || ''),
            '',
            `--${boundary}`,
            `Content-Type: application/json; name="${harName}"`,
            `Content-Disposition: attachment; filename="${harName}"`,
            'Content-Transfer-Encoding: base64',
            '',
            toBase64(capture.harText || '{}'),
            '',
            `--${boundary}`,
            `Content-Type: text/plain; charset="UTF-8"; name="${logName}"`,
            `Content-Disposition: attachment; filename="${logName}"`,
            'Content-Transfer-Encoding: base64',
            '',
            toBase64(capture.logText || ''),
            '',
            `--${boundary}--`,
            ''
        ].join('\r\n');
    }

    function buildMailtoHref(subject, body) {
        const safeBody = body.length > MAX_MAILTO_BODY_LENGTH
            ? `${body.slice(0, MAX_MAILTO_BODY_LENGTH)}\n\n[Summary truncated for mailto link — use "Copy email summary" for full details]`
            : body;
        return `mailto:?subject=${encodeURIComponent(subject || 'Prisma Network Capture')}&body=${encodeURIComponent(safeBody)}`;
    }

    function mountNetworkCaptureUI(container) {
        if (!container || container.dataset.ncMounted === 'true') return null;
        container.dataset.ncMounted = 'true';

        const startBtn = container.querySelector('[data-nc-start]');
        const stopBtn = container.querySelector('[data-nc-stop]');
        const sanitizeCheckbox = container.querySelector('[data-nc-sanitize]');
        const statusEl = container.querySelector('[data-nc-status]');
        const liveEl = container.querySelector('[data-nc-live]');
        const exportEl = container.querySelector('[data-nc-export]');
        const metaEl = container.querySelector('[data-nc-meta]');
        const previewEl = container.querySelector('[data-nc-preview]');
        const downloadBothBtn = container.querySelector('[data-nc-download-both]');
        const downloadHarBtn = container.querySelector('[data-nc-download-har]');
        const downloadLogBtn = container.querySelector('[data-nc-download-log]');
        const downloadEmlBtn = container.querySelector('[data-nc-download-eml]');
        const copyEmailBtn = container.querySelector('[data-nc-copy-email]');
        const mailtoBtn = container.querySelector('[data-nc-mailto]');
        const dismissBtn = container.querySelector('[data-nc-dismiss]');

        let pollTimer = null;
        let cachedCapture = null;

        function setMessage(text, isError = false) {
            if (!statusEl) return;
            statusEl.textContent = text || '';
            statusEl.classList.toggle('nc-status-error', Boolean(isError));
        }

        function stopPolling() {
            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }
        }

        function startPolling() {
            if (pollTimer) return;
            pollTimer = setInterval(() => {
                void refreshStatus();
            }, POLL_INTERVAL_MS);
        }

        function renderState(captureStatus) {
            const active = Boolean(captureStatus?.active);
            const hasLast = Boolean(captureStatus?.hasLastCapture);

            if (startBtn) startBtn.hidden = active;
            if (stopBtn) stopBtn.hidden = !active;
            if (liveEl) liveEl.hidden = !active;
            if (exportEl) exportEl.hidden = active || !hasLast;
            if (sanitizeCheckbox) sanitizeCheckbox.disabled = active;

            if (active) {
                const elapsed = formatElapsed(captureStatus.startedAt);
                const reqs = captureStatus.requestCount || 0;
                const logs = captureStatus.consoleCount || 0;
                setMessage(`Recording (${elapsed}) · ${reqs} req · ${logs} console`);
                startPolling();
            } else {
                stopPolling();
                if (hasLast && captureStatus.lastCaptureMeta?.stats) {
                    const s = captureStatus.lastCaptureMeta.stats;
                    const summary = `${s.totalRequests} requests (${s.failedRequests} failed, ${s.slowRequests} slow) · ${s.consoleEntries} console (${s.consoleErrors} errors)`;
                    if (metaEl) metaEl.textContent = summary;
                }
            }
        }

        async function loadCaptureData() {
            if (cachedCapture) return cachedCapture;
            const res = await chrome.runtime.sendMessage({ action: 'GET_LAST_NETWORK_CAPTURE' });
            if (res?.status === 'success' && res.capture) {
                cachedCapture = res.capture;
                if (previewEl) previewEl.textContent = cachedCapture.emailBody || '';
                return cachedCapture;
            }
            return null;
        }

        async function refreshStatus() {
            try {
                const res = await chrome.runtime.sendMessage({ action: 'GET_NETWORK_CAPTURE_STATUS' });
                if (res?.status === 'success') {
                    renderState(res.captureStatus);
                    if (!res.captureStatus.active && res.captureStatus.hasLastCapture && previewEl && !cachedCapture) {
                        void loadCaptureData();
                    }
                }
            } catch {
                stopPolling();
            }
        }

        startBtn?.addEventListener('click', async () => {
            setMessage('Starting capture…');
            try {
                const sanitize = sanitizeCheckbox ? sanitizeCheckbox.checked : true;
                const res = await chrome.runtime.sendMessage({
                    action: 'START_NETWORK_CAPTURE',
                    sanitize
                });
                if (res?.status === 'success') {
                    cachedCapture = null;
                    if (previewEl) previewEl.textContent = '';
                    renderState(res.captureStatus);
                } else {
                    setMessage(res?.message || 'Could not start capture.', true);
                }
            } catch (error) {
                setMessage(`Could not start capture: ${error?.message || error}`, true);
            }
        });

        stopBtn?.addEventListener('click', async () => {
            setMessage('Finalising HAR & console logs…');
            try {
                const res = await chrome.runtime.sendMessage({ action: 'STOP_NETWORK_CAPTURE' });
                if (res?.status === 'success' && res.capture) {
                    cachedCapture = res.capture;
                    if (previewEl) previewEl.textContent = cachedCapture.emailBody || '';
                    renderState(res.captureStatus);
                    setMessage('Capture ready! Download .har & .log and copy the email summary.');
                } else {
                    setMessage(res?.message || 'Could not stop capture.', true);
                }
            } catch (error) {
                setMessage(`Could not stop capture: ${error?.message || error}`, true);
            }
        });

        downloadHarBtn?.addEventListener('click', async () => {
            const capture = await loadCaptureData();
            if (!capture) return;
            triggerDownload(capture.filenames.har, capture.harText, 'application/json');
            setMessage(`Downloaded ${capture.filenames.har}`);
        });

        downloadLogBtn?.addEventListener('click', async () => {
            const capture = await loadCaptureData();
            if (!capture) return;
            triggerDownload(capture.filenames.log, capture.logText, 'text/plain;charset=utf-8');
            setMessage(`Downloaded ${capture.filenames.log}`);
        });

        downloadBothBtn?.addEventListener('click', async () => {
            const capture = await loadCaptureData();
            if (!capture) return;
            triggerDownload(capture.filenames.har, capture.harText, 'application/json');
            setTimeout(() => {
                triggerDownload(capture.filenames.log, capture.logText, 'text/plain;charset=utf-8');
            }, 250);
            setMessage(`Downloaded ${capture.filenames.har} and ${capture.filenames.log}`);
        });

        downloadEmlBtn?.addEventListener('click', async () => {
            const capture = await loadCaptureData();
            if (!capture) return;
            const emlName = capture.filenames.har.replace(/^prisma-network-/, 'prisma-support-draft-').replace(/\.har$/, '.eml');
            triggerDownload(emlName, buildEmlDraft(capture), 'message/rfc822');
            setMessage(`Downloaded ${emlName} — open it in Outlook for a draft with both files attached.`);
        });

        dismissBtn?.addEventListener('click', async () => {
            cachedCapture = null;
            if (exportEl) exportEl.hidden = true;
            setMessage('');
            try {
                await chrome.runtime.sendMessage({ action: 'CLEAR_LAST_NETWORK_CAPTURE' });
            } catch { /* ignore */ }
        });

        copyEmailBtn?.addEventListener('click', async () => {
            const capture = await loadCaptureData();
            if (!capture) return;
            const fullText = `Subject: ${capture.emailSubject}\n\n${capture.emailBody}`;
            try {
                await navigator.clipboard.writeText(fullText);
                setMessage('Email summary copied to clipboard! Attach the .har and .log files.');
            } catch {
                setMessage('Could not copy to clipboard.', true);
            }
        });

        mailtoBtn?.addEventListener('click', async () => {
            const capture = await loadCaptureData();
            if (!capture) return;
            const href = buildMailtoHref(capture.emailSubject, capture.emailBody);
            window.open(href, '_blank', 'noopener');
            setMessage('Opened email draft — remember to attach the downloaded .har and .log files.');
        });

        window.addEventListener('unload', stopPolling);
        void refreshStatus();
        return { refreshStatus, stopPolling };
    }

    function initAll() {
        document.querySelectorAll('[data-network-capture-root]').forEach(el => {
            mountNetworkCaptureUI(el);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAll);
    } else {
        initAll();
    }

    root.opsNetworkCaptureUI = { mountNetworkCaptureUI, buildEmlDraft, buildMailtoHref, formatElapsed };
})(typeof window === 'undefined' ? globalThis : window);
