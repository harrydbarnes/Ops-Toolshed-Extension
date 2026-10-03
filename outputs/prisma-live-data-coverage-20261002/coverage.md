# Prisma live data coverage due diligence — 2 October 2026

## Conclusion
Use the existing Social Booking Checker with an additional live Prisma input, not a separate replacement tool. Live monthly campaign data is demonstrably available without a CSV/report download. Full parity with the reporting dataset is not yet established.

## Evidence
Inspected real signed-in Prisma UI requests in an isolated browser tab. Original user tabs and bookings were not changed. No report was downloaded, no spend was entered and no finance/traffic action was taken. Network observation was disabled afterwards.

1. CP38Q29 (February 2026): Prisma's Actualise UI issued a successful HTTP 200 PUT to `/campaign-service/secure/campaign/2903994/queryservice/mediaplan/hybrid/actualize` with type `prismaDetailActualizeReconcile`, entity `RadiaLineItem`, month filter `2026-02` and onMediaPlan=true.
2. Returned P3D1BVN, placement id 112657913: payablePlannedCost=8232.95, payableActualCost=8232.95, payableThirdPartyCost=8232.95, supplierCurrencyCode=GBP, month=2026-02. The same id/placement appears in Buy data. Its Meta campaign ID was blank, so no exact Meta campaign comparison should be manufactured.
3. CP3H7VM (Healthy Skin): successful Buy query returned placement id 117155903 with exact string Meta campaign id 120250834930630153. Parent package id 117155902 carries accountCode=1508709486289326, providerTypeId=3. Account inheritance must be retained when joining.
4. Actualise queries for June, September and July returned the same placement id 117155903, placement number P3JRGLM, explicit month and monthly financial values. September actual cost was absent, not a verified zero. July payablePlannedCost=0 and payableActualCost=0, while plannedAtActualization=17139.37. This proves that choosing a superficially plausible planned-cost field could yield the wrong reporting basis; historical/current/order values need explicit mapping.
5. The existing checker parser requires exact account ID, campaign ID, Period and PLANNED_AMOUNT/Gross Amount. Its standard template also includes currency, placement/buy identity, client/product/owner and order/integration/delivery/flight/period statuses. Optional financial columns include ORDER_AMOUNT, INTEGRATED_SPEND, NON_INTEGRATED_SPEND and OPPORTUNITY.
6. Checked the actual header of the previously supplied PlacementDetailTable (11).csv: those financial and workflow columns are present, alongside Campaign public ID. Neither inspected placement appeared in that CSV, so it cannot establish same-row financial parity.

## Coverage
| Requirement | Evidence / status |
|---|---|
| Exact Meta campaign/ad-account IDs | Existing live Buy data; validated linked campaign and parent account. Blank links require explicit unavailable state. |
| Month and placement identity | Actualise response includes month, id and placementNumber; joins validated in two campaigns. |
| Monthly planned, actual, third-party figures | Live response confirmed. Reporting definitions are not yet matched. |
| Actualised/reconciled state | Multiple flags returned, including actualizationIsActualizedPercentage, actualizationIsActualized and okToPay. Their semantics differ; do not choose one arbitrarily. |
| Currency | Live supplier/budget currency fields available; financial basis must be selected consistently. |
| Full report status set and owner/client/product | Not all mapped or verified in this investigation. |
| Report ORDER_AMOUNT / INTEGRATED_SPEND / NON_INTEGRATED_SPEND / OPPORTUNITY | Similar live financial fields exist, but equivalence not proved. Keep unavailable distinct from zero. |
| All Prisma campaigns sharing a Meta campaign | Existing campaign reader scopes one CP. Complete client/account population discovery is not proved. Visited campaigns alone cannot prove completeness. |
| Session-independent scheduled service | Not provided by this local extension; requires signed-in Prisma access, Chrome running and valid Meta access. |

## Recommendation
1. Add “Use current Prisma campaign” to Social Booking Checker as a scoped live data source; preserve CSV uploads for broader/cross-campaign coverage.
2. Before enabling report-equivalent checks, compare live fields against a report for the same placements/month. Include amended/cancelled lines, zero and missing actuals, fees/currency, shared Meta IDs, package parents and order differences. Do not apportion a whole-flight cost by days as a substitute for a real monthly figure.
3. Reuse the same comparison engine, label live scope and unavailable fields, and retain exact IDs as strings.
4. Establish a complete cross-campaign discovery query before offering a client-wide result; only then consider scheduled broader comparisons.

This is an internal Prisma UI query, not a documented public API contract. Its availability is verified now in the signed-in account; robust implementation must detect schema/session/permission failures.