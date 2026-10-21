// Full query shape verified against the live Prisma Actualise grid.
export function buildReccieQuery(month) {
    const visible = `supplierGroupKey placementName placementNumber flightStart flightEnd placementType plannedCost billableCost unitAmount originalCost variance payableActualCost payableActualUnits actualizationIsActualizedPercentage payablePlannedCost payablePlannedUnits payablePlannedRate okToPay payableSupplierCost payableSupplierUnits payableThirdPartyCost payableThirdPartyUnits thirdPartyAdserverInstanceId invoiceAmount invoiceInfo buyDetailNSubKey poReference buyPayable buyBillable supplierTotalClientCost buyInfo buyStatus errorMessage buySerialNumber lateBuyReason`.split(' ');
    const hidden = `id id version packageType feeCalculationTypeId packageId parentLineItemId mediaType clientCode productCode estimateCode buySubKey buyCommissionable supplier supplierCode addMarkUp costMethod unitType month isFeeDescUsed actualMonthlyBuyId flightPeriodKey monthRemovalStatus actualMonthlyBuyVersion supplierCurrencyCode budgetCurrencyCode costingKpi isHiatus hasPrismaInvoice actualizationMonthlyBuyActualUnits isInvoiceSeller numLinkedInvoices mainInvoiceId isActualizedAndVarianceDistributed invoiceMode auditedToZeroStatus isAutoReconcile monthlyCostEditable hasInvoiceMessages isCostAdjusted isMultiJurisdictionFee unitVariance monthlyBuyId monthlyBuyVersion payableSource placementPayableRateOverridden invoiceLocked actualizationIsActualized actualizationMonthlyBuyActual actualizationMonthlyBuyActualUnits buyerComment incentiveBuy buyLock lockMessage invoiceId invoiceNumber invoiceType invoiceLineItemAmount monthlyBuyPONumberVersion campaignBuyDetailId isLateBuy buyLevel buyPayableChanged buyPlacementPayable buyPlacementBillable actualizationFormulaExpression capCost actualizationFormulaName calculatedCost plannedAtActualization originalUnitAmount taxAmount calculatedUnits unactualizedAmount programmaticPackageBudget`.split(' ');
    const explicitVisible = new Set(`placementNumber flightStart flightEnd actualizationIsActualizedPercentage okToPay invoiceAmount invoiceInfo poReference buyPayable buyBillable supplierTotalClientCost buyInfo buyStatus errorMessage buySerialNumber lateBuyReason`.split(' '));
    const notSummable = new Set(`placementNumber flightStart flightEnd buyDetailNSubKey poReference buyPayable buyBillable supplierTotalClientCost buyInfo buyStatus errorMessage buySerialNumber lateBuyReason isHiatus hasPrismaInvoice actualizationMonthlyBuyActualUnits isInvoiceSeller incentiveBuy buyLock lockMessage monthlyBuyPONumberVersion campaignBuyDetailId isLateBuy buyLevel buyPayableChanged buyPlacementPayable buyPlacementBillable`.split(' '));
    const fields = [
      ...visible.map(id => ({ id, ...(explicitVisible.has(id) ? { hidden: false } : {}), ...(notSummable.has(id) ? { summable: false } : {}) })),
      ...hidden.map(id => ({ id, hidden: true, ...(notSummable.has(id) ? { summable: false } : {}) }))
    ];
    const query = {
      type: 'prismaDetailActualizeReconcile',
      filter: { op: 'and', filters: [{ op: 'and', fields: [
        { op: 'eq', id: 'onMediaPlan', value: 'true' },
        { id: 'month', value: month, displayValue: month, op: 'eq' }
      ], alwaysApplied: true }] },
      entity: 'RadiaLineItem',
      sort: [{ id: 'supplier', dir: 'asc' }, { id: 'invoiceId', dir: 'asc' }, { id: 'placementName', dir: 'asc' }],
      fields, filterByThisfeeOrderId: null, start: 0, end: 0
    };
    return query;
}
