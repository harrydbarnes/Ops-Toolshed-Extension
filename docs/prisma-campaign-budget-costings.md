# Prisma campaign budget and costing notes

This document records the costing behaviour observed while designing the
**Max Campaign Budget** feature. It is an implementation aid, not a replacement
for Mediaocean's financial rules.

## Purpose

The campaign budget widget compares:

- the campaign **budget**, using the widget's stated budget type; and
- the current **buy total**, described by Prisma as the billable amount.

For the campaigns examined, the relevant budget type was **Total client cost**.
The feature therefore needs to change a booking value until the resulting
Total client cost equals the campaign budget. Matching Gross payable or Payable
alone is not sufficient.

One observed example showed:

| Budget widget value | Amount |
| --- | ---: |
| Total client cost budget | £8,384.00 |
| Buy total (billable amount) | £8,376.32 |
| Remaining budget | £7.68 |
| Percentage used | 99.91% |

## Booking hierarchy and aggregation

The Buy grid contains several levels of totals:

1. **Media total**
2. Root sections such as **Display** and **Fee**
3. **Supplier** headers
4. **Packages**
5. Individual **placements**

The important aggregation observations are:

- Display and Fee are root section totals. Their Total client cost values add
  up to the buy total shown in the budget widget.
- Supplier headers total the relevant bookings beneath that supplier.
- Packages carry their own relevant costs and total their child bookings.
- A placement outside a package carries its own costs directly.
- Parent totals and their descendants must not both be summed. Doing so would
  double-count the same booking value.
- Media total is the overall grid total and should agree with the combined
  root sections when the grid has finished recalculating.

The implementation currently uses the root section Total client cost rows when
available. These are the `placementName-*` rows marked as table totals, paired
with `budgetTotalClientCostBillable-*`. This provides a current grid total while
avoiding package, supplier and placement double-counting.

## Costing fields

The relevant grid fields observed were:

| Field | Meaning for this feature |
| --- | --- |
| Gross payable / Cost | The pre-discount supplier-side amount being edited in Buy, or for the active month in Actualise. |
| Discount % | The percentage removed from the applicable gross basis. |
| Payable discount | The supplier-side discount amount. |
| Payable | The post-discount supplier-side amount. |
| Commission | A campaign or booking charge that may affect the billable result. |
| Billable discount | The client-side discount amount. It can differ from Payable discount. |
| ASBOF | A levy that is sometimes zero but can contribute on applicable bookings. |
| Origin Billable | An additional billable amount that is sometimes zero but can contribute on applicable bookings. |
| Total client cost | The final billable value that contributes to the campaign buy total. |

## Observed arithmetic

At the simple package level, the visible figures behaved as follows. The Gross
payable was reconstructed from the 15% rate and £23,100.00 Payable discount
because the left edge of that value was cropped in the captured view:

```text
Gross payable       £154,000.00
Discount                  15.00%
Payable discount      £23,100.00
Payable              £130,900.00
Billable discount     £23,100.00
Total client cost    £130,900.00
```

This supports the straightforward supplier-side relationship:

```text
Payable discount = Gross payable × Discount %
Payable          = Gross payable - Payable discount
```

At an aggregate Display/Supplier level, the visible values included the
following. Here too, Gross payable was reconstructed from the 15% rate and
£56,100.00 Payable discount:

```text
Gross payable       £374,000.00
Payable discount      £56,100.00
Payable              £317,900.00
Billable discount     £60,905.80
Total client cost    £345,132.87
```

The 15% supplier discount still explains the payable values:

```text
£374,000.00 × 15% = £56,100.00
£374,000.00 - £56,100.00 = £317,900.00
```

However, Billable discount and Total client cost do not follow directly from
that supplier-side Payable value. This demonstrates that client-side bases,
discounts, commission, ASBOF, Origin and other linked booking costs can make the
billable result diverge from the payable calculation.

Consequently, these notes deliberately do not define one universal formula such
as:

```text
Total client cost = Payable + Commission + ASBOF + Origin
```

That formula is not supported by all of the observed figures.

## Max Campaign Budget calculation strategy

Prisma remains the authority for the financial calculation. The feature:

1. Reads the exact budget and budget type from the native budget popover when
   it is already available.
2. When the popover is closed, validates a whole-pound budget reconstructed
   from the collapsed budget label, the live progress percentage and the exact
   Total client cost grid total. This removes any manual-hover requirement
   without treating a rounded `k`/`m` label as exact on its own.
3. Reads the current Total client cost buy total.
4. Applies a probe change of no more than £1.00 to the selected editable cell.
5. Waits for Prisma to recalculate the billable buy total.
6. Measures:

   ```text
   billable response rate =
       change in Total client cost / change in selected Gross payable or Cost
   ```

7. Solves for the selected value that should consume the remaining budget.
8. Lets Prisma recalculate again and corrects for rounding to the penny.
9. Reduces the selected value by pennies if necessary so it never knowingly
   leaves the campaign over budget.

Measuring the live response means the calculation naturally includes the
booking's applicable discount, commission, ASBOF, Origin, supplier fees, package
costs and linked placements without duplicating Mediaocean's internal formulas.

Some dual-cost bookings accept a new Cost but do not refresh Gross billable or
Total client cost until Prisma saves/recalculates the booking. The feature does
not guess across a multi-booking campaign in that situation. A narrower fallback
is allowed only when:

- the selected placement is the campaign's entire current billable total;
- its current Cost equals its current Gross billable; and
- Client cost, Commission, ASBOF and Origin add back to its current Total client
  cost.

For that single-booking case, the feature projects each current billable
component proportionally, respecting penny rounding, finds the highest Cost
whose projected total does not exceed the budget, and labels the result as
projected until Prisma saves/recalculates it.

The feature changes the visible cell but does **not** save the Buy or Actualise
changes. The user must review and save in Prisma.

## Buy and Actualise behaviour

### Buy

- The target is an editable `plannedCost-*` Cost cell.
- Read-only group, supplier and total rows are not valid targets.
- The resulting campaign total is compared using Total client cost.

### Actualise

- The target is an editable `payableActualCost<Month>-*` Gross payable cell for
  the active month.
- Planned, read-only and total cells are not valid targets.
- Prisma must expose and recalculate the same campaign-level billable total for
  the live-response approach to work safely.

## Safety and validation rules

- Only operate when the budget type is **Total client cost**.
- Stop when the campaign is already at or over budget.
- Stop if the selected cell does not produce a positive, measurable change in
  the billable total.
- Restore the original value when a probe or solve step fails, where Prisma
  still permits the cell to be edited.
- Report any failure to restore so the user knows to review the cell.
- Never infer the campaign total by summing every visible total row.
- Never automatically save the resulting value.

## Remaining live-validation cases

The following should be rechecked against populated demo campaigns as examples
become available:

- a standalone placement with no package;
- a package with several child placements;
- non-zero commission;
- non-zero ASBOF;
- non-zero Origin Billable;
- a campaign containing both Display and Fee sections;
- an Actualise month with an editable Gross payable value;
- rounding cases where a one-penny Gross payable change has no visible billable
  effect.
