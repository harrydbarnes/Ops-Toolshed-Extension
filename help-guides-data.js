(function() {
    // Replace each test URL with the direct SharePoint PDF URL. Direct file URLs
    // are more likely to embed successfully than SharePoint preview-page URLs.
    const TEST_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

    window.HELP_GUIDES = [
        { id: 'booking-create', title: 'Creating a new booking', category: 'Booking', tags: ['campaign', 'setup', 'new booking', 'prisma'], url: TEST_PDF_URL },
        { id: 'booking-amend', title: 'Amending a live booking', category: 'Booking', tags: ['edit', 'change', 'live', 'approval'], url: TEST_PDF_URL },
        { id: 'booking-cancel', title: 'Cancelling placements safely', category: 'Booking', tags: ['cancel', 'placement', 'status', 'close'], url: TEST_PDF_URL },
        { id: 'recon-month-end', title: 'Month-end reconciliation', category: 'Reconciliation', tags: ['month end', 'finance', 'actuals', 'checklist'], url: TEST_PDF_URL },
        { id: 'recon-variance', title: 'Investigating spend variances', category: 'Reconciliation', tags: ['variance', 'overspend', 'underspend', 'billing'], url: TEST_PDF_URL },
        { id: 'recon-finalise', title: 'Finalising reconciled activity', category: 'Reconciliation', tags: ['complete', 'sign off', 'actualise', 'close'], url: TEST_PDF_URL },
        { id: 'dst-upload', title: 'Uploading a DST', category: 'DST', tags: ['upload', 'template', 'delivery', 'spreadsheet'], url: TEST_PDF_URL },
        { id: 'dst-errors', title: 'Resolving common DST errors', category: 'DST', tags: ['troubleshooting', 'validation', 'error', 'fix'], url: TEST_PDF_URL },
        { id: 'meta-export', title: 'Exporting delivery from Meta', category: 'Meta', tags: ['facebook', 'export', 'delivery', 'ads manager'], url: TEST_PDF_URL },
        { id: 'meta-match', title: 'Matching Meta activity to Prisma', category: 'Meta', tags: ['campaign id', 'partner line', 'social', 'reconciliation'], url: TEST_PDF_URL },
        { id: 'supplier-add', title: 'Adding a new supplier', category: 'Supplier', tags: ['vendor', 'setup', 'create', 'onboarding'], url: TEST_PDF_URL },
        { id: 'supplier-query', title: 'Resolving supplier invoice queries', category: 'Supplier', tags: ['invoice', 'billing', 'query', 'finance'], url: TEST_PDF_URL }
    ];
})();
