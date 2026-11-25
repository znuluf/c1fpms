using Abp.Events.Bus;
using Abp.Events.Bus.Entities;
using Capstone.EntityFrameworkCore.Seed.Development;
using Capstone.Harvests;
using Capstone.Sales;
using Capstone.Ponds;
using Capstone.Production;
using Capstone.Production.Dto;
using Microsoft.EntityFrameworkCore;
using Shouldly;
using System.Linq;
using System.Threading.Tasks;
using Xunit;

namespace Capstone.Tests.Fpms;

/// <summary>The small Codespace sample farm (FPMS_Simple): one closed intensive cycle in three ponds, one per construction type.</summary>
public class SimpleSampleData_Tests : FpmsTestBase
{
    private readonly int _farm;
    private readonly int _farmi;

    public SimpleSampleData_Tests()
    {
        UsingDbContext(null, context =>
        {
            context.EntityChangeEventHelper = NullEntityChangeEventHelper.Instance;
            context.EventBus = NullEventBus.Instance;
            context.SuppressAutoSetTenantId = true;
            new SimpleSampleDataBuilder(context).Create();
            new SimpleSampleDataBuilder(context).Create(); // a second run adds nothing
        });
        _farm = GetTenantId(SimpleSampleDataBuilder.FarmCode);
        _farmi = GetTenantId("farmi");
        LoginAsTenant(SimpleSampleDataBuilder.FarmCode, "arkabubba");
    }

    [Fact]
    public void Farmi_is_a_separate_empty_tenant_with_four_idempotently_seeded_accounts()
    {
        var users = Q(c => c.Users.IgnoreQueryFilters()
            .Where(u => u.TenantId == _farmi)
            .OrderBy(u => u.UserName)
            .Select(u => new { u.UserName, u.Name, u.Surname })
            .ToList());

        users.Select(u => (u.UserName, u.Name, u.Surname)).ShouldBe(new[]
        {
            ("haraff", "Har", "Aff"),
            ("maysuli", "May", "Suli"),
            ("rafah", "Raf", "Ah"),
            ("yamilus", "Yam", "Ilus"),
        });
        Q(c => c.Users.IgnoreQueryFilters().Count(u => u.TenantId == _farmi)).ShouldBe(4);
        Q(c => c.Ponds.IgnoreQueryFilters().Count(p => p.TenantId == _farmi)).ShouldBe(0);
        Q(c => c.ProductionCycles.IgnoreQueryFilters().Count(x => x.TenantId == _farmi)).ShouldBe(0);
        Q(c => c.FarmProfiles.IgnoreQueryFilters().Any(p => p.Id == _farmi && p.FarmName == "Farmi")).ShouldBeTrue();
        Q(c => c.Users.IgnoreQueryFilters().Where(u => u.TenantId == _farm).Count()).ShouldBe(4);
    }

    [Fact]
    public async Task A_closed_and_a_running_intensive_cycle_in_three_ponds()
    {
        var ponds = await Resolve<PondAppService>().GetAll(includeArchived: true);
        ponds.Select(p => p.PondCode).OrderBy(c => c).ShouldBe(new[] { "CP-01", "EP-01", "EP-02", "HP-01", "HP-02" });
        ponds.Where(p => p.PondCode.EndsWith("-01")).ShouldAllBe(p => p.Status == PondDisplayStatus.InProduction);
        ponds.Where(p => p.PondCode.EndsWith("-02")).ShouldAllBe(p => p.Status == PondDisplayStatus.Prepared);

        // A received delivery not stocked yet, ready for "Stock a batch".
        var waiting = Q(c => c.FryDeliveries.IgnoreQueryFilters().Where(d => d.TenantId == _farm && d.HatcheryBatchNumber.StartsWith("RDX-") && d.PlReceived != null).ToList());
        waiting.Count.ShouldBe(1);
        Q(c => c.ProductionCycles.IgnoreQueryFilters().Any(x => x.FryDeliveryId == waiting[0].Id)).ShouldBeFalse();

        var cycles = Q(c => c.ProductionCycles.IgnoreQueryFilters().Where(x => x.TenantId == _farm).ToList());
        cycles.Single(x => x.CycleCode == "2026-02-GSH-01").Status.ShouldBe(CycleStatus.Closed);
        cycles.Single(x => x.CycleCode == "2026-09-SNA-01").Status.ShouldBe(CycleStatus.Active);

        var batches = Q(c => c.PondBatches.IgnoreQueryFilters().Where(b => b.TenantId == _farm).ToList());
        batches.Count.ShouldBe(6);
        batches.Count(b => b.Status == BatchStatus.Stocked).ShouldBe(3);
        batches.Where(b => b.Status != BatchStatus.Stocked).ShouldAllBe(b => b.Status == BatchStatus.Closed && b.CultureDays == 75 && b.TotalHarvestKg > 0 && b.FarmingSystemAtStocking == FarmingSystem.Intensive);
        batches.ShouldAllBe(b => b.FarmingSystemAtStocking == FarmingSystem.Intensive && b.DensityFlag == DensityFlag.Within);

        Q(c => c.Users.IgnoreQueryFilters().Count(u => u.TenantId == _farm)).ShouldBe(4); // two owners, two technicians
        // Six from the closed cycle and four from the running cycle's partial harvests, one of them voided.
        Q(c => c.Sales.IgnoreQueryFilters().Count(s => s.TenantId == _farm)).ShouldBe(10);
        // Q runs as the host, so the tenant filter is ignored and the void (soft delete) is checked by hand.
        Q(c => c.Sales.IgnoreQueryFilters().Count(s => s.TenantId == _farm && !s.IsDeleted)).ShouldBe(9);
        Q(c => c.Buyers.IgnoreQueryFilters().Count(b => b.TenantId == _farm)).ShouldBe(3);
        var hatcheries = Q(c => c.HatcherySources.IgnoreQueryFilters().Where(h => h.TenantId == _farm).ToList());
        hatcheries.Count.ShouldBe(3);
        hatcheries.ShouldAllBe(h => h.AccreditationStatus == Capstone.Resources.AccreditationStatus.Accredited);
        Q(c => c.ComplianceDocuments.IgnoreQueryFilters().Count(d => d.TenantId == _farm)).ShouldBe(6);
    }

    // ---------------------------------------------------------------- DEC-131: every delivery step is in the sample
    [Fact]
    public async Task Every_delivery_step_is_in_the_sample_and_each_takes_only_its_next_steps()
    {
        var service = Resolve<Capstone.Resources.FryDeliveryAppService>();
        var all = (await service.GetAll(new Capstone.Resources.GetFryDeliveriesInput { MaxResultCount = 100 })).Items;
        all.Count(d => d.IsStocked).ShouldBe(2); // the closed and the running cycle
        var gate = all.Single(d => d.Status == Capstone.Resources.FryDeliveryStatus.Received && !d.IsStocked);
        var order = all.Single(d => d.Status == Capstone.Resources.FryDeliveryStatus.Ordered);
        var transit = all.Single(d => d.Status == Capstone.Resources.FryDeliveryStatus.InTransit);
        var cancelled = all.Single(d => d.Status == Capstone.Resources.FryDeliveryStatus.Cancelled);
        var rejected = all.Single(d => d.Status == Capstone.Resources.FryDeliveryStatus.Rejected);

        // Logged at the gate: one step, with a count and arrival time.
        var gateDetail = await service.Get(gate.Id);
        gateDetail.History.Single().Note.ShouldBe("Recorded at arrival");
        gateDetail.PlReceived.ShouldNotBeNull();
        gateDetail.ReceivedAtUtc.ShouldNotBeNull();

        // Orders and endings have no count, and only a received, unstocked delivery is offered for stocking.
        new[] { order, transit, cancelled, rejected }.ShouldAllBe(d => d.PlReceived == null && d.PlOrdered > 0);
        (await service.Get(cancelled.Id)).History.First().Note.ShouldNotBeNullOrWhiteSpace();
        (await service.Get(rejected.Id)).History.First().Note.ShouldNotBeNullOrWhiteSpace();
        var options = await Resolve<CycleAppService>().GetStockingOptions(new GetStockingOptionsInput());
        options.Deliveries.Select(d => d.Id).ShouldBe(new[] { gate.Id });

        // Each takes only its next steps.
        await Should.ThrowAsync<Abp.UI.UserFriendlyException>(() => service.UpdateStatus(new Capstone.Resources.UpdateFryDeliveryStatusInput { DeliveryId = order.Id, Status = Capstone.Resources.FryDeliveryStatus.Rejected, Note = "weak fry" }));
        await Should.ThrowAsync<Abp.UI.UserFriendlyException>(() => service.UpdateStatus(new Capstone.Resources.UpdateFryDeliveryStatusInput { DeliveryId = transit.Id, Status = Capstone.Resources.FryDeliveryStatus.Cancelled, Note = "too late" }));
        await Should.ThrowAsync<Abp.UI.UserFriendlyException>(() => service.Receive(new Capstone.Resources.ReceiveFryInput { DeliveryId = cancelled.Id, PlReceived = 1000 }));
        await Should.ThrowAsync<Abp.UI.UserFriendlyException>(() => service.Receive(new Capstone.Resources.ReceiveFryInput { DeliveryId = rejected.Id, PlReceived = 1000 }));

        // The fry on the road arrive: counted, and now offered for stocking.
        LoginAsTenant(SimpleSampleDataBuilder.FarmCode, "konacsus");
        await Resolve<Capstone.Resources.FryDeliveryAppService>().Receive(new Capstone.Resources.ReceiveFryInput { DeliveryId = transit.Id, PlReceived = 182500, SfscNo = "SFSC-TEST" });
        LoginAsTenant(SimpleSampleDataBuilder.FarmCode, "arkabubba");
        var received = await service.Get(transit.Id);
        received.Status.ShouldBe(Capstone.Resources.FryDeliveryStatus.Received);
        received.History.Select(h => h.Status).ShouldBe(new[] { Capstone.Resources.FryDeliveryStatus.Received, Capstone.Resources.FryDeliveryStatus.InTransit, Capstone.Resources.FryDeliveryStatus.Ordered });
        (await Resolve<CycleAppService>().GetStockingOptions(new GetStockingOptionsInput())).Deliveries.Select(d => d.Id).ShouldContain(transit.Id);

        // The order is cancelled with a reason, and the Owner takes the cancel back.
        await service.UpdateStatus(new Capstone.Resources.UpdateFryDeliveryStatusInput { DeliveryId = order.Id, Status = Capstone.Resources.FryDeliveryStatus.Cancelled, Note = "Changed hatchery" });
        await service.UndoLastStep(new Capstone.Resources.UndoDeliveryStepInput { DeliveryId = order.Id, Reason = "Hatchery found stock after all" });
        (await service.Get(order.Id)).Status.ShouldBe(Capstone.Resources.FryDeliveryStatus.Ordered);
    }

    // ---------------------------------------------------------------- DEC-127: one, two and covering technicians
    [Fact]
    public async Task Each_technician_sees_the_ponds_they_look_after_including_a_shared_pond_and_a_cover()
    {
        async Task<System.Collections.Generic.Dictionary<string, BatchListDto>> OpenAs(string user)
        {
            LoginAsTenant(SimpleSampleDataBuilder.FarmCode, user);
            return (await Resolve<BatchAppService>().GetAll(new GetBatchesInput { OpenOnly = true })).ToDictionary(b => b.PondCode);
        }

        var asOwner = await OpenAs("arkabubba");
        asOwner.Values.ShouldAllBe(b => !b.IsMine);
        asOwner["EP-01"].TechnicianNames.ShouldBe(new[] { "Kim Onacsus" });
        asOwner["HP-01"].TechnicianNames.Count.ShouldBe(2); // shared, as equals
        asOwner["HP-01"].TechnicianName.ShouldContain(" and ");
        asOwner["CP-01"].CoverActive.ShouldBeTrue(); // Kim covers Far's days off
        asOwner["CP-01"].LookingAfterName.ShouldBe("Kim Onacsus");

        var kim = await OpenAs("konacsus");
        kim.Values.ShouldAllBe(b => b.IsMine); // own, shared and covering
        var far = await OpenAs("filusyam");
        far["CP-01"].IsMine.ShouldBeTrue();
        far["HP-01"].IsMine.ShouldBeTrue();
        far["EP-01"].IsMine.ShouldBeFalse();

        // Daily log status puts the person's own ponds first.
        var rows = (await Resolve<Capstone.Logbooks.FeedingAppService>().GetDailyStatus(new Capstone.Logbooks.Dto.GetDailyLogStatusInput())).Rows;
        rows.TakeWhile(r => r.IsMine).Select(r => r.PondCode).OrderBy(c => c).ShouldBe(new[] { "CP-01", "HP-01" });
    }

    [Fact]
    public async Task A_missing_SFSC_is_listed_at_close_and_on_the_trace_report()
    {
        var running = Q(c => c.PondBatches.IgnoreQueryFilters().Where(b => b.TenantId == _farm && b.Status == BatchStatus.Stocked).Select(b => b.Id).First());
        var closed = Q(c => c.PondBatches.IgnoreQueryFilters().Where(b => b.TenantId == _farm && b.Status == BatchStatus.Closed).Select(b => b.Id).First());

        (await Resolve<BatchAppService>().GetCloseCheck(running)).SfscMissing.ShouldBeTrue();
        (await Resolve<BatchAppService>().GetCloseCheck(closed)).SfscMissing.ShouldBeFalse();
        (await Resolve<Capstone.Reports.TraceAppService>().GetBatchTrace(running)).FrySource.SfscMissing.ShouldBeTrue();
        (await Resolve<Capstone.Reports.TraceAppService>().GetBatchTrace(closed)).FrySource.SfscMissing.ShouldBeFalse();
    }

    /// <summary>The running cycle's partial harvests cover the harvest and sales scenarios (DEC-80 to DEC-86).</summary>
    [Fact]
    public async Task The_partial_harvests_cover_the_harvest_and_sales_scenarios()
    {
        var harvests = (await Resolve<HarvestAppService>().GetList(new GetHarvestsInput { MaxResultCount = 100 })).Items;
        harvests.Count.ShouldBe(6);
        var ep = harvests.Single(h => h.PondCode == "EP-01" && h.HarvestType == HarvestType.Partial);
        var cp = harvests.Single(h => h.PondCode == "CP-01" && h.HarvestType == HarvestType.Partial);
        var hp = harvests.Single(h => h.PondCode == "HP-01" && h.HarvestType == HarvestType.Partial);

        ep.SaleStatus.ShouldBe(HarvestSaleStatus.Sold);
        ep.NotSoldKg.ShouldBe(6m);
        ep.LotCode.ShouldEndWith("-02");
        cp.SaleStatus.ShouldBe(HarvestSaleStatus.PartlySold);
        cp.UnaccountedKg.ShouldBe(25m); // the voided duplicate does not count
        hp.SaleStatus.ShouldBe(HarvestSaleStatus.Unsold);

        // Each buyer's receipt lists its own crates; the staff crate is on none.
        var epCrates = (await Resolve<HarvestAppService>().Get(ep.Id)).Crates;
        epCrates.Count(c => c.SaleId == null).ShouldBe(1);
        var sales = Resolve<SaleAppService>();
        foreach (var saleId in epCrates.Where(c => c.SaleId != null).Select(c => c.SaleId.Value).Distinct())
        {
            var sale = await sales.Get(saleId);
            sale.Crates.Sum(c => c.Kg).ShouldBe(sale.TotalKg);
        }

        (await sales.GetAll(new GetSalesInput { OverdueOnly = true, MaxResultCount = 100 })).Items.ShouldNotBeEmpty();
        (await Resolve<Capstone.Reports.TraceAppService>().GetLotTrace(hp.LotCode)).WithdrawalNotMetCount.ShouldBe(1);
    }
}
