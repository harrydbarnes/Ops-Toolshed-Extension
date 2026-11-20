(() => {
    const cents = value => Math.round(Number(value) * 100);

    function compare(rows, booking) {
        const { media, client, product, po } = booking;
        const candidates = rows.filter(row => row && row.mediaCode === media && row.clientCode === client && String(row.productCode) === product);
        let matches = candidates.filter(row => String(row.reference) === po);
        let alternateReference;
        if (!matches.length && /^\d{1,10}$/.test(po)) {
            const variant = po.length === 10 ? po.replace(/^0+(?=\d)/, '') : po.padStart(10, '0');
            if (variant !== po) {
                matches = candidates.filter(row => String(row.reference) === variant);
                if (matches.length) alternateReference = variant;
            }
        }

        const issues = new Set();
        if (!matches.length) issues.add('PO not found for the booking codes and dates');
        for (const row of matches) {
            if (!/^approved$/i.test(row.status)) issues.add('PO approval is unverified');
            if (row.isMultiline) issues.add('Verify the applicable allocation line in MX');
            if (!row.startDate || !row.endDate || row.startDate > booking.start || row.endDate < booking.end) {
                issues.add('PO date coverage is unverified or incomplete');
            }
            if (row.currencyCode !== 'GBP' || !Number.isFinite(row.amount)) {
                issues.add('MX amount or currency cannot be compared');
            } else {
                const amount = cents(row.amount);
                if (amount !== cents(booking.total)) issues.add('MX amount differs from the Wrike PO total');
                if (amount < cents(booking.plan)) issues.add('Media plan exceeds the MX amount');
            }
        }
        return { matches, alternateReference, status: issues.size ? 'review' : 'checked', issues: [...issues] };
    }

    globalThis.abwPoVerdict = { compare };
})();
