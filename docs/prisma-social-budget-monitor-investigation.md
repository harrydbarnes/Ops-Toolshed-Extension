# Automatic Prisma and Meta budget comparison investigation

Investigated on 29 September 2026 using the existing signed-in Prisma Chrome
session. This records observed behaviour and a proposed implementation; it does
not describe a shipped monitoring feature.

## Live findings

- The programmatic line editor's Link existing campaign selector and the media
  grid's External entity ID column showed the same Meta campaign ID.
- After a normal campaign reload, the grid no longer displayed External entity
  ID, but its structured response still supplied the linked ID. Users therefore
  do not need to add that column for response-based capture on this tested path.
- The response field is `campaignIdOnExternalProvider`, labelled External entity
  ID in field metadata. The metadata marked it hidden, while the placement data
  still contained the value.
- The response also supplied `plannedCost`, whose value matched the displayed
  Facebook media cost of GBP 8,165.21. The campaign header budget was a different
  amount and fee lines were separate. Parent and child rows must not be summed
  indiscriminately.
- Opening Details caused a delayed campaign lookup. Its campaign list response
  contained `campaignName`, `campaignId`, `spendCap`, `status`, `placementIds`,
  `buyingType`, `objective`, and `bidStrategy`. Availability of these fields does
  not establish their freshness, currency conversion, or budget semantics.
- An account/campaign-specific GET request returned linked placement references.
  A placement reference is not necessarily the numeric placement ID used in a
  request URL; an implementation must preserve and distinguish both.

## Observed request shapes

The normal grid load used:

```text
PUT https://go.mediaocean.com/campaign-service/secure/campaign/{numericCampaignId}/queryservice/mediaplan/hybrid/rc
```

The observed query payload included `type: detailedHybrid`, `entity: Placement`,
`fields`, `filter`, `sort`, `start`, `end`, and `filterByThisFeeOrderId`. This was
observed during a normal reload, with no booking save action. PUT is used here
by Prisma's query service; it must not be confused with its booking edit routes.

The separate layout metadata request used:

```text
GET https://go.mediaocean.com/campaign-service/secure/layout/{numericCampaignId}/fieldswithmetadata/mediaplan/rc?gridType=newGrid
```

One request associated with the Details integration used:

```text
GET https://go.mediaocean.com/campaign-service/secure/campaign/{numericCampaignId}/placement/{numericPlacementId}/accounts/{metaAccountId}/campaigns/{metaCampaignId}
```

The exact campaign-list URL and full query payload still need to be captured
for implementation. No cookies, tokens, or complete business-data responses
are recorded in this document.

## Recommended workflow

1. Observe narrowly scoped media-plan responses as users visit campaigns.
   Store only saved placement data needed for comparison, together with agency,
   campaign and placement identity, capture time, and completeness.
2. Discover the external link from `campaignIdOnExternalProvider`. Read and
   validate the Meta account mapping and dates from saved data; do not infer
   them from names. A delayed or failed lookup remains pending or unavailable.
3. Refresh after a confirmed save or booking operation completes, rather than
   treating a click or unsaved form value as persisted booking evidence.
4. Opening Social Booking Checker refreshes remembered campaigns through the
   validated Prisma query and reads current Meta configuration. CSV uploads can
   remain an optional broader-population workflow.
5. Optionally schedule checks using Chrome alarms, following the approval
   feature's session-based pattern. Stop or mark incomplete when Prisma login,
   agency context, Meta credentials, or account permissions are unavailable.
6. Retain successive snapshots on both sides. Show what changed, discrepancy,
   source timestamps, and acknowledgement status. Do not claim that someone
   failed to notify the team without a separate approval/request record.

Campaign History provides a list of visited campaigns, not proof of who booked
them. Default coverage should be stated as remembered/visited campaigns, with
an explicit tracking control for additional campaigns. A newly discovered Meta
campaign is not definitively missing from Prisma unless booking coverage is
complete for the relevant account and period.

## Implementation checks still required

- Replay a captured query from the extension's intended execution context and
  verify current saved values without opening the campaign or Details UI.
- Resolve numeric campaign IDs versus the CP code and preserve agency context.
- Validate Meta account ID, exact flight dates, currency and media-cost basis.
- Handle grouped rows, multiple placements or Prisma campaigns linked to one
  Meta campaign, cancellations/rebooks, fees and monthly allocations.
- Capture the full request field/filter contract and verify pagination; one
  successful grid response does not establish complete campaign coverage.
- Verify the observed hidden-ID behaviour in legacy and new Orders workflows
  and with other layouts. The live proof here is one campaign's Buy media grid.
- Ensure passive response observation follows the existing feature-mode,
  navigation and lifecycle conventions and leaves native requests untouched.
- A daily Meta budget cannot be compared directly with a full-flight booking.
  The existing comparison condition must explicitly validate budget type and
  period before issuing a budget discrepancy.
- The existing approval GET and Actualise response bridge provide architectural
  precedents. Independent background replay of this media-plan query has not
  been tested in this investigation.

## Verification boundary

Verified in live Prisma: hidden-column ID availability, field name, saved cost
field, media-plan request method/path, and the delayed Details lookup behaviour.
Not verified: background replay, automatic tracking implementation, Meta token
access, all-account coverage, or a definitive budget discrepancy for this
campaign. No campaign or booking changes were saved during the inspection.
