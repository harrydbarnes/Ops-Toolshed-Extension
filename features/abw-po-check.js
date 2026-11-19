(() => {
    const prefix = '#abw-check-po?';
    if (!location.hash.startsWith(prefix)) return;
    const values = new URLSearchParams(location.hash.slice(prefix.length));
    history.replaceState(null, '', location.pathname);
    document.title = 'Check PO · Ops Toolshed';
    document.body.replaceChildren();
    const main = document.createElement('main');
    main.style.cssText = 'max-width:640px;margin:48px auto;padding:24px;font:16px/1.5 system-ui;color:#192437;background:white';
    document.body.append(main);
    function add(parent, tag, text) {
        const element = document.createElement(tag);
        element.textContent = text;
        parent.append(element);
        return element;
    }
    add(main,'h1','Check PO');
    add(main,'p','Confirm the Wrike booking details for MX UK / A1. Amounts are in GBP.');
    const form = add(main,'form','');
    const fields = {};
    function field(key, label, value, type = 'text') {
        const wrapper = add(form,'label',label);
        wrapper.style.cssText = 'display:inline-grid;gap:4px;width:46%;margin:0 3% 14px 0';
        const input = add(wrapper,'input','');
        input.type = type;
        input.style.cssText = 'font:inherit;padding:6px;min-width:0';
        input.required = true;
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
    field('media','Media code', /^digital$/i.test(medium) || (!medium && /programmatic|display/i.test(values.get('channel'))) ? 'D' : medium);
    field('client','Client code',values.get('client'));
    field('product','Product code',values.get('product'));
    field('po','PO number',values.get('po'));
    field('start','Campaign start',iso(values.get('start')),'date');
    field('end','Campaign end',iso(values.get('end')),'date');
    field('total','Total PO value',money(values.get('total')),'number');
    field('plan','Media plan budget',money(values.get('plan')),'number');
    const submit = add(form,'button','Check on MX');
    submit.style.cssText = 'display:block;padding:8px 16px;font:inherit;cursor:pointer';
    const result = add(main,'section','');
    result.setAttribute('aria-live','polite');
    const gbp = n => new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(n);
    form.oninput = () => {result.replaceChildren();};
    form.onsubmit = async event => {
        event.preventDefault();
        if (submit.disabled) return;
        const f = Object.fromEntries(Object.entries(fields).map(([k,el]) => [k,el.value.trim()]));
        if (f.end < f.start) {result.textContent='Campaign end must be on or after campaign start.';return;}
        submit.disabled=true;
        for (const input of Object.values(fields)) input.readOnly=true;
        result.textContent='Checking MX…';
        try {
            const media=f.media.toUpperCase(), client=f.client.toUpperCase(), product=f.product.toUpperCase();
            const response=await fetch('/campaign-service/secure/purchaseOrder/list',{
                method:'PUT',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(30000),
                headers:{Accept:'application/json','Content-Type':'application/json'},
                body:JSON.stringify({clientBusinessKey:['UK','A1',media,client].join('|'),mediaCode:media,productCode:product,startDate:f.start,endDate:f.end})
            });
            if (!response.ok) throw new Error('HTTP '+response.status);
            const rows=await response.json();
            if (!Array.isArray(rows)) throw new Error('Unexpected MX response');
            const matches=rows.filter(r => r && String(r.reference)===f.po && r.mediaCode===media && r.clientCode===client && String(r.productCode)===product);
            result.replaceChildren();
            if (!matches.length) {
                add(result,'p','No matching PO returned for these codes and dates. Check the booking details and your Prisma account.');
                return;
            }
            const seen=new Set();
            for (const r of matches) {
                const identity=JSON.stringify([r.serial,r.startDate,r.endDate,r.amount,r.currencyCode,r.status,r.isMultiline,r.name]);
                if (seen.has(identity)) continue;
                seen.add(identity);
                add(result,'h2','PO '+f.po+' · '+(r.status || 'Status unknown'));
                add(result,'p',r.name || '');
                if (r.startDate && r.endDate) {
                    const coverage=r.startDate===f.start && r.endDate===f.end ? 'Exact date match' : r.startDate<=f.start && r.endDate>=f.end ? 'Campaign dates covered' : 'Campaign dates outside PO dates';
                    add(result,'p',coverage+' · '+r.startDate+' to '+r.endDate);
                } else add(result,'p','PO date coverage unverified.');
                if (r.currencyCode==='GBP' && Number.isFinite(r.amount)) {
                    const cents=Math.round(r.amount*100);
                    const difference=cents-Math.round(Number(f.total)*100);
                    const room=cents-Math.round(Number(f.plan)*100);
                    add(result,'p','MX amount '+gbp(r.amount)+' · '+(difference===0?'matches Wrike total':gbp(Math.abs(difference)/100)+(difference<0?' below':' above')+' Wrike total'));
                    add(result,'p',room<0?'Plan exceeds MX amount by '+gbp(-room/100):'MX amount covers plan by '+gbp(room/100));
                } else add(result,'p','Value comparison unavailable. Check the MX amount and currency.');
                if (r.isMultiline) add(result,'p','Multi-line PO. Check the applicable line allocation in MX.');
            }
            add(result,'p','Available balance unverified. MX returns the PO amount without a separate remaining balance.');
        } catch (error) {
            result.textContent='Lookup unavailable. Sign in to Prisma in this Chrome profile, then retry. '+error.message;
        } finally {
            submit.disabled=false;
            for (const input of Object.values(fields)) input.readOnly=false;
        }
    };
})();
