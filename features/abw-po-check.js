(async () => {
    const prefix = '#abw-check-po?';
    const initialFragment = location.hash;
    const recovered = chrome.runtime.sendMessage({ action: 'takeAbwPoHandoff' }).catch(() => ({}));
    const fragment = initialFragment || (await recovered)?.fragment;
    if (!fragment?.startsWith(prefix)) return;
    const values = new URLSearchParams(fragment.slice(prefix.length));
    history.replaceState(null, '', location.pathname);
    document.title = 'Check PO · Ops Toolshed';
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.href = chrome.runtime.getURL('icon.png');
    document.head.append(favicon);
    document.body.replaceChildren();
    const main = document.createElement('main');
    main.className = 'abw-po-check';
    document.body.append(main);
    function add(parent, tag, text) {
        const element = document.createElement(tag);
        element.textContent = text;
        parent.append(element);
        return element;
    }
    const entry = add(main, 'div', '');
    entry.className = 'abw-po-entry';
    add(entry,'h1','Check PO');
    add(entry,'p','Check your booking details in MX. Amounts are in GBP.');
    const form = add(entry,'form','');
    const fields = {};
    function field(key, label, value, type = 'text') {
        const wrapper = add(form,'label',label);
        const input = add(wrapper,'input','');
        input.type = type;
        input.required = key !== 'product';
        if (key === 'product') input.placeholder = 'Optional';
        if (type === 'number') {input.step='0.01'; input.min='0';}
        input.value = value || '';
        fields[key] = input;
    }
    function iso(value) {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
        return m ? [m[3],m[2],m[1]].join('-') : value;
    }
    function money(value) {
        const s = (value || '').replace(/[£\s]/g,'');
        if (/^\d+(?:,\d{1,2})?$/.test(s)) return s.replace(',','.');
        if (/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(s)) return s.replace(/,/g,'');
        return '';
    }
    const medium = values.get('media');
    field('media','Media code', !medium?.trim() || /^digital$/i.test(medium.trim()) ? 'D' : medium);
    field('client','Client code',values.get('client'));
    field('product','Product code',values.get('product'));
    field('po','PO number',values.get('po'));
    field('start','Campaign start',iso(values.get('start')),'date');
    field('end','Campaign end',iso(values.get('end')),'date');
    field('total','Total PO value',money(values.get('total')),'number');
    field('plan','Media plan budget',money(values.get('plan')),'number');
    const submit = add(form,'button','Check on MX');
    const result = add(main,'section','');
    result.setAttribute('aria-live','polite');
    function revealResult() {
        if (main.classList.contains('abw-po-has-result')) return;
        const before = entry.getBoundingClientRect();
        main.classList.add('abw-po-has-result');
        const after = entry.getBoundingClientRect();
        const x = before.left - after.left;
        const y = before.top - after.top;
        if ((x || y) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            entry.animate([{ transform: 'translate(' + x + 'px, ' + y + 'px)' }, { transform: 'none' }], {
                duration: 300, easing: 'ease-out',
            });
        }
    }
    function showProgress(message) {
        result.replaceChildren();
        add(result, 'p', message).className = 'abw-po-progress';
    }
    const gbp = n => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n);
    const displayDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : value;

    function checkStatus(parent, value, passed) {
        const status = add(parent, 'p', passed ? '✓ ' + value : value);
        status.className = passed ? 'abw-po-pass' : 'abw-po-warning';
    }

    function renderPurchaseOrder(row, booking, campaignCodes) {
        const card = add(result, 'article', '');
        card.className = 'abw-po-result';
        const header = add(card, 'header', '');
        const identity = add(header, 'div', '');
        add(identity, 'h2', 'PO ' + row.reference);
        if (row.name) add(identity, 'p', row.name);
        checkStatus(header, row.status || 'Approval status unknown', /^approved$/i.test(row.status));

        const dates = add(card, 'section', '');
        add(dates, 'h3', 'Dates');
        const hasDates = Boolean(row.startDate && row.endDate);
        const covers = hasDates && row.startDate <= booking.start && row.endDate >= booking.end;
        const exact = row.startDate === booking.start && row.endDate === booking.end;
        if (hasDates && !covers) {
            if (booking.start < row.startDate) checkStatus(dates, 'Campaign starts before the PO', false);
            if (booking.end > row.endDate) checkStatus(dates, 'Campaign ends after the PO', false);
        } else {
            checkStatus(dates, hasDates ? (exact ? 'Exact date match' : 'Campaign dates covered') : 'Date coverage unverified', covers);
        }
        const table = add(dates, 'table', '');
        table.setAttribute('aria-label', 'PO and campaign dates');
        const headings = add(add(table, 'thead', ''), 'tr', '');
        for (const label of ['Period', 'Start', 'End']) add(headings, 'th', label).scope = 'col';
        const dateRows = add(table, 'tbody', '');
        for (const [label, start, end] of [['Purchase order', row.startDate, row.endDate], ['Campaign', booking.start, booking.end]]) {
            const tr = add(dateRows, 'tr', '');
            add(tr, 'th', label).scope = 'row';
            add(tr, 'td', start ? displayDate(start) : 'Unavailable');
            add(tr, 'td', end ? displayDate(end) : 'Unavailable');
        }

        const amounts = add(card, 'section', '');
        add(amounts, 'h3', 'Amounts');
        const values = add(amounts, 'dl', '');
        values.className = 'abw-po-amounts';
        const hasAmount = Number.isFinite(row.amount);
        const mxAmount = row.currencyCode === 'GBP' ? gbp(row.amount) : [row.amount?.toLocaleString('en-GB'), row.currencyCode].filter(Boolean).join(' ');
        for (const [label, value] of [['MX PO amount', hasAmount ? mxAmount : 'Unavailable'], ['Wrike PO total', gbp(Number(booking.total))], ['Media plan budget', gbp(Number(booking.plan))]]) {
            const item = add(values, 'div', '');
            add(item, 'dt', label);
            add(item, 'dd', value);
        }
        if (row.currencyCode === 'GBP' && hasAmount) {
            const pence = Math.round(row.amount * 100);
            const difference = pence - Math.round(Number(booking.total) * 100);
            const room = pence - Math.round(Number(booking.plan) * 100);
            if (difference === 0 && room === 0) {
                checkStatus(amounts, 'MX amount matches the Wrike total and media plan budget.', true);
            } else {
                checkStatus(amounts, difference === 0 ? 'MX amount matches Wrike total' : gbp(Math.abs(difference) / 100) + (difference < 0 ? ' below' : ' above') + ' Wrike total', difference === 0);
                checkStatus(amounts, room < 0 ? 'Plan exceeds MX PO amount by ' + gbp(-room / 100) : room === 0 ? 'Plan equals MX PO amount' : 'PO amount is ' + gbp(room / 100) + ' above plan budget', room >= 0);
            }
        }
        const balance = add(amounts, 'aside', '');
        balance.className = 'abw-po-balance';
        add(balance, 'strong', 'Available balance unverified');
        add(balance, 'p', 'The plan comparison uses the original PO amount. MX spend and available balance were not returned.');

        const allocation = add(card, 'section', '');
        add(allocation, 'h3', 'Allocation');
        add(allocation, 'p', [
            row.mediaCode === 'D' ? 'Digital (D)' : 'Media ' + row.mediaCode,
            'Client ' + row.clientCode,
            globalThis.abwPoVerdict.productCode(row) ? 'Product ' + row.productCode : 'Any product (client-wide)',
            campaignCodes.size ? 'Campaign ' + [...campaignCodes].join(', ') : 'No campaign booking returned for this allocation',
            row.isMultiline == null ? 'PO line count unknown' : row.isMultiline ? 'Multi-line PO · verify the applicable line in MX' : 'Single-line PO',
        ].join(' · ')).className = 'abw-po-allocation';
    }
    let signInTabId;
    async function prismaContext(signInAgain) {
        const ask = options => chrome.runtime.sendMessage({action:'getAbwPoPrismaContext', ...options});
        let session = await ask(signInAgain ? { signInAgain } : { signInTabId });
        if (session.closed) session = await ask({});
        if (session.status === 'error') throw new Error(session.message);
        if (session.signInRequired) {
            result.textContent = 'Sign in to Prisma to check this PO.';
            const signIn = add(result, 'button', 'Sign in to Prisma');
            signIn.onclick = () => { if (form.reportValidity()) void check(true); };
            return null;
        }
        if (session.context) {
            signInTabId = undefined;
            return session.context;
        }
        signInTabId = session.signInTabId ?? signInTabId;
        showProgress('Waiting for Prisma sign-in. The check will resume here automatically.');
        const deadline = Date.now() + 5 * 60 * 1000;
        while (Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            session = await ask({ signInTabId });
            if (session.status === 'error') throw new Error(session.message);
            if (session.closed) {
                signInTabId = undefined;
                throw new Error('The Prisma sign-in tab was closed. Click Check on MX to reconnect.');
            }
            if (session.context) {
                signInTabId = undefined;
                return session.context;
            }
        }
        throw new Error('Prisma sign-in is still pending. Finish signing in, then click Check on MX.');
    }
    form.oninput = () => {result.replaceChildren();};
    async function check(signInAgain = false) {
        if (submit.disabled) return;
        const f = Object.fromEntries(Object.entries(fields).map(([k,el]) => [k,el.value.trim()]));
        if (f.end < f.start) {result.textContent='Campaign end must be on or after campaign start.';return;}
        submit.disabled=true;
        for (const input of Object.values(fields)) input.readOnly=true;
        showProgress('Connecting to Prisma…');
        try {
            const context = await prismaContext(signInAgain);
            if (!context) return;
            showProgress('Checking MX…');
            const media=f.media.toUpperCase(), client=f.client.toUpperCase(), product=f.product.toUpperCase();
            const booking = { ...f, media, client, product };
            async function loadRows(productCode, supplemental = false) {
                const lookup = { media, client, product: productCode, start: f.start, end: f.end };
                const worker = await chrome.runtime.sendMessage({
                    action: 'queryAbwPoFromWorker',
                    lookup,
                }).catch(() => null);
                let rows = worker?.rows;
                if (!Array.isArray(rows)) {
                    const prisma = await chrome.runtime.sendMessage({ action: 'queryAbwPoFromPrismaTab', lookup }).catch(() => null);
                    rows = prisma?.rows;
                }
                if (!Array.isArray(rows)) {
                    const response=await fetch('/campaign-service/secure/purchaseOrder/list',{
                        method:'PUT',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(30000),
                        headers:{Accept:'application/json','Content-Type':'application/json','X-Requested-With':'XMLHttpRequest','x-mo-context':context},
                        body:globalThis.abwPoVerdict.lookupBody(lookup)
                    });
                    if (response.status === 401 || response.status === 403) {
                        if (supplemental) return null;
                        result.textContent = 'MX denied the lookup (HTTP ' + response.status + ').';
                        if (!signInAgain) {
                            const reconnect = add(result, 'button', 'Reconnect to Prisma');
                            reconnect.onclick = () => { if (form.reportValidity()) void check(true); };
                        }
                        return null;
                    }
                    if (!response.ok) {
                        if (!productCode && [400, 422].includes(response.status)) {
                            throw new Error('MX rejected the lookup without a product code. Enter a product code and try again.');
                        }
                        throw new Error('HTTP ' + response.status);
                    }
                    rows=await response.json();
                }
                if (!Array.isArray(rows)) throw new Error('Unexpected MX response');
                return rows;
            }
            const rows = await loadRows(product);
            if (!rows) return;
            let verdict = globalThis.abwPoVerdict.compare(rows, booking);
            if (product && !verdict.productEligible) {
                const clientRows = await loadRows('', true).catch(() => null);
                if (clientRows) verdict = globalThis.abwPoVerdict.compare([...rows, ...clientRows], booking);
            }
            const { matches, alternateReference } = verdict;
            result.replaceChildren();
            if (!matches.length) {
                add(result,'p','No matching PO returned for these codes and dates. Check the booking details and your Prisma account.');
                return;
            }
            if (String(matches[0].reference) !== f.po) {
                add(result, 'p', 'Matched MX reference ' + alternateReference + ' for Wrike PO ' + f.po + ' using the leading-zero variant.');
            }
            checkStatus(result, verdict.status === 'checked' ? 'PO Checked' : 'Review PO', verdict.status === 'checked');
            if (verdict.anyProduct) {
                checkStatus(result, product ? 'Any product can be used. Brief says to book against ' + product + '.' : 'Any product can be used. The brief has no product code.', true);
            } else if (!verdict.productEligible) {
                checkStatus(result, 'Eligible product codes: ' + verdict.allowedProducts.join(', ') + (product ? '. Brief specifies ' + product + '.' : '.'), false);
            }
            const purchases = new Map();
            for (const r of matches) {
                const identity=JSON.stringify([r.serial,r.startDate,r.endDate,r.amount,r.currencyCode,r.status,r.isMultiline,r.name,globalThis.abwPoVerdict.productCode(r)]);
                if (!purchases.has(identity)) purchases.set(identity, { row: r, campaignCodes: new Set() });
                if (r.estimateCode != null && r.estimateCode !== '') purchases.get(identity).campaignCodes.add(r.estimateCode);
            }
            for (const { row, campaignCodes } of purchases.values()) renderPurchaseOrder(row, f, campaignCodes);
            revealResult();
        } catch (error) {
            result.textContent='Lookup unavailable. '+error.message;
        } finally {
            submit.disabled=false;
            for (const input of Object.values(fields)) input.readOnly=false;
        }
    }
    form.onsubmit = event => {
        event.preventDefault();
        return check();
    };
    if (form.checkValidity() && fields.end.value >= fields.start.value) void check();
    else result.textContent = 'Complete the booking details, then click Check on MX.';
})();
