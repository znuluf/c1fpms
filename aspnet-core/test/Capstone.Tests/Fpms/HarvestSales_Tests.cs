using Abp.Authorization;
using Abp.UI;
using Capstone.Domain;
using Capstone.Farms;
using Capstone.Harvests;
using Capstone.Logbooks;
using Capstone.Logbooks.Dto;
using Capstone.Production;
using Capstone.Production.Dto;
using Capstone.Sales;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Xunit;

namespace Capstone.Tests.Fpms;

/// <summary>
/// Step E: Partial / Total harvests, grade lines on size grades, not-sold entries, sale lines per grade line with the buyer's
/// accepted kg, payments, due dates and dispatch receipt numbers (AC-14, AC-15; DEC-55, DEC-67, DEC-68).
/// </summary>
public class HarvestSales_Tests : FpmsTestBase
{
    private static DateOnly Today => FarmClock.Today(FarmClock.Resolve(FarmClock.DefaultTimeZone));

    private Guid Grade(string label) => Q(c => c.SizeGrades.IgnoreQueryFilters().Single(g => g.Label == label && g.TenantId == GetTenantId(PilotFarm)).Id);

    private Guid Buyer => Q(c => c.Buyers.IgnoreQueryFilters().First(b => b.Name.StartsWith("GenSan")).Id);

    private SaveHarvestInput Harvest(HarvestType type, decimal kg, params (string Label, decimal Kg)[] grades) => new()
    {
        BatchId = BatchId(CurrentBatch), HarvestedAt = DateTime.UtcNow.AddHours(-2), HarvestType = type, TotalKg = kg, AbwG = 9,
        GradeLines = grades.Select(g => new GradeLineInput { SizeGradeId = Grade(g.Label), Kg = g.Kg }).ToList(),
    };

    // ---------------------------------------------------------------- harvests
    [Fact]
    public async Task Partial_harvest_keeps_the_batch_stocked_and_estimates_pieces_from_abw()
    {
        var harvest = await Resolve<HarvestAppService>().Create(Harvest(HarvestType.Partial, 300, ("100/120", 300)));
        harvest.HarvestedPieces.ShouldBe(33333m); // 300 kg × (1,000 ÷ 9 g ABW)
        harvest.GradeLines.Single().IsUngraded.ShouldBeTrue();
        harvest.GradeLines.Single().Kg.ShouldBe(300m);
        (await Resolve<BatchAppService>().Get(BatchId(CurrentBatch))).Status.ShouldBe(BatchStatus.Stocked);
    }

    [Fact]
    public async Task Ungraded_kg_are_estimated_from_abw_and_a_final_count_wins()
    {
        var harvests = Resolve<HarvestAppService>();
        var mixed = await harvests.Create(Harvest(HarvestType.Partial, 90, ("100/120", 45), (SizeGrade.UngradedLabel, 45)));
        mixed.GradeLines.Single().IsUngraded.ShouldBeTrue();
        mixed.GradeLines.Single().Kg.ShouldBe(90m);
        mixed.HarvestedPieces.ShouldBe(10000m); // all 90 kg use the harvest ABW (1000 ÷ 9 g)
        mixed.UngradedRemainderKg.ShouldBe(0m);
        mixed.Warnings.ShouldNotContain(w => w.Kind == "Grades");

        var counted = Harvest(HarvestType.Partial, 50);
        counted.GradeLines = new();
        counted.FinalCount = 5200;
        (await harvests.Create(counted)).HarvestedPieces.ShouldBe(5200m);
    }

    [Fact]
    public async Task A_farm_that_does_not_grade_keeps_one_ungraded_line_of_the_kg_left_to_sell()
    {
        // DEC-100: no grade lines sent; the harvest keeps one "Ungraded / mixed" line of the total less the not-sold kg.
        SetSizeGrading(false);
        var harvests = Resolve<HarvestAppService>();
        var input = Harvest(HarvestType.Partial, 100);
        input.Disposals = new List<DisposalInput> { new() { Kg = 10, Reason = DisposalReason.StaffOrHomeUse } };
        var harvest = await harvests.Create(input);
        harvest.GradeLines.Count.ShouldBe(1);
        harvest.GradeLines.Single().IsUngraded.ShouldBeTrue();
        harvest.GradeLines.Single().Kg.ShouldBe(90m);
        harvest.Warnings.ShouldNotContain(w => w.Kind == "Grades");

        // Editing the harvest never replaces its existing disposition history.
        var edit = Harvest(HarvestType.Partial, 100);
        edit.Id = harvest.Id;
        edit.Disposals = new List<DisposalInput> { new() { Kg = 25, Reason = DisposalReason.SpoiledOrLost } };
        var corrected = await harvests.Update(edit);
        corrected.NotSoldKg.ShouldBe(10m);
        corrected.GradeLines.Single().Kg.ShouldBe(90m);

        var added = await harvests.RecordDisposal(harvest.Id,
            new DisposalInput { Kg = 25, Reason = DisposalReason.SpoiledOrLost });
        added.NotSoldKg.ShouldBe(35m);
        added.GradeLines.Single().Kg.ShouldBe(90m);

        var history = Q(c => c.HarvestDisposals.IgnoreQueryFilters()
            .Where(d => d.HarvestId == harvest.Id)
            .OrderBy(d => d.CreationTime)
            .Select(d => new { d.Kg, d.IsDeleted, d.CreatorUserId, d.DeleterUserId, d.DeletionTime })
            .ToList());
        history.Count.ShouldBe(2);
        history.ShouldAllBe(d => !d.IsDeleted);
        history[0].Kg.ShouldBe(10m);
        history[0].CreatorUserId.ShouldNotBeNull();
        history[1].Kg.ShouldBe(25m);
        history[1].CreatorUserId.ShouldNotBeNull();

        var suppliedGrade = await harvests.Create(Harvest(HarvestType.Partial, 50, ("100/120", 50)));
        suppliedGrade.GradeLines.Single().IsUngraded.ShouldBeTrue();
        suppliedGrade.GradeLines.Single().Kg.ShouldBe(50m);
    }

    [Fact]
    public async Task Additional_disposition_entries_are_recorded_without_replacing_prior_entries()
    {
        var harvests = Resolve<HarvestAppService>();
        var harvest = await harvests.Create(Harvest(HarvestType.Partial, 100));

        var first = await harvests.RecordDisposal(harvest.Id,
            new DisposalInput { Kg = 10, Reason = DisposalReason.StaffOrHomeUse });
        first.NotSoldKg.ShouldBe(10m);
        first.UnaccountedKg.ShouldBe(90m);

        var second = await harvests.RecordDisposal(harvest.Id,
            new DisposalInput { Kg = 25, Reason = DisposalReason.SpoiledOrLost, Note = "Damaged during handling" });
        second.NotSoldKg.ShouldBe(35m);
        second.UnaccountedKg.ShouldBe(65m);
        second.Disposals.Count.ShouldBe(2);
        second.Disposals.Sum(d => d.Kg).ShouldBe(35m);

        await Should.ThrowAsync<UserFriendlyException>(() => harvests.RecordDisposal(harvest.Id,
            new DisposalInput { Kg = 66, Reason = DisposalReason.GivenAway }));
    }

    [Fact]
    public async Task A_fully_disposed_and_sold_harvest_is_not_offered_for_another_sale()
    {
        SetSizeGrading(false);
        var harvests = Resolve<HarvestAppService>();
        var input = Harvest(HarvestType.Partial, 100);
        input.Disposals = new List<DisposalInput> { new() { Kg = 25, Reason = DisposalReason.StaffOrHomeUse } };
        var harvest = await harvests.Create(input);
        var line = harvest.GradeLines.Single();

        var sales = Resolve<SaleAppService>();
        await sales.Create(new SaveSaleInput
        {
            BuyerId = Buyer,
            SaleDate = Today,
            Lines = new() { new() { HarvestGradeLineId = line.Id, Kg = 75, PricePerKg = 200 } },
        });

        (await sales.GetSellableLines(null)).ShouldNotContain(x => x.HarvestId == harvest.Id);
    }

    [Fact]
    public async Task Total_harvest_marks_the_batch_harvested_and_is_the_last_harvest()
    {
        var harvests = Resolve<HarvestAppService>();
        var total = await harvests.Create(Harvest(HarvestType.Total, 1500, ("50/60", 1500)));
        var batch = await Resolve<BatchAppService>().Get(BatchId(CurrentBatch));
        batch.Status.ShouldBe(BatchStatus.Harvested);
        batch.HasFinalHarvest.ShouldBeTrue();

        // No harvest after the Total harvest; a second Total is rejected.
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Create(Harvest(HarvestType.Partial, 10)));

        // Correcting the Total to Partial returns the batch to Stocked.
        var edit = Harvest(HarvestType.Partial, 1500, ("50/60", 1500));
        edit.Id = total.Id;
        await harvests.Update(edit);
        (await Resolve<BatchAppService>().Get(BatchId(CurrentBatch))).Status.ShouldBe(BatchStatus.Stocked);
    }

    private SaveHarvestInput Emergency(decimal kg, bool? shrimpLeft, EmergencyReason? reason, string note = null, params (string Label, decimal Kg)[] grades)
    {
        var input = Harvest(HarvestType.Emergency, kg, grades);
        input.ShrimpLeft = shrimpLeft;
        input.EmergencyReason = reason;
        input.EmergencyNote = note;
        return input;
    }

    [Fact]
    public async Task Emergency_harvest_needs_an_answer_and_a_reason_and_is_never_a_batch_failure()
    {
        var harvests = Resolve<HarvestAppService>();

        // DEC-140: the pond's state and the reason must be said; "Other" needs a few words.
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Create(Emergency(200, null, EmergencyReason.Weather)));
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Create(Emergency(200, true, null)));
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Create(Emergency(200, true, EmergencyReason.Other)));

        var saved = await harvests.Create(Emergency(200, true, EmergencyReason.PoorWaterConditions, "  Dissolved oxygen crashed before dawn  "));
        saved.HarvestType.ShouldBe(HarvestType.Emergency);
        saved.ShrimpLeft.ShouldBe(true);
        saved.EmergencyReason.ShouldBe(EmergencyReason.PoorWaterConditions);
        saved.EmergencyNote.ShouldBe("Dissolved oxygen crashed before dawn");

        // Shrimp are left, so the batch stays active: not Harvested, not Failed, and no final harvest yet.
        var batch = await Resolve<BatchAppService>().Get(BatchId(CurrentBatch));
        batch.Status.ShouldBe(BatchStatus.Stocked);
        batch.HasFinalHarvest.ShouldBeFalse();
    }

    [Fact]
    public async Task Emergency_harvest_with_no_shrimp_left_ends_the_batch_and_correcting_it_reopens_it()
    {
        var harvests = Resolve<HarvestAppService>();
        var saved = await harvests.Create(Emergency(1500, false, EmergencyReason.DiseaseConcern, null, ("50/60", 1500)));
        var batch = await Resolve<BatchAppService>().Get(BatchId(CurrentBatch));
        batch.Status.ShouldBe(BatchStatus.Harvested);
        batch.HasFinalHarvest.ShouldBeTrue();

        // Nothing can be harvested after it.
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Create(Harvest(HarvestType.Partial, 10)));
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Create(Harvest(HarvestType.Total, 10)));

        // Correcting the answer to "shrimp left" returns the batch to Stocked; correcting it to Partial clears the emergency fields.
        var edit = Emergency(1500, true, EmergencyReason.DiseaseConcern, null, ("50/60", 1500));
        edit.Id = saved.Id;
        await harvests.Update(edit);
        (await Resolve<BatchAppService>().Get(BatchId(CurrentBatch))).Status.ShouldBe(BatchStatus.Stocked);

        var partial = Harvest(HarvestType.Partial, 1500, ("50/60", 1500));
        partial.Id = saved.Id;
        partial.ShrimpLeft = true;
        partial.EmergencyReason = EmergencyReason.Weather;
        var corrected = await harvests.Update(partial);
        corrected.ShrimpLeft.ShouldBeNull();
        corrected.EmergencyReason.ShouldBeNull();
        corrected.EmergencyNote.ShouldBeNull();
    }

    [Fact]
    public async Task Unsold_kilos_get_a_follow_up_day_from_the_farm_setting_that_the_farmer_can_move()
    {
        // DEC-140: the farm's follow-up period is a setting; a new request reads the saved value.
        var settings = Resolve<FarmSettingsAppService>();
        var farmSettings = await settings.Get();
        farmSettings.UnsoldFollowUpDays.ShouldBe(7); // the starting value, until the farm confirms its own
        farmSettings.UnsoldFollowUpDays = 3;
        await settings.Update(farmSettings);
        var tooLong = await settings.Get();
        tooLong.UnsoldFollowUpDays = 61;
        await Should.ThrowAsync<Exception>(() => settings.Update(tooLong)); // 1 to 60 days only

        var harvests = Resolve<HarvestAppService>();
        var zone = FarmClock.Resolve(FarmClock.DefaultTimeZone);
        var saved = await harvests.Create(Harvest(HarvestType.Partial, 100));
        var harvestDay = FarmClock.LocalDate(saved.HarvestedAtUtc, zone);
        saved.UnaccountedKg.ShouldBe(100m);
        saved.FollowUpOn.ShouldBe(harvestDay.AddDays(3));
        saved.FollowUpDue.ShouldBe(harvestDay.AddDays(3) <= Today);

        // The farmer moves it; a day before the harvest is refused.
        var edit = Harvest(HarvestType.Partial, 100);
        edit.Id = saved.Id;
        edit.FollowUpOn = harvestDay;
        var due = await harvests.Update(edit);
        due.FollowUpOn.ShouldBe(harvestDay);
        due.FollowUpDue.ShouldBeTrue();
        (await Resolve<Dashboard.DashboardAppService>().Get()).UnsoldFollowUps.ShouldContain(f => f.HarvestId == saved.Id && f.UnaccountedKg == 100m);

        edit.FollowUpOn = harvestDay.AddDays(-1);
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Update(edit));

        // Once every kilo is recorded as not sold there is nothing to follow up, and the system never does that by itself.
        edit.FollowUpOn = null;
        edit.Disposals = new List<DisposalInput> { new() { Kg = 100, Reason = DisposalReason.StaffOrHomeUse } };
        var settled = await harvests.Update(edit);
        settled.UnaccountedKg.ShouldBe(0m);
        settled.FollowUpOn.ShouldBeNull();
        settled.FollowUpDue.ShouldBeFalse();
        (await Resolve<Dashboard.DashboardAppService>().Get()).UnsoldFollowUps.ShouldNotContain(f => f.HarvestId == saved.Id);
    }

    [Fact]
    public async Task Harvest_rules_reject_bad_grades_counts_and_dates()
    {
        var harvests = Resolve<HarvestAppService>();
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Create(Harvest(HarvestType.Partial, 100, ("80/90", 120))));
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Create(Harvest(HarvestType.Partial, 100, ("80/90", 50), ("80/90", 20))));
        var tooMany = Harvest(HarvestType.Partial, 100);
        tooMany.FinalCount = 999999;
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Create(tooMany));
        var early = Harvest(HarvestType.Partial, 100);
        early.HarvestedAt = new DateTime(2026, 9, 1, 0, 0, 0, DateTimeKind.Utc); // before stocking on 15 Sep
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Create(early));
    }

    [Fact]
    public async Task Not_sold_entries_account_for_harvest_and_close_check_lists_the_rest()
    {
        var harvests = Resolve<HarvestAppService>();
        var input = Harvest(HarvestType.Total, 200, ("80/90", 200));
        input.Disposals = new() { new() { Kg = 15, Reason = DisposalReason.StaffOrHomeUse }, new() { Kg = 5, Reason = DisposalReason.SpoiledOrLost, Note = "Crushed in the net" } };
        var harvest = await harvests.Create(input);
        harvest.NotSoldKg.ShouldBe(20m);
        harvest.UnaccountedKg.ShouldBe(180m);

        var sale = await Resolve<SaleAppService>().Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = Today,
            Lines = new() { new() { HarvestGradeLineId = harvest.GradeLines.Single().Id, Kg = 170, PricePerKg = 260 } },
        });
        sale.Total.ShouldBe(44200m);

        var check = await Resolve<BatchAppService>().GetCloseCheck(BatchId(CurrentBatch));
        check.HarvestedKg.ShouldBe(200m);
        check.SoldKg.ShouldBe(170m);
        check.NotSoldKg.ShouldBe(20m);
        check.UnaccountedKg.ShouldBe(10m);

        // Sold + not sold may not exceed the harvest: 170 + 35 > 200.
        input.Id = harvest.Id;
        input.Disposals = new() { new() { Kg = 35, Reason = DisposalReason.GivenAway } };
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Update(input));
    }

    [Fact]
    public async Task A_sold_grade_line_cannot_drop_below_what_was_sold()
    {
        var harvests = Resolve<HarvestAppService>();
        var input = Harvest(HarvestType.Partial, 300, ("100/120", 300));
        var harvest = await harvests.Create(input);
        await Resolve<SaleAppService>().Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = Today, Lines = new() { new() { HarvestGradeLineId = harvest.GradeLines.Single().Id, Kg = 200, PricePerKg = 210 } },
        });

        input.Id = harvest.Id;
        input.GradeLines = new(); // the ungraded line is derived from the harvest total, not client-supplied grade allocations
        input.TotalKg = 150;
        await Should.ThrowAsync<UserFriendlyException>(() => harvests.Update(input));

        // Raising the harvest total above the sold amount keeps the same line identity.
        input.TotalKg = 280;
        var updated = await harvests.Update(input);
        updated.GradeLines.Single().Id.ShouldBe(harvest.GradeLines.Single().Id);
        updated.GradeLines.Single().SoldKg.ShouldBe(200m);
    }

    // ---------------------------------------------------------------- sales
    [Fact]
    public async Task Sale_cannot_exceed_a_grade_lines_unsold_kg()
    {
        var sales = Resolve<SaleAppService>();
        // The seeded sale already sold all 2,000 kg of 50/60 from the reference harvest.
        var seeded = Q(c => c.HarvestGradeLines.IgnoreQueryFilters().Include(g => g.SizeGrade).Single(g => g.SizeGrade.Label == "50/60" && g.Kg == 2000m).Id);
        await Should.ThrowAsync<UserFriendlyException>(() => sales.Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = new DateOnly(2026, 9, 9), Lines = new() { new() { HarvestGradeLineId = seeded, Kg = 1, PricePerKg = 380 } },
        }));
        (await sales.GetSellableLines(null)).ShouldNotContain(l => l.HarvestGradeLineId == seeded);
    }

    [Fact]
    public async Task One_sale_can_sell_grades_from_several_harvests_with_a_dispatch_receipt_number()
    {
        var harvests = Resolve<HarvestAppService>();
        var first = await harvests.Create(Harvest(HarvestType.Partial, 100, ("90/100", 100)));
        var secondInput = Harvest(HarvestType.Partial, 80, ("80/90", 80));
        secondInput.HarvestedAt = DateTime.UtcNow.AddHours(-1);
        var second = await harvests.Create(secondInput);

        var sales = Resolve<SaleAppService>();
        var sale = await sales.Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = Today, DueDate = Today.AddDays(15), PaymentTerms = "15 days",
            Transporter = "Mindanao Reefer", PlateNo = "ABC 1234", LocalTransportPermitNo = "LTP-001",
            Lines = new()
            {
                new() { HarvestGradeLineId = first.GradeLines.Single().Id, Kg = 100, PricePerKg = 240 },
                new() { HarvestGradeLineId = second.GradeLines.Single().Id, Kg = 70, PricePerKg = 250 },
            },
            InitialPayment = new PaymentInput { PaidOn = Today, Amount = 10000, Method = "Cash" },
        });
        sale.DispatchReceiptNo.ShouldBe($"DR-{Today:yyyy}-0001");
        sale.Total.ShouldBe(41500m); // 100 × 240 + 70 × 250
        sale.Paid.ShouldBe(10000m);
        sale.PaymentStatus.ShouldBe(PaymentStatus.Partial);
        sale.Lines.Select(l => l.HarvestId).Distinct().Count().ShouldBe(2);
        sale.Transporter.ShouldBe("Mindanao Reefer");
        sale.DocumentNotice.ShouldContain("not an official receipt");

        var next = await sales.Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = Today, Lines = new() { new() { HarvestGradeLineId = second.GradeLines.Single().Id, Kg = 10, PricePerKg = 250 } },
        });
        next.DispatchReceiptNo.ShouldBe($"DR-{Today:yyyy}-0002");
    }

    [Fact]
    public async Task Revenue_uses_the_buyers_accepted_kg_and_a_large_difference_warns()
    {
        var harvest = await Resolve<HarvestAppService>().Create(Harvest(HarvestType.Partial, 100, ("90/100", 100)));
        var sale = await Resolve<SaleAppService>().Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = Today,
            Lines = new() { new() { HarvestGradeLineId = harvest.GradeLines.Single().Id, Kg = 100, BuyerAcceptedKg = 85, PricePerKg = 200 } },
        });
        sale.Total.ShouldBe(17000m); // 85 kg × ₱200
        sale.Lines.Single().WeightDifferenceKg.ShouldBe(-15m);
        sale.Warnings.ShouldContain(w => w.Kind == "BuyerWeight"); // 15% > 10% †

        // FCR and yield keep the farm weight: the harvest is still 100 kg.
        (await Resolve<HarvestAppService>().Get(harvest.Id)).SoldKg.ShouldBe(100m);
    }

    [Fact]
    public async Task Payments_due_dates_and_overdue()
    {
        var sales = Resolve<SaleAppService>();
        var seeded = (await sales.GetAll(new GetSalesInput())).Items.Single(s => s.DispatchReceiptNo == "SR-2026-0001");
        seeded.Total.ShouldBe(930000m);
        seeded.Paid.ShouldBe(500000m);
        seeded.PaymentStatus.ShouldBe(PaymentStatus.Partial);
        seeded.IsOverdue.ShouldBeTrue(); // due 23 Sep, still partly paid
        (await sales.GetAll(new GetSalesInput { OverdueOnly = true })).Items.ShouldContain(s => s.Id == seeded.Id);

        await Should.ThrowAsync<UserFriendlyException>(() => sales.AddPayment(new AddPaymentInput { SaleId = seeded.Id, PaidOn = new DateOnly(2026, 9, 1), Amount = 1 }));
        var paid = await sales.AddPayment(new AddPaymentInput { SaleId = seeded.Id, PaidOn = new DateOnly(2026, 9, 20), Amount = 430000, Method = "Bank transfer" });
        paid.PaymentStatus.ShouldBe(PaymentStatus.Paid);
        paid.IsOverdue.ShouldBeFalse();
        paid.Payments.Count.ShouldBe(2);

        var over = await sales.AddPayment(new AddPaymentInput { SaleId = seeded.Id, PaidOn = new DateOnly(2026, 9, 21), Amount = 100 });
        over.Overpaid.ShouldBe(100m);
        over.Warnings.ShouldContain(w => w.Kind == "Overpayment");
    }

    [Fact]
    public async Task Due_date_cannot_be_before_the_sale_date()
    {
        var harvest = await Resolve<HarvestAppService>().Create(Harvest(HarvestType.Partial, 100, ("90/100", 100)));
        await Should.ThrowAsync<UserFriendlyException>(() => Resolve<SaleAppService>().Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = Today, DueDate = Today.AddDays(-1),
            Lines = new() { new() { HarvestGradeLineId = harvest.GradeLines.Single().Id, Kg = 10, PricePerKg = 200 } },
        }));
    }

    [Fact]
    public async Task A_voided_sale_frees_its_kg_and_keeps_its_number()
    {
        var harvest = await Resolve<HarvestAppService>().Create(Harvest(HarvestType.Partial, 100, ("90/100", 100)));
        var sales = Resolve<SaleAppService>();
        var sale = await sales.Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = Today, Lines = new() { new() { HarvestGradeLineId = harvest.GradeLines.Single().Id, Kg = 100, PricePerKg = 200 } },
        });
        LoginAsPilotTechnician();
        await Should.ThrowAsync<AbpAuthorizationException>(() => sales.Void(new VoidSaleInput { Id = sale.Id, Reason = "x" }));
        LoginAsPilotOwner();
        await sales.Void(new VoidSaleInput { Id = sale.Id, Reason = "Buyer cancelled" });
        (await Resolve<HarvestAppService>().Get(harvest.Id)).SoldKg.ShouldBe(0m);
        Q(c => c.Sales.IgnoreQueryFilters().Single(s => s.Id == sale.Id).VoidReason).ShouldBe("Buyer cancelled");

        var again = await sales.Create(new SaveSaleInput
        {
            BuyerId = Buyer, SaleDate = Today, Lines = new() { new() { HarvestGradeLineId = harvest.GradeLines.Single().Id, Kg = 100, PricePerKg = 205 } },
        });
        again.DispatchReceiptNo.ShouldNotBe(sale.DispatchReceiptNo);
    }

    [Fact]
    public async Task Dispatch_receipt_shows_the_bfar_registration_number()
    {
        UsingDbContext(context =>
        {
            var tenantId = GetTenantId(PilotFarm);
            var preset = context.DocumentPresets.IgnoreQueryFilters().Single(p => p.TenantId == tenantId && p.Name == SaleAppService.BfarPreset);
            context.ComplianceDocuments.Add(new Compliance.ComplianceDocument
            {
                TenantId = tenantId, CategoryId = preset.CategoryId, PresetId = preset.Id, Title = preset.Name, DocumentNumber = "BFAR-XII-2026-0042",
                IssueDate = new DateOnly(2026, 1, 10), ExpiryDate = new DateOnly(2027, 1, 9),
            });
        });
        var sale = (await Resolve<SaleAppService>().GetAll(new GetSalesInput())).Items.First();
        (await Resolve<SaleAppService>().Get(sale.Id)).BfarRegistrationNo.ShouldBe("BFAR-XII-2026-0042");
    }
}
