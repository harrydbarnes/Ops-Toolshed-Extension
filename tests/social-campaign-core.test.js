const { extractBookings, groupBookings, compare, deliveryReview, candidateEvidence } = require('../social-campaign-core');
const fields = values => Object.entries(values).map(([id,value])=>({id,value}));
const booking = (overrides={}) => ({ placementId:'1',placementNumber:'P1',campaignId:'99',accountId:'88',currency:'GBP',budget:100,start:'2026-06-01',end:'2026-06-30',packageBudget:100,packageId:'package',...overrides });
const snapshot = (overrides={})=>({campaign:{id:'99',account_id:'88',lifetime_budget:'10000'},account:{id:'act_88',currency:'GBP',timezone_name:'Europe/London'},adSets:[{id:'2',start_time:'2026-06-01T00:00:00+0100',end_time:'2026-06-30T23:59:59+0100'}],dailySpend:[],...overrides});
const run = (bookings,meta=snapshot(),links=['P1'],previous)=>compare(groupBookings(bookings)[0],meta,links,previous);
describe('Live Prisma and Meta campaign comparisons',()=>{
    test('no-delivery review describes evidence without claiming replacement or cancellation',()=>{
        const result=run([booking()]);
        const review=deliveryReview(result,{status:'PAUSED'},new Date('2026-06-10T12:00:00Z'));
        expect(review.message).toContain('paused');expect(review.message).toContain('reason is not confirmed');
        expect(deliveryReview({...result,totalSpend:1},{},new Date('2026-06-10'))).toBeNull();
        expect(deliveryReview(result,{},new Date('2026-05-31'))).toBeNull();
        expect(deliveryReview(result,{},new Date('2026-06-02'))).toBeNull();
        expect(deliveryReview({...result,metaRanges:[{start:'2026-07-01',end:'2026-07-31'}]}, {},new Date('2026-06-10'))).toBeNull();
    });
    test('candidate matching requires exact name or explicit source relationship within the same account',()=>{
        const linked={id:'99',account_id:'88',name:'Brand PO:420'};
        expect(candidateEvidence(linked,{id:'100',account_id:'88',name:'Brand PO:420'})).toContain('not confirmed');
        expect(candidateEvidence(linked,{id:'101',account_id:'88',source_campaign_id:'99',name:'Renamed'})).toContain('source_campaign_id');
        expect(candidateEvidence(linked,{id:'100',account_id:'77',name:linked.name})).toBeNull();
        expect(candidateEvidence(linked,{id:'100',account_id:'88',name:'Another Brand PO:420'})).toBeNull();
        expect(candidateEvidence(linked,{...linked})).toBeNull();
    });
    test('reads hidden IDs and inherited accounts, without adding package totals or fees to net bookings',()=>{
        const result=extractBookings({total:3,nodes:[{fields:fields({id:'10',providerTypeId:'3',accountCode:'88',adserverInstanceId:'123',programmaticPackageBudget:'150',placementCurrencyCode:'GBP'}),nodes:[{fields:fields({id:'1',placementType:'1',placementNumber:'P1',campaignIdOnExternalProvider:'99',accountCode:'',supplierCost:'125',budgetPayableAmount:'100',flightStart:'2026-06-01',flightEnd:'2026-06-30'})}]},{fields:fields({id:'3',providerTypeId:'3',placementType:'2',supplierCost:'20',campaignIdOnExternalProvider:'99'})}]});
        expect(result.bookings).toHaveLength(1);expect(result.bookings[0]).toMatchObject({accountId:'88',providerId:'123',budget:100,packageBudget:150,campaignId:'99'});expect(result.unmatched).toEqual([]);
    });
    test('rejects a truncated Prisma response instead of treating it as complete',()=>{expect(()=>extractBookings({total:5,nodes:[]})).toThrow(/partial/);});
    test('keeps unlinked Meta media as an incomplete check',()=>{expect(extractBookings({total:1,nodes:[{fields:fields({id:'1',providerTypeId:'3',placementType:'1'})}]}).unmatched).toHaveLength(1);});
    test('detects spend before, after and in gaps between booking flights',()=>{
        const dailySpend=['2026-05-31','2026-06-05','2026-06-15','2026-07-01'].map(date=>({date_start:date,date_stop:date,spend:'5'}));
        const result=run([booking({end:'2026-06-10'}),booking({placementId:'2',placementNumber:'P2',start:'2026-06-20',budget:0})],snapshot({dailySpend}),['P1','P2']);
        expect(result.outsideSpend).toBe(15);expect(result.totalSpend).toBe(20);expect(result.findings).toContain('Meta flight extends outside booked dates or crosses a gap between bookings.');
    });
    test.each(['15000','5000'])('flags both directions of lifetime budget variance (%s)',value=>{expect(run([booking()],snapshot({campaign:{id:'99',account_id:'88',lifetime_budget:value}})).findings.join(' ')).toMatch(/higher|lower/);});
    const scheduledBookings = () => [booking({budget:100,integration:{control:'replace_budget',trafficked:true}}),booking({placementId:'2',placementNumber:'P2',start:'2026-07-01',end:'2026-07-31',budget:50,integration:{control:'increment_budget',trafficked:false}})];
    test('compares against trafficked costs and forecasts an unapplied increment without a false lower-budget alert',()=>{
        const result=run(scheduledBookings(),snapshot(),['P1','P2']);
        expect(result.budget).toBe(150);expect(result.metaComparisonBudget).toBe(100);
        expect(result.upweightPlan.pending[0]).toMatchObject({amount:50,projectedBudget:150,expectedBudget:150,risk:false});
        expect(result.findings.join(' ')).not.toMatch(/higher|lower|duplicate upweight/);
    });
    test('flags a possible double increment when Meta already includes the pending budget',()=>{
        const result=run(scheduledBookings(),snapshot({campaign:{id:'99',account_id:'88',lifetime_budget:'15000'}}),['P1','P2']);
        expect(result.upweightPlan.pending[0]).toMatchObject({projectedBudget:200,expectedBudget:150,risk:true});
        expect(result.findings.join(' ')).toContain('Possible duplicate upweight');
    });
    test('does not forecast replacement updates, unknown traffic state, daily budgets or incomplete linked coverage',()=>{
        const bookings=scheduledBookings();
        expect(run(bookings,snapshot({campaign:{id:'99',account_id:'88'},adSets:[{id:'a',lifetime_budget:'10000',start_time:'2026-06-01',end_time:'2026-06-30'}]}),['P1','P2']).upweightPlan).toBeNull();
        expect(run(bookings,snapshot(),['P1']).upweightPlan).toBeNull();
        expect(run(bookings,snapshot({campaign:{id:'99',account_id:'88',daily_budget:'500'}}),['P1','P2']).upweightPlan).toBeNull();
        expect(run([bookings[0],{...bookings[1],integration:{control:'replace_budget',trafficked:false}}],snapshot(),['P1','P2']).upweightPlan).toBeNull();
        expect(run([bookings[0],{...bookings[1],integration:undefined}],snapshot(),['P1','P2']).upweightPlan).toBeNull();
    });
    test.each(['15000','5000'])('persists a possible unreflected Meta budget change until Prisma changes (%s)',value=>{
        const first=run([booking()],snapshot());
        const changed=snapshot({campaign:{id:'99',account_id:'88',lifetime_budget:value}});
        const result=run([booking()],changed,['P1'],first);
        expect(result.changeReview.messages[0]).toContain('Possible Meta budget change not reflected in Prisma');
        expect(result.changeReview.messages[0]).toContain('£100.00 →');
        expect(run([booking()],changed,['P1'],result).changeReview).toEqual(result.changeReview);
        expect(run([booking({budget:Number(value)/100})],changed,['P1'],result).changeReview).toBeNull();
    });
    test('does not infer an unreflected change from a first check, changed Prisma budget or currency mismatch',()=>{
        const changed=snapshot({campaign:{id:'99',account_id:'88',lifetime_budget:'15000'}}),first=run([booking()],snapshot());
        expect(run([booking()],changed).changeReview).toBeNull();
        expect(run([booking({budget:150})],changed,['P1'],first).changeReview).toBeNull();
        expect(run([booking()],{...changed,account:{id:'88',currency:'USD',timezone_name:'Europe/London'}},['P1'],first).changeReview).toBeNull();
    });
    test('shows inside-flight Meta date changes as information with previous and current dates',()=>{
        const first=run([booking()],snapshot());
        const result=run([booking()],snapshot({adSets:[{id:'a',start_time:'2026-06-05',end_time:'2026-06-25'}]}),['P1'],first);
        expect(result.changeReview.messages[0]).toContain('2026-06-01 to 2026-06-30 → 2026-06-05 to 2026-06-25');
        expect(result.notes.join(' ')).toContain('Prisma booking dates are unchanged');
        expect(result.findings.join(' ')).not.toContain('Prisma booking dates are unchanged');
    });
    test('does not compare a daily budget to a flight total; still detects configuration changes',()=>{
        const original=snapshot({campaign:{id:'99',account_id:'88',daily_budget:'500'}}),first=run([booking()],original);
        const result=run([booking()],snapshot({campaign:{...original.campaign,daily_budget:'300'}}),['P1'],first);
        expect(result.metaBudget).toBeNull();expect(result.dailyBudgets).toEqual([3]);expect(result.findings.join(' ')).toMatch(/changed since/);expect(result.findings.join(' ')).not.toMatch(/higher|lower/);
        expect(result.lastChange.previousDailyBudgets).toEqual([5]);
        const unchanged=run([booking()],snapshot({campaign:{...original.campaign,daily_budget:'300'}}),['P1'],result);
        expect(unchanged.lastChange).toEqual(result.lastChange);
    });
    test('currency mismatches suppress monetary variance and preserve currency provenance',()=>{
        const result=run([booking()],snapshot({account:{id:'88',currency:'USD'},campaign:{id:'99',account_id:'88',lifetime_budget:'20000'}}));
        expect(result.metaBudget).toBeNull();expect(result.prismaCurrency).toBe('GBP');expect(result.warnings.join(' ')).toMatch(/Currency mismatch/);
    });
    test('requires exact linked placement coverage and validates returned account identities',()=>{
        expect(run([booking()],snapshot(),['P1','OTHER']).coverage).toBe(false);
        expect(()=>run([booking()],snapshot({campaign:{id:'99',account_id:'different'}}))).toThrow(/different/);
    });
    test('aggregates homogeneous ad-set lifetime budgets and flags open-ended dates',()=>{
        const result=run([booking()],snapshot({campaign:{id:'99',account_id:'88'},adSets:[{id:'a',lifetime_budget:'4000',start_time:'2026-06-01'},{id:'b',lifetime_budget:'6000',start_time:'2026-06-01',end_time:'2026-06-30'}]}));
        expect(result.metaBudget).toBe(100);expect(result.findings.join(' ')).toMatch(/open-ended/);
    });
    test('compares Meta timestamps in the account timezone rather than slicing UTC dates',()=>{
        const result=run([booking()],snapshot({adSets:[{id:'a',start_time:'2026-05-31T23:00:00+0000',end_time:'2026-06-30T22:59:59+0000'}]}));
        expect(result.metaRanges).toEqual([{start:'2026-06-01',end:'2026-06-30'}]);expect(result.findings).toEqual([]);
    });
    test('a hidden integration value does not override the independently booked net media comparison',()=>{
        const result=run([booking({budget:20})],snapshot({dailySpend:[{date_start:'2026-06-15',date_stop:'2026-06-15',spend:'80'}]}));
        expect(result.comparisonBasis).toBe('Prisma allocated net media');expect(result.notes.join(' ')).toMatch(/soft limit/);
        expect(result.findings.join(' ')).toMatch(/higher/);expect(result.findings.join(' ')).toMatch(/exceeds/);
    });
    test('does not assign a shared package total to each Meta campaign',()=>{
        const groups=groupBookings([booking(),booking({placementId:'2',placementNumber:'P2',campaignId:'other'})]);
        const result=compare(groups[0],snapshot(),['P1']);expect(result.comparisonBasis).toBe('Prisma allocated net media');
    });
    test('a higher package soft limit is informational when Meta matches the summed placement costs',()=>{
        const result=run([booking({budget:40,packageBudget:20000}),booking({placementId:'2',placementNumber:'P2',budget:60,packageBudget:20000})],snapshot(),['P1','P2']);
        expect(result.budget).toBe(100);expect(result.packageBudget).toBe(20000);expect(result.metaBudget).toBe(100);
        expect(result.findings).toEqual([]);expect(result.warnings).toEqual([]);expect(result.notes.join(' ')).toContain('Package budget is a soft limit.');
    });
    test('matching the package soft limit never hides a Meta mismatch against the placement cost',()=>{
        const result=run([booking({budget:100,packageBudget:200})],snapshot({campaign:{id:'99',account_id:'88',lifetime_budget:'20000'}}));
        expect(result.findings).toContain('Meta lifetime budget is higher than booked net media.');
    });
    test('explains both date ranges and directional differences in the finding itself',()=>{
        const result=run([booking({end:'2026-09-30'})],snapshot({adSets:[{id:'a',start_time:'2026-07-07',end_time:'2026-09-13'}]}));
        const finding=result.notes.find(value=>value.startsWith('Flight dates differ'));
        expect(finding).toContain('Prisma 1 Jun 2026 to 30 Sept 2026');expect(finding).toContain('Meta 7 Jul 2026 to 13 Sept 2026');expect(finding).toContain('starts 36 days later and ends 17 days earlier');
        expect(result.findings).toEqual([]);
    });
});
