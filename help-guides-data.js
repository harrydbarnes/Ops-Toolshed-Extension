(function() {
    // Replace each test URL with the direct SharePoint PDF URL. Direct file URLs
    // are more likely to embed successfully than SharePoint preview-page URLs.
    const TEST_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

    window.HELP_GUIDES = [
        { id: 'access-getting-started', title: 'Getting Started User Information and Client Access', category: 'Access', tags: ['getting started', 'user information', 'onboarding', 'client access'], url: TEST_PDF_URL },
        { id: 'access-client', title: 'Client Access', category: 'Access', tags: ['client', 'permissions', 'login', 'access'], url: TEST_PDF_URL },
        { id: 'access-support', title: 'Support', category: 'Access', tags: ['support', 'help', 'contact', 'access'], url: TEST_PDF_URL },

        { id: 'approval-budget', title: 'Budget Approval', category: 'Approval', tags: ['budget', 'approval', 'authorisation', 'sign off'], url: TEST_PDF_URL },

        { id: 'booking-suppliers', title: 'Suppliers', category: 'Booking', tags: ['supplier', 'booking', 'provider', 'vendor'], url: TEST_PDF_URL },
        { id: 'booking-categories', title: 'Booking Categories', category: 'Booking', tags: ['category', 'booking', 'setup', 'classification'], url: TEST_PDF_URL },
        { id: 'booking-provider-mapping', title: 'Provider (ClientProduct) Mapping', category: 'Booking', tags: ['provider', 'client product', 'mapping', 'booking'], url: TEST_PDF_URL },
        { id: 'booking-custom-fee', title: 'Custom Fee Setup', category: 'Booking', tags: ['custom fee', 'setup', 'cost', 'booking'], url: TEST_PDF_URL },
        { id: 'booking-discrepancy', title: 'Discrepancy Guide', category: 'Booking', tags: ['discrepancy', 'troubleshooting', 'variance', 'booking'], url: TEST_PDF_URL },
        { id: 'booking-unlock-mx', title: 'Unlocking Booking Request - MX Media Explorer', category: 'Booking', tags: ['unlock', 'request', 'media explorer', 'mx'], url: TEST_PDF_URL },
        { id: 'booking-google-youtube-reservation', title: 'Google DST YouTube Via Reservation', category: 'Booking', tags: ['google', 'dst', 'youtube', 'reservation'], url: TEST_PDF_URL },
        { id: 'booking-google-display-ads', title: 'Google DST Display Via Google Ads', category: 'Booking', tags: ['google', 'dst', 'display', 'google ads'], url: TEST_PDF_URL },
        { id: 'booking-google-search-ads', title: 'Google DST Search Via Google Ads', category: 'Booking', tags: ['google', 'dst', 'search', 'google ads'], url: TEST_PDF_URL },
        { id: 'booking-google-ads', title: 'Google DST Via Google Ads', category: 'Booking', tags: ['google', 'dst', 'google ads', 'booking'], url: TEST_PDF_URL },
        { id: 'booking-google-reporting', title: 'Google DST Reporting Guide', category: 'Booking', tags: ['google', 'dst', 'reporting', 'delivery'], url: TEST_PDF_URL },

        { id: 'reconcile-cost-refresh', title: 'Prisma Cost Refresh', category: 'Reconcile', tags: ['prisma', 'cost', 'refresh', 'reconcile'], url: TEST_PDF_URL },

        { id: 'supplier-facebook-faq', title: 'Facebook Integration - FAQs, Support and Mapping', category: 'Supplier Integrations', tags: ['facebook', 'faq', 'support', 'mapping'], url: TEST_PDF_URL },
        { id: 'supplier-facebook-workflow-1', title: 'Facebook Integration Workflow 1', category: 'Supplier Integrations', tags: ['facebook', 'integration', 'workflow', 'step 1'], url: TEST_PDF_URL },
        { id: 'supplier-facebook-workflow-2', title: 'Facebook Integration Workflow 2', category: 'Supplier Integrations', tags: ['facebook', 'integration', 'workflow', 'step 2'], url: TEST_PDF_URL },
        { id: 'supplier-facebook-amendments', title: 'Facebook Integration - Amendments & Cancellation', category: 'Supplier Integrations', tags: ['facebook', 'amendment', 'cancellation', 'integration'], url: TEST_PDF_URL },

        { id: 'traffic-supplier-mappings', title: 'Supplier Mappings', category: 'Traffic', tags: ['supplier', 'mapping', 'traffic', 'trafficking'], url: TEST_PDF_URL }
    ];
})();
